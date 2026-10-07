"use client";

import { useEffect, useRef, useState } from "react";
import { ExitPanel } from "./ExitPanel";
import { statusPill } from "./FleetTable";
import { OperatorWizard, type WizardView } from "./OperatorWizard";
import { PeerIdCard } from "./PeerIdCard";
import { AddressLink, Badge } from "./ui";
import { type Address } from "viem";
import { OwnerScope, useConsole } from "~~/hooks/interfold/ConsoleContext";
import { type OperatorStatus } from "~~/hooks/interfold/useFleetStatus";

type Props = {
  owner: Address;
  operator: Address;
  status?: OperatorStatus;
  statusLoading: boolean;
  label?: string;
  onClose: () => void;
};

const VIEW_TITLE: Record<WizardView, string> = {
  menu: "",
  batch: "One Safe transaction",
  manual: "Step by step",
  monitor: "Monitoring",
  exit: "Exit, unbond and claim",
};

/**
 * One node's actions in a dialog, so everything in it is unmistakably for the node named in the
 * header. It opens on a short menu; each choice replaces the menu with that one path and a way back.
 */
export const NodeModal = ({ owner, operator, status, statusLoading, label, onClose }: Props) => {
  const ref = useRef<HTMLDialogElement>(null);
  const { params: p } = useConsole();
  const [view, setView] = useState<WizardView>("menu");
  const pill = statusPill(status, owner, p?.requiredCiphernodeBond, p?.minTicketBalance);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      className="if-modal"
      onClose={onClose}
      onClick={e => {
        // A click on the backdrop lands on the dialog element itself, not on its children.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="if-modal__frame">
        <header className="if-modal__head">
          <div className="if-actions" style={{ gap: 10 }}>
            {view !== "menu" && (
              <button type="button" className="if-btn if-btn--ghost if-btn--xs" onClick={() => setView("menu")}>
                ← Options
              </button>
            )}
            <span className="if-eyebrow">{view === "menu" ? "Node" : VIEW_TITLE[view]}</span>
            {label && <b>{label}</b>}
            <AddressLink address={operator} full />
            <Badge kind={pill.kind}>{pill.label}</Badge>
            {statusLoading && <span className="if-spinner" />}
          </div>
          <button type="button" className="if-btn if-btn--ghost if-btn--xs" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="if-modal__body">
          <OwnerScope owner={owner}>
            {view === "monitor" ? (
              <PeerIdCard operator={operator} bondOwner={owner} label={label} />
            ) : view === "exit" ? (
              <ExitPanel operator={operator} status={status} open />
            ) : (
              <OperatorWizard operator={operator} status={status} label={label ?? ""} view={view} onPick={setView} />
            )}
          </OwnerScope>
        </div>
      </div>
    </dialog>
  );
};
