"use client";

import { useEffect, useState } from "react";
import { CopyButton, Note, TxLink } from "./ui";
import { useConsole } from "~~/hooks/interfold/ConsoleContext";
import { type WriteParams, useSafeAwareWrite } from "~~/hooks/interfold/useSafeAwareWrite";
import { safeQueue, safeTx } from "~~/utils/interfold/contracts";
import { shortAddr } from "~~/utils/interfold/format";

type Props = {
  label: string;
  params?: WriteParams;
  variant?: "primary" | "ghost" | "danger";
  /** Blocks Propose/Send only; Simulate and Copy calldata always work. */
  disabled?: boolean;
  disabledReason?: string;
  /** When the gating read is already satisfied: show `doneLabel`, disable, and reset any stale status. */
  done?: boolean;
  doneLabel?: string;
  /** Owner-only calls require the connected wallet to be the owner; operator calls require the hot wallet. */
  requires?: "owner" | "connected";
};

/**
 * Simulate -> Propose to Safe (or Send) -> status line, plus a calldata export so the identical
 * call can be pasted into the Safe Transaction Builder or ABI.ninja if a connector misbehaves.
 */
export const ActionButtons = ({
  label,
  params,
  variant = "primary",
  disabled,
  disabledReason,
  done,
  doneLabel,
  requires = "owner",
}: Props) => {
  const w = useSafeAwareWrite();
  const { canWriteAsOwner, connected, onMainnet, isSafe, owner } = useConsole();
  const [showCalldata, setShowCalldata] = useState(false);

  useEffect(() => {
    if (done && w.status !== "idle") w.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  const walletOk = requires === "owner" ? canWriteAsOwner : !!connected && onMainnet;
  const walletReason =
    requires === "owner"
      ? !connected
        ? "Connect the bond owner wallet (the Safe) to send this."
        : !onMainnet
          ? "Switch the wallet to Ethereum mainnet."
          : `Connected wallet is not the bond owner ${shortAddr(owner)}.`
      : !connected
        ? "Connect the operator's hot wallet to send this."
        : "Switch the wallet to Ethereum mainnet.";

  const sendDisabled = !params || !!done || !!disabled || !walletOk || w.busy;
  const simDisabled = !params || w.busy;
  const sendLabel = w.status === "awaiting-wallet" ? "Confirm in wallet…" : isSafe ? `${label} · propose` : label;

  const calldata = params ? w.calldata(params) : undefined;
  const exportJson = params
    ? JSON.stringify({ to: params.address, value: "0", data: calldata, summary: params.summary ?? params.functionName })
    : "";

  return (
    <div className="if-step__content" style={{ marginTop: 0 }}>
      <div className="if-actions">
        <button
          type="button"
          className="if-btn if-btn--ghost"
          disabled={simDisabled}
          onClick={() => params && w.simulate(params)}
        >
          {w.status === "simulating" ? <span className="if-spinner" /> : null}
          Simulate
        </button>
        <button
          type="button"
          className={`if-btn if-btn--${variant}`}
          disabled={sendDisabled}
          onClick={() => params && w.write(params)}
          title={done ? doneLabel : !walletOk ? walletReason : disabledReason}
        >
          {w.status === "awaiting-wallet" ? <span className="if-spinner" /> : null}
          {done && doneLabel ? doneLabel : sendLabel}
        </button>
        <button
          type="button"
          className="if-btn if-btn--ghost if-btn--sm"
          disabled={!params}
          onClick={() => setShowCalldata(s => !s)}
        >
          {showCalldata ? "Hide calldata" : "Calldata"}
        </button>
      </div>

      {!done && !walletOk && params && !disabled && (
        <Note>{walletReason} You can still simulate and copy the calldata.</Note>
      )}
      {!done && disabled && disabledReason && <Note>{disabledReason}</Note>}

      {w.status === "simulating" && (
        <Note>
          Simulating as <code>{shortAddr(w.simulatedAs)}</code>…
        </Note>
      )}
      {w.status === "sim-ok" && (
        <Note kind="good">
          Simulation succeeded as <code>{shortAddr(w.simulatedAs)}</code>. This call would not revert right now.
        </Note>
      )}
      {w.status === "sim-fail" && (
        <Note kind="bad">
          Would revert as <code>{shortAddr(w.simulatedAs)}</code>: {w.error}
          {w.revert && (
            <>
              {" "}
              <code>{w.revert}</code>
            </>
          )}
        </Note>
      )}
      {w.status === "awaiting-wallet" && (
        <Note>
          Waiting for the wallet. For a Safe this resolves once the first signature is collected (some connectors wait
          for execution). The page tracks the on-chain state either way, so it is safe to leave.
        </Note>
      )}
      {w.status === "proposed" && (
        <Note kind="good">
          Proposed to the Safe · safeTxHash {w.hash && <TxLink hash={w.hash} href={safeTx(owner, w.hash)} />} · waiting
          for on-chain change… Collect the remaining signatures in the{" "}
          <a className="if-link" href={safeQueue(owner)} target="_blank" rel="noreferrer">
            Safe queue
          </a>
          .
        </Note>
      )}
      {w.status === "sent" && <Note>Sent {w.hash && <TxLink hash={w.hash} />} · waiting for confirmation…</Note>}
      {w.status === "confirmed" && (
        <Note kind="good">Confirmed {w.hash && <TxLink hash={w.hash} />}. Reads refresh on the next poll.</Note>
      )}
      {w.status === "error" && <Note kind="bad">{w.error}</Note>}

      {showCalldata && params && calldata && (
        <dl className="if-calldata">
          <dt>to</dt>
          <dd>{params.address}</dd>
          <dt>value</dt>
          <dd>0</dd>
          <dt>function</dt>
          <dd>
            {params.functionName}({(params.args ?? []).map(a => String(a)).join(", ")})
          </dd>
          <dt>data</dt>
          <dd>{calldata}</dd>
          <dt></dt>
          <dd style={{ fontFamily: "var(--if-sans)", gap: 8, display: "flex", flexWrap: "wrap" }}>
            <CopyButton text={calldata} label="Copy data" />
            <CopyButton text={exportJson} label="Copy as JSON" />
            <span style={{ color: "var(--if-ink-4)", fontSize: 12 }}>
              Paste into Safe → Apps → Transaction Builder (custom data) or abi.ninja.
            </span>
          </dd>
        </dl>
      )}
    </div>
  );
};
