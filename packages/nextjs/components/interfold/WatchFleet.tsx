"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LOW_ETH, softwarePill, statusPill } from "./FleetTable";
import { AddressLink, Badge, Empty, Field, Note } from "./ui";
import { type Address } from "viem";
import { useEnsAddress, useEnsName } from "wagmi";
import { useNodeProbe } from "~~/hooks/interfold/useNodeProbe";
import { useRegistryParams } from "~~/hooks/interfold/useRegistryParams";
import { type WatchGroup, parseAddressList, useWatchFleet, useWatchList } from "~~/hooks/interfold/useWatchFleet";
import { fmtEth, fmtTokens, safeNormalize, toChecksum } from "~~/utils/interfold/format";

/**
 * Watch: paste bond owner wallets, see every node each one funds. Read-only, no wallet, shareable
 * through the URL. One table grouped by owner; a node row opens the Set up a node page for it.
 */
export const WatchFleet = () => {
  const list = useWatchList();
  const { groups, statuses, isDiscovering, refetch } = useWatchFleet(list.owners);
  const { data: params } = useRegistryParams();
  const probe = useNodeProbe();

  const [input, setInput] = useState("");
  const trimmed = input.trim();
  const ens = trimmed.toLowerCase().endsWith(".eth") ? trimmed : undefined;
  const { data: ensAddr, isLoading: ensLoading } = useEnsAddress({
    name: safeNormalize(ens),
    chainId: 1,
    query: { enabled: !!ens },
  });
  const pasted = parseAddressList(trimmed);
  const fromEns = ensAddr ? toChecksum(ensAddr) : null;
  const resolved: Address[] = pasted.length ? pasted : fromEns ? [fromEns] : [];
  const invalid = trimmed !== "" && resolved.length === 0 && !ensLoading;

  const add = () => {
    if (resolved.length === 0) return;
    list.add(resolved);
    setInput("");
  };

  const nodeCount = groups.reduce((n, g) => n + g.operators.length + g.pending.length, 0);

  return (
    <main className="if-main" style={{ gap: 28 }}>
      <header className="if-guide__head">
        <div className="if-eyebrow">Watch</div>
        <h1 className="if-guide__title">Every node these wallets fund, on one screen.</h1>
        <p className="if-guide__lede">
          No wallet needed. Paste bond owner addresses (plain wallets or Safes) and the console lists the ciphernodes
          each one is bonding, with their on-chain state and what the probe last saw. The list stays in this browser and
          in the page URL, so the link can be shared.
        </p>
      </header>

      <form
        className="if-addrow if-addrow--two"
        onSubmit={e => {
          e.preventDefault();
          add();
        }}
      >
        <Field
          label="Bond owner wallets (addresses, or one ENS name; paste several at once)"
          value={input}
          onChange={setInput}
          placeholder="0x…, 0x…"
          invalid={invalid}
          hint={
            invalid
              ? "No valid address or ENS name in there."
              : pasted.length > 1
                ? `${pasted.length} addresses`
                : undefined
          }
        />
        <div className="if-addrow__actions">
          <button type="submit" className="if-btn if-btn--primary" disabled={resolved.length === 0}>
            {resolved.length > 1 ? `Watch ${resolved.length} wallets` : "Watch"}
          </button>
          {list.owners.length > 0 && (
            <button
              type="button"
              className="if-btn if-btn--ghost if-btn--sm"
              onClick={refetch}
              disabled={isDiscovering}
              title="Re-reads the chain for nodes that named these wallets as bond owner (also runs every 2 minutes)"
            >
              {isDiscovering ? <span className="if-spinner" /> : null}
              {isDiscovering ? "Scanning…" : "Rescan"}
            </button>
          )}
        </div>
      </form>

      {!list.ready ? null : list.owners.length === 0 ? (
        <Empty>Nothing watched yet. Paste one or more bond owner addresses above.</Empty>
      ) : (
        <div className="if-table-wrap">
          <table className="if-table">
            <thead>
              <tr>
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
              {groups.map(g => (
                <OwnerGroup
                  key={g.owner}
                  group={g}
                  statuses={statuses}
                  params={params}
                  probe={probe}
                  onRemove={() => list.remove(g.owner)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {groups.some(g => g.logsFailed) && (
        <Note kind="warn">
          The RPC refused the event scan, so only nodes found through Safe history are listed. Set{" "}
          <code>NEXT_PUBLIC_ALCHEMY_API_KEY</code> for full discovery.
        </Note>
      )}

      {nodeCount > 0 && (
        <p className="if-stat__sub" style={{ margin: 0 }}>
          {list.owners.length} wallet{list.owners.length === 1 ? "" : "s"}, {nodeCount} node
          {nodeCount === 1 ? "" : "s"}. Click a node to open its page. To act on a wallet&apos;s nodes, connect it on{" "}
          <Link href="/" className="if-link">
            Fleet
          </Link>
          .
        </p>
      )}
    </main>
  );
};

type GroupProps = {
  group: WatchGroup;
  statuses: ReturnType<typeof useWatchFleet>["statuses"];
  params: ReturnType<typeof useRegistryParams>["data"];
  probe: ReturnType<typeof useNodeProbe>;
  onRemove: () => void;
};

const OwnerGroup = ({ group: g, statuses, params: p, probe, onRemove }: GroupProps) => {
  const router = useRouter();
  const { data: ens } = useEnsName({ address: g.owner, chainId: 1 });
  const total = g.operators.length + g.pending.length;
  const cols = probe.report ? 6 : 5;
  return (
    <>
      <tr className="if-row--group">
        <td colSpan={cols}>
          <div className="if-actions" style={{ justifyContent: "space-between" }}>
            <span className="if-actions" style={{ gap: 8 }}>
              {ens && <span style={{ fontWeight: 600 }}>{ens}</span>}
              <AddressLink address={g.owner} />
              {g.isDiscovering && <span className="if-spinner" />}
            </span>
            <span className="if-actions" style={{ gap: 14 }}>
              <span className="if-stat__sub">
                {total} node{total === 1 ? "" : "s"}
                {g.operators.length ? ` · ${g.eligible} eligible` : ""}
              </span>
              <span className="if-mono if-stat__sub" title="FOLD bonded across these nodes">
                {fmtTokens(g.totalBonded, "FOLD")}
              </span>
              <button
                type="button"
                className="if-btn if-btn--ghost if-btn--xs"
                title="Stop watching this wallet"
                onClick={onRemove}
              >
                ×
              </button>
            </span>
          </div>
        </td>
      </tr>
      {total === 0 && (
        <tr className="if-row--quiet">
          <td colSpan={cols} className="if-stat__sub">
            {g.isDiscovering ? "Scanning the chain…" : "No node has named this wallet as bond owner."}
          </td>
        </tr>
      )}
      {[...g.operators, ...g.pending].map(op => {
        const k = op.toLowerCase();
        const s = statuses[k];
        const pill = statusPill(s, g.owner, p?.requiredCiphernodeBond, p?.minTicketBalance);
        const sw = softwarePill(probe.byOperator[k], probe.report, probe.stale);
        const lowEth = s ? s.ethBalance < LOW_ETH : false;
        return (
          <tr key={op} onClick={() => router.push(`/my-node?op=${op}`)}>
            <td>
              <AddressLink address={op} />
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
    </>
  );
};
