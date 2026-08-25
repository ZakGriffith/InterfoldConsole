"use client";

import { useEffect, useState } from "react";
import { HandOff } from "./HandOff";
import { Note } from "./ui";
import { type Address, zeroAddress } from "viem";
import { usePublicClient } from "wagmi";
import { type OwnerFunds } from "~~/hooks/interfold/useOwnerFunds";
import { type BatchCall, contractName, txBuilderJson } from "~~/utils/interfold/batch";
import { CHAIN_ID } from "~~/utils/interfold/contracts";
import { decodeRevertHex, explainError, parseContractError } from "~~/utils/interfold/errors";
import { fmtTokens, shortAddr } from "~~/utils/interfold/format";

type Props = {
  calls: BatchCall[];
  owner?: Address;
  funds?: OwnerFunds;
  totalFold: bigint;
  totalSusds: bigint;
  batchName: string;
};

type CallResult = { ok: boolean; gasUsed: bigint; error?: string };

/** Context-free batch: calls, optional simulation as the bond owner, Transaction Builder hand-off. */
export const BatchExport = ({ calls, owner, funds, totalFold, totalSusds, batchName }: Props) => {
  const publicClient = usePublicClient({ chainId: CHAIN_ID });
  const [createdAt] = useState(() => Date.now());
  const [sim, setSim] = useState<{
    status: "idle" | "running" | "done" | "error";
    results: CallResult[];
    error?: string;
  }>({ status: "idle", results: [] });
  const key = calls.map(c => c.data).join("|") + (owner ?? "");
  useEffect(() => setSim({ status: "idle", results: [] }), [key]);

  const fileName = `${batchName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.json`;
  const json = calls.length
    ? txBuilderJson(calls, owner ?? zeroAddress, batchName, calls.map(c => c.summary).join("; "), createdAt)
    : "";

  const simulate = async () => {
    if (!publicClient || !owner) return;
    setSim({ status: "running", results: [] });
    try {
      const r = await publicClient.simulateCalls({
        account: owner,
        calls: calls.map(c => ({ to: c.to, data: c.data })),
      });
      setSim({
        status: "done",
        results: r.results.map(x => ({
          ok: x.status === "success",
          gasUsed: x.gasUsed,
          error:
            x.status === "success"
              ? undefined
              : explainError(decodeRevertHex(x.data) ?? (x.error as any)?.shortMessage ?? "reverted"),
        })),
      });
    } catch (e) {
      setSim({ status: "error", results: [], error: parseContractError(e) });
    }
  };

  if (calls.length === 0) return <Note>Nothing left to do for this node.</Note>;

  return (
    <section className="if-card">
      <header className="if-card__head" style={{ marginBottom: 12 }}>
        <div>
          <div className="if-eyebrow">One Safe transaction</div>
          <h3 className="if-card__title" style={{ margin: 0 }}>
            Everything this node still needs, as one bundle
          </h3>
        </div>
        <span className="if-stat__sub">
          {calls.length} calls · {fmtTokens(totalFold, "FOLD")} · {fmtTokens(totalSusds, "sUSDS")}
        </span>
      </header>
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
                  <td>{c.summary}</td>
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
      </div>
      <div className="if-actions" style={{ marginTop: 14 }}>
        <button
          type="button"
          className="if-btn if-btn--ghost"
          disabled={!owner || sim.status === "running"}
          title={owner ? "Dry-run all calls in order as the bond owner" : "Needs the bond owner address"}
          onClick={simulate}
        >
          {sim.status === "running" ? <span className="if-spinner" /> : null} Simulate as the bond owner
        </button>
        {sim.status === "done" && sim.results.every(r => r.ok) && (
          <span className="if-action__hint">
            All {sim.results.length} calls succeed as {shortAddr(owner)} (
            {sim.results.reduce((a, r) => a + r.gasUsed, 0n).toString()} gas).
          </span>
        )}
      </div>
      {sim.status === "done" && sim.results.some(r => !r.ok) && (
        <div style={{ marginTop: 10 }}>
          <Note kind="bad">
            {sim.results.filter(r => !r.ok).length} of {sim.results.length} calls would revert right now; see the table.
            Expected if the node has not run <code>set-bond-owner</code> yet or the owner still needs funds.
          </Note>
        </div>
      )}
      {sim.status === "error" && (
        <div style={{ marginTop: 10 }}>
          <Note kind="bad">{sim.error}</Note>
        </div>
      )}
      <div style={{ marginTop: 16 }}>
        <HandOff
          json={json}
          fileName={fileName}
          callCount={calls.length}
          owner={owner}
          funds={funds}
          totalFold={totalFold}
          totalSusds={totalSusds}
        />
      </div>
    </section>
  );
};
