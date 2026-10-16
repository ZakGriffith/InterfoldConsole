"use client";

import { useMemo } from "react";
import { useE3Activity } from "~~/hooks/interfold/useE3Activity";
import { useNetworkOwners } from "~~/hooks/interfold/useNetworkOwners";
import { ownerSeatOdds } from "~~/utils/interfold/odds";

/** Seats per committee so far on mainnet; replaced by the newest committee's size once seen. */
const DEFAULT_SEATS = 19;

export type DrawOdds = {
  /** P(seat in the next E3) per lower-cased bond owner: one seat per owner at most. */
  byOwner: Record<string, number>;
  /** P(seat) per lower-cased node: its owner's odds times its share of the owner's tickets. */
  byOperator: Record<string, number>;
  seats: number;
  /** Who is in the draw if every eligible node enters. */
  pool: { owners: number; nodes: number; tickets: number };
  ready: boolean;
};

/**
 * Each node's and each bond owner's chance of a committee seat in the next E3, from the whole
 * network's eligible nodes and their ticket counts. Assumes every eligible node enters the draw;
 * nodes that are down miss it, which raises everyone else's odds.
 */
export const useDrawOdds = (): DrawOdds => {
  const net = useNetworkOwners();
  const e3 = useE3Activity();
  const seats = e3.data?.e3s.find(x => x.committee.length > 0)?.committee.length ?? DEFAULT_SEATS;

  return useMemo(() => {
    const ownerKeys: string[] = [];
    const ownerTickets: number[] = [];
    const nodeTickets: Record<string, { owner: string; tickets: number }> = {};
    let nodes = 0;
    for (const o of net.owners) {
      let total = 0;
      for (const op of o.operators) {
        const s = net.statuses[op.toLowerCase()];
        if (!s || !s.isActive || s.availableTickets <= 0n) continue;
        const t = Number(s.availableTickets);
        total += t;
        nodes++;
        nodeTickets[op.toLowerCase()] = { owner: o.owner.toLowerCase(), tickets: t };
      }
      if (total === 0) continue;
      ownerKeys.push(o.owner.toLowerCase());
      ownerTickets.push(total);
    }
    const odds = ownerSeatOdds(ownerTickets, seats);
    const byOwner: Record<string, number> = {};
    ownerKeys.forEach((k, i) => (byOwner[k] = odds[i]));
    const byOperator: Record<string, number> = {};
    for (const [op, { owner, tickets }] of Object.entries(nodeTickets)) {
      const i = ownerKeys.indexOf(owner);
      byOperator[op] = (byOwner[owner] ?? 0) * (tickets / ownerTickets[i]);
    }
    return {
      byOwner,
      byOperator,
      seats,
      pool: { owners: ownerKeys.length, nodes, tickets: ownerTickets.reduce((a, b) => a + b, 0) },
      ready: !net.isLoading && net.owners.length > 0,
    };
  }, [net.owners, net.statuses, net.isLoading, seats]);
};
