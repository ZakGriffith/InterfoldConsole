"use client";

import { useAccount, useBytecode } from "wagmi";
import { CHAIN_ID } from "~~/utils/interfold/contracts";

export type ConnectionMode = "safe-app" | "safe-wc" | "eoa" | "none";

/**
 * Classifies the connected account.
 *  - "safe-app": RainbowKit's safeWallet connector (page is iframed inside app.safe.global)
 *  - "safe-wc":  any other connector but the account has bytecode (Safe via WalletConnect, or another smart account)
 *  - "eoa":      a plain key (a node's hot wallet, or a signer testing reads)
 */
export const useIsSafeAccount = () => {
  const { address, connector, chainId, isConnected } = useAccount();
  const { data: code, isLoading } = useBytecode({ address, chainId: CHAIN_ID, query: { enabled: !!address } });
  const isSafeApp = connector?.id === "safe";
  const isContractAccount = !!code && code !== "0x";
  const isSafe = isSafeApp || isContractAccount;
  const mode: ConnectionMode = !address ? "none" : isSafeApp ? "safe-app" : isContractAccount ? "safe-wc" : "eoa";
  return {
    address,
    connector,
    chainId,
    isConnected,
    onMainnet: chainId === CHAIN_ID,
    isSafeApp,
    isContractAccount,
    isSafe,
    isCheckingBytecode: !!address && isLoading,
    mode,
  } as const;
};
