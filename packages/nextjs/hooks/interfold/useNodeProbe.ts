"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

/** One row of probe.json, written by .github/workflows/probe.yaml from probe/probe.mjs. */
export type ProbeNode = {
  operator: string;
  /** "peer-id" = found through the DHT from the registered peer ID; "host" = fixed entry in nodes.json */
  via?: "host" | "peer-id";
  host?: string;
  port?: number;
  peerId?: string;
  addrs?: string[];
  checkedAt: string;
  /** true = answered identify, false = lookup or dial failed, null = nothing to dial */
  ok: boolean | null;
  rttMs?: number;
  agentVersion?: string | null;
  /** "0.16.0" parsed from agentVersion "interfold-ciphernode/0.16.0" */
  version?: string | null;
  /** identify protocol matched the mainnet network id + protocol version + deployment fingerprint */
  sameNetwork?: boolean;
  error?: string;
  /** Which step failed on a peer-ID probe: the DHT lookup, the dial, or identify. */
  stage?: "lookup" | "dial" | "identify";
  /** public-ip:listen-port guesses dialed after the DHT addresses failed (NAT rewrote the port). */
  tried?: string[];
  /** The guess that answered, when the DHT addresses did not. */
  fallback?: string;
};

export type ProbeReport = {
  generatedAt: string;
  latestRelease: string | null;
  identifyProtocol: string;
  /** operators with a registered peer ID at probe time */
  registry?: number;
  dhtPeers?: number;
  bootstrap: ProbeNode;
  nodes: ProbeNode[];
};

/** Results older than this mean the GitHub cron has stopped; the console says so instead of showing stale versions. */
export const PROBE_STALE_MS = 45 * 60_000;

const PROBE_URL =
  process.env.NEXT_PUBLIC_PROBE_URL ??
  "https://raw.githubusercontent.com/ZakGriffith/InterfoldConsole/probe-data/probe.json";

type Fetched = { report: ProbeReport; ageMs: number };

const fetchReport = async (): Promise<Fetched> => {
  // The query string defeats the raw.githubusercontent CDN cache (5 min) once a minute.
  const now = Date.now();
  const r = await fetch(`${PROBE_URL}?t=${Math.floor(now / 60_000)}`, { cache: "no-store" });
  if (!r.ok) throw new Error(`probe.json ${r.status}`);
  const report = (await r.json()) as ProbeReport;
  return { report, ageMs: now - new Date(report.generatedAt).getTime() };
};

/**
 * Liveness + software version per node, from the probe that dials each node's libp2p port every
 * 10 minutes (nothing runs on the node). Keyed by lower-cased operator address.
 */
export const useNodeProbe = () => {
  const q = useQuery({
    queryKey: ["interfold", "node-probe"],
    queryFn: fetchReport,
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: 1,
  });
  const report = q.data?.report;
  const ageMs = q.data?.ageMs;
  const byOperator: Record<string, ProbeNode> = {};
  report?.nodes.forEach(n => (byOperator[n.operator.toLowerCase()] = n));
  return {
    report,
    byOperator,
    ageMs,
    stale: ageMs !== undefined && ageMs > PROBE_STALE_MS,
    error: q.error ?? undefined,
    isLoading: q.isLoading,
  };
};

export const ago = (iso: string | undefined) => {
  if (!iso) return "";
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 90) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 90) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
};

/**
 * The "Re-probe now" button: POST /api/probe/run dispatches the GitHub workflow. Hidden when the
 * deployment has no PROBE_DISPATCH_TOKEN. The run takes about 40 s; the report query above picks
 * the new probe.json up on its next minute tick.
 */
export const useProbeRun = () => {
  const enabled = useQuery({
    queryKey: ["interfold", "probe-run-enabled"],
    queryFn: async () => {
      const r = await fetch("/api/probe/run", { cache: "no-store" });
      return r.ok ? ((await r.json()) as { enabled: boolean }).enabled : false;
    },
    staleTime: Infinity,
    retry: false,
  });
  const run = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/probe/run", { method: "POST" });
      const body = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(body.error ?? `probe run ${r.status}`);
    },
    onSuccess: () => setQueued(true),
  });
  // The workflow takes about 40 s and the report refetches once a minute: say "queued" for 90 s.
  const [queued, setQueued] = useState(false);
  useEffect(() => {
    if (!queued) return;
    const t = setTimeout(() => setQueued(false), 90_000);
    return () => clearTimeout(t);
  }, [queued]);
  return {
    enabled: enabled.data ?? false,
    run: () => run.mutate(),
    isPending: run.isPending,
    /** A dispatch was accepted in the last 90 s. */
    queued,
    error: run.error ?? undefined,
  };
};
