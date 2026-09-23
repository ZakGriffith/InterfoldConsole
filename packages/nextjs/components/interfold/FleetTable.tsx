"use client";

import { useState } from "react";
import { AddressLink, Badge, type BadgeKind, CopyButton, Empty, Field, Note } from "./ui";
import { type Address, parseEther } from "viem";
import { useEnsAddress, useEnsName } from "wagmi";
import { useConsole } from "~~/hooks/interfold/ConsoleContext";
import { type OperatorStatus } from "~~/hooks/interfold/useFleetStatus";
import { type ProbeNode, type ProbeReport, ago, useNodeProbe } from "~~/hooks/interfold/useNodeProbe";
import { type OperatorSource } from "~~/hooks/interfold/useOperatorList";
import { fmtEth, fmtTokens, safeNormalize, sameAddr, toChecksum } from "~~/utils/interfold/format";
import { operatorInstructions } from "~~/utils/interfold/instructions";

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
  if (s.isActive) return { label: "Eligible", kind: "published" };
  return { label: "Registered · inactive", kind: "open" };
};

/**
 * What the probe saw when it last dialed this node's libp2p port. "Eligible" above is on-chain
 * collateral only; this is the closest thing to "is the process up and on the right build".
 */
export const softwarePill = (
  n: ProbeNode | undefined,
  report: ProbeReport | undefined,
  stale: boolean,
): StatusPill & { sub?: string; title?: string } => {
  if (!report) return { label: "no probe data", kind: "muted", title: "probe.json has not been published yet" };
  if (!n || n.ok === null)
    return {
      label: "no peer ID",
      kind: "muted",
      title:
        "Not monitored yet. The operator registers the node's peer ID on the Your node page (interfold net get-peer-id).",
    };
  if (stale)
    return { label: "probe stale", kind: "warn", sub: ago(n.checkedAt), title: "The GitHub probe has stopped running" };
  if (!n.ok && n.stage === "lookup")
    return {
      label: "not on network",
      kind: "bad",
      sub: ago(n.checkedAt),
      title:
        "No peer on the network has seen this peer ID. The node is not running, or the registered peer ID is wrong.",
    };
  if (!n.ok && n.stage === "dial")
    return {
      label: "unreachable",
      kind: "bad",
      sub: ago(n.checkedAt),
      title: `The network knows this node, so it is running, but UDP 9091 cannot be reached from outside: forward the port on the router and allow it in the host firewall. Addresses on record: ${(n.addrs ?? []).join(", ") || "none"}`,
    };
  if (!n.ok) return { label: "no answer", kind: "bad", sub: ago(n.checkedAt), title: n.error };
  const v = n.version ?? n.agentVersion ?? "unknown";
  const behind = !!report.latestRelease && !!n.version && n.version !== report.latestRelease;
  if (n.sameNetwork === false)
    return { label: `${v} · wrong network`, kind: "bad", sub: ago(n.checkedAt), title: n.agentVersion ?? undefined };
  if (behind)
    return {
      label: `${v} · upgrade to ${report.latestRelease}`,
      kind: "warn",
      sub: ago(n.checkedAt),
      title: n.agentVersion ?? undefined,
    };
  return { label: v, kind: "published", sub: ago(n.checkedAt), title: n.agentVersion ?? undefined };
};

export const needsAttention = (pill: StatusPill) => pill.kind !== "published";
/** The bond owner can act on this node right now (authorized, no exit, something left to do). */
export const batchable = (pill: StatusPill) => pill.kind === "working";

type Props = {
  operators: Address[];
  sources: Record<string, OperatorSource[]>;
  labels: Record<string, string>;
  statuses: Record<string, OperatorStatus>;
  selected?: Address;
  onSelect: (a: Address) => void;
  batchEnabled: boolean;
  batchSelection: ReadonlySet<string>;
  onToggleBatch: (a: Address) => void;
  onSelectAllBatchable: () => void;
  onAdd: (a: Address, label: string) => void;
  removeManual: (a: Address) => void;
  isDiscovering: boolean;
  logsFailed: boolean;
  lastScan: number;
  refetch: () => void;
};

