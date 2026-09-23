"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type Address, type Hex } from "viem";
import { type PeerEntry } from "~~/utils/interfold/peerIds";

type Registry = { enabled: boolean; peers: Record<string, PeerEntry> };

const QUERY_KEY = ["interfold", "peer-registry"];

/** Operator -> peer ID map from /api/peer-ids. `enabled` is false when this deployment has no store. */
export const usePeerRegistry = () => {
  const q = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async (): Promise<Registry> => {
      const r = await fetch("/api/peer-ids", { cache: "no-store" });
      if (!r.ok) throw new Error(`peer-ids ${r.status}`);
      return r.json();
    },
    staleTime: 30_000,
    refetchInterval: 120_000,
    retry: 1,
  });
  return {
    enabled: q.data?.enabled ?? false,
    peers: q.data?.peers ?? {},
    entryFor: (operator: Address | undefined) => (operator ? q.data?.peers[operator.toLowerCase()] : undefined),
    isLoading: q.isLoading,
    error: q.error ?? undefined,
  };
};

export type RegisterArgs = { operator: Address; peerId: string; signer?: Address; signature?: Hex };
export type RegisterError = Error & { needsSignature?: boolean };

/** POST to /api/peer-ids. Throws with `needsSignature` when the slot is taken and no signature was sent. */
export const useRegisterPeerId = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: RegisterArgs) => {
      const r = await fetch("/api/peer-ids", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(args),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        const err: RegisterError = new Error(body.error ?? `peer-ids ${r.status}`);
        err.needsSignature = !!body.needsSignature;
        throw err;
      }
      return body as { ok: true; entry: PeerEntry | null };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
};
