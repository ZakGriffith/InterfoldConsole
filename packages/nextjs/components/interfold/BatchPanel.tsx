"use client";

import { useEffect, useState } from "react";
import { RequirementsNote } from "./RequirementsNote";
import { CopyButton, Note, TxLink } from "./ui";
import { useConsole } from "~~/hooks/interfold/ConsoleContext";
import { useSafeBatch } from "~~/hooks/interfold/useSafeBatch";
import { type Plan, contractName, txBuilderJson } from "~~/utils/interfold/batch";
import { safeQueue, safeTx, safeTxBuilder } from "~~/utils/interfold/contracts";
import { fmtTokens, shortAddr } from "~~/utils/interfold/format";

type Props = {
  eyebrow: string;
  title: string;
  lede: string;
  plan: Plan;
  /** Used for the Transaction Builder file name/description. */
  batchName: string;
};

/** Plan table + Simulate batch / Propose as one batch / Transaction Builder export. */
export const BatchPanel = ({ eyebrow, title, lede, plan, batchName }: Props) => {
  const { owner, canWriteAsOwner, isSafe, connected, onMainnet, funds, params } = useConsole();
  const b = useSafeBatch();
  const [createdAt] = useState(() => Date.now());
  const [showJson, setShowJson] = useState(false);
  const [actedWhileShort, setActedWhileShort] = useState<string>();

  // Shortfall check, evaluated live and again at the moment of Download / Copy / Propose.
  const shortFold = funds && plan.totalFold > funds.foldBalance ? plan.totalFold - funds.foldBalance : 0n;
  const shortSusds = funds && plan.totalSusds > funds.susdsBalance ? plan.totalSusds - funds.susdsBalance : 0n;
  const isShort = shortFold > 0n || shortSusds > 0n;
  const shortText = [
    shortFold > 0n ? `${fmtTokens(shortFold, "FOLD")} more FOLD` : "",
    shortSusds > 0n ? `${fmtTokens(shortSusds, "sUSDS")} more sUSDS` : "",
  ]
    .filter(Boolean)
    .join(" and ");
  const ticketCount = params && params.ticketPrice > 0n ? plan.totalSusds / params.ticketPrice : 0n;
  const noteShort = (action: string) => {
    if (isShort) setActedWhileShort(action);
  };
  const fileName = `${batchName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.json`;
  const key = plan.calls.map(c => c.data).join("|");

  // Any change to the plan invalidates a previous simulation/proposal status.
  useEffect(() => {
    b.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const json = plan.calls.length
    ? txBuilderJson(
        plan.calls,
        owner,
        batchName,
        `${plan.calls.length} calls: ${plan.calls.map(c => c.summary).join("; ")}`,
        createdAt,
      )
    : "";
  const download = () => {
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    noteShort("Downloaded");
  };

  const canPropose = canWriteAsOwner && onMainnet;
  const proposeReason = !connected
    ? "Connect as the Safe to propose."
    : !onMainnet
      ? "Switch to Ethereum mainnet."
      : !canWriteAsOwner
        ? `Connected wallet is not the bond owner ${shortAddr(owner)}.`
        : !isSafe
          ? "A plain key is connected; batching needs a Safe (or another EIP-5792 wallet)."
          : undefined;

  return (
    <section className="if-card">
      <header className="if-card__head">
        <div>
          <div className="if-eyebrow">{eyebrow}</div>
          <h3 className="if-card__title">{title}</h3>
          <p className="if-card__body">{lede}</p>
        </div>
        {plan.calls.length > 0 && (
          <div className="if-stat__sub" style={{ textAlign: "right" }}>
            {plan.calls.length} call{plan.calls.length === 1 ? "" : "s"} · 1 signature round
            <br />
            {fmtTokens(plan.totalFold, "FOLD")} · {fmtTokens(plan.totalSusds, "sUSDS")}
          </div>
        )}
      </header>

      {plan.calls.length === 0 ? (
        <Note>Nothing to batch for the selected node(s) right now.</Note>
      ) : (
        <div className="if-table-wrap" style={{ marginBottom: 16 }}>
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
                    <td>
                      {c.summary}
                      <div style={{ color: "var(--if-ink-4)", fontSize: 11.5 }} className="if-mono">
                        {c.functionName}({c.args.map(a => String(a)).join(", ")})
                      </div>
                    </td>
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
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {plan.calls.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <RequirementsNote foldNeeded={plan.totalFold} susdsNeeded={plan.totalSusds} tickets={ticketCount} />
        </div>
      )}

      {plan.skipped.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <Note>Not included: {plan.skipped.map(s => `${shortAddr(s.operator)} (${s.reason})`).join(" · ")}</Note>
        </div>
      )}
      {plan.warnings.map(w => (
        <div key={w} style={{ marginBottom: 12 }}>
          <Note kind="warn">{w}</Note>
        </div>
      ))}

      <div className="if-actions">
        <button
          type="button"
          className="if-btn if-btn--ghost"
          disabled={plan.calls.length === 0 || b.busy}
          onClick={() => b.simulate(plan.calls)}
        >
          {b.status === "simulating" ? <span className="if-spinner" /> : null} Simulate batch
        </button>
        <button
          type="button"
          className="if-btn if-btn--primary"
          disabled={plan.calls.length === 0 || b.busy || !canPropose}
          title={proposeReason}
          onClick={() => {
            noteShort("Proposed");
            b.propose(plan.calls);
          }}
        >
          {b.status === "awaiting-wallet" ? <span className="if-spinner" /> : null} Propose as one batch
        </button>
      </div>

      <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        {plan.calls.length > 0 && !canPropose && (
          <Note>
            {proposeReason} You can still simulate here, or export the batch below and have any signer of the Safe
            import it in Transaction Builder.
          </Note>
        )}
        {b.status === "sim-ok" && (
          <Note kind="good">
            Whole batch simulated as {shortAddr(owner)}: every call succeeds in sequence (
            {b.results.reduce((a, r) => a + r.gasUsed, 0n).toString()} gas total).
          </Note>
        )}
        {b.status === "sim-fail" && <Note kind="bad">{b.error}</Note>}
        {b.status === "awaiting-wallet" && (
          <Note>Waiting for Safe{"{Wallet}"} — confirm the batch there. It becomes one MultiSend proposal.</Note>
        )}
        {b.status === "proposed" && (
          <Note kind="good">
            Batch proposed · safeTxHash {b.id && <TxLink hash={b.id} href={safeTx(owner, b.id)} />} · collect the
            remaining signatures in the{" "}
            <a className="if-link" href={safeQueue(owner)} target="_blank" rel="noreferrer">
              Safe queue
            </a>
            . The table above updates once it executes.
          </Note>
        )}
        {b.status === "error" && <Note kind="bad">{b.error}</Note>}
      </div>

      {plan.calls.length > 0 && (
        <section className="if-export">
          <div className="if-eyebrow">Hand-off</div>
          <h4 className="if-export__title">Export this batch as a file for Safe&apos;s Transaction Builder</h4>
          <p className="if-card__body">
            The file describes exactly the {plan.calls.length} calls listed above — targets, function names, amounts, in
            order — in the format Safe&apos;s <b>Transaction Builder</b> app imports. Whoever uploads it there gets the
            same bundle as one Safe transaction (one MultiSend, one signature round), without needing this console or a
            wallet connected here. Exporting sends nothing on-chain; the file only becomes a proposal when a Safe signer
            submits it in Safe{"{Wallet}"}. The file carries Safe&apos;s checksum, so a corrupted or edited copy is
            rejected on import. At execution the Safe must hold the FOLD and sUSDS listed in the checklist above (locked
            FOLD is fine), or the whole bundle reverts.
          </p>
          <ol className="if-export__steps">
            <li>
              <b>Download</b> the file below (<code>{fileName}</code>) and send it to a signer of{" "}
              <code>{shortAddr(owner)}</code>.
            </li>
            <li>
              In Safe{"{Wallet}"}, open the Safe and go to <b>Apps → Transaction Builder</b>{" "}
              <a className="if-link" href={safeTxBuilder(owner)} target="_blank" rel="noreferrer">
                (direct link for this Safe)
              </a>
              .
            </li>
            <li>
              Drag the file onto the <b>Upload a batch</b> area (or click it and pick the file). Transaction Builder
              validates the checksum and lists every call with its decoded arguments — compare it with the table above.
            </li>
            <li>
              Click <b>Create Batch</b>, then <b>Send Batch</b>, and sign. The bundle appears in the Safe queue for the
              other signers to confirm and execute, exactly like a batch proposed from here.
            </li>
          </ol>
          <div className="if-actions">
            <button type="button" className="if-btn if-btn--primary" disabled={!json} onClick={download}>
              Download batch file · {plan.calls.length} call{plan.calls.length === 1 ? "" : "s"}
            </button>
            <CopyButton
              text={json}
              label="Copy JSON to clipboard"
              className="if-btn--sm"
              onCopy={() => noteShort("Copied")}
            />
            <button
              type="button"
              className="if-btn if-btn--ghost if-btn--sm"
              disabled={!json}
              onClick={() => setShowJson(v => !v)}
            >
              {showJson ? "Hide JSON" : "Show JSON"}
            </button>
          </div>
          {isShort && (
            <Note kind={actedWhileShort ? "bad" : "warn"}>
              {actedWhileShort ? `${actedWhileShort}, but heads up: ` : "Heads up: "}
              the bond owner {shortAddr(owner)} currently needs {shortText} for this bundle to execute. It can still be
              imported and signed, but it will revert as a whole unless the Safe is funded before execution.
            </Note>
          )}
          {showJson && (
            <pre className="if-json" aria-label="Transaction Builder JSON">
              {json}
            </pre>
          )}
        </section>
      )}
    </section>
  );
};
