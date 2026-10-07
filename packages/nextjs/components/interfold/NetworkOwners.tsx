"use client";

import { useMemo, useState } from "react";
import { AddressLink, Empty, Note } from "./ui";
import { type Address } from "viem";
import { useEnsName } from "wagmi";
import { useConsole } from "~~/hooks/interfold/ConsoleContext";
import { type NetworkOwner, useNetworkOwners } from "~~/hooks/interfold/useNetworkOwners";
import { fmtTokens, sameAddr } from "~~/utils/interfold/format";

type SortKey = "nodes" | "tickets" | "bonded";

const cmp = (a: NetworkOwner, b: NetworkOwner, key: SortKey) => {
  const d =
    key === "nodes" ? BigInt(b.nodes - a.nodes) : key === "tickets" ? b.tickets - a.tickets : b.bonded - a.bonded;
  if (d !== 0n) return d > 0n ? 1 : -1;
  return b.nodes - a.nodes || (b.tickets > a.tickets ? 1 : b.tickets < a.tickets ? -1 : 0);
};

/** Every bond owner on the network, ranked. Track adds one as a section on the Fleet page. */
export const NetworkOwners = () => {
  const { owners: tracked, addOwner, removeOwner } = useConsole();
  const net = useNetworkOwners();
  const [sort, setSort] = useState<SortKey>("tickets");
  const [onlyTracked, setOnlyTracked] = useState(false);

  const rows = useMemo(() => {
    const list = onlyTracked ? net.owners.filter(o => tracked.some(t => sameAddr(t, o.owner))) : net.owners;
    return [...list].sort((a, b) => cmp(a, b, sort));
  }, [net.owners, sort, onlyTracked, tracked]);

  const totals = net.owners.reduce(
    (t, o) => ({ nodes: t.nodes + o.nodes, eligible: t.eligible + o.eligible, tickets: t.tickets + o.tickets }),
    { nodes: 0, eligible: 0, tickets: 0n },
  );

  const th = (key: SortKey, label: string, title: string) => (
    <th className="if-num" title={title}>
      <button
        type="button"
        className={`if-th-link ${sort === key ? "if-th-link--on" : ""}`}
        onClick={() => setSort(key)}
        aria-pressed={sort === key}
      >
        {label}
        {sort === key ? " ↓" : ""}
      </button>
    </th>
  );

  return (
    <section className="if-guide" style={{ gap: 12 }}>
      <header className="if-card__head" style={{ marginBottom: 0 }}>
        <div>
          <div className="if-eyebrow">Network</div>
          <h2 className="if-section-title">Every bond owner</h2>
        </div>
        <div className="if-actions">
          <span className="if-stat__sub">
            {net.isLoading
              ? "Scanning the registry…"
              : `${net.owners.length} owner${net.owners.length === 1 ? "" : "s"} · ${totals.nodes} node${totals.nodes === 1 ? "" : "s"}, ${totals.eligible} eligible · ${totals.tickets.toString()} tickets`}
          </span>
          {tracked.length > 0 && (
            <label
              className="if-stat__sub"
              style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}
            >
              <input type="checkbox" checked={onlyTracked} onChange={e => setOnlyTracked(e.target.checked)} />
              tracked only
            </label>
          )}
        </div>
      </header>

      {net.logsFailed ? (
        <Note kind="warn">
          The RPC refused the network-wide event scan. Set <code>NEXT_PUBLIC_ALCHEMY_API_KEY</code> to list every bond
          owner.
        </Note>
      ) : !net.isLoading && rows.length === 0 ? (
        <Empty>{onlyTracked ? "None of the tracked owners funds a node." : "No bond owner has a node yet."}</Empty>
      ) : (
        <div className="if-table-wrap">
          <table className="if-table">
            <thead>
              <tr>
                <th>Bond owner</th>
                {th("nodes", "Nodes", "Nodes this owner funds today (eligible / total). Click to sort.")}
                {th("tickets", "Tickets", "Sortition tickets across its nodes. Click to sort.")}
                {th("bonded", "FOLD bonded", "FOLD collateral across its nodes. Click to sort.")}
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map(o => (
                <OwnerRow
                  key={o.owner}
                  row={o}
                  tracked={tracked.some(t => sameAddr(t, o.owner))}
                  onTrack={addOwner}
                  onUntrack={removeOwner}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};

const OwnerRow = ({
  row: o,
  tracked,
  onTrack,
  onUntrack,
}: {
  row: NetworkOwner;
  tracked: boolean;
  onTrack: (a: Address) => void;
  onUntrack: (a: Address) => void;
}) => {
  const { data: ens } = useEnsName({ address: o.owner, chainId: 1 });
  return (
    <tr style={{ cursor: "default" }}>
      <td>
        <span className="if-actions" style={{ gap: 8 }}>
          {ens && <span style={{ fontWeight: 600 }}>{ens}</span>}
          <AddressLink address={o.owner} />
        </span>
      </td>
      <td className="if-num">
        {o.eligible}
        <span className="if-stat__of"> / {o.nodes}</span>
      </td>
      <td className="if-num">{o.tickets.toString()}</td>
      <td className="if-num">{fmtTokens(o.bonded)}</td>
      <td className="if-num">
        <button
          type="button"
          className={`if-btn if-btn--xs ${tracked ? "if-btn--ghost" : "if-btn--primary"}`}
          title={
            tracked ? "Remove this owner's section from the Fleet page" : "Add this owner's nodes as a section above"
          }
          onClick={() => (tracked ? onUntrack(o.owner) : onTrack(o.owner))}
        >
          {tracked ? "Tracked · remove" : "Track"}
        </button>
      </td>
    </tr>
  );
};
