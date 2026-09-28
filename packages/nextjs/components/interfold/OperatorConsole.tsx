"use client";

import { useEffect, useRef, useState } from "react";
import { BatchPanel } from "./BatchPanel";
import { BondOwnerCard } from "./BondOwnerCard";
import { FleetTable, batchable, needsAttention, statusPill } from "./FleetTable";
import { OperatorWizard } from "./OperatorWizard";
import { PeerIdCard } from "./PeerIdCard";
import { Empty, Field, Loader, Note } from "./ui";
import { type Address } from "viem";
import { useEnsAddress } from "wagmi";
import { ConsoleProvider, OwnerScope, useConsole } from "~~/hooks/interfold/ConsoleContext";
import { useFleetStatus } from "~~/hooks/interfold/useFleetStatus";
import { useOperatorList } from "~~/hooks/interfold/useOperatorList";
import { planOnboarding } from "~~/utils/interfold/batch";
import { REGISTRY } from "~~/utils/interfold/contracts";
import { safeNormalize, sameAddr, toChecksum } from "~~/utils/interfold/format";

/**
 * One bond owner's section: owner strip, its nodes, the Safe batch panel, and the guide for the
 * selected node. Reads `owner` from the surrounding OwnerScope, so every section is self-contained.
 */
const FleetSection = ({ primary }: { primary: boolean }) => {
  const { owner, ownerIsContract, params, funds } = useConsole();
  const list = useOperatorList(owner);
  const fleet = useFleetStatus(list.operators);
  const [selected, setSelected] = useState<Address>();
  const wizardRef = useRef<HTMLDivElement>(null);
  const [batchSel, setBatchSel] = useState<Set<string>>(new Set());

  const pillOf = (op: Address) =>
    statusPill(fleet.statuses[op.toLowerCase()], owner, params?.requiredCiphernodeBond, params?.minTicketBalance);
  const toggleBatch = (op: Address) =>
    setBatchSel(prev => {
      const next = new Set(prev);
      const k = op.toLowerCase();
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  const selectAllBatchable = () =>
    setBatchSel(new Set(list.operators.filter(op => batchable(pillOf(op))).map(op => op.toLowerCase())));
  const batchNodes = list.operators
    .filter(op => batchSel.has(op.toLowerCase()))
    .map(op => ({ operator: op, status: fleet.statuses[op.toLowerCase()], label: list.labels[op.toLowerCase()] }));
  const fleetPlan = planOnboarding(owner, batchNodes, params, funds);

  useEffect(() => {
    if (selected && !list.operators.some(o => sameAddr(o, selected))) setSelected(undefined);
    setBatchSel(prev => new Set([...prev].filter(k => list.operators.some(o => o.toLowerCase() === k))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.operators, owner]);

  // The primary section lands on the first node that still needs something; other sections wait for a click.
  useEffect(() => {
    if (!primary || selected || list.operators.length === 0 || fleet.isLoading) return;
    const pending = list.operators.find(op => needsAttention(pillOf(op)));
    setSelected(pending ?? list.operators[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.operators, fleet.statuses, fleet.isLoading]);

  const addNode = (op: Address, label: string) => {
    list.addManual(op);
    if (label) list.setLabel(op, label);
    setSelected(op);
    setTimeout(() => wizardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  return (
    <section className="if-fleet-section">
      <BondOwnerCard />

      <FleetTable
        operators={list.operators}
        sources={list.sources}
        labels={list.labels}
        statuses={fleet.statuses}
        selected={selected}
        onSelect={setSelected}
        batchEnabled={ownerIsContract}
        batchSelection={batchSel}
        onToggleBatch={toggleBatch}
        onSelectAllBatchable={selectAllBatchable}
        onAdd={addNode}
        removeManual={list.removeManual}
        isDiscovering={list.isDiscovering}
        logsFailed={list.logsFailed}
        lastScan={list.lastScan}
        refetch={() => list.refetch()}
      />

      {ownerIsContract && batchNodes.length > 0 && (
        <BatchPanel
          title={`Bond, register and ticket ${batchNodes.length} node${batchNodes.length === 1 ? "" : "s"} in one transaction`}
          plan={fleetPlan}
          batchName={`interfold-onboard-${batchNodes.length}-nodes`}
        />
      )}

      <div ref={wizardRef} style={{ scrollMarginTop: 80 }}>
        {selected ? (
          <>
            <OperatorWizard
              operator={selected}
              status={fleet.statuses[selected.toLowerCase()]}
              statusLoading={fleet.isLoading}
              label={list.labels[selected.toLowerCase()] ?? ""}
              onLabel={l => list.setLabel(selected, l)}
            />
            <div style={{ marginTop: 20 }}>
              <PeerIdCard operator={selected} bondOwner={owner} label={list.labels[selected.toLowerCase()]} />
            </div>
          </>
        ) : primary ? (
          <Empty>Select a node above, or add one, to open its guide.</Empty>
        ) : null}
      </div>
    </section>
  );
};

/** Adds another bond owner as its own section: a Safe you sign for, or a second wallet of yours. */
const AddOwnerRow = () => {
  const { owners, addOwner } = useConsole();
  const [input, setInput] = useState("");
  const ens = input.trim().toLowerCase().endsWith(".eth") ? input.trim() : undefined;
  const { data: ensAddr, isLoading } = useEnsAddress({
    name: safeNormalize(ens),
    chainId: 1,
    query: { enabled: !!ens },
  });
  const resolved = toChecksum(input.trim()) ?? (ensAddr ? toChecksum(ensAddr) : null);
  const shown = !!resolved && owners.some(o => sameAddr(o, resolved));
  const invalid = (input.trim() !== "" && !resolved && !isLoading) || shown;
  const add = () => {
    if (!resolved || shown) return;
    addOwner(resolved);
    setInput("");
  };
  return (
    <form
      className="if-addrow if-addrow--two"
      onSubmit={e => {
        e.preventDefault();
        add();
      }}
    >
      <Field
        label="Also show a bond owner (address or ENS)"
        value={input}
        onChange={setInput}
        placeholder="0x… or name.eth"
        invalid={invalid}
        hint={
          shown
            ? "Already on this page."
            : invalid
              ? "Not a valid address or ENS name."
              : "A Safe you sign for, or another wallet of yours. Saved in this browser for the connected wallet."
        }
      />
      <div className="if-addrow__actions">
        <button type="submit" className="if-btn if-btn--primary" disabled={!resolved || shown}>
          Add section
        </button>
      </div>
    </form>
  );
};

const Inner = () => {
  const { owners, params, paramsLoading, paramsError, connected, onMainnet } = useConsole();

  if (paramsError && !params)
    return (
      <main className="if-main">
        <Empty>Cannot reach the bonding registry. Retrying.</Empty>
      </main>
    );
  if (paramsLoading && !params)
    return (
      <main className="if-main">
        <Loader label="Loading" sub={REGISTRY.address} />
      </main>
    );

  return (
    <main className="if-main" style={{ gap: 28 }}>
      {connected && !onMainnet && <Note kind="warn">Switch the wallet to Ethereum mainnet; writes are disabled.</Note>}

      {owners.map((owner, i) => (
        <OwnerScope key={owner} owner={owner}>
          <FleetSection primary={i === 0} />
        </OwnerScope>
      ))}

      <AddOwnerRow />
    </main>
  );
};

export const OperatorConsole = () => (
  <ConsoleProvider>
    <Inner />
  </ConsoleProvider>
);
