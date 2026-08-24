"use client";

import { type Address } from "viem";
import { useReadContracts } from "wagmi";
import { CHAIN_ID, REGISTRY } from "~~/utils/interfold/contracts";

export type RegistryParams = {
  requiredCiphernodeBond: bigint;
  ticketPrice: bigint;
  minTicketBalance: bigint;
  exitDelay: bigint;
  ciphernodeBondActiveBps: bigint;
  numActiveOperators: bigint;
  numRegisteredOperators: bigint;
  ticketToken: Address;
  /** Bond below which a node drops to inactive: required * activeBps / 10000. */
  activeThreshold: bigint;
};

const FN = [
  "requiredCiphernodeBond",
  "ticketPrice",
  "minTicketBalance",
  "exitDelay",
  "ciphernodeBondActiveBps",
  "numActiveOperators",
  "numRegisteredOperators",
  "ticketToken",
] as const;

/** Owner-settable network parameters. One multicall, polled slowly (60 s). Never hard-code these. */
export const useRegistryParams = () => {
  const q = useReadContracts({
    contracts: FN.map(functionName => ({
      address: REGISTRY.address,
      abi: REGISTRY.abi,
      functionName,
      chainId: CHAIN_ID,
    })),
    query: { refetchInterval: 60_000, staleTime: 30_000 },
  });

  const r = q.data;
  const ok = !!r && r.every(x => x.status === "success");
  const data: RegistryParams | undefined = ok
    ? (() => {
        const required = r[0].result as bigint;
        const bps = r[4].result as bigint;
        return {
          requiredCiphernodeBond: required,
          ticketPrice: r[1].result as bigint,
          minTicketBalance: r[2].result as bigint,
          exitDelay: r[3].result as bigint,
          ciphernodeBondActiveBps: bps,
          numActiveOperators: r[5].result as bigint,
          numRegisteredOperators: r[6].result as bigint,
          ticketToken: r[7].result as Address,
          activeThreshold: (required * bps) / 10_000n,
        };
      })()
    : undefined;

  return { data, isLoading: q.isLoading, error: q.error ?? undefined, refetch: q.refetch };
};
