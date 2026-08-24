"use client";

import { useState } from "react";
import { AddressLink, Badge, Field, Note, Stat } from "./ui";
import { isAddress } from "viem";
import { useEnsAddress, useEnsName } from "wagmi";
import { useConsole } from "~~/hooks/interfold/ConsoleContext";
import { susdsToUsds } from "~~/hooks/interfold/useOwnerFunds";
import { DEFAULT_BOND_OWNER, LINKS, safeQueue } from "~~/utils/interfold/contracts";
import { fmtTokens, safeNormalize, sameAddr, toChecksum } from "~~/utils/interfold/format";

const SOURCE_LABEL = {
  connected: "Connected wallet",
  "operator-of-connected": "Bond owner of the connected hot wallet",
  default: "Default Safe",
  override: "Viewing as",
} as const;

/** View A: the bond owner (the Safe) — who it is, what it holds, what it can still fund. */
export const BondOwnerCard = () => {
  const {
    owner,
    ownerSource,
    setOwnerOverride,
    connected,
    connMode,
    isSafe,
    funds: f,
    params: p,
    fundsLoading,
  } = useConsole();
  const [input, setInput] = useState("");
  const ensName = input.trim().toLowerCase().endsWith(".eth") ? input.trim() : undefined;
  const { data: ensAddr, isLoading: ensLoading } = useEnsAddress({
    name: safeNormalize(ensName),
    chainId: 1,
    query: { enabled: !!ensName },
  });
  const { data: ownerEns } = useEnsName({ address: owner, chainId: 1 });

  const resolved = toChecksum(input.trim()) ?? (ensAddr ? toChecksum(ensAddr) : null);
  const invalid = input.trim() !== "" && !resolved && !ensLoading;

  const nodesCapacity = f && p && p.requiredCiphernodeBond > 0n ? f.foldBalance / p.requiredCiphernodeBond : undefined;
  const ticketsCapacity = f && p && p.ticketPrice > 0n ? f.susdsBalance / p.ticketPrice : undefined;
  const usds = f ? susdsToUsds(f.susdsBalance, f.susdsRate) : undefined;

  return (
    <section className="if-card">
      <header className="if-card__head">
        <div>
          <div className="if-eyebrow">Bond owner (the funding wallet)</div>
          <div className="if-actions" style={{ gap: 10 }}>
            <AddressLink address={owner} full />
            {ownerEns && (
              <span className="if-mono" style={{ fontSize: 13, color: "var(--if-ink-3)" }}>
                {ownerEns}
              </span>
            )}
            <Badge kind={ownerSource === "override" ? "muted" : ownerSource === "default" ? "muted" : "working"}>
              {SOURCE_LABEL[ownerSource]}
            </Badge>
            {connected && sameAddr(connected, owner) && (
              <Badge kind={isSafe ? "open" : "muted"}>
                {connMode === "safe-app" ? "Safe App" : connMode === "safe-wc" ? "Safe via WalletConnect" : "EOA"}
              </Badge>
            )}
          </div>
        </div>
        <div className="if-actions">
          <a className="if-btn if-btn--ghost if-btn--sm" href={safeQueue(owner)} target="_blank" rel="noreferrer">
            Safe queue <span className="if-btn__arrow">→</span>
          </a>
          <a className="if-btn if-btn--ghost if-btn--sm" href={LINKS.dashboard} target="_blank" rel="noreferrer">
            Official dashboard <span className="if-btn__arrow">→</span>
          </a>
        </div>
      </header>

      <div className="if-stats if-stats--6 if-stats--flat" style={{ marginBottom: 22 }}>
        <Stat
          label="FOLD balance"
          value={fmtTokens(f?.foldBalance)}
          sub={
            f
              ? `${fmtTokens(f.foldTransferable)} transferable · ${fmtTokens(f.foldLocked)} locked`
              : fundsLoading
                ? "loading…"
                : undefined
          }
          title={f ? `${f.foldBalance.toString()} wei` : undefined}
        />
        <Stat label="Bonded" value={fmtTokens(f?.totalBonded)} sub="FOLD across all operators" />
        <Stat
          label="Nodes you can bond"
          value={nodesCapacity === undefined ? "—" : nodesCapacity.toString()}
          sub="locked FOLD counts"
        />
        <Stat
          label="sUSDS balance"
          value={fmtTokens(f?.susdsBalance)}
          sub={usds !== undefined ? `≈ ${fmtTokens(usds, "USDS")}` : undefined}
          title={f ? `${f.susdsBalance.toString()} wei` : undefined}
        />
        <Stat
          label="Tickets you can buy"
          value={ticketsCapacity === undefined ? "—" : ticketsCapacity.toString()}
          sub={p ? `${fmtTokens(p.ticketPrice, "sUSDS")} each` : undefined}
        />
        <Stat
          label="Approvals"
          value={
            <span style={{ fontSize: 15 }}>
              {fmtTokens(f?.foldAllowance)} <span className="if-stat__of">FOLD → registry</span>
            </span>
          }
          sub={f ? `${fmtTokens(f.susdsAllowance)} sUSDS → ticket token` : undefined}
        />
      </div>

      <div className="if-fields">
        <Field
          label="View another bond owner (address or ENS)"
          value={input}
          onChange={setInput}
          placeholder="0x… or name.eth"
          invalid={invalid}
          hint={
            invalid
              ? "Not a valid address or ENS name."
              : "Reads and simulations work for any address; sending requires connecting as it."
          }
          suffix={
            <>
              <button
                type="button"
                className="if-btn if-btn--sm if-btn--ghost"
                disabled={!resolved}
                onClick={() => resolved && setOwnerOverride(resolved)}
              >
                View
              </button>
              {ownerSource === "override" && (
                <button
                  type="button"
                  className="if-btn if-btn--sm if-btn--ghost"
                  onClick={() => {
                    setOwnerOverride(undefined);
                    setInput("");
                  }}
                >
                  Reset
                </button>
              )}
            </>
          }
        />
        <div className="if-field">
          <span className="if-field__label">Shortcuts</span>
          <div className="if-actions">
            {connected && isAddress(connected) && !sameAddr(connected, owner) && (
              <button type="button" className="if-chip" onClick={() => setOwnerOverride(connected)}>
                Use connected {connected.slice(0, 6)}…
              </button>
            )}
            {!sameAddr(owner, DEFAULT_BOND_OWNER) && (
              <button type="button" className="if-chip" onClick={() => setOwnerOverride(DEFAULT_BOND_OWNER)}>
                Default Safe {DEFAULT_BOND_OWNER.slice(0, 6)}…
              </button>
            )}
          </div>
          <span className="if-field__hint">
            The console never puts the bond owner in a call parameter; it is always the caller.
          </span>
        </div>
      </div>

      {f && p && f.foldTransferable < p.requiredCiphernodeBond && f.foldBalance >= p.requiredCiphernodeBond && (
        <div style={{ marginTop: 16 }}>
          <Note>
            Most of this FOLD is under the airdrop lock, and that is fine: bonding credits the bond before pulling
            tokens, so locked FOLD is bondable. Capacity above is computed from the full balance on purpose.
          </Note>
        </div>
      )}
    </section>
  );
};
