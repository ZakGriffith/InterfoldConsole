/**
 * Sortition odds. The ciphernode registry scores every ticket as keccak(node, ticketNumber, e3Id,
 * seed), a node submits its lowest-scoring ticket, and the `seats` lowest scores form the committee
 * with at most one node per bond owner (CommitteeBondOwnerCapEnabled, on since E3 #2). So an owner's
 * entry is the minimum of `tickets` uniform draws pooled across its eligible nodes, it wins a seat
 * when fewer than `seats` other owners draw lower, and inside the owner the seat goes to whichever
 * node drew the minimum, which is each node's share of the owner's tickets.
 */

/** Integration grid for the owner race; the integrand is smooth, so this is accurate to well under a point. */
const GRID = 1_000;

/**
 * P(owner i gets a seat) for every owner, given each owner's pooled ticket count and the number of
 * seats, assuming every ticket enters the draw. Sums to `seats` when there are at least that many owners.
 */
export const ownerSeatOdds = (tickets: number[], seats: number): number[] => {
  const n = tickets.length;
  if (seats <= 0 || n === 0) return tickets.map(() => 0);
  if (n <= seats) return tickets.map(t => (t > 0 ? 1 : 0));
  return tickets.map((ti, i) => {
    if (ti <= 0) return 0;
    let acc = 0;
    for (let g = 0; g < GRID; g++) {
      const x = (g + 0.5) / GRID;
      // Owner i's best draw lands at x with density ti(1-x)^(ti-1).
      const density = ti * Math.pow(1 - x, ti - 1);
      // Poisson-binomial: how many other owners drew below x, truncated at `seats`.
      const dp = new Float64Array(seats + 1);
      dp[0] = 1;
      for (let j = 0; j < n; j++) {
        if (j === i || tickets[j] <= 0) continue;
        const p = 1 - Math.pow(1 - x, tickets[j]);
        for (let c = seats; c >= 1; c--) dp[c] = dp[c] * (1 - p) + dp[c - 1] * p;
        dp[0] *= 1 - p;
      }
      let below = 0;
      for (let c = 0; c < seats; c++) below += dp[c];
      acc += density * below;
    }
    return Math.min(1, acc / GRID);
  });
};

export const fmtOdds = (p: number | undefined): string => {
  if (p === undefined) return "-";
  if (p >= 0.995) return "~100%";
  if (p > 0 && p < 0.005) return "<1%";
  return `${Math.round(p * 100)}%`;
};
