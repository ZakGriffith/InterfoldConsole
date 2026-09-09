"use client";

import { useEffect, useMemo, useState } from "react";
import { type Address, type Hex, hexToString, stringToHex } from "viem";
import { useReadContracts } from "wagmi";
import { CHAIN_ID, FOLD } from "~~/utils/interfold/contracts";

/** Unclassified claims sit under this policy and never unlock by time. */
const PENDING_POLICY_ID = stringToHex("PENDING", { size: 32 });
const TGE_ANCHOR = 1;
const STALE = 5 * 60_000;

type Curve = { anchor: number; start: bigint; cliffDuration: bigint; vestDuration: bigint };
type Policy = { holdUntil: bigint; unlock: Curve };
type LockEntry = { policyId: Hex; amount: bigint; policy: Policy | undefined };

export type FoldUnlock = {
  /** Sum of every lock entry: what the schedule covers, whether or not it is still in the wallet. */
  total: bigint;
  lockedNow: bigint;
  unlockedNow: bigint;
  /** What will have unlocked 30 days from now. */
  unlockedIn30d: bigint;
  /** Unix seconds when the last lock finishes. */
  fullyUnlockedAt: number | undefined;
  policies: string[];
};

/** Mirrors InterfoldToken._lockedAmount so projections match lockedBalanceAt. */
const lockedAmount = (lock: LockEntry, tge: bigint, noMoreLocks: bigint, ts: bigint): bigint => {
  if (ts >= noMoreLocks) return 0n;
  if (lock.policyId === PENDING_POLICY_ID || !lock.policy) return lock.amount;
  const { holdUntil, unlock: c } = lock.policy;
  if (ts < holdUntil) return lock.amount;
  const anchor = c.anchor === TGE_ANCHOR ? tge : c.start;
  if (anchor === 0n || ts < anchor + c.cliffDuration) return lock.amount;
  if (c.vestDuration === 0n || ts >= anchor + c.vestDuration) return 0n;
  return lock.amount - (lock.amount * (ts - anchor)) / c.vestDuration;
};

const unlockEnd = (lock: LockEntry, tge: bigint, noMoreLocks: bigint): bigint => {
  if (lock.policyId === PENDING_POLICY_ID || !lock.policy) return noMoreLocks;
  const c = lock.policy.unlock;
  const anchor = c.anchor === TGE_ANCHOR ? tge : c.start;
  if (anchor === 0n) return noMoreLocks;
  const curveEnd = anchor + (c.vestDuration === 0n ? c.cliffDuration : c.vestDuration);
  const end = curveEnd > lock.policy.holdUntil ? curveEnd : lock.policy.holdUntil;
  return end < noMoreLocks ? end : noMoreLocks;
};

const policyName = (id: Hex) => hexToString(id, { size: 32 }).replace(/\0+$/, "");

const fold = { address: FOLD.address, abi: FOLD.abi, chainId: CHAIN_ID } as const;

/** The owner's FOLD lock schedule (airdrop vesting), read from the token's lock entries and policies. */
export const useFoldUnlock = (owner: Address | undefined) => {
  const head = useReadContracts({
    contracts: owner
      ? [
          { ...fold, functionName: "lockCount", args: [owner] },
          { ...fold, functionName: "tgeTimestamp" },
          { ...fold, functionName: "NO_MORE_LOCKS" },
        ]
      : [],
    query: { enabled: !!owner, staleTime: STALE },
  });
  const h = head.data;
  const headOk = !!h && h.length === 3 && h.every(x => x.status === "success");
  const count = h && headOk ? Number(h[0].result as bigint) : 0;
  const tge = h && headOk ? (h[1].result as bigint) : 0n;
  const noMoreLocks = h && headOk ? (h[2].result as bigint) : 0n;

  const entries = useReadContracts({
    contracts:
      owner && count > 0
        ? Array.from({ length: count }, (_, i) => ({ ...fold, functionName: "locks", args: [owner, BigInt(i)] }))
        : [],
    query: { enabled: !!owner && count > 0, staleTime: STALE },
  });
  const rawLocks = useMemo(
    () =>
      entries.data && entries.data.every(x => x.status === "success")
        ? entries.data.map(x => {
            const [policyId, amount] = x.result as unknown as readonly [Hex, bigint];
            return { policyId, amount };
          })
        : undefined,
    [entries.data],
  );
  const policyIds = useMemo(
    () => [...new Set((rawLocks ?? []).map(l => l.policyId).filter(id => id !== PENDING_POLICY_ID))],
    [rawLocks],
  );

  const policies = useReadContracts({
    contracts: policyIds.map(id => ({ ...fold, functionName: "lockPolicyOf", args: [id] })),
    query: { enabled: policyIds.length > 0, staleTime: STALE },
  });

  // Tick once a minute so the unlocked figure creeps like the chain's does.
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 60_000);
    return () => clearInterval(t);
  }, []);

  const data = useMemo<FoldUnlock | undefined>(() => {
    if (!headOk || !rawLocks) return undefined;
    const empty = {
      total: 0n,
      lockedNow: 0n,
      unlockedNow: 0n,
      unlockedIn30d: 0n,
      fullyUnlockedAt: undefined,
      policies: [],
    };
    if (rawLocks.length === 0) return empty;
    const policiesOk = !!policies.data && policies.data.every(x => x.status === "success");
    if (policyIds.length > 0 && !policiesOk) return undefined;
    const byId = new Map<Hex, Policy>();
    policyIds.forEach((id, i) => byId.set(id, policies.data![i].result as unknown as Policy));
    const locks: LockEntry[] = rawLocks.map(l => ({ ...l, policy: byId.get(l.policyId) }));

    const sum = (f: (l: LockEntry) => bigint) => locks.reduce((acc, l) => acc + f(l), 0n);
    const ts = BigInt(now);
    const total = sum(l => l.amount);
    const lockedNow = sum(l => lockedAmount(l, tge, noMoreLocks, ts));
    const lockedIn30d = sum(l => lockedAmount(l, tge, noMoreLocks, ts + 30n * 86400n));
    const end = locks.map(l => unlockEnd(l, tge, noMoreLocks)).reduce((m, e) => (e > m ? e : m), 0n);
    return {
      total,
      lockedNow,
      unlockedNow: total - lockedNow,
      unlockedIn30d: total - lockedIn30d,
      fullyUnlockedAt: end === 0n ? undefined : Number(end),
      policies: [...new Set(locks.map(l => policyName(l.policyId)))],
    };
  }, [headOk, rawLocks, policyIds, policies.data, tge, noMoreLocks, now]);

  return {
    data,
    isLoading: head.isLoading || entries.isLoading || policies.isLoading,
    error: head.error ?? entries.error ?? policies.error ?? undefined,
  };
};
