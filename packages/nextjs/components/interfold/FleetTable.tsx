"use client";

import { useState } from "react";
import { AddressLink, Badge, type BadgeKind, Empty, Field, Note } from "./ui";
import { type Address, parseEther } from "viem";
import { useEnsAddress } from "wagmi";
import { useConsole } from "~~/hooks/interfold/ConsoleContext";
import { type OperatorStatus } from "~~/hooks/interfold/useFleetStatus";
import { type OperatorSource } from "~~/hooks/interfold/useOperatorList";
import { fmtEth, fmtTokens, safeNormalize, sameAddr, toChecksum } from "~~/utils/interfold/format";

const LOW_ETH = parseEther("0.01");

export type StatusPill = { label: string; kind: BadgeKind };

/** Priority: Exit > not owned > needs bond > needs registration > needs tickets > active / registered-inactive. */
export const statusPill = (
  s: OperatorStatus | undefined,
  owner: Address,
  required: bigint | undefined,
  minTickets: bigint | undefined,
): StatusPill => {
  if (!s) return { label: "Loading…", kind: "muted" };
  if (s.exitInProgress) return { label: "Exit in progress", kind: "bad" };
  if (!sameAddr(s.bondOwner, owner))
    return s.bondOwner === "0x0000000000000000000000000000000000000000"
      ? { label: "Needs bond owner", kind: "warn" }
      : { label: "Not bond-owned by this wallet", kind: "warn" };
  if (required !== undefined && s.bond < required)
    return { label: s.bond > 0n ? "Needs full bond" : "Needs bond", kind: "working" };
  if (!s.isRegistered) return { label: "Needs registration", kind: "working" };
  if (minTickets !== undefined && (s.availableTickets < minTickets || s.availableTickets < 1n))
    return { label: "Needs tickets", kind: "working" };
  if (s.isActive) return { label: "Active", kind: "published" };
  return { label: "Registered · inactive", kind: "open" };
};

type Props = {
  operators: Address[];
  sources: Record<string, OperatorSource[]>;
  statuses: Record<string, OperatorStatus>;
  selected?: Address;
  onSelect: (a: Address) => void;
  addManual: (a: Address) => void;
  removeManual: (a: Address) => void;
  isDiscovering: boolean;
  logsFailed: boolean;
  refetch: () => void;
};

