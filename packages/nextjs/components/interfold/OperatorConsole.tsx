"use client";

import { useEffect, useMemo, useState } from "react";
import { BatchPanel } from "./BatchPanel";
import { BondOwnerCard } from "./BondOwnerCard";
import { ConnectGate } from "./ConnectGate";
import { FleetNotes, FleetTable, FleetToolbar, batchable, statusPill } from "./FleetTable";
import { NetworkOwners } from "./NetworkOwners";
import { NodeModal } from "./NodeModal";
import { Empty, Field, Loader, Note } from "./ui";
import { type Address, zeroAddress } from "viem";
import { useEnsAddress } from "wagmi";
import { ConsoleProvider, useConsole } from "~~/hooks/interfold/ConsoleContext";
import { useFleet } from "~~/hooks/interfold/useFleet";
import { planOnboarding } from "~~/utils/interfold/batch";
import { REGISTRY } from "~~/utils/interfold/contracts";
import { safeNormalize, sameAddr, toChecksum } from "~~/utils/interfold/format";

type Selection = { owner: Address; operator: Address };

/** Adds another bond owner as its own list: a Safe you sign for, or a second wallet of yours. */
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
        label="Also list the nodes of another bond owner (address or ENS)"
        value={input}
        onChange={setInput}
        placeholder="0x… or name.eth"
        invalid={invalid}
        hint={shown ? "Already on this page." : invalid ? "Not a valid address or ENS name." : undefined}
      />
      <div className="if-addrow__actions">
        <button type="submit" className="if-btn if-btn--primary" disabled={!resolved || shown}>
          Add
        </button>
      </div>
    </form>
  );
};

/**
 * Fleet: one short list per bond owner (the connected wallet's owner plus any added here), the
 * largest fleet first. Everything else appears once: the toolbar above, and the guide for the
 * selected node, the add rows and the footnotes below.
 */
