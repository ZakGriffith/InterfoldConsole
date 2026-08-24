"use client";

import { AddressLink, Badge, type BadgeKind, Empty, Note } from "./ui";
import { type Address, parseEther } from "viem";
import { useConsole } from "~~/hooks/interfold/ConsoleContext";
import { type OperatorStatus } from "~~/hooks/interfold/useFleetStatus";
import { type OperatorSource } from "~~/hooks/interfold/useOperatorList";
import { fmtEth, fmtTokens, sameAddr } from "~~/utils/interfold/format";

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
      ? { label: "Waiting for node: set-bond-owner", kind: "warn" }
      : { label: "Not bond-owned by this wallet", kind: "warn" };
  if (required !== undefined && s.bond < required)
    return { label: s.bond > 0n ? "Needs full bond" : "Needs bond", kind: "working" };
  if (!s.isRegistered) return { label: "Needs registration", kind: "working" };
  if (minTickets !== undefined && (s.availableTickets < minTickets || s.availableTickets < 1n))
    return { label: "Needs tickets", kind: "working" };
  if (s.isActive) return { label: "Active", kind: "published" };
  return { label: "Registered · inactive", kind: "open" };
};

/** True when the row still needs something from the bond owner or the node operator. */
export const needsAttention = (pill: StatusPill) => pill.kind !== "published";

type Props = {
  operators: Address[];
  sources: Record<string, OperatorSource[]>;
  labels: Record<string, string>;
  statuses: Record<string, OperatorStatus>;
  selected?: Address;
  onSelect: (a: Address) => void;
  removeManual: (a: Address) => void;
  isDiscovering: boolean;
  logsFailed: boolean;
  lastScan: number;
  refetch: () => void;
};

/** View B: one row per operator owned by the bond owner. Click a row to open its setup guide. */
export const FleetTable = ({
  operators,
  sources,
  labels,
  statuses,
  selected,
  onSelect,
  removeManual,
  isDiscovering,
  logsFailed,
  lastScan,
  refetch,
}: Props) => {
  const { owner, params: p } = useConsole();
  const attention = operators.filter(op =>
    needsAttention(statusPill(statuses[op.toLowerCase()], owner, p?.requiredCiphernodeBond, p?.minTicketBalance)),
  ).length;

  return (
    <section className="if-guide" style={{ gap: 16 }}>
      <header className="if-card__head" style={{ marginBottom: 0 }}>
        <div>
          <div className="if-eyebrow">Operator positions</div>
          <h2 className="if-section-title">Ciphernodes bonded by this wallet</h2>
        </div>
        <div className="if-actions">
          <span className="if-stat__sub">
            {operators.length > 0 && (
              <>
                {operators.length} node{operators.length === 1 ? "" : "s"} · {attention} need
                {attention === 1 ? "s" : ""} attention ·{" "}
              </>
            )}
            {lastScan ? `last scan ${new Date(lastScan).toLocaleTimeString()}` : "not scanned yet"}
          </span>
          <button
            type="button"
            className="if-btn if-btn--primary if-btn--sm"
            onClick={() => refetch()}
            disabled={isDiscovering}
            title="Re-reads BondOwnerSet events and the Safe transaction history for nodes that named this wallet as bond owner. Also runs automatically every 2 minutes."
          >
            {isDiscovering ? <span className="if-spinner" /> : null}
            {isDiscovering ? "Scanning…" : "Scan for new nodes"}
          </button>
        </div>
      </header>

      {operators.length === 0 ? (
        <Empty>
          {isDiscovering
            ? "Scanning BondOwnerSet events and Safe history for operators…"
            : "No operators found for this bond owner yet. Use “Onboard a new ciphernode” above to add one."}
        </Empty>
      ) : (
        <div className="if-table-wrap">
          <table className="if-table">
            <thead>
              <tr>
                <th>Node</th>
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
                const k = op.toLowerCase();
                const s = statuses[k];
                const pill = statusPill(s, owner, p?.requiredCiphernodeBond, p?.minTicketBalance);
                const src = sources[k] ?? [];
                const lowEth = s ? s.ethBalance < LOW_ETH : false;
                return (
                  <tr key={op} className={sameAddr(op, selected) ? "if-row--on" : ""} onClick={() => onSelect(op)}>
                    <td>
                      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                        {labels[k] && <span style={{ fontWeight: 540 }}>{labels[k]}</span>}
                        <AddressLink address={op} />
                      </div>
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
              Discovered from BondOwnerSet events and executed Safe transactions; manual entries and labels are stored
              in this browser. A node you added by hand shows “Waiting for node” until its operator runs set-bond-owner.
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
    </section>
  );
};