/** View B: one row per operator owned by the bond owner. Click a row to open its setup guide. */
export const FleetTable = ({
  operators,
  sources,
  statuses,
  selected,
  onSelect,
  addManual,
  removeManual,
  isDiscovering,
  logsFailed,
  refetch,
}: Props) => {
  const { owner, params: p } = useConsole();
  const [input, setInput] = useState("");
  const ensName = input.trim().toLowerCase().endsWith(".eth") ? input.trim() : undefined;
  const { data: ensAddr, isLoading: ensLoading } = useEnsAddress({
    name: safeNormalize(ensName),
    chainId: 1,
    query: { enabled: !!ensName },
  });
  const resolved = toChecksum(input.trim()) ?? (ensAddr ? toChecksum(ensAddr) : null);
  const invalid = input.trim() !== "" && !resolved && !ensLoading;

  const add = () => {
    if (!resolved) return;
    addManual(resolved);
    onSelect(resolved);
    setInput("");
  };

  return (
    <section className="if-guide" style={{ gap: 16 }}>
      <header className="if-card__head" style={{ marginBottom: 0 }}>
        <div>
          <div className="if-eyebrow">Operator positions</div>
          <h2 className="if-section-title">Ciphernodes owned by this wallet</h2>
        </div>
        <div className="if-actions">
          <button
            type="button"
            className="if-btn if-btn--ghost if-btn--sm"
            onClick={() => refetch()}
            disabled={isDiscovering}
          >
            {isDiscovering ? <span className="if-spinner" /> : null} Rescan
          </button>
        </div>
      </header>

      {operators.length === 0 ? (
        <Empty>
          {isDiscovering
            ? "Scanning BondOwnerSet events and Safe history for operators…"
            : "No operators found for this bond owner yet. Add the node's operator key below to start the guide."}
        </Empty>
      ) : (
        <div className="if-table-wrap">
          <table className="if-table">
            <thead>
              <tr>
                <th>Operator key</th>
                <th>Status</th>
                <th className="if-num">Bond (FOLD)</th>
                <th>Registered</th>
                <th className="if-num">Tickets</th>
                <th className="if-num">Hot wallet ETH</th>
                <th className="if-num">Pending exit</th>
                <th className="if-num">Claimable</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {operators.map(op => {
                const s = statuses[op.toLowerCase()];
                const pill = statusPill(s, owner, p?.requiredCiphernodeBond, p?.minTicketBalance);
                const src = sources[op.toLowerCase()] ?? [];
                const lowEth = s ? s.ethBalance < LOW_ETH : false;
                return (
                  <tr key={op} className={sameAddr(op, selected) ? "if-row--on" : ""} onClick={() => onSelect(op)}>
                    <td>
                      <AddressLink address={op} />
                    </td>
                    <td>
                      <Badge kind={pill.kind}>{pill.label}</Badge>
                    </td>
                    <td className="if-num" title={s ? `${s.bond.toString()} wei` : undefined}>
                      {s ? fmtTokens(s.bond) : "—"}
                      {p && <span className="if-stat__of"> / {fmtTokens(p.requiredCiphernodeBond)}</span>}
                    </td>
                    <td>{s ? (s.isRegistered ? "Yes" : "No") : "—"}</td>
                    <td className="if-num" title={s ? `${s.ticketBalance.toString()} wei balance` : undefined}>
                      {s ? s.availableTickets.toString() : "—"}
                    </td>
                    <td
                      className="if-num"
                      style={lowEth ? { color: "var(--if-bad-ink)" } : undefined}
                      title={
                        lowEth
                          ? "Below 0.01 ETH: the node pays gas for duties; an empty wallet silently misses them."
                          : undefined
                      }
                    >
                      {s ? fmtEth(s.ethBalance) : "—"}
                      {lowEth && " ⚠"}
                    </td>
                    <td className="if-num">
                      {s ? `${fmtTokens(s.pendingBondExit)} FOLD · ${fmtTokens(s.pendingTicketExit)} sUSDS` : "—"}
                    </td>
                    <td className="if-num">
                      {s ? `${fmtTokens(s.claimableBond)} FOLD · ${fmtTokens(s.claimableTicket)} sUSDS` : "—"}
                    </td>
                    <td>
                      <span style={{ color: "var(--if-ink-4)", fontSize: 11.5 }}>{src.join(" · ")}</span>
                      {src.includes("manual") && src.length === 1 && (
                        <button
                          type="button"
                          className="if-btn if-btn--ghost if-btn--xs"
                          style={{ marginLeft: 8 }}
                          onClick={e => {
                            e.stopPropagation();
                            removeManual(op);
                          }}
                        >
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="if-table__foot">
            <span>
              {operators.length} operator{operators.length === 1 ? "" : "s"} · discovered from BondOwnerSet events,
              executed Safe transactions, and manual entries (stored in this browser).
            </span>
          </div>
        </div>
      )}

      {logsFailed && (
        <Note kind="warn">
          The RPC refused the event scan, so only Safe history and manual entries are listed. Set{" "}
          <code>NEXT_PUBLIC_ALCHEMY_API_KEY</code> in <code>.env.local</code> for full discovery.
        </Note>
      )}

      <div className="if-fields">
        <Field
          label="Add an operator key (the ciphernode address, or ENS)"
          value={input}
          onChange={setInput}
          placeholder="0x…"
          invalid={invalid}
          hint={
            invalid ? "Not a valid address or ENS name." : "The address your ciphernode signs with. Never the Safe."
          }
          suffix={
            <button type="button" className="if-btn if-btn--sm if-btn--primary" disabled={!resolved} onClick={add}>
              Add operator
            </button>
          }
        />
      </div>
    </section>
  );
};
