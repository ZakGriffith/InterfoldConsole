"use client";

import { useQuery } from "@tanstack/react-query";
import { type Address } from "viem";
import { usePublicClient, useReadContracts } from "wagmi";
import { CHAIN_ID, REFUND_MANAGER, USDS_ADDRESS } from "~~/utils/interfold/contracts";
import { scanLogs } from "~~/utils/interfold/discovery";
import { sameAddr, shortAddr } from "~~/utils/interfold/format";

const COUNTER_MASK = (1n << 96n) - 1n;
/** Rewards only change when an E3 completes or someone claims; the ledger scan is cheap to repeat. */
const LEDGER_POLL_MS = 5 * 60_000;
const PENDING_POLL_MS = 60_000;

/** One committee member's share of a completed E3's payment, parked for its bond owner. */
export type HeldReward = {
  e3Id: bigint;
  num: number;
  /** Lower-cased operator that did the work. */
  operator: string;
  /** Lower-cased bond owner the manager snapshotted as payee. */
  recipient: string;
  token: Address;
  amount: bigint;
};

export type RewardLedger = {
  held: HeldReward[];
  /** Paid out so far, per `${e3Id}:${recipient}`. */
  claimed: Record<string, bigint>;
  /** What each committee member earned on an E3 (shares within one E3 are equal), by e3Id string. */
  perE3: Record<string, { amount: bigint; token: Address }>;
};

/** What one bond owner is owed from one E3, across all of its nodes on that committee. */
export type OwnerE3Reward = {
  e3Id: bigint;
  num: number;
  token: Address;
  operators: string[];
  earned: bigint;
  claimed: bigint;
  /** From pendingHeldSuccessReward; undefined until read. */
  claimable?: bigint;
};

export const tokenSymbol = (token: Address) => (sameAddr(token, USDS_ADDRESS) ? "USDS" : shortAddr(token));

const fetchLedger = async (client: NonNullable<ReturnType<typeof usePublicClient>>): Promise<RewardLedger> => {
  const latest = await client.getBlockNumber();
  const logs = await scanLogs(
    (fromBlock, toBlock) =>
      client.getLogs({
        address: REFUND_MANAGER.address,
        events: REFUND_MANAGER.abi.filter(x => x.type === "event"),
        fromBlock,
        toBlock,
      }),
    REFUND_MANAGER.deployedOnBlock,
    latest,
  );

  const recipients = new Map<string, string>();
  const held: HeldReward[] = [];
  const claimed: Record<string, bigint> = {};
  const perE3: RewardLedger["perE3"] = {};
  for (const log of logs) {
    const e3Id = log.args.e3Id!;
    if (log.eventName === "RewardRecipientSnapshotted") {
      recipients.set(`${e3Id}:${log.args.operator!.toLowerCase()}`, log.args.recipient!.toLowerCase());
    } else if (log.eventName === "SuccessRewardHeld") {
      held.push({
        e3Id,
        num: Number(e3Id & COUNTER_MASK),
        operator: log.args.operator!.toLowerCase(),
        recipient: "",
        token: log.args.token!,
        amount: log.args.amount!,
      });
    } else {
      const key = `${e3Id}:${log.args.account!.toLowerCase()}`;
      claimed[key] = (claimed[key] ?? 0n) + log.args.amount!;
    }
  }
  for (const h of held) {
    // The snapshot is taken when the committee forms; a missing one would mean the manager paid the operator itself.
    h.recipient = recipients.get(`${h.e3Id}:${h.operator}`) ?? h.operator;
    perE3[h.e3Id.toString()] = { amount: h.amount, token: h.token };
  }
  return { held, claimed, perE3 };
};

/**
 * E3 earnings: every success reward the refund manager has held since launch (one shared scan),
 * and, for `owner`, what it is owed per E3 with the live claimable amount. Earnings go to the bond
 * owner, never to the node's hot wallet, and the owner must claim them one E3 at a time.
 */
export const useE3Rewards = (owner?: Address) => {
  const publicClient = usePublicClient({ chainId: CHAIN_ID });
  const ledger = useQuery({
    queryKey: ["interfold", "e3-rewards"],
    enabled: !!publicClient,
    queryFn: () => fetchLedger(publicClient!),
    staleTime: LEDGER_POLL_MS,
    refetchInterval: LEDGER_POLL_MS,
    retry: 1,
  });

  const me = owner?.toLowerCase();
  const mine = me ? (ledger.data?.held ?? []).filter(h => h.recipient === me) : [];
  const e3Ids = [...new Set(mine.map(h => h.e3Id))];
  const pending = useReadContracts({
    contracts: e3Ids.map(e3Id => ({
      address: REFUND_MANAGER.address,
      abi: REFUND_MANAGER.abi,
      functionName: "pendingHeldSuccessReward",
      args: [e3Id, owner!],
      chainId: CHAIN_ID,
    })),
    query: { enabled: !!owner && e3Ids.length > 0, refetchInterval: PENDING_POLL_MS, staleTime: PENDING_POLL_MS / 2 },
  });

  const byE3: OwnerE3Reward[] = e3Ids.map((e3Id, i) => {
    const shares = mine.filter(h => h.e3Id === e3Id);
    const r = pending.data?.[i];
    return {
      e3Id,
      num: shares[0].num,
      token: shares[0].token,
      operators: shares.map(h => h.operator),
      earned: shares.reduce((sum, h) => sum + h.amount, 0n),
      claimed: ledger.data?.claimed[`${e3Id}:${me}`] ?? 0n,
      claimable: r?.status === "success" ? (r.result as bigint) : undefined,
    };
  });
  const earned = byE3.reduce((sum, e) => sum + e.earned, 0n);
  const claimedTotal = byE3.reduce((sum, e) => sum + e.claimed, 0n);
  const claimable = byE3.every(e => e.claimable !== undefined)
    ? byE3.reduce((sum, e) => sum + (e.claimable ?? 0n), 0n)
    : undefined;

  return {
    ledger: ledger.data,
    isLoading: ledger.isLoading,
    error: ledger.error ?? undefined,
    byE3,
    earned,
    claimed: claimedTotal,
    claimable,
  };
};
