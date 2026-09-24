"use client";

import { useQuery } from "@tanstack/react-query";
import { parseAbiItem } from "viem";
import { usePublicClient, useReadContract } from "wagmi";
import { CHAIN_ID, INTERFOLD, REGISTRY, REGISTRY_DEPLOYED_ON_BLOCK } from "~~/utils/interfold/contracts";

/** IInterfold.E3Stage, in enum order. */
export const E3_STAGE = [
  "none",
  "forming committee",
  "running DKG",
  "key published, taking inputs",
  "ciphertext ready, decrypting",
  "complete",
  "failed",
] as const;
export const E3_COMPLETE = 5;
export const E3_FAILED = 6;

/** IInterfold.FailureReason, in enum order. */
export const E3_FAILURE_REASON = [
  "no reason given",
  "committee formation timeout",
  "insufficient committee members",
  "DKG timeout",
  "DKG invalid shares",
  "no inputs received",
  "compute timeout",
  "compute provider expired",
  "compute provider failed",
  "requester cancelled",
  "decryption timeout",
  "decryption invalid shares",
  "verification failed",
] as const;

export type E3 = {
  id: bigint;
  /** Low 96 bits of the id: the per-deployment counter, shown as "#n". */
  num: number;
  requestBlock: bigint;
  requestedAt?: number;
  requestTx: string;
  /** Current E3Stage. Complete and Failed are terminal. */
  stage: number;
  failedAtStage?: number;
  reason?: number;
  /** Block of the terminal stage change, if any. */
  endBlock?: bigint;
  endedAt?: number;
  /** Lower-cased operators that held a committee obligation when the E3 reached its current stage. */
  committee: string[];
  /** Operators the registry still lists as obligated for this E3 (bond locked). */
  obligated: string[];
  /** Operators drafted at request time but released before the committee was fixed. */
  candidates: string[];
};

/** How one operator relates to one E3. */
export type E3Duty = { e3: E3; role: "committee" | "candidate"; obligated: boolean };

const STAGE_CHANGED = parseAbiItem("event E3StageChanged(uint256 indexed e3Id, uint8 previousStage, uint8 newStage)");
const FAILED = parseAbiItem("event E3Failed(uint256 indexed e3Id, uint8 failedAtStage, uint8 reason)");
const PAUSED_SET = parseAbiItem("event RequestsPausedSet(bool paused)");
const OBLIGATION = parseAbiItem(
  "event CommitteeObligationUpdated(uint256 indexed e3Id, address indexed registry, address indexed operator, bool active)",
);
const ZERO = "0x0000000000000000000000000000000000000000";
const CHUNK = 20_000n;
/** Timestamps are one eth_getBlock each; only the newest E3s get them. */
const DATED = 25;
const COUNTER_MASK = (1n << 96n) - 1n;

export type E3Activity = {
  e3s: E3[];
  /** Block of the last RequestsPausedSet(true), if requests are paused by that log. */
  pausedSinceBlock?: bigint;
  pausedSince?: number;
  latestBlock: bigint;
};

