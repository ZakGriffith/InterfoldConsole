"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { type Address, getAddress, parseAbiItem } from "viem";
import { usePublicClient } from "wagmi";
import { CHAIN_ID, REGISTRY, REGISTRY_DEPLOYED_ON_BLOCK } from "~~/utils/interfold/contracts";
import { discoverOperatorsFromSafeHistory } from "~~/utils/interfold/safeDiscovery";

export type OperatorSource = "events" | "safe" | "manual";

const BOND_OWNER_SET = parseAbiItem("event BondOwnerSet(address indexed operator, address indexed bondOwner)");
const CHUNK = 20_000n;
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
 *  1. BondOwnerSet(operator, bondOwner = owner) logs since the registry was deployed. One wide
 *     eth_getLogs first (indexed filter => tiny response); public RPCs that refuse wide ranges
 *     fall back to 20k-block chunks.
 *  2. Safe Transaction Service: every executed Safe tx to the registry, decoded for its operator arg.
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
    queryKey: ["interfold", "operators", owner],
    enabled: !!owner && !!publicClient,
    staleTime: 60_000,
    refetchInterval: 120_000,
    queryFn: async () => {
      if (!owner || !publicClient) return { events: [] as Address[], safe: [] as Address[], logsFailed: false };
      const latest = await publicClient.getBlockNumber();

      const fromEvents = async (): Promise<{ ops: Address[]; failed: boolean }> => {
        const getLogs = (fromBlock: bigint, toBlock: bigint) =>
          publicClient.getLogs({
            address: REGISTRY.address,
            event: BOND_OWNER_SET,
            args: { bondOwner: owner },
            fromBlock,
            toBlock,
          });
        try {
          const logs = await getLogs(REGISTRY_DEPLOYED_ON_BLOCK, latest);
          return { ops: logs.map(l => l.args.operator!).filter(Boolean), failed: false };
        } catch {
          /* wide range refused: chunk */
        }
        try {
          const ops: Address[] = [];
          for (let from = REGISTRY_DEPLOYED_ON_BLOCK; from <= latest; from += CHUNK) {
            const to = from + CHUNK - 1n < latest ? from + CHUNK - 1n : latest;
            const logs = await getLogs(from, to);
            ops.push(...logs.map(l => l.args.operator!).filter(Boolean));
          }
          return { ops, failed: false };
        } catch {
          return { ops: [], failed: true };
        }
      };

      const [ev, safe] = await Promise.all([
        fromEvents(),
        discoverOperatorsFromSafeHistory(owner, REGISTRY.address, REGISTRY.abi as any),
      ]);
      return { events: ev.ops, safe, logsFailed: ev.failed };
    },
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
