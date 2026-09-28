"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { type Address, getAddress, zeroAddress } from "viem";
import { usePublicClient } from "wagmi";
import { CHAIN_ID } from "~~/utils/interfold/contracts";
import { discoverOperators, discoveryKey } from "~~/utils/interfold/discovery";

export type OperatorSource = "events" | "safe" | "manual";

const storageKey = (owner: Address) => `interfold.operators.${owner.toLowerCase()}`;

const readManual = (owner: Address): Address[] => {
  try {
    const raw = localStorage.getItem(storageKey(owner));
    const arr = raw ? (JSON.parse(raw) as string[]) : [];
    return arr.map(a => getAddress(a));
  } catch {
    return [];
  }
};
const writeManual = (owner: Address, list: Address[]) => {
  try {
    localStorage.setItem(storageKey(owner), JSON.stringify(list));
  } catch {
    /* private mode / quota: list lives in memory only */
  }
};

/** Human labels ("Alice's node") keyed by lower-cased operator, per bond owner. */
const labelsKey = (owner: Address) => `interfold.labels.${owner.toLowerCase()}`;
const readLabels = (owner: Address): Record<string, string> => {
  try {
    const raw = localStorage.getItem(labelsKey(owner));
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
};
const writeLabels = (owner: Address, labels: Record<string, string>) => {
  try {
    localStorage.setItem(labelsKey(owner), JSON.stringify(labels));
  } catch {
    /* in-memory only */
  }
};

/**
 * Operators owned by `owner`, merged and de-duplicated from three sources:
 *  1-2. On-chain BondOwnerSet logs and Safe history (see utils/interfold/discovery.ts).
 *  3. Manual entries persisted in localStorage["interfold.operators.<owner>"].
 */
export const useOperatorList = (owner: Address | undefined) => {
  const publicClient = usePublicClient({ chainId: CHAIN_ID });
  const [manual, setManual] = useState<Address[]>([]);
  const [labels, setLabels] = useState<Record<string, string>>({});

  useEffect(() => {
    setManual(owner ? readManual(owner) : []);
    setLabels(owner ? readLabels(owner) : {});
  }, [owner]);

  const setLabel = useCallback(
    (a: Address, label: string) => {
      if (!owner) return;
      setLabels(prev => {
        const next = { ...prev };
        const k = a.toLowerCase();
        if (label.trim()) next[k] = label.trim();
        else delete next[k];
        writeLabels(owner, next);
        return next;
      });
    },
    [owner],
  );

  const discovery = useQuery({
    queryKey: discoveryKey(owner ?? zeroAddress),
    enabled: !!owner && !!publicClient,
    staleTime: 60_000,
    refetchInterval: 120_000,
    queryFn: () => discoverOperators(publicClient!, owner!),
  });

  const { operators, sources } = useMemo(() => {
    const sources: Record<string, OperatorSource[]> = {};
    const add = (list: readonly Address[] | undefined, src: OperatorSource) => {
      for (const a of list ?? []) {
        const k = a.toLowerCase();
        (sources[k] ??= []).push(src);
      }
    };
    add(discovery.data?.events, "events");
    add(discovery.data?.safe, "safe");
    add(manual, "manual");
    const operators = Object.keys(sources).map(k => getAddress(k));
    return { operators, sources };
  }, [discovery.data, manual]);

  const addManual = useCallback(
    (a: Address) => {
      if (!owner) return;
      setManual(prev => {
        if (prev.some(x => x.toLowerCase() === a.toLowerCase())) return prev;
        const next = [...prev, getAddress(a)];
        writeManual(owner, next);
        return next;
      });
    },
    [owner],
  );

  const removeManual = useCallback(
    (a: Address) => {
      if (!owner) return;
      setManual(prev => {
        const next = prev.filter(x => x.toLowerCase() !== a.toLowerCase());
        writeManual(owner, next);
        return next;
      });
    },
    [owner],
  );

  return {
    operators,
    sources,
    labels,
    setLabel,
    addManual,
    removeManual,
    isDiscovering: discovery.isLoading || discovery.isFetching,
    logsFailed: discovery.data?.logsFailed ?? false,
    /** Unix ms of the last successful scan (0 until the first one completes). */
    lastScan: discovery.dataUpdatedAt,
    discoveredCount: (discovery.data?.events.length ?? 0) + (discovery.data?.safe.length ?? 0),
    refetch: discovery.refetch,
  };
};
