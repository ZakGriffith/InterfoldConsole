"use client";

import { Fragment, type ReactNode, useEffect, useMemo, useState } from "react";
import { AddressLink, Badge, type BadgeKind, Dl, Empty, Loader, Note, TxLink } from "./ui";
import { type Address } from "viem";
import { ConsoleProvider, useConsole } from "~~/hooks/interfold/ConsoleContext";
import { E3_COMPLETE, E3_FAILED, E3_FAILURE_REASON, E3_STAGE, e3Outcome } from "~~/hooks/interfold/useE3Activity";
import { tokenSymbol, useE3Rewards } from "~~/hooks/interfold/useE3Rewards";
import { COMMITTEE_SIZE, type E3Record, LAUNCH_TESTS, type LiveE3, useE3s } from "~~/hooks/interfold/useE3s";
import { useFleetLists } from "~~/hooks/interfold/useFleet";
import { ago } from "~~/hooks/interfold/useNodeProbe";
import { E3_PROGRAMS, INTERFOLD, USDS_ADDRESS, explorerAddress } from "~~/utils/interfold/contracts";
import { fmtDate, fmtTokens, sameAddr, shortAddr, shortHash } from "~~/utils/interfold/format";

const isLive = (e3: E3Record) => e3.stage !== E3_COMPLETE && e3.stage !== E3_FAILED;
const outcomeKind = (e3: E3Record): BadgeKind =>
  e3.stage === E3_COMPLETE ? "published" : e3.stage === E3_FAILED ? "bad" : "working";
const iso = (unix: number) => new Date(unix * 1000).toISOString();

