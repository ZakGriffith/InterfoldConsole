"use client";

import { useQuery } from "@tanstack/react-query";
import { type Address } from "viem";
import { sameAddr } from "~~/utils/interfold/format";

/**
 * The Interfold Foundation's IPP-001 tracker (rewards.theinterfold.com) publishes a static
 * state.json recomputed from an archive RPC by a scheduled job: per-epoch ticket-block accrual
 * per bond owner and the FOLD payout that implies. The console reads that file instead of
 * replaying 500k blocks of ticket balances itself. The file is served with open CORS.
 */
export const REWARDS_URL = process.env.NEXT_PUBLIC_REWARDS_URL ?? "https://rewards.theinterfold.com/state.json";
export const REWARDS_SITE = "https://rewards.theinterfold.com/";

export type RewardsEpoch = {
  index: number;
  startBlock: string | null;
  endBlock: string | null;
  startTs: number;
  endTs: number;
  poolWei: string;
  status: "complete" | "in-progress" | "upcoming";
  blocksObserved: string;
  totalTicketBlocks: string;
  operatorCount: number;
  operators: {
    /** Lower-cased bond owner. */
    operator: string;
    ens: string | null;
    /** Sum over observed blocks of min(tickets, cap). */
    ticketBlocks: string;
    sharePct: number;
    estPayoutWei: string;
  }[];
};

export type RewardsState = {
  schema?: number;
  generatedAt: string;
  headBlock: string;
  program: {
    id: string;
    name: string;
    t0Block: string;
    t0Ts: number;
    epochSeconds: number;
    epochs: number;
    weights: string[];
    totalPool: string;
    cap: string;
    proposal: string;
  };
  epochs: RewardsEpoch[];
  snapshot: {
    node: string;
    operator: string;
    ens: string | null;
    ticketBalanceWei: string;
    tickets: number;
    bondWei: string;
    banned: boolean;
    active: boolean;
  }[];
  notes: string[];
};

/** The tracker regenerates every few hours; the file is small, so refresh often enough to catch an epoch rollover. */
const STALE_MS = 5 * 60_000;
const POLL_MS = 15 * 60_000;

export const useFoldRewards = () =>
  useQuery({
    queryKey: ["fold-rewards", REWARDS_URL],
    queryFn: async (): Promise<RewardsState> => {
      const r = await fetch(REWARDS_URL, { cache: "no-store" });
      if (!r.ok) throw new Error(`rewards tracker ${r.status}`);
      return r.json();
    },
    staleTime: STALE_MS,
    refetchInterval: POLL_MS,
    retry: 1,
  });

/** One epoch's line for one bond owner. */
export type OwnerEpochReward = {
  index: number;
  status: RewardsEpoch["status"];
  startTs: number;
  endTs: number;
  poolWei: bigint;
  /** Estimated payout: pool × this owner's ticket-blocks ÷ everyone's. Settled once the epoch is complete. */
  payout: bigint;
  sharePct: number;
  /** Average credited tickets per observed block (the cap applies per owner, not per node). */
  creditedAvg: number;
};

export type OwnerFoldRewards = {
  epochs: OwnerEpochReward[];
  /** Sum of payouts across complete epochs. */
  settled: bigint;
  settledEpochs: number;
  /** The in-progress epoch's line, if the owner is accruing in it. */
  current?: OwnerEpochReward;
  /** The in-progress epoch itself, whether or not the owner appears in it. */
  currentEpoch?: RewardsEpoch;
  /** What the remaining epochs would pay if the owner's current share held. */
  projected: bigint;
  projectedEpochs: number;
  /** Index of the program's final epoch. */
  lastEpoch: number;
  /** Tickets across the owner's active nodes at the tracker's head block, and what counts after the cap. */
  tickets: number;
  credited: number;
  cap: number;
  /** True when the owner appears nowhere in the tracker. */
  empty: boolean;
};

const big = (s: string | null | undefined) => (s ? BigInt(s) : 0n);

/** Pure selector so the table and the owner strip derive from one fetch. */
export const ownerFoldRewards = (state: RewardsState | undefined, owner: Address): OwnerFoldRewards | undefined => {
  if (!state) return undefined;
  const epochs: OwnerEpochReward[] = [];
  let settled = 0n;
  let settledEpochs = 0;
  let current: OwnerEpochReward | undefined;
  const currentEpoch = state.epochs.find(e => e.status === "in-progress");
  for (const e of state.epochs) {
    const row = e.operators.find(o => sameAddr(o.operator, owner));
    if (!row) continue;
    const blocks = Number(e.blocksObserved) || 1;
    const line: OwnerEpochReward = {
      index: e.index,
      status: e.status,
      startTs: e.startTs,
      endTs: e.endTs,
      poolWei: big(e.poolWei),
      payout: big(row.estPayoutWei),
      sharePct: row.sharePct,
      creditedAvg: Number(row.ticketBlocks) / blocks,
    };
    epochs.push(line);
    if (e.status === "complete") {
      settled += line.payout;
      settledEpochs++;
    } else if (e.status === "in-progress") {
      current = line;
    }
  }

  // Forward look: the latest share the owner holds, applied to every epoch that has not closed.
  const latest = current ?? epochs[epochs.length - 1];
  const shareBps = latest && latest.status !== "complete" ? Math.round(latest.sharePct * 100) : 0;
  let projected = 0n;
  let projectedEpochs = 0;
  if (shareBps > 0) {
    for (const e of state.epochs) {
      if (e.status !== "upcoming") continue;
      projected += (big(e.poolWei) * BigInt(shareBps)) / 10_000n;
      projectedEpochs++;
    }
  }

  const cap = Number(state.program.cap);
  const tickets = state.snapshot
    .filter(n => n.active && sameAddr(n.operator, owner))
    .reduce((t, n) => t + n.tickets, 0);

  return {
    epochs,
    settled,
    settledEpochs,
    current,
    currentEpoch,
    projected,
    projectedEpochs,
    lastEpoch: state.program.epochs,
    tickets,
    credited: Math.min(tickets, cap),
    cap,
    empty: epochs.length === 0 && tickets === 0,
  };
};

export const useOwnerFoldRewards = (owner: Address) => {
  const q = useFoldRewards();
  return { ...q, rewards: ownerFoldRewards(q.data, owner) };
};
