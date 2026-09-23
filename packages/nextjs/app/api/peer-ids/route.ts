import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { type Address, createPublicClient, getAddress, http, isAddress, isHex } from "viem";
import { mainnet } from "viem/chains";
import scaffoldConfig from "~~/scaffold.config";
import { REGISTRY } from "~~/utils/interfold/contracts";
import { PEER_ID_RE, type PeerEntry, signMessageFor } from "~~/utils/interfold/peerIds";

/**
 * Operator key -> libp2p peer ID, so the probe can find a node on the network by itself.
 *
 * Optional: with no Redis configured the route answers { enabled: false } and the console hides
 * the registration UI. Storage is Upstash Redis over REST (Vercel Marketplace "Upstash" or the
 * older Vercel KV both work; either env pair below).
 *
 * Rules: an empty slot, or re-submitting the same peer ID, needs no signature (the operator has no
 * browser wallet on the node). Changing or clearing an existing entry needs an EIP-191 signature
 * from the operator key or from its current bond owner (read from the bonding registry).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEY = "interfold:peer-ids";

const redis = (): Redis | null => {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  return url && token ? new Redis({ url, token }) : null;
};

const client = () =>
  createPublicClient({
    chain: mainnet,
    transport: http(`https://eth-mainnet.g.alchemy.com/v2/${scaffoldConfig.alchemyApiKey}`),
  });

export async function GET() {
  const r = redis();
  if (!r) return NextResponse.json({ enabled: false, peers: {} });
  const peers = (await r.hgetall<Record<string, PeerEntry>>(KEY)) ?? {};
  return NextResponse.json({ enabled: true, peers }, { headers: { "cache-control": "public, max-age=30" } });
}

export async function POST(req: Request) {
  const r = redis();
  if (!r) return NextResponse.json({ error: "peer ID registry is not configured" }, { status: 501 });

  let body: { operator?: string; peerId?: string; signer?: string; signature?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const { operator: opRaw, peerId = "", signer, signature } = body;
  if (!opRaw || !isAddress(opRaw)) return NextResponse.json({ error: "invalid operator address" }, { status: 400 });
  if (peerId !== "" && !PEER_ID_RE.test(peerId))
    return NextResponse.json(
      { error: "peer ID should look like 12D3KooW… (interfold net get-peer-id)" },
      { status: 400 },
    );
  const operator = getAddress(opRaw);
  const field = operator.toLowerCase();

  const existing = await r.hget<PeerEntry>(KEY, field);
  const unchanged = existing ? existing.peerId === peerId : peerId === "";
  const open = !existing || unchanged;

  let by = "open";
  if (!open) {
    if (!signer || !isAddress(signer) || !signature || !isHex(signature))
      return NextResponse.json(
        {
          error:
            "this operator already has a peer ID; changing it needs a signature from the operator key or its bond owner",
          needsSignature: true,
        },
        { status: 403 },
      );
    const who = getAddress(signer);
    const c = client();
    const bondOwner = (await c.readContract({
      address: REGISTRY.address,
      abi: REGISTRY.abi,
      functionName: "bondOwnerOf",
      args: [operator],
    })) as Address;
    const allowed = who === operator || who === getAddress(bondOwner);
    if (!allowed)
      return NextResponse.json({ error: "signer is neither the operator nor its bond owner" }, { status: 403 });
    const ok = await c.verifyMessage({ address: who, message: signMessageFor(operator, peerId), signature });
    if (!ok) return NextResponse.json({ error: "signature does not verify" }, { status: 403 });
    by = who;
  }

  if (peerId === "") {
    await r.hdel(KEY, field);
    return NextResponse.json({ ok: true, entry: null });
  }
  const entry: PeerEntry = { peerId, updatedAt: new Date().toISOString(), by };
  await r.hset(KEY, { [field]: entry });
  return NextResponse.json({ ok: true, entry });
}