const fetchActivity = async (client: NonNullable<ReturnType<typeof usePublicClient>>): Promise<E3Activity> => {
  const latest = await client.getBlockNumber();

  // One wide eth_getLogs first; public RPCs that cap the range fall back to chunks.
  const scan = async <T>(get: (from: bigint, to: bigint) => Promise<T[]>, start: bigint): Promise<T[]> => {
    try {
      return await get(start, latest);
    } catch {
      /* range refused */
    }
    const out: T[] = [];
    for (let from = start; from <= latest; from += CHUNK) {
      const to = from + CHUNK - 1n < latest ? from + CHUNK - 1n : latest;
      out.push(...(await get(from, to)));
    }
    return out;
  };

  const [lifecycle, obligations] = await Promise.all([
    scan(
      (fromBlock, toBlock) =>
        client.getLogs({ address: INTERFOLD.address, events: [STAGE_CHANGED, FAILED, PAUSED_SET], fromBlock, toBlock }),
      INTERFOLD.deployedOnBlock,
    ),
    scan(
      (fromBlock, toBlock) => client.getLogs({ address: REGISTRY.address, event: OBLIGATION, fromBlock, toBlock }),
      REGISTRY_DEPLOYED_ON_BLOCK,
    ),
  ]);

  const byId = new Map<bigint, E3>();
  let pausedSinceBlock: bigint | undefined;
  for (const log of lifecycle) {
    if (log.eventName === "RequestsPausedSet") {
      pausedSinceBlock = log.args.paused ? log.blockNumber : undefined;
      continue;
    }
    const id = log.args.e3Id!;
    let e3 = byId.get(id);
    if (!e3) {
      e3 = {
        id,
        num: Number(id & COUNTER_MASK),
        requestBlock: log.blockNumber,
        requestTx: log.transactionHash,
        stage: 0,
        committee: [],
        obligated: [],
        candidates: [],
      };
      byId.set(id, e3);
    }
    if (log.eventName === "E3StageChanged") {
      e3.stage = log.args.newStage!;
      if (e3.stage === E3_COMPLETE || e3.stage === E3_FAILED) e3.endBlock = log.blockNumber;
    } else {
      e3.failedAtStage = log.args.failedAtStage;
      e3.reason = log.args.reason;
    }
  }

  // Committee membership. Sortition drafts a pool, then releases the operators it does not keep in
  // the same block; a terminal stage releases everyone. So: released before the terminal block and
  // never re-added = candidate; still active at the end (or now) = committee.
  type Track = { active: Set<string>; releasedEarly: Set<string> };
  const tracks = new Map<bigint, Track>();
  for (const log of obligations) {
    const op = log.args.operator!.toLowerCase();
    if (op === ZERO) continue;
    const e3 = byId.get(log.args.e3Id!);
    if (!e3) continue;
    let t = tracks.get(e3.id);
    if (!t) {
      t = { active: new Set(), releasedEarly: new Set() };
      tracks.set(e3.id, t);
    }
    if (log.args.active) {
      t.active.add(op);
      t.releasedEarly.delete(op);
    } else {
      t.active.delete(op);
      if (e3.endBlock === undefined || log.blockNumber < e3.endBlock) t.releasedEarly.add(op);
    }
  }
  for (const [id, t] of tracks) {
    const e3 = byId.get(id)!;
    e3.obligated = [...t.active];
    e3.candidates = [...t.releasedEarly];
    e3.committee = [...t.active];
  }
  // For finished E3s the registry released the committee at the end; recover it from the releases
  // that happened at or after the terminal block.
  for (const log of obligations) {
    const e3 = byId.get(log.args.e3Id!);
    if (!e3 || e3.endBlock === undefined || log.args.active || log.blockNumber < e3.endBlock) continue;
    const op = log.args.operator!.toLowerCase();
    if (op !== ZERO && !e3.committee.includes(op)) e3.committee.push(op);
  }

  const e3s = [...byId.values()].sort((a, b) => (a.requestBlock < b.requestBlock ? 1 : -1));

  const blocks = new Set<bigint>();
  for (const e3 of e3s.slice(0, DATED)) {
    blocks.add(e3.requestBlock);
    if (e3.endBlock !== undefined) blocks.add(e3.endBlock);
  }
  if (pausedSinceBlock !== undefined) blocks.add(pausedSinceBlock);
  const stamps = new Map<bigint, number>();
  await Promise.all(
    [...blocks].map(async b => {
      try {
        const blk = await client.getBlock({ blockNumber: b });
        stamps.set(b, Number(blk.timestamp));
      } catch {
        /* the row shows the block number instead */
      }
    }),
  );
  for (const e3 of e3s) {
    e3.requestedAt = stamps.get(e3.requestBlock);
    if (e3.endBlock !== undefined) e3.endedAt = stamps.get(e3.endBlock);
  }

  return {
    e3s,
    pausedSinceBlock,
    pausedSince: pausedSinceBlock !== undefined ? stamps.get(pausedSinceBlock) : undefined,
    latestBlock: latest,
  };
};

/**
 * Every E3 the Interfold contract has run on mainnet, with the committee the registry drafted for
 * each, so a bond owner can see which of its nodes took part and how the E3 ended. Public; the
 * event scan runs once a minute. Per-node behavior inside an E3 (who sent a DKG share) is not on
 * chain, so the most this can say is "in the committee of an E3 that failed at stage X".
 */
export const useE3Activity = () => {
  const publicClient = usePublicClient({ chainId: CHAIN_ID });
  const q = useQuery({
    queryKey: ["interfold", "e3-activity"],
    enabled: !!publicClient,
    queryFn: () => fetchActivity(publicClient!),
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 1,
  });
  const paused = useReadContract({
    address: INTERFOLD.address,
    abi: INTERFOLD.abi,
    functionName: "requestsPaused",
    chainId: CHAIN_ID,
    query: { refetchInterval: 60_000 },
  });

  const byOperator: Record<string, E3Duty[]> = {};
  for (const e3 of q.data?.e3s ?? []) {
    for (const op of e3.committee)
      (byOperator[op] ??= []).push({ e3, role: "committee", obligated: e3.obligated.includes(op) });
    for (const op of e3.candidates) (byOperator[op] ??= []).push({ e3, role: "candidate", obligated: false });
  }

  return {
    data: q.data,
    /** requestsPaused() on the contract; falls back to the last RequestsPausedSet log. */
    paused: paused.data ?? (q.data ? q.data.pausedSinceBlock !== undefined : undefined),
    /** Keyed by lower-cased operator, newest E3 first. */
    byOperator,
    isLoading: q.isLoading,
    /** The RPC refused the event scan: hide the E3 column rather than show "never drafted". */
    failed: q.isError,
  };
};

export const e3Outcome = (e3: E3): string => {
  if (e3.stage === E3_FAILED)
    return `failed: ${E3_FAILURE_REASON[e3.reason ?? 0] ?? `reason ${e3.reason}`} (while ${E3_STAGE[e3.failedAtStage ?? 0] ?? `stage ${e3.failedAtStage}`})`;
  return E3_STAGE[e3.stage] ?? `stage ${e3.stage}`;
};
