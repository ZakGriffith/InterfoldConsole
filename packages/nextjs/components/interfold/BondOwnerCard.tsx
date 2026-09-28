"use client";

import { UnlockStrip } from "./UnlockStrip";
import { AddressLink, Badge } from "./ui";
import { useEnsName } from "wagmi";
import { useConsole } from "~~/hooks/interfold/ConsoleContext";
import { susdsToUsds } from "~~/hooks/interfold/useOwnerFunds";
import { safeQueue } from "~~/utils/interfold/contracts";
import { fmtTokens, sameAddr } from "~~/utils/interfold/format";

/** Section header: who the bond owner is, how it relates to the connected wallet, what it holds. */
export const BondOwnerCard = () => {
  const {
    owner,
    ownerSource,
    ownerIsContract,
    setOwnerOverride,
    removeOwner,
    connected,
    connMode,
    funds: f,
    params: p,
  } = useConsole();
  const { data: ens } = useEnsName({ address: owner, chainId: 1 });

  const nodes = f && p && p.requiredCiphernodeBond > 0n ? f.foldBalance / p.requiredCiphernodeBond : undefined;
  const usds = f ? susdsToUsds(f.susdsBalance, f.susdsRate) : undefined;
  const isConnectedOwner = sameAddr(connected, owner);
  const conn =
    connMode === "safe-app" ? "Safe App" : connMode === "safe-wc" ? "Safe via WalletConnect" : "plain wallet";
  const relation =
    ownerSource === "override"
      ? "viewing"
      : ownerSource === "extra"
        ? ownerIsContract
          ? "Safe · read-only from this wallet"
          : "read-only from this wallet"
        : "owner of the connected node";

  return (
    <section className="if-owner">
      <div className="if-owner__who">
        <span className="if-eyebrow" style={{ marginBottom: 4 }}>
          Bond owner
        </span>
        <div className="if-actions" style={{ gap: 8 }}>
          {ens && <span className="if-owner__name">{ens}</span>}
          <AddressLink address={owner} />
          {isConnectedOwner ? (
            <Badge kind={ownerIsContract ? "open" : "muted"}>connected · {conn}</Badge>
          ) : (
            <Badge kind="muted">{relation}</Badge>
          )}
          {ownerSource === "override" && (
            <button
              type="button"
              className="if-btn if-btn--ghost if-btn--xs"
              onClick={() => setOwnerOverride(undefined)}
            >
              Back to my wallet
            </button>
          )}
          {ownerSource === "extra" && (
            <button
              type="button"
              className="if-btn if-btn--ghost if-btn--xs"
              title="Remove this section from the Fleet page"
              onClick={() => removeOwner(owner)}
            >
              ×
            </button>
          )}
        </div>
      </div>
      <div className="if-owner__stats">
        <div
          className="if-owner__stat"
          title={f ? `${fmtTokens(f.foldTransferable)} transferable; locked FOLD still counts for bonding` : undefined}
        >
          <span className="if-owner__value if-mono">{fmtTokens(f?.foldBalance)}</span>
          <span className="if-owner__label">FOLD</span>
        </div>
        <div className="if-owner__stat" title={usds !== undefined ? `about ${fmtTokens(usds, "USDS")}` : undefined}>
          <span className="if-owner__value if-mono">{fmtTokens(f?.susdsBalance)}</span>
          <span className="if-owner__label">sUSDS</span>
        </div>
        <div className="if-owner__stat">
          <span className="if-owner__value if-mono">{fmtTokens(f?.totalBonded)}</span>
          <span className="if-owner__label">FOLD bonded</span>
        </div>
        <div className="if-owner__stat">
          <span className="if-owner__value if-mono">{nodes === undefined ? "-" : nodes.toString()}</span>
          <span className="if-owner__label">more nodes fundable</span>
        </div>
        {ownerIsContract && (
          <a className="if-btn if-btn--ghost if-btn--sm" href={safeQueue(owner)} target="_blank" rel="noreferrer">
            Safe queue <span className="if-btn__arrow">→</span>
          </a>
        )}
      </div>
      <UnlockStrip owner={owner} />
    </section>
  );
};
