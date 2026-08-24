"use client";

import { useEffect, useRef, useState } from "react";
import { BondOwnerCard } from "./BondOwnerCard";
import { FleetTable, needsAttention, statusPill } from "./FleetTable";
import { OnboardCard } from "./OnboardCard";
import { OperatorWizard } from "./OperatorWizard";
import { ParamsStrip } from "./ParamsStrip";
import { Empty, Loader, Note } from "./ui";
import { type Address } from "viem";
import { ConsoleProvider, useConsole } from "~~/hooks/interfold/ConsoleContext";
import { useFleetStatus } from "~~/hooks/interfold/useFleetStatus";
import { useOperatorList } from "~~/hooks/interfold/useOperatorList";
import { REGISTRY, explorerAddress } from "~~/utils/interfold/contracts";
import { sameAddr } from "~~/utils/interfold/format";

const Inner = () => {
  const { owner, params, paramsLoading, paramsError, connected, onMainnet } = useConsole();
  const list = useOperatorList(owner);
  const fleet = useFleetStatus(list.operators);
  const [selected, setSelected] = useState<Address>();
  const wizardRef = useRef<HTMLDivElement>(null);

  // Drop the selection when the owner changes or the operator disappears.
  useEffect(() => {
    if (selected && !list.operators.some(o => sameAddr(o, selected))) setSelected(undefined);
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
          <div className="if-eyebrow">Ciphernode operators</div>
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
        removeManual={list.removeManual}
        isDiscovering={list.isDiscovering}
        logsFailed={list.logsFailed}
        lastScan={list.lastScan}
        refetch={() => list.refetch()}
      />

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
