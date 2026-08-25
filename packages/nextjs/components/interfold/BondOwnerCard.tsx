"use client";

import { useState } from "react";
import { AddressLink, Badge, Field } from "./ui";
import { useEnsAddress } from "wagmi";
import { useConsole } from "~~/hooks/interfold/ConsoleContext";
import { susdsToUsds } from "~~/hooks/interfold/useOwnerFunds";
import { safeQueue } from "~~/utils/interfold/contracts";
import { fmtTokens, safeNormalize, sameAddr, toChecksum } from "~~/utils/interfold/format";

/** One strip: who the bond owner is, what it holds, how many more nodes it can fund. */
export const BondOwnerCard = () => {
  const {
    owner,
    ownerSource,
    ownerIsContract,
    setOwnerOverride,
    connected,
    connMode,
    funds: f,
    params: p,
  } = useConsole();
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState("");
  const ens = input.trim().toLowerCase().endsWith(".eth") ? input.trim() : undefined;
  const { data: ensAddr, isLoading } = useEnsAddress({
    name: safeNormalize(ens),
    chainId: 1,
    query: { enabled: !!ens },
  });
  const resolved = toChecksum(input.trim()) ?? (ensAddr ? toChecksum(ensAddr) : null);
  const invalid = input.trim() !== "" && !resolved && !isLoading;

  const nodes = f && p && p.requiredCiphernodeBond > 0n ? f.foldBalance / p.requiredCiphernodeBond : undefined;
  const usds = f ? susdsToUsds(f.susdsBalance, f.susdsRate) : undefined;
  const isConnectedOwner = sameAddr(connected, owner);
  const conn =
    connMode === "safe-app" ? "Safe App" : connMode === "safe-wc" ? "Safe via WalletConnect" : "plain wallet";

  return (
    <section className="if-owner">
      <div className="if-owner__who">
        <span className="if-eyebrow" style={{ marginBottom: 4 }}>
          Bond owner
        </span>
        <div className="if-actions" style={{ gap: 8 }}>
          <AddressLink address={owner} />
          {isConnectedOwner ? (
            <Badge kind={ownerIsContract ? "open" : "muted"}>connected · {conn}</Badge>
          ) : (
            <Badge kind="muted">{ownerSource === "override" ? "viewing" : "owner of the connected node"}</Badge>
          )}
          <button type="button" className="if-btn if-btn--ghost if-btn--xs" onClick={() => setEditing(v => !v)}>
            {editing ? "Cancel" : "View another"}
          </button>
          {ownerSource === "override" && (
            <button
              type="button"
              className="if-btn if-btn--ghost if-btn--xs"
              onClick={() => setOwnerOverride(undefined)}
            >
              Back to my wallet
            </button>
          )}
        </div>
        {editing && (
          <div style={{ marginTop: 10, maxWidth: 520 }}>
            <Field
              label="Bond owner to view (address or ENS)"
              value={input}
              onChange={setInput}
              placeholder="0x… or name.eth"
              invalid={invalid}
              suffix={
                <button
                  type="button"
                  className="if-btn if-btn--sm if-btn--primary"
                  disabled={!resolved}
                  onClick={() => {
                    if (!resolved) return;
                    setOwnerOverride(resolved);
                    setEditing(false);
                    setInput("");
                  }}
                >
                  View
                </button>
              }
            />
          </div>
        )}
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
    </section>
  );
};
