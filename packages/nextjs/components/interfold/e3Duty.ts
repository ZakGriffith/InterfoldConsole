import { type BadgeKind } from "./ui";
import {
  type E3,
  type E3Duty,
  E3_COMPLETE,
  E3_FAILED,
  E3_WINDOW_DAYS,
  e3Outcome,
} from "~~/hooks/interfold/useE3Activity";
import { ago } from "~~/hooks/interfold/useNodeProbe";

const isLive = (e3: E3) => e3.stage !== E3_COMPLETE && e3.stage !== E3_FAILED;
const atIso = (unix: number | undefined) => (unix ? new Date(unix * 1000).toISOString() : undefined);
const when = (unix: number | undefined, block: bigint) => (unix ? ago(atIso(unix)) : `block ${block.toString()}`);

/** Tooltip lines per E3, newest first; beyond this many the rest are counted, not listed. */
const TOOLTIP_LINES = 10;
/** Share of finished committees that completed, below which the badge turns amber. */
const GOOD_SHARE = 0.8;
/** Below this many finished committees a share is noise; the latest result sets the colour instead. */
const SHARE_MIN = 5;

/** One node's E3 duty for the fleet table: what it is doing now, else the last committee it sat on. */
export const e3Pill = (
  duties: E3Duty[],
  totalE3s: number,
): { label: string; kind: BadgeKind; sub?: string; title?: string } => {
  const committees = duties.filter(d => d.role === "committee");
  const live = committees.find(d => isLive(d.e3));
  const window = `last ${E3_WINDOW_DAYS} days`;
  const lines = duties
    .slice(0, TOOLTIP_LINES)
    .map(
      d =>
        `E3 #${d.e3.num}: ${d.role === "committee" ? "in committee" : "drafted, not selected"}, ${e3Outcome(d.e3)}${d.obligated ? ", bond still obligated" : ""}`,
    );
  if (duties.length > TOOLTIP_LINES) lines.push(`+${duties.length - TOOLTIP_LINES} earlier in the ${window}`);
  const title = lines.length
    ? `${window}:\n${lines.join("\n")}`
    : `Not drafted into any of the ${totalE3s} E3s requested in the ${window}.`;
  if (live)
    return {
      label: `in committee · #${live.e3.num}`,
      kind: "working",
      sub: e3Outcome(live.e3),
      title,
    };
  if (committees.length === 0)
    return {
      label: duties.length ? "drafted, not selected" : totalE3s ? "not drafted" : "no E3s yet",
      kind: "muted",
      sub: duties.length ? `E3 #${duties[0].e3.num}` : undefined,
      title,
    };
  // Finished committees in the window: how many completed, and how the latest one ended.
  const finished = committees.filter(d => !isLive(d.e3));
  const complete = finished.filter(d => d.e3.stage === E3_COMPLETE).length;
  const last = finished[0].e3;
  const good = finished.length >= SHARE_MIN ? complete / finished.length >= GOOD_SHARE : last.stage === E3_COMPLETE;
  return {
    label: `${complete}/${finished.length} complete`,
    kind: good ? "published" : "warn",
    sub: `E3 #${last.num} ${last.stage === E3_FAILED ? "failed" : "complete"} · ${when(last.endedAt ?? last.requestedAt, last.endBlock ?? last.requestBlock)}`,
    title,
  };
};
