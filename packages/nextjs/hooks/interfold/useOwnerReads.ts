"use client";

import { type Address, parseUnits } from "viem";
import { useReadContracts } from "wagmi";
import { CHAIN_ID, FOLD, GOVERNANCE, REGISTRY, SUSDS, TICKET_TOKEN } from "~~/utils/interfold/contracts";

export const ONE = parseUnits("1", 18);

/** How often a bond owner's balances and votes are re-read. Writes invalidate the query on confirmation. */
const OWNER_POLL_MS = 60_000;

/** Funds first (8 reads), then voting power (5). Slice boundaries used by the two consumer hooks. */
export const FUNDS_READS = 8;
export const VOTES_READS = 5;

/**
 * Every per-owner read in one multicall: what the owner holds (for the wizard's gates) and what the
 * DAO counts for it. The funds and votes hooks both call this with the same contract list, so React
 * Query serves both from one request instead of two.
 */
export const useOwnerReads = (owner: Address | undefined) =>
  useReadContracts({
    contracts: owner
      ? [
          { address: FOLD.address, abi: FOLD.abi, functionName: "balanceOf", args: [owner], chainId: CHAIN_ID },
          {
            address: FOLD.address,
            abi: FOLD.abi,
            functionName: "transferableBalanceOf",
            args: [owner],
            chainId: CHAIN_ID,
          },
          { address: FOLD.address, abi: FOLD.abi, functionName: "lockedBalanceOf", args: [owner], chainId: CHAIN_ID },
          {
            address: FOLD.address,
            abi: FOLD.abi,
            functionName: "allowance",
            args: [owner, REGISTRY.address],
            chainId: CHAIN_ID,
          },
          { address: SUSDS.address, abi: SUSDS.abi, functionName: "balanceOf", args: [owner], chainId: CHAIN_ID },
          {
            address: SUSDS.address,
            abi: SUSDS.abi,
            functionName: "allowance",
            args: [owner, TICKET_TOKEN.address],
            chainId: CHAIN_ID,
          },
          {
            address: REGISTRY.address,
            abi: REGISTRY.abi,
            functionName: "totalBonded",
            args: [owner],
            chainId: CHAIN_ID,
          },
          { address: SUSDS.address, abi: SUSDS.abi, functionName: "convertToAssets", args: [ONE], chainId: CHAIN_ID },
          { ...GOVERNANCE.votes, functionName: "getVotes", args: [owner], chainId: CHAIN_ID },
          { ...GOVERNANCE.bondedCheckpoints, functionName: "bonded", args: [owner], chainId: CHAIN_ID },
          { ...GOVERNANCE.escrow, functionName: "votingPowerForAccount", args: [owner], chainId: CHAIN_ID },
          { ...GOVERNANCE.escrowVotes, functionName: "getVotes", args: [owner], chainId: CHAIN_ID },
          { ...GOVERNANCE.escrowVotes, functionName: "delegates", args: [owner], chainId: CHAIN_ID },
        ]
      : [],
    query: { enabled: !!owner, refetchInterval: OWNER_POLL_MS, staleTime: OWNER_POLL_MS / 2 },
  });