const Inner = () => {
  const {
    owners,
    primaryOwner,
    removeOwner,
    ownerIsContract,
    params,
    paramsLoading,
    paramsError,
    connected,
    onMainnet,
    funds,
  } = useConsole();
  const fleet = useFleet(owners);
  const [selected, setSelected] = useState<Selection>();
  const [batchSel, setBatchSel] = useState<Set<string>>(new Set());

  const primary = fleet.sections.find(s => sameAddr(s.owner, primaryOwner));
  const anyOperators = fleet.sections.some(s => s.operators.length > 0);
  // Full-page loader only until the first status multicall lands; later loads (an added owner) update in place.
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (anyOperators && !fleet.statusLoading) setSettled(true);
  }, [anyOperators, fleet.statusLoading]);
  // Largest fleet first; the order settles once every status has loaded, so lists do not jump.
  const ordered = useMemo(
    () =>
      [...fleet.sections].sort((a, b) =>
        a.totalBonded === b.totalBonded ? 0 : a.totalBonded > b.totalBonded ? -1 : 1,
      ),
    [fleet.sections],
  );

  const pillOf = (owner: Address, op: Address) =>
    statusPill(fleet.statuses[op.toLowerCase()], owner, params?.requiredCiphernodeBond, params?.minTicketBalance);

  // Batch selection is only offered on the primary section, and only when it is a Safe.
  const batchEnabled = ownerIsContract;
  const toggleBatch = (op: Address) =>
    setBatchSel(prev => {
      const next = new Set(prev);
      const k = op.toLowerCase();
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  const primaryOps = primaryOwner && primary ? primary.operators : [];
  const selectAllBatchable = () =>
    setBatchSel(new Set(primaryOps.filter(op => batchable(pillOf(primaryOwner!, op))).map(op => op.toLowerCase())));
  const batchNodes = primaryOps
    .filter(op => batchSel.has(op.toLowerCase()))
    .map(op => ({ operator: op, status: fleet.statuses[op.toLowerCase()], label: primary?.labels[op.toLowerCase()] }));
  const fleetPlan = planOnboarding(primaryOwner ?? zeroAddress, batchNodes, params, funds);

  useEffect(() => {
    if (selected) {
      const sec = fleet.sections.find(s => sameAddr(s.owner, selected.owner));
      if (!sec || !sec.operators.some(o => sameAddr(o, selected.operator))) setSelected(undefined);
    }
    setBatchSel(prev => new Set([...prev].filter(k => (primary?.operators ?? []).some(o => o.toLowerCase() === k))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fleet.sections]);

  // No wallet and nothing tracked yet: the public landing, with the add row so tracking needs no wallet.
  if (!connected && owners.length === 0)
    return (
      <ConnectGate>
        <AddOwnerRow />
        <NetworkOwners />
      </ConnectGate>
    );
  if (paramsError && !params)
    return (
      <main className="if-main">
        <Empty>Cannot reach the bonding registry. Retrying.</Empty>
      </main>
    );
  if ((paramsLoading && !params) || (!settled && anyOperators && fleet.statusLoading))
    return (
      <main className="if-main">
        <Loader label="Loading" sub={REGISTRY.address} />
      </main>
    );

  const selectedSection = selected && fleet.sections.find(s => sameAddr(s.owner, selected.owner));
  const allOperators = fleet.sections.flatMap(s => s.operators);
  const allLabels = Object.assign({}, ...fleet.sections.map(s => s.labels)) as Record<string, string>;

  return (
    <main className="if-main" style={{ gap: 28 }}>
      {connected && !onMainnet && <Note kind="warn">Switch the wallet to Ethereum mainnet; writes are disabled.</Note>}
      {!connected && (
        <Note>Reading without a wallet. Connect a bond owner to bond, register or buy tickets for its nodes.</Note>
      )}

      <FleetToolbar lastScan={fleet.lastScan} isDiscovering={fleet.isDiscovering} refetch={fleet.refetch} />

      {ordered.map(s => {
        const isPrimary = sameAddr(s.owner, primaryOwner);
        return (
          <section key={s.owner} className="if-fleet-section">
            <div className="if-fleet-card">
              <BondOwnerCard section={s} primary={isPrimary} onRemove={isPrimary ? undefined : removeOwner} />
              <FleetTable
                owner={s.owner}
                operators={s.operators}
                sources={s.sources}
                labels={s.labels}
                statuses={fleet.statuses}
                selected={selected && sameAddr(selected.owner, s.owner) ? selected.operator : undefined}
                onSelect={op => setSelected({ owner: s.owner, operator: op })}
                batchEnabled={isPrimary && batchEnabled}
                batchSelection={batchSel}
                onToggleBatch={toggleBatch}
                onSelectAllBatchable={selectAllBatchable}
                removeManual={op => fleet.removeManual(s.owner, op)}
                setLabel={(op, l) => fleet.setLabel(s.owner, op, l)}
                isDiscovering={s.isDiscovering}
              />
            </div>
            {isPrimary && batchEnabled && batchNodes.length > 0 && (
              <BatchPanel
                title={`Bond, register and ticket ${batchNodes.length} node${batchNodes.length === 1 ? "" : "s"} in one transaction`}
                plan={fleetPlan}
                batchName={`interfold-onboard-${batchNodes.length}-nodes`}
              />
            )}
          </section>
        );
      })}

      <AddOwnerRow />

      {selected && selectedSection && (
        <NodeModal
          key={`${selected.owner}-${selected.operator}`}
          owner={selected.owner}
          operator={selected.operator}
          status={fleet.statuses[selected.operator.toLowerCase()]}
          statusLoading={fleet.statusLoading}
          label={selectedSection.labels[selected.operator.toLowerCase()]}
          onClose={() => setSelected(undefined)}
        />
      )}

      <NetworkOwners />

      <FleetNotes operators={allOperators} labels={allLabels} logsFailed={fleet.sections.some(s => s.logsFailed)} />
    </main>
  );
};

export const OperatorConsole = () => (
  <ConsoleProvider>
    <Inner />
  </ConsoleProvider>
);
