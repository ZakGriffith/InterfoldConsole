"use client";

import { type Address, parseUnits } from "viem";
import { useReadContracts } from "wagmi";
import scaffoldConfig from "~~/scaffold.config";
import { CHAIN_ID, FOLD, REGISTRY, SUSDS, TICKET_TOKEN } from "~~/utils/interfold/contracts";

export type OwnerFunds = {
  foldBalance: bigint;
  foldTransferable: bigint;
  foldLocked: bigint;
  /** FOLD allowance granted to the BondingRegistry (spender for bondCiphernodeFor). */
  foldAllowance: bigint;
  susdsBalance: bigint;
  /** sUSDS allowance granted to the InterfoldTicketToken (spender for addTicketBalanceFor). */
  susdsAllowance: bigint;
  totalBonded: bigint;
  /** USDS assets backing 1e18 sUSDS shares (ERC-4626 convertToAssets). */
  susdsRate: bigint;
  ethBalance?: bigint;
};

const ONE = parseUnits("1", 18);

/** Everything the bond owner (the Safe) holds that the wizard gates on. One multicall per poll. */
export const useOwnerFunds = (owner: Address | undefined) => {
  const q = useReadContracts({
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
        ]
      : [],
    query: { enabled: !!owner, refetchInterval: scaffoldConfig.pollingInterval },
  });

  const r = q.data;
  const ok = !!r && r.length === 8 && r.every(x => x.status === "success");
  const data: OwnerFunds | undefined = ok
    ? {
        foldBalance: r[0].result as bigint,
        foldTransferable: r[1].result as bigint,
        foldLocked: r[2].result as bigint,
        foldAllowance: r[3].result as bigint,
        susdsBalance: r[4].result as bigint,
        susdsAllowance: r[5].result as bigint,
        totalBonded: r[6].result as bigint,
        susdsRate: r[7].result as bigint,
      }
    : undefined;

  return { data, isLoading: q.isLoading, error: q.error ?? undefined, refetch: q.refetch };
};

/** USDS value of `shares` sUSDS given the polled rate. */
export const susdsToUsds = (shares: bigint, rate: bigint | undefined): bigint | undefined =>
  rate === undefined ? undefined : (shares * rate) / ONE;
