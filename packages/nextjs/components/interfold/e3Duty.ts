import { type BadgeKind } from "./ui";
import {
  type E3,
  type E3Duty,
  E3_COMPLETE,
  E3_FAILED,
  E3_FORMING,
  E3_WINDOW_DAYS,
  e3Outcome,
} from "~~/hooks/interfold/useE3Activity";
import { ago } from "~~/hooks/interfold/useNodeProbe";

const isLive = (e3: E3) => e3.stage !== E3_COMPLETE && e3.stage !== E3_FAILED;
const atIso = (unix: number | undefined) => (unix ? new Date(unix * 1000).toISOString() : undefined);
const when = (unix: number | undefined, block: bigint) => (unix ? ago(atIso(unix)) : `block ${block.toString()}`);

/** Tooltip lines per E3, newest first; beyond this many the rest are counted, not listed. */
const TOOLTIP_LINES = 10;

const roleText = (d: E3Duty) => {
  if (d.role === "committee") return "in committee";
  if (d.role === "candidate") return "drafted, not selected";
  return d.e3.stage === E3_FORMING ? "ticket in, draw pending" : "ticket in, not selected";
};

/**
 * One node's E3 duty for the fleet table. The badge is about the newest E3: a live committee seat
 * first, else where the node stood on the latest request (selected, ticket in, no ticket) and how
 * that E3 ended if it sat on it. The line under it is the node's record: committees it was fully
 * selected for in the window, and how many of those completed.
 */
export const e3Pill = (
  duties: E3Duty[],
  latest: E3 | undefined,
  totalE3s: number,
): { label: string; kind: BadgeKind; sub?: string; title?: string } => {
  const committees = duties.filter(d => d.role === "committee");
  const finished = committees.filter(d => !isLive(d.e3));
  const complete = finished.filter(d => d.e3.stage === E3_COMPLETE).length;
  const record = finished.length
    ? `${complete}/${finished.length} committee${finished.length === 1 ? "" : "s"} complete`
    : undefined;

  const window = `last ${E3_WINDOW_DAYS} days`;
  const lines = duties
    .slice(0, TOOLTIP_LINES)
    .map(d => `E3 #${d.e3.num}: ${roleText(d)}, ${e3Outcome(d.e3)}${d.obligated ? ", bond still obligated" : ""}`);
  if (latest && !duties.some(d => d.e3.id === latest.id))
    lines.unshift(
      `E3 #${latest.num}: no ticket submitted (the node was down, out of tickets, or not yet registered when it was requested)`,
    );
  if (duties.length > TOOLTIP_LINES) lines.push(`+${duties.length - TOOLTIP_LINES} earlier in the ${window}`);
  const head = latest
    ? `Latest E3 #${latest.num}, requested ${when(latest.requestedAt, latest.requestBlock)}. ${window}:`
    : `No E3 requested in the ${window}.`;
  const title = lines.length ? `${head}\n${lines.join("\n")}` : `${head}\nNot drafted into any of the ${totalE3s} E3s.`;

  const live = committees.find(d => isLive(d.e3));
  if (live)
    return { label: `in committee · #${live.e3.num}`, kind: "working", sub: record ?? e3Outcome(live.e3), title };
  if (!latest) return { label: "no E3s yet", kind: "muted", sub: record, title };

  const num = `#${latest.num}`;
  const onLatest = duties.find(d => d.e3.id === latest.id);
  if (!onLatest)
    return {
      label: `no ticket${latest.stage === E3_FORMING ? " yet" : ""} · ${num}`,
      kind: "muted",
      sub: record,
      title,
    };
  if (onLatest.role === "committee") {
    const ok = latest.stage === E3_COMPLETE;
    return { label: `${ok ? "complete" : "failed"} · ${num}`, kind: ok ? "published" : "warn", sub: record, title };
  }
  if (onLatest.role === "ticket" && latest.stage === E3_FORMING)
    return { label: `ticket in · ${num}`, kind: "working", sub: record ?? "draw pending", title };
  return { label: `not selected · ${num}`, kind: "muted", sub: record, title };
};
