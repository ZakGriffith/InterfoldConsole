"use client";

import { useEffect, useState } from "react";
import { CopyButton, Note } from "./ui";
import { type Address, zeroAddress } from "viem";
import { usePublicClient } from "wagmi";
import { type OwnerFunds } from "~~/hooks/interfold/useOwnerFunds";
import { type BatchCall, contractName, txBuilderJson } from "~~/utils/interfold/batch";
import { CHAIN_ID, safeTxBuilder } from "~~/utils/interfold/contracts";
import { decodeRevertHex, explainError, parseContractError } from "~~/utils/interfold/errors";
import { fmtTokens, shortAddr } from "~~/utils/interfold/format";

type Props = {
  calls: BatchCall[];
  /** The Safe that will import the file. Optional: unknown until the node has run set-bond-owner. */
  owner?: Address;
  funds?: OwnerFunds;
  totalFold: bigint;
  totalSusds: bigint;
  batchName: string;
};

type CallResult = { ok: boolean; gasUsed: bigint; error?: string };

/**
 * Context-free batch export: plan table, optional simulation as the bond owner, and the Transaction
 * Builder hand-off (download / copy / preview). Used where no wallet is connected.
 */
export const BatchExport = ({ calls, owner, funds, totalFold, totalSusds, batchName }: Props) => {
  const publicClient = usePublicClient({ chainId: CHAIN_ID });
  const [createdAt] = useState(() => Date.now());
  const [showJson, setShowJson] = useState(false);
  const [sim, setSim] = useState<{
    status: "idle" | "running" | "done" | "error";
    results: CallResult[];
    error?: string;
  }>({ status: "idle", results: [] });
  const [actedWhileShort, setActedWhileShort] = useState<string>();
  const key = calls.map(c => c.data).join("|") + (owner ?? "");
  useEffect(() => {
    setSim({ status: "idle", results: [] });
    setActedWhileShort(undefined);
  }, [key]);

  const fileName = `${batchName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.json`;
  const json = calls.length
    ? txBuilderJson(
        calls,
        owner ?? zeroAddress,
        batchName,
        `${calls.length} calls: ${calls.map(c => c.summary).join("; ")}`,
        createdAt,
      )
    : "";

  const shortFold = funds && totalFold > funds.foldBalance ? totalFold - funds.foldBalance : 0n;
  const shortSusds = funds && totalSusds > funds.susdsBalance ? totalSusds - funds.susdsBalance : 0n;
  const isShort = shortFold > 0n || shortSusds > 0n;
  const shortText = [
    shortFold > 0n ? `${fmtTokens(shortFold, "FOLD")} more FOLD` : "",
    shortSusds > 0n ? `${fmtTokens(shortSusds, "sUSDS")} more sUSDS` : "",
  ]
    .filter(Boolean)
    .join(" and ");
  const noteShort = (action: string) => {
    if (isShort) setActedWhileShort(action);
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    noteShort("Downloaded");
  };

  const simulate = async () => {
    if (!publicClient || !owner) return;
    setSim({ status: "running", results: [] });
    try {
      const r = await publicClient.simulateCalls({
        account: owner,
        calls: calls.map(c => ({ to: c.to, data: c.data })),
      });
      const results = r.results.map(x => ({
        ok: x.status === "success",
        gasUsed: x.gasUsed,
        error:
          x.status === "success"
            ? undefined
            : explainError(decodeRevertHex(x.data) ?? (x.error as any)?.shortMessage ?? "reverted"),
      }));
      setSim({ status: "done", results });
    } catch (e) {
      setSim({ status: "error", results: [], error: parseContractError(e) });
    }
  };

  if (calls.length === 0) return <Note>Nothing left to batch for this node.</Note>;

  return (
    <div className="if-guide" style={{ gap: 14 }}>
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
            {calls.map((c, i) => {
              const r = sim.results[i];
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
                    {sim.status === "running" ? (
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
        <div className="if-table__foot">
          <span>
            {calls.length} calls · {fmtTokens(totalFold, "FOLD")} · {fmtTokens(totalSusds, "sUSDS")} · executes as one
            Safe transaction.
          </span>
          <button
            type="button"
            className="if-btn if-btn--ghost if-btn--sm"
            disabled={!owner || sim.status === "running"}
            title={
              owner ? "Dry-run all calls in order as the bond owner (eth_simulateV1)" : "Needs the bond owner address"
            }
            onClick={simulate}
          >
            {sim.status === "running" ? <span className="if-spinner" /> : null} Simulate as the bond owner
          </button>
        </div>
      </div>

      {sim.status === "done" && sim.results.every(r => r.ok) && (
        <Note kind="good">
          Whole batch simulated as {shortAddr(owner)}: every call succeeds in sequence (
          {sim.results.reduce((a, r) => a + r.gasUsed, 0n).toString()} gas total).
        </Note>
      )}
      {sim.status === "done" && sim.results.some(r => !r.ok) && (
        <Note kind="bad">
          {sim.results.filter(r => !r.ok).length} of {sim.results.length} calls would revert right now; see the table.
          If the node has not run <code>set-bond-owner</code> yet, or the owner still needs funds, that is expected.
        </Note>
      )}
      {sim.status === "error" && <Note kind="bad">{sim.error}</Note>}

      <section className="if-export" style={{ marginTop: 0 }}>
        <div className="if-eyebrow">Hand-off</div>
        <h4 className="if-export__title">Export this batch as a file for Safe&apos;s Transaction Builder</h4>
        <p className="if-card__body">
          The file describes exactly the {calls.length} calls above (targets, function names, amounts, in order) in the
          format Safe&apos;s <b>Transaction Builder</b> app imports. Whoever uploads it there gets the same bundle as
          one Safe transaction (one MultiSend, one signature round), without needing this console or a wallet connected
          here. Exporting sends nothing on-chain; the file only becomes a proposal when a signer of the bond-owner Safe
          submits it in Safe{"{Wallet}"}. It carries Safe&apos;s checksum, so an edited copy is rejected on import. At
          execution the Safe must hold the FOLD and sUSDS listed above (locked FOLD is fine), or the whole bundle
          reverts.
        </p>
        {!owner && (
          <Note kind="warn">
            No bond owner is known for this node yet, so the file is not tied to a specific Safe (the importing Safe is
            fine). Remember: the node must run <code>set-bond-owner</code> naming that Safe <em>before</em> the bundle
            executes, or every call in it reverts.
          </Note>
        )}
        <ol className="if-export__steps">
          <li>
            <b>Download</b> the file (<code>{fileName}</code>) and send it to a signer of the Safe that funds this node
            {owner && (
              <>
                {" "}
                (<code>{shortAddr(owner)}</code>)
              </>
            )}
            .
          </li>
          <li>
            In Safe{"{Wallet}"}, open the Safe and go to <b>Apps → Transaction Builder</b>
            {owner && (
              <>
                {" "}
                <a className="if-link" href={safeTxBuilder(owner)} target="_blank" rel="noreferrer">
                  (direct link for this Safe)
                </a>
              </>
            )}
            .
          </li>
          <li>
            Drag the file onto the <b>Upload a batch</b> area. Transaction Builder validates the checksum and lists
            every call with its decoded arguments; compare it with the table above.
          </li>
          <li>
            Click <b>Create Batch</b>, then <b>Send Batch</b>, and sign. The bundle appears in the Safe queue for the
            other signers to confirm and execute.
          </li>
        </ol>
        <div className="if-actions">
          <button type="button" className="if-btn if-btn--primary" disabled={!json} onClick={download}>
            Download batch file · {calls.length} calls
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
    </div>
  );
};
