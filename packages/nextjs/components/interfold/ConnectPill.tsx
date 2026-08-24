"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useIsSafeAccount } from "~~/hooks/interfold/useIsSafeAccount";

const MODE_LABEL = { "safe-app": "Safe App", "safe-wc": "Safe · WalletConnect", eoa: "EOA", none: "" } as const;

/** RainbowKit connect control in the Interfold pill style, with the connection-mode badge. */
export const ConnectPill = () => {
  const { mode } = useIsSafeAccount();
  return (
    <ConnectButton.Custom>
      {({ account, chain, openConnectModal, openAccountModal, openChainModal, mounted }) => {
        const connected = mounted && account && chain;
        if (!connected) {
          return (
            <button type="button" className="if-btn if-btn--primary if-btn--sm" onClick={openConnectModal}>
              Connect wallet
            </button>
          );
        }
        if (chain.unsupported || chain.id !== 1) {
          return (
            <button type="button" className="if-btn if-btn--danger if-btn--sm" onClick={openChainModal}>
              Wrong network · switch to Ethereum
            </button>
          );
        }
        return (
          <div className="if-actions" style={{ gap: 8 }}>
            {mode !== "none" && (
              <span className={`if-badge ${mode === "eoa" ? "if-badge--muted" : "if-badge--working"}`}>
                <span className="if-badge__dot" />
                {MODE_LABEL[mode]}
              </span>
            )}
            <button type="button" className="if-btn if-btn--ghost if-btn--sm if-mono" onClick={openAccountModal}>
              {account.displayName}
              <span aria-hidden="true">▾</span>
            </button>
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
};
