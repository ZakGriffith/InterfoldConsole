"use client";

import { useCallback, useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { type Address, getAddress } from "viem";
import { usePublicClient } from "wagmi";
import { useFleetStatus } from "~~/hooks/interfold/useFleetStatus";
import { CHAIN_ID } from "~~/utils/interfold/contracts";
import { discoverOperators, discoveryKey } from "~~/utils/interfold/discovery";
import { sameAddr } from "~~/utils/interfold/format";
import { readJson, useLocalStoreVersion, writeJson } from "~~/utils/interfold/localStore";

export type OperatorSource = "events" | "safe" | "manual";

/** Manually added operators and their labels, per bond owner, in this browser. */
const manualKey = (owner: Address) => `interfold.operators.${owner.toLowerCase()}`;
const labelsKey = (owner: Address) => `interfold.labels.${owner.toLowerCase()}`;

export type FleetSection = {
  owner: Address;
  /** Every operator that ever named this owner, plus manual entries; the status pill says if it still does. */
  operators: Address[];
  sources: Record<string, OperatorSource[]>;
  labels: Record<string, string>;
  isDiscovering: boolean;
  logsFailed: boolean;
  /** Unix ms of the last successful scan (0 until the first one completes). */
  lastScan: number;
  /** Nodes currently bond-owned by this owner on-chain. */
  nodeCount: number;
  eligible: number;
  totalBonded: bigint;
};

/**
 * The Fleet page's data for several bond owners at once: one discovery query per owner (shared
 * with the Watch page), manual nodes and labels from localStorage, and one status multicall for
 * every operator across all sections.
 */
export const useFleet = (owners: readonly Address[]) => {
  const publicClient = usePublicClient({ chainId: CHAIN_ID });
  const discoveries = useQueries({
    queries: owners.map(owner => ({
      queryKey: discoveryKey(owner),
      enabled: !!publicClient,
      staleTime: 60_000,
      refetchInterval: 120_000,
      queryFn: () => discoverOperators(publicClient!, owner),
    })),
  });
  // useQueries returns a new array every render; this string changes only when a result does.
  const stamp = discoveries.map(d => `${d.dataUpdatedAt}:${d.isFetching}`).join("|");
  const storeVersion = useLocalStoreVersion();

  const lists = useMemo(
    () =>
      owners.map((owner, i) => {
        const d = discoveries[i];
        const manual = storeVersion < 0 ? [] : readJson<string[]>(manualKey(owner), []);
        const labels = storeVersion < 0 ? {} : readJson<Record<string, string>>(labelsKey(owner), {});
        const sources: Record<string, OperatorSource[]> = {};
        const add = (list: readonly string[] | undefined, src: OperatorSource) => {
          for (const a of list ?? []) (sources[a.toLowerCase()] ??= []).push(src);
        };
        add(d?.data?.events, "events");
        add(d?.data?.safe, "safe");
        add(manual, "manual");
        return {
          owner,
          operators: Object.keys(sources).map(k => getAddress(k)),
          sources,
          labels,
          isDiscovering: !!d && (d.isLoading || d.isFetching),
          logsFailed: d?.data?.logsFailed ?? false,
          lastScan: d?.dataUpdatedAt ?? 0,
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [owners, stamp, storeVersion],
  );

  const allOperators = useMemo(() => {
    const seen = new Set<string>();
    const out: Address[] = [];
    for (const l of lists)
      for (const op of l.operators) {
        const k = op.toLowerCase();
        if (!seen.has(k)) {
          seen.add(k);
          out.push(op);
        }
      }
    return out;
  }, [lists]);
  const fleet = useFleetStatus(allOperators);

  const sections = useMemo<FleetSection[]>(
    () =>
      lists.map(l => {
        const owned = l.operators
          .map(op => fleet.statuses[op.toLowerCase()])
          .filter(s => s && sameAddr(s.bondOwner, l.owner));
        return {
          ...l,
          nodeCount: owned.length,
          eligible: owned.filter(s => s.isActive).length,
          totalBonded: owned.reduce((a, s) => a + s.bond, 0n),
        };
      }),
    [lists, fleet.statuses],
  );

  const setLabel = useCallback((owner: Address, op: Address, label: string) => {
    const next = { ...readJson<Record<string, string>>(labelsKey(owner), {}) };
    const k = op.toLowerCase();
    if (label.trim()) next[k] = label.trim();
    else delete next[k];
    writeJson(labelsKey(owner), next);
  }, []);
  const addManual = useCallback((owner: Address, op: Address) => {
    const cur = readJson<string[]>(manualKey(owner), []);
    if (cur.some(x => sameAddr(x, op))) return;
    writeJson(manualKey(owner), [...cur, getAddress(op)]);
  }, []);
  const removeManual = useCallback((owner: Address, op: Address) => {
    writeJson(
      manualKey(owner),
      readJson<string[]>(manualKey(owner), []).filter(x => !sameAddr(x, op)),
    );
  }, []);
  const refetch = useCallback(() => {
    discoveries.forEach(d => d.refetch());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stamp]);

  return {
    sections,
    statuses: fleet.statuses,
    statusLoading: fleet.isLoading,
    isDiscovering: discoveries.some(d => d.isLoading || d.isFetching),
    lastScan: Math.max(0, ...discoveries.map(d => d.dataUpdatedAt)),
    refetch,
    setLabel,
    addManual,
    removeManual,
  };
};
