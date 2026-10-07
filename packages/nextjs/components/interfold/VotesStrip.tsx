"use client";

import { useState } from "react";
import { ActionButtons } from "./ActionButtons";
import { AddressLink, Field } from "./ui";
import { type Address, zeroAddress } from "viem";
import { useEnsAddress } from "wagmi";
import { useConsole } from "~~/hooks/interfold/ConsoleContext";
import { type WriteParams } from "~~/hooks/interfold/useSafeAwareWrite";
import { useVotingPower } from "~~/hooks/interfold/useVotingPower";
import { GOVERNANCE, LINKS } from "~~/utils/interfold/contracts";
import { fmtTokens, safeNormalize, sameAddr, toChecksum } from "~~/utils/interfold/format";

type Props = {
  owner: Address;
  /** The owner is a contract (a Safe): it cannot sign a secret ballot. */
  isContract: boolean;
  /** Only the connection's own owner gets the delegate control. */
  primary: boolean;
};

/**
 * One line under the owner strip: what the DAO counts for this owner and where it comes from.
 * Secret ballots (CRISP) need a 65-byte wallet signature, so a Safe cannot cast one, and the two
 * sources a bond owner usually has (bonded and vesting FOLD) cannot be delegated either. Only FOLD
 * locked in the voting escrow can, so that is the one control offered.
 */
export const VotesStrip = ({ owner, isContract, primary }: Props) => {
  const { data: v } = useVotingPower(owner);
  if (!v || v.total === 0n) return null;

  const delegated = v.delegate !== zeroAddress;
  const selfDelegated = sameAddr(v.delegate, owner);

  return (
    <div
      className="if-unlock"
      title="BondedVotes.getVotes: escrow-locked (once delegated) + bonded + vesting-locked, net of the bond"
    >
      <div className="if-unlock__row">
        <span className="if-eyebrow">Voting power</span>
        <span className="if-unlock__main">
          <span className="if-mono">{fmtTokens(v.total)}</span> FOLD
        </span>
        <span className="if-unlock__held">
          <span className="if-mono">{fmtTokens(v.bonded)}</span> bonded ·{" "}
          <span className="if-mono">{fmtTokens(v.vesting)}</span> vesting ·{" "}
          <span className="if-mono">{fmtTokens(v.escrowLocked)}</span> locked in escrow
        </span>
        <span className="if-unlock__side">
          <a className="if-link" href={LINKS.governanceProposals} target="_blank" rel="noreferrer">
            Governance ↗
          </a>
        </span>
      </div>
      {isContract && (
        <div className="if-unlock__row">
          <span className="if-unlock__side" style={{ marginLeft: 0 }}>
            Secret ballots need a wallet with its own key, so this Safe cannot cast one. Bonded and vesting FOLD cannot
            be delegated; only FOLD locked in the escrow can.
          </span>
        </div>
      )}
      {v.escrowLocked > 0n && (
        <div className="if-unlock__row">
          <span className="if-unlock__held">
            Locked FOLD{" "}
            {delegated ? (
              <>delegated to {selfDelegated ? "itself" : <AddressLink address={v.delegate} />}</>
            ) : (
              "is not delegated, so it does not count yet"
            )}
          </span>
          {primary && <DelegateRow owner={owner} current={v.delegate} />}
        </div>
      )}
    </div>
  );
};

/** Delegate this owner's escrow-locked FOLD to an address or ENS name (the owner itself is fine). */
const DelegateRow = ({ owner, current }: { owner: Address; current: Address }) => {
  const { canWriteAsOwner } = useConsole();
  const [input, setInput] = useState("");
  const ens = safeNormalize(input.trim().toLowerCase().endsWith(".eth") ? input.trim() : undefined);
  const { data: ensAddr, isLoading } = useEnsAddress({ name: ens, chainId: 1, query: { enabled: !!ens } });
  const resolved = toChecksum(input.trim()) ?? (ensAddr ? toChecksum(ensAddr) : null);
  const same = !!resolved && sameAddr(resolved, current);
  const invalid = input.trim() !== "" && !resolved && !isLoading;

  const params: WriteParams | undefined = resolved
    ? {
        address: GOVERNANCE.escrowVotes.address,
        abi: GOVERNANCE.escrowVotes.abi,
        functionName: "delegate",
        args: [resolved],
        simulateAs: owner,
        summary: `Delegate escrow-locked FOLD voting power to ${resolved}`,
      }
    : undefined;

  if (!canWriteAsOwner) return null;
  return (
    <div className="if-actions" style={{ gap: 10, alignItems: "flex-end" }}>
      <Field
        label="Delegate locked FOLD to"
        value={input}
        onChange={setInput}
        placeholder="address or ENS (a wallet that can sign ballots)"
        invalid={invalid}
      />
      <ActionButtons
        label="Delegate"
        variant="ghost"
        params={params}
        disabled={!resolved || same}
        disabledReason={same ? "Already delegated there." : "Enter the delegate address."}
      />
    </div>
  );
};
