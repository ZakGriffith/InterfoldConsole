// Finds every registered ciphernode on the Interfold peer network and asks it to identify itself.
// A ciphernode answers identify with agentVersion "interfold-ciphernode/<version>" to any peer that
// connects, so nothing has to be installed or configured on the node. Output: probe.json.
//
// Targets come from two places, merged by operator address:
//   - the console's peer ID registry (GET $PEER_REGISTRY_URL): operator -> libp2p peer ID, looked
//     up through the network's Kademlia DHT, so the node's IP can change freely;
//   - nodes.json: optional fixed entries with a host (dialed directly) or a peerId.
//
// A node keeps a peer only if its identify says it belongs to the same Interfold network (network
// id, protocol version, deployment fingerprint) and it speaks the kad + sync protocols, so we
// present exactly that. The strings below mirror crates/net/src/network.rs and crates/config in
// github.com/theinterfold/interfold.

import { createHash } from "node:crypto";
import { resolveTxt } from "node:dns/promises";
import { readFile, writeFile } from "node:fs/promises";
import { createLibp2p } from "libp2p";
import { quic } from "@chainsafe/libp2p-quic";
import { identify } from "@libp2p/identify";
import { kadDHT } from "@libp2p/kad-dht";
import { ping } from "@libp2p/ping";
import { peerIdFromString } from "@libp2p/peer-id";
import { multiaddr } from "@multiformats/multiaddr";

const MAINNET_NETWORK_ID = "c3e81f904b0a8129dce0a85a8d48958a3ca5ee3aea6c32b623fcf66b35728acb"; // sha256("interfold:p2p-network:v1:mainnet")
const PROTOCOL_VERSION = 4; // crates/config/protocol-release.toml
const INTERFOLD_MAINNET = "28cF63B459e6218C69EA97ea7D90541cf648c715"; // deployments/manifest.json -> mainnet.contracts.interfold
const BOOTSTRAP_DNSADDR = "bootstrap.interfold.network";
const BOOTSTRAP_FALLBACK = "/ip4/34.192.113.100/udp/9501/quic-v1/p2p/12D3KooWKaXTrbunmUXgnFfDJohaadYxx3QR3MCz9Am8VAV5w3QL";
const PEER_REGISTRY_URL = process.env.PEER_REGISTRY_URL || "https://interfold-console.vercel.app/api/peer-ids";
const RELEASES = "https://api.github.com/repos/theinterfold/interfold/releases/latest";
// The previous run's report: every node it reached is a DHT seed and a direct-dial fallback for this run,
// so the probe keeps working when the Interfold bootstrap peer is down.
const LAST_REPORT_URL =
  process.env.LAST_REPORT_URL ||
  `https://raw.githubusercontent.com/${process.env.GITHUB_REPOSITORY || "ZakGriffith/InterfoldConsole"}/probe-data/probe.json`;
const DIAL_TIMEOUT_MS = 15_000;
const LOOKUP_TIMEOUT_MS = 45_000;

const deploymentFingerprint = () => {
  const chainId = Buffer.alloc(8);
  chainId.writeBigUInt64BE(1n);
  return createHash("sha256").update(chainId).update(Buffer.from(INTERFOLD_MAINNET, "hex")).digest("hex");
};

const prefix = `interfold/${MAINNET_NETWORK_ID}/protocol/${PROTOCOL_VERSION}`;
const IDENTIFY_PROTOCOL = `${prefix}/deployments/${deploymentFingerprint()}/1`;
const KAD_PROTOCOL = `/${prefix}/kad/1.0.0`;
const ADVERTISED = [KAD_PROTOCOL, `/${prefix}/sync/3.0.0`, `/${prefix}/sync/2.0.0`];

const isIp = (h) => /^\d+\.\d+\.\d+\.\d+$/.test(h);
const hostAddr = ({ host, port }) => multiaddr(`/${isIp(host) ? "ip4" : "dns4"}/${host}/udp/${port ?? 9091}/quic-v1`);