/** "13h 52m", "2d 3h", "23m", "40s". */
const span = (seconds: number): string => {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h${m % 60 ? ` ${m % 60}m` : ""}`;
  const d = Math.floor(h / 24);
  return `${d}d${h % 24 ? ` ${h % 24}h` : ""}`;
};
/** "in 2h 10m" / "2h 10m ago", against the clock now. */
const rel = (unix: number): string => {
  const diff = unix - Date.now() / 1000;
  return diff >= 0 ? `in ${span(diff)}` : `${span(-diff)} ago`;
};
const programName = (program: Address) => E3_PROGRAMS[program.toLowerCase()];

/** What a running E3 is waiting on, from its stage, the input window and the contract's deadlines. */
const nextUp = (e3: E3Record, live: LiveE3 | undefined): { label: string; at?: number } | undefined => {
  const now = Date.now() / 1000;
  switch (e3.stage) {
    case 1:
      // Tickets only arrive once the randomness landed; before that the VRF deadline is the thing to watch.
      if (e3.tickets.length) return { label: `${e3.tickets.length} tickets in, sortition picking the committee` };
      if (e3.randomness && e3.randomness.deadline > now) return { label: "randomness due", at: e3.randomness.deadline };
      return { label: "waiting for tickets" };
    case 2:
      return { label: "DKG key due", at: live?.dkgDeadline };
    case 3:
      if (now < e3.inputWindow[0]) return { label: "inputs open", at: e3.inputWindow[0] };
      if (now < e3.inputWindow[1]) return { label: "inputs close", at: e3.inputWindow[1] };
      return { label: "ciphertext due", at: live?.computeDeadline };
    case 4:
      return { label: "decryption due", at: live?.decryptionDeadline };
  }
  return undefined;
};

type Mine = Record<string, { owner: Address; label?: string }>;

const Who = ({ address, mine }: { address: string; mine: Mine }) => {
  const m = mine[address.toLowerCase()];
  return (
    <span className="if-actions" style={{ gap: 6, fontWeight: m ? 600 : undefined }}>
      {m?.label && <span>{m.label}</span>}
      <AddressLink address={address} />
      {m && <Badge kind="open">yours</Badge>}
    </span>
  );
};

const Block = ({ title, wide, children }: { title: string; wide?: boolean; children: ReactNode }) => (
  <div className={wide ? "if-e3-block if-e3-block--wide" : "if-e3-block"}>
    <div className="if-eyebrow" style={{ marginBottom: 6 }}>
      {title}
    </div>
    {children}
  </div>
);

type DetailProps = {
  e3: E3Record;
  live?: LiveE3;
  mine: Mine;
  held: { operator: string; recipient: string; amount: bigint }[];
  heldClaimed: Record<string, bigint>;
};

/** Everything the chain says about one E3, unfolded under its row. */
const Detail = ({ e3, live, mine, held, heldClaimed }: DetailProps) => {
  const sym = e3.rewards?.token ? tokenSymbol(e3.rewards.token) : "USDS";
  const next = isLive(e3) ? nextUp(e3, live) : undefined;
  const recipientOf = (op: string) => held.find(h => h.operator === op)?.recipient;
  const rewardOf = (op: string) => {
    const i = e3.rewards?.nodes.findIndex(n => sameAddr(n, op)) ?? -1;
    return i >= 0 ? e3.rewards!.amounts[i] : undefined;
  };
  const claimedBy = (op: string) => {
    const r = recipientOf(op);
    return r ? (heldClaimed[`${e3.id}:${r}`] ?? 0n) > 0n || (e3.claimed[r] ?? 0n) > 0n : false;
  };
  const kept = new Set(e3.committee);
  const notKept = e3.tickets.filter(t => !kept.has(t.node)).map(t => t.node);
  const uniqueTickets = new Set(e3.tickets.map(t => t.node)).size;
  const rewardTotal = e3.rewards?.amounts.reduce((s, a) => s + a, 0n);
  const claimedCount = e3.rewards ? e3.rewards.nodes.filter(n => claimedBy(n.toLowerCase())).length : 0;

  const timeline: Array<[ReactNode, ReactNode]> = [
    [
      "Requested",
      <>
        {fmtDate(e3.requestedAt)} <TxLink hash={e3.requestTx} />
      </>,
    ],
    ...e3.steps
      .filter(s => s.stage !== 1)
      .map(
        s =>
          [
            E3_STAGE[s.stage] ?? `stage ${s.stage}`,
            <>
              {s.estimated ? "≈ " : ""}
              {fmtDate(s.at)}
              <span className="if-stat__sub">+{span((s.at ?? e3.requestedAt) - e3.requestedAt)}</span>
              <TxLink hash={s.tx} />
            </>,
          ] as [ReactNode, ReactNode],
      ),
  ];
  if (e3.stage === E3_FAILED)
    timeline.push([
      "Failed because",
      `${E3_FAILURE_REASON[e3.reason ?? 0] ?? `reason ${e3.reason}`}, while ${E3_STAGE[e3.failedAtStage ?? 0] ?? `at stage ${e3.failedAtStage}`}`,
    ]);
  if (next)
    timeline.push([
      "Next",
      next.at ? (
        <>
          {next.label} {rel(next.at)}
          <span className="if-stat__sub">{fmtDate(next.at)}</span>
        </>
      ) : (
        next.label
      ),
    ]);
  if (isLive(e3) && live?.lifecycleDeadline)
    timeline.push(["Must finish by", `${fmtDate(live.lifecycleDeadline)} (${rel(live.lifecycleDeadline)})`]);
  if (live?.canFail)
    timeline.push([
      "Can be failed now",
      `anyone may mark it failed: ${E3_FAILURE_REASON[live.canFail.reason] ?? `reason ${live.canFail.reason}`}`,
    ]);

  const money: Array<[ReactNode, ReactNode]> = [
    [
      "Requester paid",
      e3.payment !== undefined ? (
        <>
          {fmtTokens(e3.payment, sym)}
          {e3.randomnessFee > 0n && (
            <span className="if-stat__sub">incl. {fmtTokens(e3.randomnessFee, sym)} randomness fee</span>
          )}
        </>
      ) : (
        "-"
      ),
    ],
  ];
  if (e3.rewards)
    money.push(
      [
        "Nodes earned",
        <>
          {fmtTokens(rewardTotal, sym)}
          <span className="if-stat__sub">
            {e3.rewards.nodes.length} × {fmtTokens(e3.rewards.amounts[0], sym)}, paid to each node&apos;s bond owner
          </span>
        </>,
      ],
      ["Claimed so far", `${claimedCount} of ${e3.rewards.nodes.length} shares`],
      ["Protocol treasury", fmtTokens(e3.treasury, sym)],
    );
  if (e3.refund)
    money.push([
      "Refunded",
      <>
        {fmtTokens(e3.refund.payment, sym)} back to the requester
        {e3.refund.honestNodes > 0n && (
          <span className="if-stat__sub">{e3.refund.honestNodes.toString()} honest nodes compensated</span>
        )}
      </>,
    ]);

  const params: Array<[ReactNode, ReactNode]> = [
    [
      "Program",
      <>
        {programName(e3.program) && <span>{programName(e3.program)}</span>}
        <AddressLink address={e3.program} />
      </>,
    ],
    ["Requester", <AddressLink key="r" address={e3.requester} />],
    [
      "Committee size",
      `${COMMITTEE_SIZE[e3.committeeSize] ?? e3.committeeSize}${e3.committee.length ? ` (${e3.committee.length} nodes)` : ""}`,
    ],
    ["Inputs accepted", `${fmtDate(e3.inputWindow[0])} to ${fmtDate(e3.inputWindow[1])}`],
    ["BFV param set", String(e3.paramSet)],
    [
      "Crypto config",
      <span key="c" className="if-mono" title={e3.cryptoConfigId}>
        {shortHash(e3.cryptoConfigId)}
      </span>,
    ],
  ];
  if (e3.randomness)
    params.push([
      "Randomness",
      <>
        <AddressLink address={e3.randomness.provider} />
        <span className="if-stat__sub">Chainlink VRF, due {fmtDate(e3.randomness.deadline)}</span>
      </>,
    ]);
  if (e3.ciphertext)
    params.push([
      "Ciphertext",
      <>
        on Avail, block {e3.ciphertext.availabilityBlock.toLocaleString()} leaf {e3.ciphertext.leafIndex.toString()}
        <span className="if-mono if-stat__sub" title={e3.ciphertext.contentHash}>
          {shortHash(e3.ciphertext.contentHash)}
        </span>
        <TxLink hash={e3.ciphertext.tx} />
      </>,
    ]);
  if (e3.stage === E3_COMPLETE && e3.endTx) params.push(["Plaintext output", <TxLink key="p" hash={e3.endTx} />]);
  params.push([
    "E3 id",
    <span key="id" className="if-mono" style={{ fontSize: 11 }}>
      {e3.id.toString()}
    </span>,
  ]);

  return (
    <div className="if-e3-detail">
      <Block title="Timeline">
        <Dl items={timeline} />
      </Block>
      <Block title="Money">
        <Dl items={money} />
      </Block>
      <Block title="Request">
        <Dl items={params} />
      </Block>
      <Block
        wide
        title={
          e3.committee.length
            ? `Committee: ${e3.committee.length} nodes, picked from ${uniqueTickets} tickets`
            : e3.formationFailed
              ? `Committee never formed: ${e3.formationFailed.submitted.toString()} tickets, ${e3.formationFailed.required.toString()} needed`
              : `Tickets so far: ${uniqueTickets}`
        }
      >
        {(e3.committee.length > 0 || e3.tickets.length > 0) && (
          <div className="if-table-wrap" style={{ maxWidth: 760 }}>
            <table className="if-table">
              <thead>
                <tr>
                  <th>Node</th>
                  {e3.committee.length > 0 && (
                    <th title="Snapshotted when the committee formed; the reward goes here">Bond owner</th>
                  )}
                  <th>{e3.committee.length ? "Reward" : "Ticket"}</th>
                </tr>
              </thead>
              <tbody>
                {(e3.committee.length ? e3.committee : e3.tickets.map(t => t.node))
                  .map(op => ({ op, mine: !!mine[op] }))
                  .sort((a, b) => Number(b.mine) - Number(a.mine))
                  .map(({ op }) => {
                    const r = recipientOf(op);
                    const amount = rewardOf(op);
                    const expelled = e3.expelled.find(x => x.node === op);
                    return (
                      <tr key={op} className="if-row--quiet">
                        <td>
                          <Who address={op} mine={mine} />
                        </td>
                        {e3.committee.length > 0 && (
                          <td>{r ? <AddressLink address={r} /> : <span className="if-stat__sub">-</span>}</td>
                        )}
                        <td>
                          {expelled ? (
                            <Badge kind="bad">expelled</Badge>
                          ) : amount !== undefined ? (
                            <span className="if-actions" style={{ gap: 8 }}>
                              <span className="if-mono">{fmtTokens(amount, sym)}</span>
                              <Badge kind={claimedBy(op) ? "published" : "open"}>
                                {claimedBy(op) ? "claimed" : "held"}
                              </Badge>
                            </span>
                          ) : e3.committee.length ? (
                            <span className="if-stat__sub">
                              {e3.obligated.includes(op) ? "bond obligated" : e3.stage === E3_FAILED ? "nothing" : "-"}
                            </span>
                          ) : (
                            <span className="if-stat__sub">
                              #{e3.tickets.find(t => t.node === op)?.ticketId.toString()}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
        {e3.committee.length > 0 && notKept.length > 0 && (
          <p className="if-stat__sub" style={{ margin: "8px 0 0" }}>
            Submitted a ticket, not kept by sortition:{" "}
            {notKept.map(op => (mine[op]?.label ? `${mine[op].label} (yours)` : shortAddr(op))).join(", ")}
          </p>
        )}
        {e3.viability && (
          <p className="if-stat__sub" style={{ margin: "8px 0 0" }}>
            Viability: {e3.viability.active.toString()} active of {e3.viability.threshold.toString()} needed
            {e3.viability.viable ? "" : ", not viable"}.
          </p>
        )}
      </Block>
    </div>
  );
};

const Tile = ({ value, label, title }: { value: string; label: string; title?: string }) => (
  <div className="if-pulse__tile" title={title}>
    <div className="if-pulse__value">{value}</div>
    <div className="if-pulse__label">{label}</div>
  </div>
);

const Inner = () => {
  const { owners } = useConsole();
  const { lists } = useFleetLists(owners);
  const e3s = useE3s();
  const rewards = useE3Rewards();
  const [open, setOpen] = useState<Set<string>>(new Set());
  // /e3s?e3=2 arrives with that E3 unfolded.
  const wanted = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("e3") : null;
  useEffect(() => {
    if (wanted === null || !e3s.data) return;
    const hit = e3s.data.e3s.find(e => String(e.num) === wanted);
    if (hit) setOpen(prev => new Set([...prev, hit.id.toString()]));
  }, [wanted, e3s.data]);

  const mine = useMemo<Mine>(() => {
    const out: Mine = {};
    for (const l of lists)
      for (const op of l.operators) out[op.toLowerCase()] = { owner: l.owner, label: l.labels[op.toLowerCase()] };
    return out;
  }, [lists]);

  if (e3s.failed && !e3s.data)
    return (
      <main className="if-main">
        <Note kind="warn">
          The RPC refused the event scan, so nothing about E3s can be shown. Set{" "}
          <code>NEXT_PUBLIC_ALCHEMY_API_KEY</code>.
        </Note>
      </main>
    );
  if (!e3s.data)
    return (
      <main className="if-main">
        <Loader label="Reading every E3 since launch" sub={INTERFOLD.address} />
      </main>
    );

  const all = e3s.data.e3s;
  const complete = all.filter(e => e.stage === E3_COMPLETE);
  const failed = all.filter(e => e.stage === E3_FAILED);
  const running = all.filter(isLive);
  const earned = complete.reduce((s, e) => s + (e.rewards?.amounts.reduce((a, b) => a + b, 0n) ?? 0n), 0n);
  const toggle = (k: string) =>
    setOpen(prev => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  const yoursOn = (e3: E3Record) => {
    const inCommittee = e3.committee.filter(op => mine[op]);
    const ticketed = e3.tickets.map(t => t.node).filter(op => mine[op] && !e3.committee.includes(op));
    return { inCommittee, ticketed: [...new Set(ticketed)] };
  };
  const paused = e3s.paused;

  return (
    <main className="if-main" style={{ gap: 28 }}>
      <section className="if-pulse" aria-label="E3 activity">
        <div className="if-pulse__head">
          <span className="if-dot-live" aria-hidden="true" />
          <span className="if-pulse__title">E3s on mainnet since launch</span>
          <span className="if-pulse__net">
            {paused === true
              ? `requests paused${e3s.data.pausedSince ? ` since ${fmtDate(e3s.data.pausedSince)}` : ""}`
              : paused === false
                ? "accepting requests"
                : "Ethereum mainnet"}
          </span>
          <span className="if-stat__sub" style={{ marginLeft: "auto" }}>
            {e3s.updatedAt ? `scanned ${ago(new Date(e3s.updatedAt).toISOString())}` : ""}
          </span>
        </div>
        <div className="if-pulse__grid">
          <Tile value={all.length.toLocaleString()} label="requested" />
          <Tile value={running.length.toLocaleString()} label="running now" />
          <Tile value={complete.length.toLocaleString()} label="complete" />
          <Tile value={failed.length.toLocaleString()} label="failed" />
          <Tile
            value={fmtTokens(earned)}
            label="USDS earned by nodes"
            title="Sum of every committee member's share of completed E3s"
          />
        </div>
      </section>

      {all.length === 0 ? (
        <Empty>No E3 has been requested on mainnet yet.</Empty>
      ) : (
        <div className="if-table-wrap">
          <table className="if-table if-e3-table">
            <thead>
              <tr>
                <th>E3</th>
                <th>Requested</th>
                <th>Program</th>
                <th className="if-num" title="Nodes sortition kept, out of the tickets submitted">
                  Committee
                </th>
                <th>Status</th>
                <th className="if-num" title="What the requester paid, and what each committee node earned">
                  Paid
                </th>
                <th title="Nodes of the bond owners tracked on the Fleet page">Yours</th>
              </tr>
            </thead>
            <tbody>
              {all.map(e3 => {
                const k = e3.id.toString();
                const sym = e3.rewards?.token ? tokenSymbol(e3.rewards.token) : "USDS";
                const live = e3s.live[k];
                const next = isLive(e3) ? nextUp(e3, live) : undefined;
                const tickets = new Set(e3.tickets.map(t => t.node)).size;
                const yours = yoursOn(e3);
                const claimedShares = e3.rewards
                  ? e3.rewards.nodes.filter(n => {
                      const r = rewards.ledger?.held.find(
                        h => h.e3Id === e3.id && h.operator === n.toLowerCase(),
                      )?.recipient;
                      return r && ((rewards.ledger?.claimed[`${e3.id}:${r}`] ?? 0n) > 0n || (e3.claimed[r] ?? 0n) > 0n);
                    }).length
                  : 0;
                return (
                  <Fragment key={k}>
                    <tr
                      className={open.has(k) ? "if-row--on" : ""}
                      onClick={() => toggle(k)}
                      aria-expanded={open.has(k)}
                    >
                      <td>
                        <div className="if-cell-inline">
                          <span className="if-mono">#{e3.num}</span> <TxLink hash={e3.requestTx} />
                        </div>
                        {LAUNCH_TESTS.has(e3.num) && (
                          <div className="if-stat__sub" title="Requested by Interfold before operators were on duty">
                            launch test
                          </div>
                        )}
                      </td>
                      <td title={iso(e3.requestedAt)}>
                        {ago(iso(e3.requestedAt))}
                        <div className="if-stat__sub if-nowrap">{fmtDate(e3.requestedAt)}</div>
                      </td>
                      <td>
                        {programName(e3.program) ?? <AddressLink address={e3.program} />}
                        <div className="if-stat__sub">
                          by{" "}
                          <a className="if-hash" href={explorerAddress(e3.requester)} target="_blank" rel="noreferrer">
                            <span className="if-mono">{shortAddr(e3.requester)}</span>
                          </a>
                        </div>
                      </td>
                      <td className="if-num">
                        {e3.committee.length ? (
                          <>
                            {e3.committee.length}
                            <span className="if-stat__of"> of {tickets} tickets</span>
                          </>
                        ) : e3.formationFailed ? (
                          <span className="if-stat__sub">
                            {e3.formationFailed.submitted.toString()} tickets, {e3.formationFailed.required.toString()}{" "}
                            needed
                          </span>
                        ) : (
                          <span className="if-stat__sub">
                            {tickets ? `${tickets} tickets so far` : "no tickets yet"}
                          </span>
                        )}
                      </td>
                      <td>
                        <Badge kind={outcomeKind(e3)}>{e3Outcome(e3)}</Badge>
                        <div className="if-stat__sub">
                          {e3.endedAt !== undefined
                            ? `${e3.endEstimated ? "≈ " : ""}${ago(iso(e3.endedAt))}, ${span(e3.endedAt - e3.requestedAt)} after the request`
                            : next
                              ? `${next.label}${next.at ? ` ${rel(next.at)}` : ""}`
                              : ""}
                        </div>
                      </td>
                      <td className="if-num">
                        <span className="if-nowrap">{fmtTokens(e3.payment, sym)}</span>
                        <div className="if-stat__sub" style={{ fontFamily: "var(--if-sans)" }}>
                          {e3.rewards
                            ? `${fmtTokens(e3.rewards.amounts[0], sym)} per node · ${claimedShares}/${e3.rewards.nodes.length} claimed`
                            : e3.refund
                              ? `${fmtTokens(e3.refund.payment, sym)} refunded`
                              : isLive(e3)
                                ? `${sym} held by Interfold`
                                : ""}
                        </div>
                      </td>
                      <td>
                        {yours.inCommittee.length === 0 && yours.ticketed.length === 0 ? (
                          <span className="if-stat__sub">{owners.length ? "none" : "-"}</span>
                        ) : (
                          <div className="if-actions" style={{ gap: 6, flexWrap: "wrap" }}>
                            {yours.inCommittee.map(op => (
                              <span key={op} title={`${op}: on the committee`}>
                                {mine[op].label ?? shortAddr(op)}
                              </span>
                            ))}
                            {yours.ticketed.map(op => (
                              <span key={op} className="if-stat__sub" title={`${op}: submitted a ticket, not kept`}>
                                {mine[op].label ?? shortAddr(op)} (ticket)
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                    {open.has(k) && (
                      <tr className="if-row--quiet">
                        <td colSpan={7} style={{ whiteSpace: "normal", paddingTop: 4, paddingBottom: 18 }}>
                          <Detail
                            e3={e3}
                            live={live}
                            mine={mine}
                            held={(rewards.ledger?.held ?? []).filter(h => h.e3Id === e3.id)}
                            heldClaimed={rewards.ledger?.claimed ?? {}}
                          />
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

      <p className="if-stat__sub" style={{ margin: 0 }}>
        From the Interfold contract&apos;s request, stage, output and reward events, the ciphernode registry&apos;s
        sortition events, the bonding registry&apos;s committee obligations, the refund manager&apos;s held rewards and
        the fee token&apos;s transfers into Interfold. Click a row for the full story. The chain records who sat on a
        committee and how the E3 ended, not which node dropped the ball inside it. Amounts are in{" "}
        <a className="if-hash" href={explorerAddress(USDS_ADDRESS)} target="_blank" rel="noreferrer">
          USDS
        </a>
        .
      </p>
    </main>
  );
};

/** The E3s tab: every encrypted computation Interfold ran on mainnet, past and current. */
export const E3Ledger = () => (
  <ConsoleProvider>
    <Inner />
  </ConsoleProvider>
);
