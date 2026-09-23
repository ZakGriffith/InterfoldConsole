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

/** Look a peer ID up in the DHT, dial whatever address it is at now, identify. */
const probePeerId = async (node, target) => {
  const started = Date.now();
  const out = { operator: target.operator, via: "peer-id", peerId: target.peerId, checkedAt: new Date().toISOString() };
  let conn;
  try {
    const id = peerIdFromString(target.peerId);
    const found = await node.peerRouting.findPeer(id, { signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS) });
    const addrs = found.multiaddrs.map((a) => a.toString());
    const signal = AbortSignal.timeout(DIAL_TIMEOUT_MS);
    conn = await node.dial(id, { signal });
    const info = await node.services.identify.identify(conn, { signal });
    return { ...out, ok: true, rttMs: Date.now() - started, host: conn.remoteAddr.toString(), addrs, ...summarize(info) };
  } catch (e) {
    return { ...out, ok: false, rttMs: Date.now() - started, error: String(e?.message ?? e).slice(0, 200) };
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
  node.addEventListener("peer:disconnect", (e) => console.error(`[diag] peer:disconnect ${e.detail}`));
  node.addEventListener("connection:close", (e) => console.error(`[diag] connection:close ${e.detail.remotePeer} ${e.detail.remoteAddr}`));
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
      console.error(`[diag] routing table size after add: ${node.services.dht.routingTable.size}, conn status: ${conn.status}`);
      break; // keep the connection: the DHT walks from here
    } catch (e) {
      if (conn) await conn.close().catch(() => {});
      bootstrap = { operator: "bootstrap", via: "host", host: a, ok: false, rttMs: Date.now() - started, checkedAt: new Date().toISOString(), error: String(e?.message ?? e).slice(0, 200) };
    }
  }
  // Give the DHT a moment to learn that the bootstrap speaks its protocol.
  for (let i = 0; i < 50 && node.services.dht.routingTable.size === 0; i++) await new Promise((r) => setTimeout(r, 200));

  console.error(`[diag] after wait: routing table size ${node.services.dht.routingTable.size}, open connections ${node.getConnections().length}`);
  const nodes = await Promise.all(
    [...targets.values()].map((t) => (t.host ? probeHost(node, t) : probePeerId(node, t))),
  );
  await node.stop();

  const result = {
    generatedAt: new Date().toISOString(),
    latestRelease: latest,
    identifyProtocol: IDENTIFY_PROTOCOL,
    registry: Object.keys(registry).length,
    dhtPeers: node.services.dht.routingTable.size,
    bootstrap,
    nodes,
  };
  const outPath = process.argv[2] ?? new URL("./probe.json", import.meta.url);
  await writeFile(outPath, JSON.stringify(result, null, 2) + "\n");
  for (const n of [bootstrap, ...nodes]) {
    const state = n.ok ? `up   ${n.version ?? n.agentVersion}` : `down ${n.error}`;
    console.log(`${n.operator.padEnd(44)} ${(n.via === "peer-id" ? n.peerId.slice(0, 16) + "…" : String(n.host ?? "")).padEnd(24)} ${state}`);
  }
  if (!bootstrap.ok) process.exitCode = 1; // the probe itself is broken if even the bootstrap won't answer
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
