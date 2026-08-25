"use client";

import { useState } from "react";
import { NetworkPulse } from "./NetworkPulse";
import { ParamsStrip } from "./ParamsStrip";
import { AddressLink, Field, Note } from "./ui";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { type Address } from "viem";
import { useEnsAddress } from "wagmi";
import { LINKS } from "~~/utils/interfold/contracts";
import { safeNormalize, toChecksum } from "~~/utils/interfold/format";

/** Public landing: nothing about any bond owner is shown until a wallet connects. */
export const ConnectGate = () => {
  const { openConnectModal } = useConnectModal();
  return (
    <main className="if-main">
      <div className="if-guide">
        <header className="if-guide__head">
          <div className="if-eyebrow">Ciphernode Console</div>
          <h1 className="if-guide__title">Connect a wallet to see its ciphernodes.</h1>
          <p className="if-guide__lede">
            This console lets a bond owner — typically a Gnosis Safe — bond FOLD, register, buy sUSDS tickets, monitor
            and exit Interfold ciphernodes, for as many nodes as it funds. Open it as a Safe App inside Safe
            {"{Wallet}"} (Apps → My custom apps → this URL) or pair through WalletConnect to act as the Safe. Connect a
            node&apos;s hot wallet instead to authorize a bond owner for that node.
          </p>
        </header>
        <div className="if-actions">
          <button type="button" className="if-btn if-btn--primary" onClick={() => openConnectModal?.()}>
            Connect wallet
          </button>
          <a className="if-btn if-btn--ghost" href={LINKS.docs} target="_blank" rel="noreferrer">
            Operator docs <span className="if-btn__arrow">→</span>
          </a>
        </div>
        <NetworkPulse />
        <ParamsStrip />
        <Note>
          Every transaction is simulated as the connected wallet before it is proposed, and Safe proposals are never
          awaited: the page follows on-chain state. Nothing is stored server-side; labels and manual entries live in
          your browser.
        </Note>
      </div>
    </main>
  );
};

/** A plain key that owns nothing: most likely a node's hot wallet. Ask which Safe it should authorize. */
export const OwnerPrompt = ({ connected, onPick }: { connected: Address; onPick: (a: Address) => void }) => {
  const [input, setInput] = useState("");
  const ensName = input.trim().toLowerCase().endsWith(".eth") ? input.trim() : undefined;
  const { data: ensAddr, isLoading } = useEnsAddress({
    name: safeNormalize(ensName),
    chainId: 1,
    query: { enabled: !!ensName },
  });
  const resolved = toChecksum(input.trim()) ?? (ensAddr ? toChecksum(ensAddr) : null);
  const invalid = input.trim() !== "" && !resolved && !isLoading;
  const isSelf = !!resolved && resolved.toLowerCase() === connected.toLowerCase();

  return (
    <main className="if-main">
      <div className="if-guide">
        <header className="if-guide__head">
          <div className="if-eyebrow">Node hot wallet</div>
          <h1 className="if-guide__title">Which bond owner will fund this node?</h1>
          <p className="if-guide__lede">
            <AddressLink address={connected} /> holds no FOLD and has not named a bond owner yet, so it looks like a
            ciphernode&apos;s operator key. Enter the Safe (address or ENS) that will post its collateral; you can then
            sign <code>setBondOwner</code> from here and the bond owner takes it from there.
          </p>
        </header>
        <div className="if-fields">
          <Field
            label="Bond owner (the funding Safe)"
            value={input}
            onChange={setInput}
            placeholder="0x… or name.eth"
            invalid={invalid || isSelf}
            hint={
              isSelf
                ? "That is this wallet; the bond owner is the Safe that holds the FOLD."
                : invalid
                  ? "Not a valid address or ENS name."
                  : "Kept only in this browser session."
            }
            suffix={
              <button
                type="button"
                className="if-btn if-btn--sm if-btn--primary"
                disabled={!resolved || isSelf}
                onClick={() => resolved && onPick(resolved)}
              >
                Continue
              </button>
            }
          />
        </div>
        <Note>
          If this wallet <em>is</em> a bond owner that simply has not bonded anything yet, enter its own address to
          continue as it.
        </Note>
      </div>
    </main>
  );
};

/** Centered call-to-action for the "Connect your node" tab before any wallet is connected. */
export const ConnectCta = () => {
  const { openConnectModal } = useConnectModal();
  return (
    <main className="if-main if-cta">
      <div className="if-cta__box">
        <div className="if-eyebrow">Node operators · connect your node</div>
        <h1 className="if-guide__title">Connect your wallet to set up your node.</h1>
        <p className="if-guide__lede">
          Connect as the bond owner that funds your ciphernode — your own wallet, or a Safe (open this page as a Safe
          App inside Safe{"{Wallet}"} or pair through WalletConnect) — or connect the node&apos;s own hot wallet to
          authorize its bond owner. The guide appears as soon as a wallet is connected.
        </p>
        <div className="if-actions if-cta__actions">
          <button type="button" className="if-btn if-btn--primary" onClick={() => openConnectModal?.()}>
            Connect wallet
          </button>
          <a className="if-btn if-btn--ghost" href={LINKS.docs} target="_blank" rel="noreferrer">
            How ciphernodes work <span className="if-btn__arrow">→</span>
          </a>
        </div>
      </div>
    </main>
  );
};
