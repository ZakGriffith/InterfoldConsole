"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { type Address, getAddress, zeroAddress } from "viem";
import { usePublicClient } from "wagmi";
import { useFleetStatus } from "~~/hooks/interfold/useFleetStatus";
import { CHAIN_ID } from "~~/utils/interfold/contracts";
import { discoverAllOperators } from "~~/utils/interfold/discovery";

export type NetworkOwner = {
  owner: Address;
  operators: Address[];
  nodes: number;
  eligible: number;
  bonded: bigint;
  tickets: bigint;
};

/**
 * Every bond owner on the network, from every operator that ever set one, grouped by who funds
 * each node today. One log scan (refreshed every 2 minutes) and one status multicall.
 */
export const useNetworkOwners = () => {
  const publicClient = usePublicClient({ chainId: CHAIN_ID });
  const q = useQuery({
    queryKey: ["interfold", "all-operators"],
    enabled: !!publicClient,
    staleTime: 60_000,
    refetchInterval: 120_000,
    queryFn: () => discoverAllOperators(publicClient!),
  });
  const operators = useMemo(() => q.data?.operators ?? [], [q.data]);
  const fleet = useFleetStatus(operators);

  const owners = useMemo<NetworkOwner[]>(() => {
    const by: Record<string, NetworkOwner> = {};
    for (const op of operators) {
      const s = fleet.statuses[op.toLowerCase()];
      if (!s || s.bondOwner === zeroAddress) continue;
      const k = s.bondOwner.toLowerCase();
      const row = (by[k] ??= { owner: getAddress(k), operators: [], nodes: 0, eligible: 0, bonded: 0n, tickets: 0n });
      row.operators.push(op);
      row.nodes++;
      if (s.isActive) row.eligible++;
      row.bonded += s.bond;
      row.tickets += s.availableTickets;
    }
    return Object.values(by);
  }, [operators, fleet.statuses]);

  return {
    owners,
    operatorCount: operators.length,
    isLoading: q.isLoading || (operators.length > 0 && fleet.isLoading),
    logsFailed: q.data?.logsFailed ?? false,
    error: q.error ?? undefined,
  };
};
