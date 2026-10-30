"use client";

import { useMemo } from "react";
import { type Address, zeroAddress } from "viem";
import { useReadContracts } from "wagmi";
import { CHAIN_ID, GOVERNANCE } from "~~/utils/interfold/contracts";
import { sameAddr } from "~~/utils/interfold/format";

/**
 * locked: the NFT sits with its owner and the FOLD counts as escrow voting power.
 * exiting: beginWithdrawal was sent; the NFT is parked in the escrow until the cooldown ends.
 * withdrawable: the cooldown has passed; withdraw pays the FOLD out.
 * withdrawn: the NFT was burned and the FOLD is back in the owner's wallet.
 */
export type LockPhase = "locked" | "exiting" | "withdrawable" | "withdrawn";

export type LockState = {
  tokenId: bigint;
  phase: LockPhase;
  /** Unix seconds when the cooldown ends (exiting / withdrawable). */
  exitDate?: number;
  /** The escrow is already approved to take this NFT, so only beginWithdrawal is left to start the exit. */
  approved: boolean;
};

export type LockStates = {
  /** Exit-queue cooldown in seconds (30 days at launch). */
  cooldown: number;
  /** Exit fee in basis points of the lock; 0 at launch. */
  feeBps: number;
  locks: LockState[];
};

const READS_PER_LOCK = 4;
const HEAD_READS = 2;
const POLL_MS = 60_000;

/** Live state of a set of escrow locks (ownerOf, getApproved, queue entry, canExit each) in one multicall. */
export const useLockStates = (tokenIds: readonly bigint[]) => {
  const contracts = useMemo(
    () => [
      { ...GOVERNANCE.exitQueue, functionName: "cooldown", chainId: CHAIN_ID },
      { ...GOVERNANCE.exitQueue, functionName: "feePercent", chainId: CHAIN_ID },
      ...tokenIds.flatMap(id => [
        { ...GOVERNANCE.lockNft, functionName: "ownerOf", args: [id], chainId: CHAIN_ID },
        { ...GOVERNANCE.lockNft, functionName: "getApproved", args: [id], chainId: CHAIN_ID },
        { ...GOVERNANCE.exitQueue, functionName: "queue", args: [id], chainId: CHAIN_ID },
        { ...GOVERNANCE.exitQueue, functionName: "canExit", args: [id], chainId: CHAIN_ID },
      ]),
    ],
    [tokenIds],
  );
  const q = useReadContracts({
    contracts: contracts as any,
    allowFailure: true,
    batchSize: 32_768,
    query: { enabled: tokenIds.length > 0, refetchInterval: POLL_MS, staleTime: POLL_MS / 2 },
  });

  const r = q.data;
  let data: LockStates | undefined;
  if (r && r.length === HEAD_READS + tokenIds.length * READS_PER_LOCK) {
    const head0 = r[0];
    const head1 = r[1];
    const cooldown = head0?.status === "success" ? Number(head0.result) : 30 * 86_400;
    const feeBps = head1?.status === "success" ? Number(head1.result) : 0;
    const locks = tokenIds.map((tokenId, i) => {
      const base = HEAD_READS + i * READS_PER_LOCK;
      const own = r[base];
      const appr = r[base + 1];
      const ticket = r[base + 2];
      const exitable = r[base + 3];
      // ownerOf reverts once the NFT is burned, which is what withdraw does.
      const holder = own?.status === "success" ? (own.result as Address) : undefined;
      const entry =
        ticket?.status === "success"
          ? (ticket.result as { holder: Address; queuedAt: bigint; cooldown: bigint })
          : undefined;
      const queued = !!entry && !sameAddr(entry.holder, zeroAddress);
      const exitDate = queued ? Number(entry.queuedAt + entry.cooldown) : undefined;
      const canExit = exitable?.status === "success" && exitable.result === true;
      const approved = appr?.status === "success" && sameAddr(appr.result as Address, GOVERNANCE.escrow.address);
      const phase: LockPhase = !holder
        ? "withdrawn"
        : queued || sameAddr(holder, GOVERNANCE.escrow.address)
          ? canExit
            ? "withdrawable"
            : "exiting"
          : "locked";
      return { tokenId, phase, exitDate, approved };
    });
    data = { cooldown, feeBps, locks };
  }
  return { data, isLoading: q.isLoading, isError: q.isError };
};
