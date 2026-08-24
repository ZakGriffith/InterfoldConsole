"use client";

import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { type Abi, type Address, type Hex, encodeFunctionData } from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { useIsSafeAccount } from "~~/hooks/interfold/useIsSafeAccount";
import { CHAIN_ID } from "~~/utils/interfold/contracts";
import { explainError, parseContractError, revertName } from "~~/utils/interfold/errors";

export type WriteParams = {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
  /** Account to simulate as; defaults to the connected account. Use the Safe when it is not connected. */
  simulateAs?: Address;
  /** One-line description shown next to the exported calldata. */
  summary?: string;
};

export type WriteStatus =
  | "idle"
  | "simulating"
  | "sim-ok"
  | "sim-fail"
  | "awaiting-wallet"
  | "proposed"
  | "sent"
  | "confirmed"
  | "error";

/**
 * Write path that is safe for Gnosis Safe signers.
 *
 * SE-2's useScaffoldWriteContract -> useTransactor calls publicClient.waitForTransactionReceipt on
 * whatever the wallet returned. Under the Safe-App / WalletConnect connectors that value is a
 * *safeTxHash*, which the HTTP RPC has never heard of, so the toast spins forever (and with a
 * 3-of-6 Safe the real execution may be days away). This hook:
 *   1. always simulates first with `account = simulateAs ?? connected` (an eth_call; no signature),
 *   2. sends via wagmi's useWriteContract,
 *   3. treats the result as "proposed" for Safes and never waits on it; callers drive UI from polled reads,
 *   4. for EOAs waits for the receipt and invalidates every query so reads refresh at once.
 */
export const useSafeAwareWrite = () => {
  const { address: account } = useAccount();
  const { isSafe } = useIsSafeAccount();
  const publicClient = usePublicClient({ chainId: CHAIN_ID });
  const { writeContractAsync } = useWriteContract();
  const queryClient = useQueryClient();

  const [status, setStatus] = useState<WriteStatus>("idle");
  const [hash, setHash] = useState<Hex>();
  const [rawError, setRawError] = useState<string>();
  const [simulatedAs, setSimulatedAs] = useState<Address>();

  const simulate = useCallback(
    async (p: WriteParams): Promise<boolean> => {
      if (!publicClient) return false;
      const as = p.simulateAs ?? account;
      setStatus("simulating");
      setRawError(undefined);
      setSimulatedAs(as);
      try {
        await publicClient.simulateContract({
          address: p.address,
          abi: p.abi,
          functionName: p.functionName,
          args: p.args as any,
          account: as,
        } as any);
        setStatus("sim-ok");
        return true;
      } catch (e) {
        setRawError(parseContractError(e));
        setStatus("sim-fail");
        return false;
      }
    },
    [publicClient, account],
  );

  const write = useCallback(
    async (p: WriteParams) => {
      if (!(await simulate(p))) return;
      setStatus("awaiting-wallet");
      try {
        const h = await writeContractAsync({
          address: p.address,
          abi: p.abi,
          functionName: p.functionName,
          args: p.args as any,
          chainId: CHAIN_ID,
        } as any);
        setHash(h);
        if (isSafe) {
          // safeTxHash (or, for some connectors, the real hash after execution). Do not wait on it.
          setStatus("proposed");
          return;
        }
        setStatus("sent");
        publicClient
          ?.waitForTransactionReceipt({ hash: h })
          .then(r => {
            setStatus(r.status === "success" ? "confirmed" : "error");
            if (r.status !== "success") setRawError("Transaction reverted on-chain.");
            queryClient.invalidateQueries();
          })
          .catch(e => {
            setRawError(parseContractError(e));
            setStatus("error");
          });
      } catch (e) {
        setRawError(parseContractError(e));
        setStatus("error");
      }
    },
    [simulate, writeContractAsync, isSafe, publicClient, queryClient],
  );

  const calldata = useCallback(
    (p: WriteParams): Hex => encodeFunctionData({ abi: p.abi, functionName: p.functionName, args: p.args as any }),
    [],
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setHash(undefined);
    setRawError(undefined);
    setSimulatedAs(undefined);
  }, []);

  const busy = status === "simulating" || status === "awaiting-wallet";

  return {
    status,
    hash,
    rawError,
    error: rawError ? explainError(rawError) : undefined,
    revert: revertName(rawError),
    simulatedAs,
    busy,
    simulate,
    write,
    calldata,
    reset,
    isSafe,
  };
};

export type SafeAwareWrite = ReturnType<typeof useSafeAwareWrite>;