const ghHeaders = () => {
  const headers = { accept: "application/vnd.github+json", "user-agent": "interfold-console-probe" };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return headers;
};

const latestRelease = async () => {
  try {
    const r = await fetch(RELEASES, { headers: ghHeaders() });
    if (!r.ok) return null;
    const { tag_name } = await r.json();
    return tag_name?.replace(/^v/, "") ?? null;
  } catch {
    return null;
  }
};

const registryPeers = async () => {
  if (!PEER_REGISTRY_URL || PEER_REGISTRY_URL === "off") return {};
  try {
    const r = await fetch(PEER_REGISTRY_URL, { headers: { "user-agent": "interfold-console-probe" } });
    if (!r.ok) throw new Error(`${r.status}`);
    const { enabled, peers } = await r.json();
    return enabled ? peers : {};
  } catch (e) {
    console.warn(`peer registry unavailable (${e.message}); using nodes.json only`);
    return {};
  }
};

const withPeer = (host, peerId) => (host.includes("/p2p/") ? host : `${host}/p2p/${peerId}`);

/**
 * peerId -> multiaddr (with /p2p/) of every node worth dialing first: the static seeds in nodes.json,
 * then the previous report's carried-forward `lastKnown` map, then whatever it reached that run.
 * Later sources win, so an address that moved is replaced by where the node was last seen.
 */
const lastKnownHosts = async (staticSeeds) => {
  const out = new Map();
  for (const a of staticSeeds ?? []) {
    const id = a.split("/p2p/")[1];
    if (id) out.set(id, a);
  }
  if (LAST_REPORT_URL === "off") return out;
  try {
    const r = await fetch(`${LAST_REPORT_URL}?t=${Date.now()}`, { headers: { "user-agent": "interfold-console-probe" } });
    if (!r.ok) throw new Error(`${r.status}`);
    const { nodes, lastKnown } = await r.json();
    for (const [id, a] of Object.entries(lastKnown ?? {})) out.set(id, a);
    for (const n of nodes ?? []) if (n.ok && n.host && n.peerId) out.set(n.peerId, withPeer(n.host, n.peerId));
  } catch (e) {
    console.warn(`last report unavailable (${e.message}); static seeds only`);
  }
  return out;
};

/**
 * Dial an address without its /p2p/ part and check who answered. With the peer ID attached, libp2p's
 * dial queue would "join" any dial still winding down for that peer (say, one that just timed out) and
 * hand back its abort instead of dialing.
 */
const dialVerified = async (node, id, addr) => {
  const c = await node.dial(multiaddr(addr).decapsulateCode(421), { signal: AbortSignal.timeout(DIAL_TIMEOUT_MS) });
  if (!c.remotePeer.equals(id)) {
    await c.close().catch(() => {});
    throw new Error(`${addr.split("/p2p/")[0]} answered as ${c.remotePeer.toString()}, not this node`);
  }
  return c;
};

const bootstrapAddrs = async () => {
  try {
    const txt = await resolveTxt(`_dnsaddr.${BOOTSTRAP_DNSADDR}`);
    const addrs = txt.flat().filter((t) => t.startsWith("dnsaddr=")).map((t) => t.slice("dnsaddr=".length));
    if (addrs.length) return addrs;
  } catch {
    /* fall through */
  }
  return [BOOTSTRAP_FALLBACK];
};

const summarize = (info) => {
  const m = /^interfold-ciphernode\/(\S+)/.exec(info.agentVersion ?? "");
  return {
    peerId: info.peerId.toString(),
    agentVersion: info.agentVersion ?? null,
    version: m ? m[1] : null,
    sameNetwork: info.protocolVersion === IDENTIFY_PROTOCOL,
    protocolVersion: info.protocolVersion ?? null,
    protocols: info.protocols ?? [],
    listenAddrs: (info.listenAddrs ?? []).map(String),
  };
};

