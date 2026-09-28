"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { type Address, getAddress } from "viem";
import { usePublicClient } from "wagmi";
import { useFleetStatus } from "~~/hooks/interfold/useFleetStatus";
import { CHAIN_ID } from "~~/utils/interfold/contracts";
import { discoverOperators, discoveryKey } from "~~/utils/interfold/discovery";
import { sameAddr } from "~~/utils/interfold/format";

const STORAGE_KEY = "interfold.watch.owners";
const URL_PARAM = "owners";

/** Every checksummable address in a pasted blob (commas, spaces or newlines between them), de-duplicated. */
export const parseAddressList = (raw: string | null | undefined): Address[] => {
  const out: Address[] = [];
  for (const t of (raw ?? "").split(/[\s,;]+/)) {
    try {
      const a = getAddress(t);
      if (!out.some(x => sameAddr(x, a))) out.push(a);
    } catch {
      /* not an address */
    }
  }
  return out;
};

/**
 * The watch list: bond owners typed by whoever is looking, no wallet involved. Lives in the URL
 * (`?owners=0x…,0x…`, so the view can be shared) and in localStorage (so it survives a reload
 * without the query string). The URL wins when both are present.
 */
export const useWatchList = () => {
  const [owners, setOwners] = useState<Address[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let initial: Address[] = [];
    try {
      initial = parseAddressList(new URLSearchParams(window.location.search).get(URL_PARAM));
      if (initial.length === 0) initial = parseAddressList(localStorage.getItem(STORAGE_KEY));
    } catch {
      /* no storage */
    }
    setOwners(initial);
    setReady(true);
  }, []);

  const persist = useCallback((next: Address[]) => {
    setOwners(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* in-memory only */
    }
    try {
      const url = new URL(window.location.href);
      if (next.length) url.searchParams.set(URL_PARAM, next.join(","));
      else url.searchParams.delete(URL_PARAM);
      window.history.replaceState(null, "", url);
    } catch {
      /* ignore */
    }
  }, []);

  const add = useCallback(
    (list: readonly Address[]) => {
      const next = [...owners];
      for (const a of list) if (!next.some(x => sameAddr(x, a))) next.push(getAddress(a));
      if (next.length !== owners.length) persist(next);
    },
    [owners, persist],
  );
  const remove = useCallback((a: Address) => persist(owners.filter(x => !sameAddr(x, a))), [owners, persist]);

  return { owners, ready, add, remove };
};

export type WatchGroup = {
  owner: Address;
  /** Operators still bond-owned by this owner on-chain (transferred-away nodes are dropped). */
  operators: Address[];
  /** Operators whose status has not arrived yet: listed so the row count does not jump. */
  pending: Address[];
  isDiscovering: boolean;
  logsFailed: boolean;
  totalBonded: bigint;
  eligible: number;
};

/**
 * Nodes funded by several bond owners at once: one discovery query per owner (cache shared with
 * the Fleet page), then a single status multicall for the union of their operators.
 */
export const useWatchFleet = (owners: readonly Address[]) => {
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
  // useQueries returns a new array every render; these strings change only when a result does.
  const discoveryStamp = discoveries.map(d => `${d.dataUpdatedAt}:${d.isFetching}`).join("|");

  const candidates = useMemo(() => {
    const seen = new Set<string>();
    const out: Address[] = [];
    discoveries.forEach(d => {
      for (const a of [...(d.data?.events ?? []), ...(d.data?.safe ?? [])]) {
        const k = a.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(getAddress(k));
      }
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discoveryStamp]);

  const fleet = useFleetStatus(candidates);

  const groups = useMemo<WatchGroup[]>(
    () =>
      owners.map((owner, i) => {
        const d = discoveries[i];
        const found = new Set<string>();
        for (const a of [...(d?.data?.events ?? []), ...(d?.data?.safe ?? [])]) found.add(a.toLowerCase());
        const operators: Address[] = [];
        const pending: Address[] = [];
        for (const k of found) {
          const s = fleet.statuses[k];
          if (!s) pending.push(getAddress(k));
          else if (sameAddr(s.bondOwner, owner)) operators.push(getAddress(k));
        }
        const statuses = operators.map(op => fleet.statuses[op.toLowerCase()]);
        return {
          owner,
          operators,
          pending,
          isDiscovering: !!d && (d.isLoading || d.isFetching),
          logsFailed: d?.data?.logsFailed ?? false,
          totalBonded: statuses.reduce((a, s) => a + s.bond, 0n),
          eligible: statuses.filter(s => s.isActive).length,
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [owners, fleet.statuses, discoveryStamp],
  );

  const refetch = useCallback(() => {
    discoveries.forEach(d => d.refetch());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discoveryStamp]);

  return {
    groups,
    statuses: fleet.statuses,
    isDiscovering: discoveries.some(d => d.isLoading || d.isFetching),
    statusLoading: fleet.isLoading,
    refetch,
  };
};
