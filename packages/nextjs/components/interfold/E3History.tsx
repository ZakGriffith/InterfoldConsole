"use client";

import { Fragment, useState } from "react";
import { AddressLink, Badge, type BadgeKind, Disclosure, TxLink } from "./ui";
import { type Address } from "viem";
import {
  type E3,
  type E3Activity,
  type E3Duty,
  E3_COMPLETE,
  E3_FAILED,
  e3Outcome,
} from "~~/hooks/interfold/useE3Activity";
import { ago } from "~~/hooks/interfold/useNodeProbe";
import { fmtDate, sameAddr, shortAddr } from "~~/utils/interfold/format";

const isLive = (e3: E3) => e3.stage !== E3_COMPLETE && e3.stage !== E3_FAILED;
const atIso = (unix: number | undefined) => (unix ? new Date(unix * 1000).toISOString() : undefined);
const when = (unix: number | undefined, block: bigint) => (unix ? ago(atIso(unix)) : `block ${block.toString()}`);

const outcomeKind = (e3: E3): BadgeKind =>
  e3.stage === E3_COMPLETE ? "published" : e3.stage === E3_FAILED ? "bad" : "open";

/** One node's E3 duty for the fleet table: what it is doing now, else the last committee it sat on. */
export const e3Pill = (
  duties: E3Duty[],
  totalE3s: number,
): { label: string; kind: BadgeKind; sub?: string; title?: string } => {
  const committees = duties.filter(d => d.role === "committee");
  const live = committees.find(d => isLive(d.e3));
  const lines = duties.map(
    d =>
      `E3 #${d.e3.num}: ${d.role === "committee" ? "in committee" : "drafted, not selected"}, ${e3Outcome(d.e3)}${d.obligated ? ", bond still obligated" : ""}`,
  );
  const title = lines.length ? lines.join("\n") : `Not drafted into any of the ${totalE3s} E3s requested so far.`;
  if (live)
    return {
      label: `in committee · #${live.e3.num}`,
      kind: "open",
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
  const last = committees[0].e3;
  const n = committees.length;
  return {
    label: `${n} committee${n === 1 ? "" : "s"}`,
    kind: last.stage === E3_COMPLETE ? "published" : "muted",
    sub: `#${last.num} ${last.stage === E3_FAILED ? "failed" : "complete"} · ${when(last.endedAt ?? last.requestedAt, last.endBlock ?? last.requestBlock)}`,
    title,
  };
};

type Props = {
  activity: E3Activity;
  paused: boolean | undefined;
  operators: Address[];
  labels: Record<string, string>;
};

/** Every mainnet E3 and how this fleet took part, folded under the fleet table. */
export const E3History = ({ activity, paused, operators, labels }: Props) => {
  const { e3s } = activity;
  const complete = e3s.filter(e => e.stage === E3_COMPLETE).length;
  const failed = e3s.filter(e => e.stage === E3_FAILED).length;
  const live = e3s.length - complete - failed;
  const mine = (e3: E3) => operators.filter(op => e3.committee.some(c => sameAddr(c, op)));
  const nameOf = (op: string) => labels[op.toLowerCase()] ?? shortAddr(op);
  const isOurs = (op: string) => operators.some(o => sameAddr(o, op));
  // E3 ids whose full committee is unfolded under the row.
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setOpen(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const summary = [
    `${e3s.length} requested`,
    live ? `${live} running` : null,
    `${complete} complete`,
    `${failed} failed`,
    paused
      ? `requests paused${activity.pausedSince ? ` since ${fmtDate(activity.pausedSince)}` : ""}`
      : paused === false
        ? "accepting requests"
        : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Disclosure title={`E3s on mainnet: ${summary}`}>
      {e3s.length === 0 ? (
        <p className="if-stat__sub" style={{ margin: 0 }}>
          No E3 has been requested on mainnet yet.
        </p>
      ) : (
        <div className="if-table-wrap">
          <table className="if-table">
            <thead>
              <tr>
                <th>E3</th>
                <th>Requested</th>
                <th className="if-num" title="Operators still obligated when the E3 reached its current stage">
                  Committee
                </th>
                <th title="Which of the nodes above sat on the committee">Yours</th>
                <th>Outcome</th>
              </tr>
            </thead>
            <tbody>
              {e3s.map(e3 => {
                const ours = mine(e3);
                const took = e3.endedAt && e3.requestedAt ? e3.endedAt - e3.requestedAt : undefined;
                const key = e3.id.toString();
                return (
                  <Fragment key={key}>
                    <tr style={{ cursor: "default" }}>
                      <td>
                        <span className="if-mono">#{e3.num}</span> <TxLink hash={e3.requestTx} />
                      </td>
                      <td title={e3.requestedAt ? fmtDate(e3.requestedAt) : undefined}>
                        {when(e3.requestedAt, e3.requestBlock)}
                      </td>
                      <td className="if-num">
                        <button
                          type="button"
                          className="if-btn if-btn--ghost if-btn--xs"
                          onClick={() => toggle(e3.id.toString())}
                          aria-expanded={open.has(e3.id.toString())}
                          title={
                            open.has(e3.id.toString()) ? "Hide the committee" : "List every node on this committee"
                          }
                        >
                          {e3.committee.length} {open.has(e3.id.toString()) ? "▲" : "▼"}
                        </button>
                        {e3.candidates.length > 0 && (
                          <span className="if-stat__of"> of {e3.committee.length + e3.candidates.length} drafted</span>
                        )}
                      </td>
                      <td>
                        {ours.length === 0 ? (
                          <span className="if-stat__sub">none</span>
                        ) : (
                          <span className="if-actions" style={{ gap: 6, flexWrap: "wrap" }}>
                            {ours.map(op => (
                              <span key={op} title={op}>
                                {labels[op.toLowerCase()] ? nameOf(op) : <AddressLink address={op} />}
                              </span>
                            ))}
                          </span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                          <Badge kind={outcomeKind(e3)}>{e3Outcome(e3)}</Badge>
                          {e3.endBlock !== undefined && (
                            <span className="if-stat__sub">
                              {when(e3.endedAt, e3.endBlock)}
                              {took !== undefined && `, ${Math.round(took / 60)} min after the request`}
                              {e3.obligated.length > 0 && `, ${e3.obligated.length} bonds still obligated`}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                    {open.has(key) && (
                      <tr style={{ cursor: "default" }}>
                        <td colSpan={5} style={{ paddingTop: 4 }}>
                          <div className="if-stat__sub" style={{ marginBottom: 6 }}>
                            Committee of E3 #{e3.num}: {e3.committee.length} nodes
                            {e3.obligated.length > 0 && `, ${e3.obligated.length} still obligated`}
                            {ours.length > 0 && `, ${ours.length} yours (marked)`}
                          </div>
                          <div className="if-actions" style={{ gap: "6px 14px", flexWrap: "wrap" }}>
                            {[...e3.committee]
                              .sort((a, b) => Number(isOurs(b)) - Number(isOurs(a)))
                              .map(op => (
                                <span
                                  key={op}
                                  className="if-actions"
                                  style={{ gap: 6, fontWeight: isOurs(op) ? 600 : undefined }}
                                  title={e3.obligated.includes(op) ? "bond still obligated for this E3" : undefined}
                                >
                                  {isOurs(op) && labels[op.toLowerCase()] && <span>{nameOf(op)}</span>}
                                  <AddressLink address={op} />
                                  {isOurs(op) && <Badge kind="open">yours</Badge>}
                                </span>
                              ))}
                          </div>
                          {e3.candidates.length > 0 && (
                            <div className="if-stat__sub" style={{ marginTop: 8 }}>
                              Drafted but not kept by sortition:{" "}
                              {e3.candidates
                                .map(op => (isOurs(op) ? `${nameOf(op)} (yours)` : shortAddr(op)))
                                .join(", ")}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="if-stat__sub" style={{ margin: "10px 0 0" }}>
        From the Interfold contract&apos;s stage events and the registry&apos;s committee obligations. The chain records
        who was on a committee and how the E3 ended, not which node dropped the ball inside it.
      </p>
    </Disclosure>
  );
};
