"use client";

import { AddressLink } from "./ui";
import { type Address } from "viem";
import { useConsole } from "~~/hooks/interfold/ConsoleContext";
import { type OwnerFunds, susdsToUsds } from "~~/hooks/interfold/useOwnerFunds";
import { type RegistryParams } from "~~/hooks/interfold/useRegistryParams";
import { fmtTokens, maxBig } from "~~/utils/interfold/format";

type Amounts = {
  /** Exact amounts a specific batch will pull. Omit to show the per-node minimum instead. */
  foldNeeded?: bigint;
  susdsNeeded?: bigint;
  /** Number of tickets the sUSDS figure represents (for the label). */
  tickets?: bigint;
  compact?: boolean;
};

const Row = ({ ok, children }: { ok: boolean | undefined; children: React.ReactNode }) => (
  <li className={`if-req__row ${ok === undefined ? "" : ok ? "if-req__row--ok" : "if-req__row--bad"}`}>
    <span className="if-req__mark" aria-hidden="true">
      {ok === undefined ? "•" : ok ? "✓" : "✗"}
    </span>
    <span>{children}</span>
  </li>
);

/**
 * What the bond owner must hold for bonding/ticketing to succeed, checked live against its balances
 * when they are known. Locked (vesting) FOLD counts; the sUSDS must already be sUSDS shares, not USDS.
 * Pure: takes owner/params/funds as props so it also works without the console context.
 */
export const RequirementsList = ({
  owner,
  params: p,
  funds: f,
  foldNeeded,
  susdsNeeded,
  tickets,
  compact,
}: Amounts & { owner?: Address; params?: RegistryParams; funds?: OwnerFunds }) => {
  if (!p) return null;
  const minTickets = maxBig(1n, p.minTicketBalance);
  const fold = foldNeeded ?? p.requiredCiphernodeBond;
  const ticketCount =
    tickets ?? (susdsNeeded !== undefined && p.ticketPrice > 0n ? susdsNeeded / p.ticketPrice : minTickets);
  const susds = susdsNeeded ?? minTickets * p.ticketPrice;
  const foldOk = f ? f.foldBalance >= fold : undefined;
  const susdsOk = f ? f.susdsBalance >= susds : undefined;
  const perNode = foldNeeded === undefined;

  return (
    <div className={`if-req ${compact ? "if-req--compact" : ""}`}>
      <div className="if-req__head">
        What the bond owner {owner ? <AddressLink address={owner} /> : null} must hold
        {perNode ? " per node" : " for this batch"}
      </div>
      <ul className="if-req__list">
        <Row ok={foldOk}>
          <b>{fmtTokens(fold, "FOLD")}</b> for the ciphernode bond
          {f && (
            <>
              {" "}
              (holds {fmtTokens(f.foldBalance, "FOLD")}
              {foldOk === false && <>; short by {fmtTokens(fold - f.foldBalance, "FOLD")}</>})
            </>
          )}
          . Locked or vesting FOLD counts: the registry credits the bond before it pulls the tokens.
        </Row>
        <Row ok={susdsOk}>
          <b>{fmtTokens(susds, "sUSDS")}</b> for {ticketCount.toString()} ticket{ticketCount === 1n ? "" : "s"} (
          {fmtTokens(p.ticketPrice, "sUSDS")} each; a node needs at least {minTickets.toString()} to go active)
          {f && (
            <>
              {" "}
              (holds {fmtTokens(f.susdsBalance, "sUSDS")}
              {f.susdsRate > 0n && <> ≈ {fmtTokens(susdsToUsds(f.susdsBalance, f.susdsRate), "USDS")}</>}
              {susdsOk === false && <>; short by {fmtTokens(susds - f.susdsBalance, "sUSDS")}</>})
            </>
          )}
          . This must be <b>sUSDS</b> (USDS deposited into Sky Savings at sky.money), not plain USDS or DAI; a plain
          USDS balance does not count.
        </Row>
        <Row ok={undefined}>
          The <b>node&apos;s own hot wallet</b> needs a little ETH for gas (≥ 0.01 ETH, ideally ~0.05) to submit
          sortition tickets and committee transactions. It should never hold FOLD or sUSDS.
        </Row>
      </ul>
      {!perNode && (
        <div className="if-req__foot">
          The bundle executes as one transaction: if either balance is short at execution time, every call in it reverts
          together and nothing is spent.
        </div>
      )}
    </div>
  );
};

/** Context-bound variant for pages inside the console. */
export const RequirementsNote = (props: Amounts) => {
  const { owner, params, funds } = useConsole();
  return <RequirementsList owner={owner} params={params} funds={funds} {...props} />;
};