/** The nodes this bond owner funds, plus the row to add a new one. Click a row to open its guide. */
export const FleetTable = ({
  operators,
  sources,
  labels,
  statuses,
  selected,
  onSelect,
  batchEnabled,
  batchSelection,
  onToggleBatch,
  onSelectAllBatchable,
  onAdd,
  removeManual,
  isDiscovering,
  logsFailed,
  lastScan,
  refetch,
}: Props) => {
  const { owner, params: p } = useConsole();
  const probe = useNodeProbe();
  const { data: ownerEns } = useEnsName({ address: owner, chainId: 1 });
  const [input, setInput] = useState("");
  const [label, setLabel] = useState("");
  const ens = input.trim().toLowerCase().endsWith(".eth") ? input.trim() : undefined;
  const { data: ensAddr, isLoading } = useEnsAddress({
    name: safeNormalize(ens),
    chainId: 1,
    query: { enabled: !!ens },
  });
  const resolved = toChecksum(input.trim()) ?? (ensAddr ? toChecksum(ensAddr) : null);
  const isOwner = !!resolved && sameAddr(resolved, owner);
  const invalid = (input.trim() !== "" && !resolved && !isLoading) || isOwner;

  const pills = Object.fromEntries(
    operators.map(op => [
      op.toLowerCase(),
      statusPill(statuses[op.toLowerCase()], owner, p?.requiredCiphernodeBond, p?.minTicketBalance),
    ]),
  );
  const batchableCount = operators.filter(op => batchable(pills[op.toLowerCase()])).length;

  const add = () => {
    if (!resolved || isOwner) return;
    onAdd(resolved, label.trim());
    setInput("");
    setLabel("");
  };

  return (
    <section className="if-guide" style={{ gap: 12 }}>
      <header className="if-card__head" style={{ marginBottom: 0 }}>
        <div>
          <div className="if-eyebrow">Nodes</div>
          <h2 className="if-section-title">Ciphernodes this bond owner funds</h2>
        </div>
        <div className="if-actions">
          <span className="if-stat__sub">{lastScan ? `scanned ${new Date(lastScan).toLocaleTimeString()}` : ""}</span>
          {batchEnabled && batchableCount > 1 && (
            <button type="button" className="if-btn if-btn--ghost if-btn--sm" onClick={onSelectAllBatchable}>
              Select all ready ({batchableCount})
            </button>
          )}
          <button
            type="button"
            className="if-btn if-btn--ghost if-btn--sm"
            onClick={() => refetch()}
            disabled={isDiscovering}
            title="Re-reads the chain for nodes that named this wallet as bond owner (also runs every 2 minutes)"
          >
            {isDiscovering ? <span className="if-spinner" /> : null}
            {isDiscovering ? "Scanning…" : "Scan for new nodes"}
          </button>
        </div>
      </header>

      {operators.length === 0 ? (
        <Empty>
          {isDiscovering ? "Scanning the chain for nodes…" : "No nodes yet. Add a node's operator key below."}
        </Empty>
      ) : (
        <div className="if-table-wrap">
          <table className="if-table">
            <thead>
              <tr>
                {batchEnabled && (
                  <th title="Tick nodes to batch their remaining steps into one Safe transaction">Batch</th>
                )}
                <th>Node</th>
                <th title="On-chain state from the bonding registry: bond, registration, tickets. Not liveness.">
                  Status
                </th>
                {probe.report && (
                  <th title="What the node answered on the peer network when the probe last found it (every 10 min)">
                    Software
                  </th>
                )}
                <th className="if-num">Bond</th>
                <th className="if-num">Tickets</th>
                <th className="if-num">Hot wallet ETH</th>
              </tr>
            </thead>
            <tbody>
              {operators.map(op => {
                const k = op.toLowerCase();
                const s = statuses[k];
                const pill = pills[k];
                const manualOnly = (sources[k] ?? []).length === 1 && sources[k][0] === "manual";
                const lowEth = s ? s.ethBalance < LOW_ETH : false;
                const sw = softwarePill(probe.byOperator[k], probe.report, probe.stale);
                return (
                  <tr key={op} className={sameAddr(op, selected) ? "if-row--on" : ""} onClick={() => onSelect(op)}>
                    {batchEnabled && (
                      <td onClick={e => e.stopPropagation()} style={{ cursor: "default" }}>
                        <input
                          type="checkbox"
                          aria-label={`Include ${op} in batch`}
                          checked={batchSelection.has(k)}
                          disabled={!batchable(pill)}
                          onChange={() => onToggleBatch(op)}
                        />
                      </td>
                    )}
                    <td>
                      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                        {labels[k] && <span style={{ fontWeight: 600 }}>{labels[k]}</span>}
                        <span className="if-actions" style={{ gap: 6 }}>
                          <AddressLink address={op} />
                          {manualOnly && (
                            <button
                              type="button"
                              className="if-btn if-btn--ghost if-btn--xs"
                              title="Remove this manually added node from the list"
                              onClick={e => {
                                e.stopPropagation();
                                removeManual(op);
                              }}
                            >
                              ×
                            </button>
                          )}
                        </span>
                      </div>
                    </td>
                    <td>
                      <Badge kind={pill.kind}>{pill.label}</Badge>
                    </td>
                    {probe.report && (
                      <td title={sw.title}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                          <Badge kind={sw.kind}>{sw.label}</Badge>
                          {sw.sub && <span className="if-stat__sub">{sw.sub}</span>}
                        </div>
                      </td>
                    )}
                    <td className="if-num" title={s ? `${s.bond.toString()} wei` : undefined}>
                      {s ? fmtTokens(s.bond) : "-"}
                      {p && <span className="if-stat__of"> / {fmtTokens(p.requiredCiphernodeBond)}</span>}
                    </td>
                    <td className="if-num">{s ? s.availableTickets.toString() : "-"}</td>
                    <td
                      className="if-num"
                      style={lowEth ? { color: "var(--if-bad-ink)" } : undefined}
                      title={lowEth ? "Below 0.01 ETH: the node cannot pay for its duties" : undefined}
                    >
                      {s ? fmtEth(s.ethBalance) : "-"}
                      {lowEth && " ⚠"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {operators.length > 0 && (
        <p className="if-stat__sub" style={{ margin: 0 }}>
          {probe.report ? (
            <>
              Software column: every 10 minutes a probe looks each registered node up on the peer network and reads the
              version it announces. &quot;No peer ID&quot; means the node is not registered yet; click the row for how.
              Last probe {ago(probe.report.generatedAt)}
              {probe.report.latestRelease ? `, latest release ${probe.report.latestRelease}` : ""}
              {probe.report.bootstrap.ok === false
                ? ". The probe could not reach the Interfold bootstrap peer, so treat results as unreliable."
                : "."}
              {probe.stale && " The probe has not run for a while; check the workflow on GitHub."}
            </>
          ) : null}
        </p>
      )}

      {logsFailed && (
        <Note kind="warn">
          The RPC refused the event scan, so only Safe history and manually added nodes are listed. Set{" "}
          <code>NEXT_PUBLIC_ALCHEMY_API_KEY</code> for full discovery.
        </Note>
      )}

      <div className="if-addrow">
        <Field
          label="Add a node (operator key or ENS)"
          value={input}
          onChange={setInput}
          placeholder="0x…"
          invalid={invalid}
          hint={
            isOwner
              ? "That is the bond owner itself; the operator key is the node hot wallet."
              : invalid
                ? "Not a valid address."
                : undefined
          }
        />
        <Field
          label="Label (optional)"
          value={label}
          onChange={setLabel}
          placeholder="e.g. Alice / hetzner-1"
          mono={false}
        />
        <div className="if-addrow__actions">
          <button type="button" className="if-btn if-btn--primary" disabled={!resolved || isOwner} onClick={add}>
            Add node
          </button>
          <CopyButton
            text={operatorInstructions(owner, p, ownerEns ?? undefined)}
            label="Copy instructions for a node operator"
            className="if-btn--sm"
          />
        </div>
      </div>
    </section>
  );
};
