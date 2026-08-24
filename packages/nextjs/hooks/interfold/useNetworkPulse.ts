"use client";

import { useReadContracts } from "wagmi";
import { CHAIN_ID, REGISTRY, TICKET_TOKEN } from "~~/utils/interfold/contracts";

export type NetworkPulse = {
  registered: bigint;
  active: bigint;
  /** Sum of every operator's ciphernode bond held by the registry (FOLD wei). */
  bonded: bigint;
  /** Network-wide ticket balance = tFOLD supply (sUSDS wei), and the whole tickets it buys. */
  ticketBalance: bigint;
  tickets: bigint;
};

/** The same three headline numbers as dashboard.theinterfold.com, plus tickets. Public; one multicall per minute. */
export const useNetworkPulse = () => {
  const q = useReadContracts({
    contracts: [
      { address: REGISTRY.address, abi: REGISTRY.abi, functionName: "numRegisteredOperators", chainId: CHAIN_ID },
      { address: REGISTRY.address, abi: REGISTRY.abi, functionName: "numActiveOperators", chainId: CHAIN_ID },
      { address: REGISTRY.address, abi: REGISTRY.abi, functionName: "totalCiphernodeBondLiability", chainId: CHAIN_ID },
      { address: TICKET_TOKEN.address, abi: TICKET_TOKEN.abi, functionName: "totalSupply", chainId: CHAIN_ID },
      { address: REGISTRY.address, abi: REGISTRY.abi, functionName: "ticketPrice", chainId: CHAIN_ID },
    ],
    query: { refetchInterval: 60_000, staleTime: 30_000 },
  });
  const r = q.data;
  const ok = !!r && r.length === 5 && r.every(x => x.status === "success");
  const data: NetworkPulse | undefined = ok
    ? (() => {
        const ticketBalance = r[3].result as bigint;
        const price = r[4].result as bigint;
        return {
          registered: r[0].result as bigint,
          active: r[1].result as bigint,
          bonded: r[2].result as bigint,
          ticketBalance,
          tickets: price > 0n ? ticketBalance / price : 0n,
        };
      })()
    : undefined;
  return { data, isLoading: q.isLoading, error: q.error ?? undefined };
};