/** Dial a fixed host:port and identify. */
const probeHost = async (node, target) => {
  const started = Date.now();
  const out = { operator: target.operator, via: "host", host: target.host, port: target.port ?? 9091, checkedAt: new Date().toISOString() };
  const signal = AbortSignal.timeout(DIAL_TIMEOUT_MS);
  let conn;
  try {
    conn = await node.dial(hostAddr(target), { signal });
    const info = await node.services.identify.identify(conn, { signal });
    return { ...out, ok: true, rttMs: Date.now() - started, ...summarize(info) };
  } catch (e) {
    return { ...out, ok: false, rttMs: Date.now() - started, error: String(e?.message ?? e).slice(0, 200) };
  } finally {
    if (conn) await conn.close().catch(() => {});
  }
};

const PRIVATE_V4 = [/^10[.]/, /^172[.](1[6-9]|2[0-9]|3[01])[.]/, /^192[.]168[.]/, /^127[.]/, /^169[.]254[.]/, /^100[.](6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])[.]/, /^0[.]/];
const isPublicV4 = (ip) => isIp(ip) && !PRIVATE_V4.some((re) => re.test(ip));
const parseV4 = (addr) => {
  const m = /^[/]ip4[/]([0-9.]+)[/]udp[/]([0-9]+)[/]quic-v1/.exec(addr);
  return m ? { ip: m[1], port: Number(m[2]) } : null;
};

/**
 * A node behind a home router that forwards its port but rewrites the source port of outgoing
 * traffic is recorded in the DHT at public-ip:<random port> (what other peers observed), while the
 * port that is actually open is the one it listens on. So when the DHT addresses fail, try every
 * public IPv4 the DHT holds on every port the node's own listen addresses use (9091 by default).
 */
const fallbackAddrs = (addrs, peerId) => {
  const parsed = addrs.map(parseV4).filter(Boolean);
  const publicIps = [...new Set(parsed.filter((p) => isPublicV4(p.ip)).map((p) => p.ip))];
  const ports = [...new Set(parsed.filter((p) => !isPublicV4(p.ip)).map((p) => p.port))];
  if (ports.length === 0) ports.push(9091);
  const known = new Set(parsed.map((p) => `${p.ip}:${p.port}`));
  const out = [];
  for (const ip of publicIps) for (const port of ports) if (!known.has(`${ip}:${port}`)) out.push(`/ip4/${ip}/udp/${port}/quic-v1/p2p/${peerId}`);
  return out;
};

/**
 * Look a peer ID up in the DHT, dial whatever address it is at now, identify. When the lookup fails
 * (DHT unreachable this run) the node's address from the last report is dialed directly; when the
 * DHT addresses fail (NAT rewrote the port) each public IP is tried on the node's listen port.
 */
