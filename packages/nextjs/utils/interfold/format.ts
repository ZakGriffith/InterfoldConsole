import { type Address, formatUnits, getAddress, isAddress, parseUnits } from "viem";
import { normalize } from "viem/ens";

/** 1,234.5678 style; >= 1000 rounds to whole tokens like the official dashboard. */
export const fmtTokens = (wei: bigint | undefined, symbol?: string, decimals = 18): string => {
  if (wei === undefined) return "—";
  const n = Number(formatUnits(wei, decimals));
  const s = n.toLocaleString(undefined, { maximumFractionDigits: n >= 1000 ? 0 : 4 });
  return symbol ? `${s} ${symbol}` : s;
};

export const fmtCompact = (wei: bigint | undefined, decimals = 18): string => {
  if (wei === undefined) return "—";
  const n = Number(formatUnits(wei, decimals));
  return n >= 10_000
    ? n.toLocaleString(undefined, { notation: "compact", maximumFractionDigits: 1 })
    : n.toLocaleString(undefined, { maximumFractionDigits: n >= 1000 ? 0 : 2 });
};

export const fmtEth = (wei: bigint | undefined): string => {
  if (wei === undefined) return "—";
  const n = Number(formatUnits(wei, 18));
  return `${n.toLocaleString(undefined, { maximumFractionDigits: n < 0.01 ? 5 : 4 })} ETH`;
};

/** Same rules as the dashboard: 30d / 12h / 5m / 30s. */
export const fmtDuration = (seconds: bigint | number | undefined): string => {
  if (seconds === undefined) return "—";
  const t = Number(seconds);
  if (t <= 0) return "none";
  if (t % 86400 === 0) return `${t / 86400}d`;
  if (t % 3600 === 0) return `${t / 3600}h`;
  if (t % 60 === 0) return `${t / 60}m`;
  return `${t}s`;
};

export const fmtDate = (unixSeconds: bigint | number | undefined): string => {
  if (unixSeconds === undefined || Number(unixSeconds) === 0) return "—";
  return new Date(Number(unixSeconds) * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
};

export const shortAddr = (a?: string): string => (!a || a.length < 14 ? (a ?? "—") : `${a.slice(0, 6)}…${a.slice(-4)}`);
export const shortHash = (h?: string): string =>
  !h || h.length < 14 ? (h ?? "—") : `${h.slice(0, 10)}…${h.slice(-6)}`;

/** "32000" / "1.5" -> wei, or null when not a positive decimal. */
export const parseTokenInput = (s: string, decimals = 18): bigint | null => {
  const n = s.trim();
  if (!/^\d*\.?\d*$/.test(n) || n === "" || n === ".") return null;
  try {
    const v = parseUnits(n, decimals);
    return v > 0n ? v : null;
  } catch {
    return null;
  }
};

/** "3" -> 3n, or null when not a positive whole number. */
export const parseWholeInput = (s: string): bigint | null => {
  const n = s.trim();
  if (!/^\d+$/.test(n)) return null;
  const v = BigInt(n);
  return v > 0n ? v : null;
};

export const sameAddr = (a?: string | null, b?: string | null): boolean =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();

export const toChecksum = (a: string): Address | null => (isAddress(a) ? getAddress(a) : null);

export const bpsToPct = (bps: bigint | number | undefined): string =>
  bps === undefined ? "—" : `${(Number(bps) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;

export const maxBig = (a: bigint, b: bigint) => (a > b ? a : b);
export const minBig = (a: bigint, b: bigint) => (a < b ? a : b);

/** ENSIP-15 normalize, but null instead of throwing on malformed input while the user is still typing. */
export const safeNormalize = (name: string | undefined): string | undefined => {
  if (!name) return undefined;
  try {
    return normalize(name);
  } catch {
    return undefined;
  }
};
