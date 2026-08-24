"use client";

import { useEffect, useState } from "react";
import { BondOwnerCard } from "./BondOwnerCard";
import { FleetTable } from "./FleetTable";
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

  // Default to the first known operator; drop the selection when the owner changes.
  useEffect(() => {
    if (selected && !list.operators.some(o => sameAddr(o, selected))) setSelected(undefined);
    if (!selected && list.operators.length > 0) setSelected(list.operators[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.operators, owner]);

  return (
    <main className="if-main">
      <div className="if-guide">
        <header className="if-guide__head">
          <div className="if-eyebrow">Ciphernode operators</div>
          <h1 className="if-guide__title">Run a ciphernode on Interfold.</h1>
          <p className="if-guide__lede">
            Ciphernodes hold key shares for encrypted computations and are selected into committees by sortition. To
            take part, a node needs a bonded ciphernode bond and a ticket balance. This console walks the on-chain setup
            step by step for a bond owner that is a Gnosis Safe, against the live{" "}
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
          </>
        )}
      </div>

      <FleetTable
        operators={list.operators}
        sources={list.sources}
        statuses={fleet.statuses}
        selected={selected}
        onSelect={setSelected}
        addManual={list.addManual}
        removeManual={list.removeManual}
        isDiscovering={list.isDiscovering}
        logsFailed={list.logsFailed}
        refetch={() => list.refetch()}
      />

      {selected ? (
        <OperatorWizard
          operator={selected}
          status={fleet.statuses[selected.toLowerCase()]}
          statusLoading={fleet.isLoading}
        />
      ) : (
        <Empty>Select an operator above, or add the node&apos;s operator key, to open its setup guide.</Empty>
      )}
    </main>
  );
};

export const OperatorConsole = () => (
  <ConsoleProvider>
    <Inner />
  </ConsoleProvider>
);
