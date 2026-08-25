"use client";

import { useEffect, useState } from "react";
import { HandOff } from "./HandOff";
import { RequirementsNote } from "./RequirementsNote";
import { Note, TxLink } from "./ui";
import { useConsole } from "~~/hooks/interfold/ConsoleContext";
import { useSafeBatch } from "~~/hooks/interfold/useSafeBatch";
import { type Plan, contractName, txBuilderJson } from "~~/utils/interfold/batch";
import { safeQueue, safeTx } from "~~/utils/interfold/contracts";
import { fmtTokens, shortAddr } from "~~/utils/interfold/format";

type Props = {
  title: string;
  plan: Plan;
  batchName: string;
  /** Show the requirements checklist inside the panel (off when the page already shows one). */
  showRequirements?: boolean;
};

/** One Safe transaction for the plan: calls, simulate, propose, or export for Transaction Builder. */
export const BatchPanel = ({ title, plan, batchName, showRequirements = true }: Props) => {
  const { owner, canWriteAsOwner, connected, onMainnet, funds, params } = useConsole();
  const b = useSafeBatch();
  const [createdAt] = useState(() => Date.now());
  const key = plan.calls.map(c => c.data).join("|");
  useEffect(() => {
    b.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const fileName = `${batchName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.json`;
  const json = plan.calls.length
    ? txBuilderJson(plan.calls, owner, batchName, plan.calls.map(c => c.summary).join("; "), createdAt)
    : "";
  const ticketCount = params && params.ticketPrice > 0n ? plan.totalSusds / params.ticketPrice : 0n;
  const canPropose = canWriteAsOwner && onMainnet;
  const proposeReason = !connected
    ? "Connect as the Safe to propose from here, or export the file below."
    : !onMainnet
      ? "Switch to Ethereum mainnet."
      : !canWriteAsOwner
        ? `Connected wallet is not the bond owner ${shortAddr(owner)}; export the file below instead.`
        : undefined;

  return (
    <section className="if-card">
      <header className="if-card__head" style={{ marginBottom: 12 }}>
        <div>
          <div className="if-eyebrow">One Safe transaction</div>
          <h3 className="if-card__title" style={{ margin: 0 }}>
            {title}
          </h3>
        </div>
        {plan.calls.length > 0 && (
          <span className="if-stat__sub">
            {plan.calls.length} calls · {fmtTokens(plan.totalFold, "FOLD")} · {fmtTokens(plan.totalSusds, "sUSDS")} ·
            one signature round
          </span>
        )}
      </header>

      {plan.calls.length === 0 ? (
        <Note>Nothing to batch right now.</Note>
      ) : (
        <>
          <div className="if-table-wrap">
            <table className="if-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Call</th>
                  <th>Target</th>
                  <th className="if-num">Simulation</th>
                </tr>
              </thead>
              <tbody>
                {plan.calls.map((c, i) => {
                  const r = b.results[i];
                  return (
                    <tr key={i} style={{ cursor: "default" }}>
                      <td className="if-mono">{i + 1}</td>
                      <td>{c.summary}</td>
                      <td className="if-mono" title={c.to}>
                        {contractName(c.to)}
                      </td>
                      <td className="if-num" style={r && !r.ok ? { color: "var(--if-bad-ink)" } : undefined}>
                        {b.status === "simulating" ? (
                          <span className="if-spinner" />
                        ) : r ? (
                          r.ok ? (
                            `ok · ${r.gasUsed.toString()} gas`
                          ) : (
                            <span style={{ whiteSpace: "normal" }}>{r.error}</span>
                          )
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {showRequirements && (
            <div style={{ marginTop: 12 }}>
              <RequirementsNote
                foldNeeded={plan.totalFold}
                susdsNeeded={plan.totalSusds}
                tickets={ticketCount}
                compact
              />
            </div>
          )}
          {plan.skipped.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <Note>Not included: {plan.skipped.map(s => `${shortAddr(s.operator)} (${s.reason})`).join(" · ")}</Note>
            </div>
          )}

          <div className="if-actions" style={{ marginTop: 14 }}>
            <button
              type="button"
              className="if-btn if-btn--ghost"
              disabled={b.busy}
              onClick={() => b.simulate(plan.calls)}
            >
              {b.status === "simulating" ? <span className="if-spinner" /> : null} Simulate
            </button>
            <button
              type="button"
              className="if-btn if-btn--primary"
              disabled={b.busy || !canPropose}
              title={proposeReason}
              onClick={() => b.propose(plan.calls)}
            >
              {b.status === "awaiting-wallet" ? <span className="if-spinner" /> : null} Propose to the Safe
            </button>
            {proposeReason && <span className="if-action__hint">{proposeReason}</span>}
          </div>
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
            {b.status === "sim-ok" && (
              <Note kind="good">
                Every call succeeds in sequence as {shortAddr(owner)} (
                {b.results.reduce((a, r) => a + r.gasUsed, 0n).toString()} gas).
              </Note>
            )}
            {b.status === "sim-fail" && <Note kind="bad">{b.error}</Note>}
            {b.status === "awaiting-wallet" && <Note>Confirm the batch in Safe{"{Wallet}"}.</Note>}
            {b.status === "proposed" && (
              <Note kind="good">
                Proposed {b.id && <TxLink hash={b.id} href={safeTx(owner, b.id)} />}. Collect signatures in the{" "}
                <a className="if-link" href={safeQueue(owner)} target="_blank" rel="noreferrer">
                  Safe queue
                </a>
                .
              </Note>
            )}
            {b.status === "error" && <Note kind="bad">{b.error}</Note>}
          </div>

          <div style={{ marginTop: 16 }}>
            <HandOff
              json={json}
              fileName={fileName}
              callCount={plan.calls.length}
              owner={owner}
              funds={funds}
              totalFold={plan.totalFold}
              totalSusds={plan.totalSusds}
            />
          </div>
        </>
      )}
    </section>
  );
};
