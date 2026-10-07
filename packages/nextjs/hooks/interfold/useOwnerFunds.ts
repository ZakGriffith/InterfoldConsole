"use client";

import { FUNDS_READS, ONE, useOwnerReads } from "./useOwnerReads";
import { type Address } from "viem";

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

/** Everything the bond owner (the Safe) holds that the wizard gates on: the first slice of useOwnerReads. */
export const useOwnerFunds = (owner: Address | undefined) => {
  const q = useOwnerReads(owner);

  const r = q.data?.slice(0, FUNDS_READS);
  const ok = !!r && r.length === FUNDS_READS && r.every(x => x.status === "success");
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
