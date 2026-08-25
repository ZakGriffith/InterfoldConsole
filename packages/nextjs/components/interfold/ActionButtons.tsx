"use client";

import { useEffect } from "react";
import { Note, TxLink } from "./ui";
import { useConsole } from "~~/hooks/interfold/ConsoleContext";
import { type WriteParams, useSafeAwareWrite } from "~~/hooks/interfold/useSafeAwareWrite";
import { safeQueue, safeTx } from "~~/utils/interfold/contracts";
import { shortAddr } from "~~/utils/interfold/format";

type Props = {
  label: string;
  params?: WriteParams;
  variant?: "primary" | "ghost" | "danger";
  /** An on-chain prerequisite is not met; in queue mode this only produces a note. */
  disabled?: boolean;
  disabledReason?: string;
  /** The gating read is already satisfied: show `doneLabel`, disable, reset stale status. */
  done?: boolean;
  doneLabel?: string;
  /** Owner-only calls require the connected wallet to be the owner; operator calls require the hot wallet. */
  requires?: "owner" | "connected";
};

/**
 * One button per action. Every click simulates first (as the bond owner) and then proposes to the
 * Safe or sends from a plain wallet; the line underneath reports what happened.
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
  const { canWriteAsOwner, connected, onMainnet, isSafe, owner, queueMode } = useConsole();

  useEffect(() => {
    if (done && w.status !== "idle") w.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  const walletOk = requires === "owner" ? canWriteAsOwner : !!connected && onMainnet;
  const walletReason =
    requires === "owner"
      ? !connected
        ? "Connect the bond owner wallet to send this."
        : !onMainnet
          ? "Switch the wallet to Ethereum mainnet."
          : `Connected wallet is not the bond owner ${shortAddr(owner)}.`
      : !connected
        ? "Connect the node hot wallet to send this."
        : "Switch the wallet to Ethereum mainnet.";

  const gated = !!disabled && !(queueMode && isSafe);
  const sendDisabled = !params || !!done || gated || !walletOk || w.busy;
  const text = done && doneLabel ? doneLabel : w.busy ? "Working…" : isSafe ? `${label} · propose` : label;

  return (
    <div className="if-action">
      <button
        type="button"
        className={`if-btn if-btn--${variant}`}
        disabled={sendDisabled}
        onClick={() => params && w.write(params, { proceedOnRevert: queueMode && isSafe })}
        title={done ? doneLabel : !walletOk ? walletReason : disabled ? disabledReason : undefined}
      >
        {w.busy ? <span className="if-spinner" /> : null}
        {text}
      </button>
      {!done && params && !walletOk && !disabled && <span className="if-action__hint">{walletReason}</span>}
      {!done && disabled && disabledReason && (
        <span className={`if-action__hint ${queueMode && isSafe ? "if-action__hint--warn" : ""}`}>
          {queueMode && isSafe
            ? `Not on-chain yet (${disabledReason}). Fine if the earlier step is queued ahead.`
            : disabledReason}
        </span>
      )}
      {w.simWarning && (w.status === "awaiting-wallet" || w.status === "proposed" || w.status === "sent") && (
        <Note kind="warn">
          Simulation reverted ({w.simWarning}); expected while the prerequisite is queued. Sent anyway.
        </Note>
      )}
      {w.status === "sim-fail" && (
        <Note kind="bad">
          Would revert as {shortAddr(w.simulatedAs)}: {w.error}
          {w.revert && (
            <>
              {" "}
              <code>{w.revert}</code>
            </>
          )}
        </Note>
      )}
      {w.status === "awaiting-wallet" && (
        <Note>Confirm in the wallet. For a Safe this returns after the first signature.</Note>
      )}
      {w.status === "proposed" && (
        <Note kind="good">
          Proposed {w.hash && <TxLink hash={w.hash} href={safeTx(owner, w.hash)} />}. Collect signatures in the{" "}
          <a className="if-link" href={safeQueue(owner)} target="_blank" rel="noreferrer">
            Safe queue
          </a>
          ; this page updates once it executes.
        </Note>
      )}
      {w.status === "sent" && <Note>Sent {w.hash && <TxLink hash={w.hash} />}. Waiting for confirmation.</Note>}
      {w.status === "confirmed" && <Note kind="good">Confirmed {w.hash && <TxLink hash={w.hash} />}.</Note>}
      {w.status === "error" && <Note kind="bad">{w.error}</Note>}
    </div>
  );
};
