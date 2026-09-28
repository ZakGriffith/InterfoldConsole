"use client";

import { UnlockStrip } from "./UnlockStrip";
import { AddressLink, Badge } from "./ui";
import { type Address } from "viem";
import { useBytecode, useEnsName } from "wagmi";
import { useConsole } from "~~/hooks/interfold/ConsoleContext";
import { type FleetSection } from "~~/hooks/interfold/useFleet";
import { useOwnerFunds } from "~~/hooks/interfold/useOwnerFunds";
import { CHAIN_ID, safeQueue } from "~~/utils/interfold/contracts";
import { fmtTokens, isContractCode, sameAddr } from "~~/utils/interfold/format";

type Props = {
  section: FleetSection;
  /** The owner the connection resolved to: its section can act, and it carries the FOLD unlock line. */
  primary: boolean;
  onRemove?: (a: Address) => void;
};

/** One line above each list: who the bond owner is, how it relates to the connected wallet, what it holds. */
export const BondOwnerCard = ({ section: s, primary, onRemove }: Props) => {
  const { connected, connMode, ownerSource, setOwnerOverride } = useConsole();
  const { data: ens } = useEnsName({ address: s.owner, chainId: 1 });
  const { data: code } = useBytecode({ address: s.owner, chainId: CHAIN_ID });
  const isContract = isContractCode(code);
  const { data: f } = useOwnerFunds(s.owner);

  const isConnectedOwner = sameAddr(connected, s.owner);
  const via = connMode === "safe-app" ? "Safe App" : connMode === "safe-wc" ? "WalletConnect" : undefined;

  return (
    <section className="if-owner">
      <div className="if-owner__who">
        <span className="if-eyebrow" style={{ marginBottom: 4 }}>
          Bond owner
        </span>
        <div className="if-actions" style={{ gap: 8 }}>
          {ens && <span className="if-owner__name">{ens}</span>}
          <AddressLink address={s.owner} />
          <Badge kind={isContract ? "open" : "muted"}>{code === undefined ? "…" : isContract ? "Safe" : "EOA"}</Badge>
          {isConnectedOwner && <Badge kind="published">connected{via ? ` · ${via}` : ""}</Badge>}
          {primary && ownerSource === "override" && (
            <button
              type="button"
              className="if-btn if-btn--ghost if-btn--xs"
              onClick={() => setOwnerOverride(undefined)}
            >
              Back to my wallet
            </button>
          )}
          {!primary && onRemove && (
            <button
              type="button"
              className="if-btn if-btn--ghost if-btn--xs"
              title="Remove this bond owner from the Fleet page"
              onClick={() => onRemove(s.owner)}
            >
              ×
            </button>
          )}
        </div>
      </div>
      <div className="if-owner__stats">
        <div className="if-owner__stat">
          <span className="if-owner__value if-mono">
            {s.nodeCount}
            {s.eligible !== s.nodeCount && <span className="if-stat__of"> · {s.eligible} eligible</span>}
          </span>
          <span className="if-owner__label">node{s.nodeCount === 1 ? "" : "s"}</span>
        </div>
        <div className="if-owner__stat">
          <span className="if-owner__value if-mono">{fmtTokens(s.totalBonded)}</span>
          <span className="if-owner__label">FOLD bonded</span>
        </div>
        <div
          className="if-owner__stat"
          title={f ? `${fmtTokens(f.foldTransferable)} transferable; locked FOLD still counts for bonding` : undefined}
        >
          <span className="if-owner__value if-mono">{fmtTokens(f?.foldBalance)}</span>
          <span className="if-owner__label">FOLD in wallet</span>
        </div>
        <div className="if-owner__stat">
          <span className="if-owner__value if-mono">{fmtTokens(f?.susdsBalance)}</span>
          <span className="if-owner__label">sUSDS</span>
        </div>
        {isContract && (
          <a className="if-btn if-btn--ghost if-btn--sm" href={safeQueue(s.owner)} target="_blank" rel="noreferrer">
            Safe queue <span className="if-btn__arrow">→</span>
          </a>
        )}
      </div>
      {primary && <UnlockStrip owner={s.owner} />}
    </section>
  );
};
