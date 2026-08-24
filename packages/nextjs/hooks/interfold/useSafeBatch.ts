"use client";

import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { type Hex } from "viem";
import { usePublicClient, useSendCalls } from "wagmi";
import { useConsole } from "~~/hooks/interfold/ConsoleContext";
import { type BatchCall } from "~~/utils/interfold/batch";
import { CHAIN_ID } from "~~/utils/interfold/contracts";
import { decodeRevertHex, explainError, parseContractError } from "~~/utils/interfold/errors";

export type BatchStatus = "idle" | "simulating" | "sim-ok" | "sim-fail" | "awaiting-wallet" | "proposed" | "error";
export type CallResult = { ok: boolean; gasUsed: bigint; error?: string };

/**
 * One Safe transaction for many calls.
 *  - simulate: eth_simulateV1 (viem simulateCalls) as the bond owner, so call N sees the state left by
 *    call N-1 — the only honest pre-flight for approve→bond→register→ticket chains.
 *  - propose: EIP-5792 wallet_sendCalls. Inside the Safe App the provider turns it into a single
 *    MultiSend proposal (`sdk.txs.send({txs})`) and returns the safeTxHash as the batch id;
 *    Safe{Wallet} over WalletConnect handles it the same way. Wallets without 5792 throw, and the
 *    caller falls back to the Transaction Builder JSON export.
 */
export const useSafeBatch = () => {
  const { owner } = useConsole();
  const publicClient = usePublicClient({ chainId: CHAIN_ID });
  const { sendCallsAsync } = useSendCalls();
  const queryClient = useQueryClient();

  const [status, setStatus] = useState<BatchStatus>("idle");
  const [results, setResults] = useState<CallResult[]>([]);
  const [id, setId] = useState<Hex>();
  const [error, setError] = useState<string>();

  const simulate = useCallback(
    async (calls: BatchCall[]): Promise<boolean> => {
      if (!publicClient || calls.length === 0) return false;
      setStatus("simulating");
      setError(undefined);
      setResults([]);
      try {
        const r = await publicClient.simulateCalls({
          account: owner,
          calls: calls.map(c => ({ to: c.to, data: c.data })),
        });
        const out: CallResult[] = r.results.map(x => ({
          ok: x.status === "success",
          gasUsed: x.gasUsed,
          error:
            x.status === "success"
              ? undefined
              : explainError(decodeRevertHex(x.data) ?? (x.error as any)?.shortMessage ?? "reverted"),
        }));
        setResults(out);
        const allOk = out.every(x => x.ok);
        setStatus(allOk ? "sim-ok" : "sim-fail");
        if (!allOk) setError(`${out.filter(x => !x.ok).length} of ${out.length} calls would revert.`);
        return allOk;
      } catch (e) {
        setError(parseContractError(e));
        setStatus("sim-fail");
        return false;
      }
    },
    [publicClient, owner],
  );

  const propose = useCallback(
    async (calls: BatchCall[]) => {
      if (!(await simulate(calls))) return;
      setStatus("awaiting-wallet");
      try {
        const res = await sendCallsAsync({
          chainId: CHAIN_ID,
          calls: calls.map(c => ({ to: c.to, data: c.data, value: 0n })),
        });
        setId(res.id as Hex);
        setStatus("proposed");
        queryClient.invalidateQueries();
      } catch (e) {
        const msg = parseContractError(e);
        setError(
          /not support|unsupported|does not exist|Method not found|5792|sendCalls/i.test(msg)
            ? "This connector cannot batch (no EIP-5792). Download the Transaction Builder JSON below and upload it in Safe → Apps → Transaction Builder instead."
            : msg,
        );
        setStatus("error");
      }
    },
    [simulate, sendCallsAsync, queryClient],
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setResults([]);
    setId(undefined);
    setError(undefined);
  }, []);

  return {
    status,
    results,
    id,
    error,
    busy: status === "simulating" || status === "awaiting-wallet",
    simulate,
    propose,
    reset,
  };
};
