"use client";

import { type Address } from "viem";
import { useReadContracts } from "wagmi";
import scaffoldConfig from "~~/scaffold.config";
import { CHAIN_ID, GOVERNANCE } from "~~/utils/interfold/contracts";

export type VotingPower = {
  /** What the DAO counts for this account right now (BondedVotes.getVotes). */
  total: bigint;
  /** FOLD bonded through the registry, credited to the bond owner; cannot be delegated. */
  bonded: bigint;
  /** Vesting-locked FOLD still in the wallet, net of the bond; cannot be delegated. */
  vesting: bigint;
  /** FOLD this account has locked in the voting escrow; votes only once delegated. */
  escrowLocked: bigint;
  /** Escrow votes currently delegated to this account (its own locks and anyone else's). */
  escrowVotes: bigint;
  /** Where this account's escrow locks are delegated (zero address = nowhere, so they do not count). */
  delegate: Address;
};

/** Voting power of one bond owner, split by source. One multicall per poll. */
export const useVotingPower = (owner: Address | undefined) => {
  const q = useReadContracts({
    contracts: owner
      ? [
          { ...GOVERNANCE.votes, functionName: "getVotes", args: [owner], chainId: CHAIN_ID },
          { ...GOVERNANCE.bondedCheckpoints, functionName: "bonded", args: [owner], chainId: CHAIN_ID },
          { ...GOVERNANCE.escrow, functionName: "votingPowerForAccount", args: [owner], chainId: CHAIN_ID },
          { ...GOVERNANCE.escrowVotes, functionName: "getVotes", args: [owner], chainId: CHAIN_ID },
          { ...GOVERNANCE.escrowVotes, functionName: "delegates", args: [owner], chainId: CHAIN_ID },
        ]
      : [],
    query: { enabled: !!owner, refetchInterval: scaffoldConfig.pollingInterval },
  });

  const r = q.data;
  const ok = !!r && r.length === 5 && r.every(x => x.status === "success");
  let data: VotingPower | undefined;
  if (ok) {
    const total = r[0].result as bigint;
    const bonded = r[1].result as bigint;
    const escrowVotes = r[3].result as bigint;
    const rest = total - bonded - escrowVotes;
    data = {
      total,
      bonded,
      vesting: rest > 0n ? rest : 0n,
      escrowLocked: r[2].result as bigint,
      escrowVotes,
      delegate: r[4].result as Address,
    };
  }
  return { data, isLoading: q.isLoading, error: q.error ?? undefined };
};