const probePeerId = async (node, target, known) => {
  const started = Date.now();
  const out = { operator: target.operator, via: "peer-id", peerId: target.peerId, checkedAt: new Date().toISOString() };
  let conn;
  let stage = "lookup"; // which step failed, and what the DHT knew, so a "down" result says whether the node
  let addrs; //           is unknown to the network or known but unreachable (NAT, firewall)
  let tried; //           the extra addresses dialed after the DHT path failed
  let fallback; //        the one that answered, if any
  const id = peerIdFromString(target.peerId);
  const tryFallbacks = async (candidates, cause) => {
    tried = [...new Set(candidates)];
    let lastErr = cause;
    for (const a of tried) {
      try {
        conn = await dialVerified(node, id, a);
        fallback = a;
        return;
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr;
  };
  try {
    try {
      const found = await node.peerRouting.findPeer(id, { signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS) });
      addrs = found.multiaddrs.map((a) => a.toString());
    } catch (lookupErr) {
      if (!known) throw lookupErr;
      await tryFallbacks([known], lookupErr);
    }
    if (!conn) {
      stage = "dial";
      try {
        conn = await node.dial(id, { signal: AbortSignal.timeout(DIAL_TIMEOUT_MS) });
      } catch (dialErr) {
        await tryFallbacks([...fallbackAddrs(addrs, target.peerId), ...(known ? [known] : [])], dialErr);
      }
    }
    stage = "identify";
    const info = await node.services.identify.identify(conn, { signal: AbortSignal.timeout(DIAL_TIMEOUT_MS) });
    return { ...out, ok: true, rttMs: Date.now() - started, host: conn.remoteAddr.toString(), addrs, ...(fallback ? { fallback, tried } : {}), ...summarize(info) };
  } catch (e) {
    return { ...out, ok: false, rttMs: Date.now() - started, stage, addrs, ...(tried ? { tried } : {}), error: String(e?.message ?? e).slice(0, 200) };
  } finally {
    if (conn) await conn.close().catch(() => {});
  }
};

const main = async () => {
  const cfg = JSON.parse(await readFile(new URL("./nodes.json", import.meta.url), "utf8"));
  const node = await createLibp2p({
    transports: [quic()],
    services: {
      // The probe calls identify() itself on every connection; the automatic run would open a second
      // stream and trip the one-outbound-stream limit ("Too many outbound protocol streams").
      identify: identify({ timeout: DIAL_TIMEOUT_MS, runOnConnectionOpen: false }),
      dht: kadDHT({ protocol: KAD_PROTOCOL, clientMode: true }),
      // kad-dht declares ping as a required capability; without it createLibp2p throws before dialing anything.
      ping: ping(),
    },
    nodeInfo: { name: "interfold-console-probe", version: "0.2.0", userAgent: "interfold-console-probe/0.2.0" },
    connectionGater: { denyDialMultiaddr: () => false },
  });
  // Pass the node's supports_peer() check: matching network identity plus the protocols it expects.
  node.services.identify.host.protocolVersion = IDENTIFY_PROTOCOL;
  // kad-dht pings each new contact over /ipfs/ping/1.0.0 before adding it, and the Interfold node does not
  // speak that protocol, so nothing would ever enter the routing table. Trust contacts as they come.
  node.services.dht.routingTable.kb.verify = async () => true;
  for (const p of ADVERTISED) await node.handle(p, ({ stream }) => stream.close());
  await node.start();

  // Targets: registry first, nodes.json entries override / add (a fixed host beats a lookup).
  const [latest, registry, bootAddrs] = await Promise.all([latestRelease(), registryPeers(), bootstrapAddrs()]);
  const targets = new Map();
  for (const [op, entry] of Object.entries(registry)) targets.set(op.toLowerCase(), { operator: op, peerId: entry.peerId });
  for (const n of cfg.nodes ?? []) {
    if (!n.operator || (!n.host && !n.peerId)) continue;
    targets.set(n.operator.toLowerCase(), { ...targets.get(n.operator.toLowerCase()), ...n });
  }

  // The bootstrap peer is the control: it seeds the DHT and proves the probe itself works.
  let bootstrap = { operator: "bootstrap", via: "host", ok: false, checkedAt: new Date().toISOString(), error: "no address" };
  for (const a of bootAddrs) {
    const ma = multiaddr(a);
    const started = Date.now();
    let conn;
    try {
      let warning;
      try {
        conn = await node.dial(ma, { signal: AbortSignal.timeout(DIAL_TIMEOUT_MS) });
      } catch (e) {
        // The dnsaddr record can lag behind a bootstrap key rotation ("Dialed peer X but connected to Y").
        // The machine is still the right DHT seed, so dial the bare address and record what answered.
        const m = /connected to ([A-Za-z0-9]+)/.exec(String(e?.message ?? e));
        if (!m) throw e;
        conn = await node.dial(ma.decapsulateCode(421), { signal: AbortSignal.timeout(DIAL_TIMEOUT_MS) });
        warning = `dnsaddr advertises ${a.split("/p2p/")[1] ?? "?"} but the node answers as ${m[1]}`;
      }
      const info = await node.services.identify.identify(conn, { signal: AbortSignal.timeout(DIAL_TIMEOUT_MS) });
      bootstrap = { operator: "bootstrap", via: "host", host: a, ok: true, rttMs: Date.now() - started, checkedAt: new Date().toISOString(), ...summarize(info), ...(warning && { warning }) };
      // kad-dht only adds a peer by itself when identify reports a public listen address; seed it by hand
      // from the address we actually reached, so peer-ID lookups have somewhere to start.
      await node.peerStore.merge(conn.remotePeer, { multiaddrs: [conn.remoteAddr] });
      await node.services.dht.routingTable.add(conn.remotePeer).catch((e) => console.error("routing table add:", e?.message ?? e));
      break; // keep the connection: the DHT walks from here
    } catch (e) {
      if (conn) await conn.close().catch(() => {});
      bootstrap = { operator: "bootstrap", via: "host", host: a, ok: false, rttMs: Date.now() - started, checkedAt: new Date().toISOString(), error: String(e?.message ?? e).slice(0, 200) };
    }
  }
  // More seeds: every node the last run reached. Keeps the DHT walkable when the bootstrap is down.
  const known = await lastKnownHosts(cfg.seeds);
  const seeds = { tried: 0, ok: 0 };
  await Promise.all(
    [...known.entries()].filter(([, a]) => !bootAddrs.includes(a)).map(async ([peerId, a]) => {
      seeds.tried++;
      let c;
      try {
        const id = peerIdFromString(peerId);
        c = await dialVerified(node, id, a);
        const info = await node.services.identify.identify(c, { signal: AbortSignal.timeout(DIAL_TIMEOUT_MS) });
        if (info.protocolVersion !== IDENTIFY_PROTOCOL) throw new Error("not on this network");
        await node.peerStore.merge(id, { multiaddrs: [c.remoteAddr] });
        await node.services.dht.routingTable.add(id);
        seeds.ok++; // keep the connection: the DHT walks from here
      } catch (e) {
        if (c) await c.close().catch(() => {});
        console.warn(`seed ${a.split("/p2p/")[0]} skipped: ${String(e?.message ?? e).slice(0, 80)}`);
      }
    }),
  );
  // Give the DHT a moment to learn that the bootstrap speaks its protocol.
  for (let i = 0; i < 50 && node.services.dht.routingTable.size === 0; i++) await new Promise((r) => setTimeout(r, 200));

  const nodes = await Promise.all(
    [...targets.values()].map((t) => (t.host ? probeHost(node, t) : probePeerId(node, t, known.get(t.peerId)))),
  );
  const dhtPeers = node.services.dht.routingTable.size; // read before stop() empties the table
  await node.stop();

  const result = {
    generatedAt: new Date().toISOString(),
    latestRelease: latest,
    identifyProtocol: IDENTIFY_PROTOCOL,
    registry: Object.keys(registry).length,
    dhtPeers,
    seeds,
    bootstrap,
    nodes,
    // Carried forward run to run, so a bad run (bootstrap down, nothing reached) does not forget where the nodes were.
    lastKnown: Object.fromEntries(
      [...known.entries(), ...nodes.filter((n) => n.ok && n.host && n.peerId).map((n) => [n.peerId, withPeer(n.host, n.peerId)])],
    ),
  };
  const outPath = process.argv[2] ?? new URL("./probe.json", import.meta.url);
  await writeFile(outPath, JSON.stringify(result, null, 2) + "\n");
  for (const n of [bootstrap, ...nodes]) {
    const state = n.ok ? `up   ${n.version ?? n.agentVersion}` : `down ${n.error}`;
    console.log(`${n.operator.padEnd(44)} ${(n.via === "peer-id" ? n.peerId.slice(0, 16) + "…" : String(n.host ?? "")).padEnd(24)} ${state}`);
  }
  // The probe itself is broken only if nothing would seed it: neither the bootstrap nor any node from last time.
  if (!bootstrap.ok && seeds.ok === 0) process.exitCode = 1;
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
