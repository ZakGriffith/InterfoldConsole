"use client";

import { useEffect, useRef, useState } from "react";
import { BatchPanel } from "./BatchPanel";
import { BondOwnerCard } from "./BondOwnerCard";
import { FleetTable, batchable, needsAttention, statusPill } from "./FleetTable";
import { NetworkPulse } from "./NetworkPulse";
import { OnboardCard } from "./OnboardCard";
import { OperatorWizard } from "./OperatorWizard";
import { ParamsStrip } from "./ParamsStrip";
import { Empty, Loader, Note } from "./ui";
import { type Address } from "viem";
import { ConsoleProvider, useConsole } from "~~/hooks/interfold/ConsoleContext";
import { useFleetStatus } from "~~/hooks/interfold/useFleetStatus";
import { useOperatorList } from "~~/hooks/interfold/useOperatorList";
import { planOnboarding } from "~~/utils/interfold/batch";
import { REGISTRY, explorerAddress } from "~~/utils/interfold/contracts";
import { sameAddr } from "~~/utils/interfold/format";

const Inner = () => {
  const { owner, ownerIsContract, params, paramsLoading, paramsError, connected, onMainnet, funds } = useConsole();
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

  // Drop selections when the owner changes or an operator disappears.
  useEffect(() => {
    if (selected && !list.operators.some(o => sameAddr(o, selected))) setSelected(undefined);
    setBatchSel(prev => new Set([...prev].filter(k => list.operators.some(o => o.toLowerCase() === k))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.operators, owner]);

  // Default to the first node that still needs something (a fully set-up node reads all "Complete",
  // which is not what a fleet manager wants to land on); fall back to the first node.
  useEffect(() => {
    if (selected || list.operators.length === 0 || fleet.isLoading) return;
    const pending = list.operators.find(op =>
      needsAttention(
        statusPill(fleet.statuses[op.toLowerCase()], owner, params?.requiredCiphernodeBond, params?.minTicketBalance),
      ),
    );
    setSelected(pending ?? list.operators[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.operators, fleet.statuses, fleet.isLoading]);

  const startOnboarding = (op: Address, label: string) => {
    list.addManual(op);
    if (label) list.setLabel(op, label);
    setSelected(op);
    setTimeout(() => wizardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  return (
    <main className="if-main">
      <div className="if-guide">
        <header className="if-guide__head">
          <div className="if-eyebrow">My nodes</div>
          <h1 className="if-guide__title">Run ciphernodes on Interfold, funded from one Safe.</h1>
          <p className="if-guide__lede">
            Ciphernodes hold key shares for encrypted computations and are selected into committees by sortition. To
            take part, a node needs a bonded ciphernode bond and a ticket balance. This console lets one bond owner — a
            Gnosis Safe — post that collateral for many nodes run by different people, step by step, against the live{" "}
            <a className="if-link" href={explorerAddress(REGISTRY.address)} target="_blank" rel="noreferrer">
              bonding registry
            </a>
            .
          </p>
        </header>

        {connected && !onMainnet && (
          <Note kind="warn">
            Interfold is deployed on Ethereum mainnet. Switch the wallet network to continue; writes are disabled.
          </Note>
        )}

        {paramsError && !params ? (
          <Empty>Couldn&apos;t reach the bonding registry. Retrying automatically…</Empty>
        ) : paramsLoading && !params ? (
          <Loader label="Loading bonding parameters" sub={REGISTRY.address} />
        ) : (
          <>
            <NetworkPulse />
            <ParamsStrip />
            <BondOwnerCard />
            <OnboardCard existing={list.operators} onStart={startOnboarding} />
          </>
        )}
      </div>

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
        removeManual={list.removeManual}
        isDiscovering={list.isDiscovering}
        logsFailed={list.logsFailed}
        lastScan={list.lastScan}
        refetch={() => list.refetch()}
      />

      {ownerIsContract && batchNodes.length > 0 && (
        <BatchPanel
          eyebrow="Batch"
          title={`One Safe transaction for ${batchNodes.length} node${batchNodes.length === 1 ? "" : "s"}`}
          lede="Approvals are merged into one FOLD and one sUSDS approval sized for the whole batch; then every node is bonded, registered and ticketed in order. New nodes get the minimum ticket count (use a node's own guide to buy more). One signature round for all of it."
          plan={fleetPlan}
          batchName={`interfold-onboard-${batchNodes.length}-nodes`}
        />
      )}

      <div ref={wizardRef} style={{ scrollMarginTop: 80 }}>
        {selected ? (
          <OperatorWizard
            operator={selected}
            status={fleet.statuses[selected.toLowerCase()]}
            statusLoading={fleet.isLoading}
            label={list.labels[selected.toLowerCase()] ?? ""}
            onLabel={l => list.setLabel(selected, l)}
          />
        ) : (
          <Empty>Select a node above, or onboard a new one, to open its setup guide.</Empty>
        )}
      </div>
    </main>
  );
};

export const OperatorConsole = () => (
  <ConsoleProvider>
    <Inner />
  </ConsoleProvider>
);
