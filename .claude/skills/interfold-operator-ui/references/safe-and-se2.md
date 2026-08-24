# Safe connection + transaction handling in Scaffold-ETH 2

Verified against SE-2 template at commit `c412532` (2025-10-28): Next 15, wagmi 2.16, viem 2.34,
RainbowKit 2.2.8. File paths below are relative to `packages/nextjs/`.

## 1. Three ways the page gets a signer

| Mode | How the user connects | `useAccount().connector.id` | What a write returns |
|---|---|---|---|
| **Safe App (preferred)** | app.safe.global → Apps → *My custom apps* → *Add custom Safe App* → URL of this app (`http://localhost:3000` is accepted for local dev; production must be https). The page loads inside an iframe; RainbowKit's `safeWallet` (already in `services/web3/wagmiConnectors.tsx`) is only listed inside an iframe and wagmi auto-reconnects it because the connector's `isAuthorized()` is true there. | `"safe"` | A **safeTxHash** immediately after the first signer confirms in the Safe UI. Not an on-chain hash. |
| **WalletConnect from Safe{Wallet}** | In app.safe.global click the WalletConnect icon (top bar), paste the URI shown by RainbowKit's *WalletConnect* option. Works for any dapp URL. | `"walletConnect"`; the account has bytecode (`useBytecode({ address })` non-empty) | Depends on Safe{Wallet} version: safeTxHash after first confirmation, or the promise stays pending until execution. Treat identically to Safe App. |
| **EOA** (a node's hot wallet, or a signer testing reads) | MetaMask etc. | anything else, no bytecode | Real tx hash; receipts work normally. |

Requirements for Safe App mode (both already handled by the SKILL setup steps):
- `public/manifest.json` with `name`, `description`, `iconPath`, served with
  `Access-Control-Allow-Origin: *` (add `headers()` to `next.config.ts`).
- No `X-Frame-Options` / CSP `frame-ancestors` that would block app.safe.global.
- The Safe UI shows the app on chain of the selected Safe; keep the app on chainId 1.

Detect "this account is a Safe" once and expose it from a small hook:

```ts
// hooks/operators/useIsSafeAccount.ts
"use client";
import { useAccount, useBytecode } from "wagmi";

export const useIsSafeAccount = () => {
  const { address, connector } = useAccount();
  const { data: code } = useBytecode({ address, chainId: 1, query: { enabled: !!address } });
  const isSafeApp = connector?.id === "safe";
  const isContractAccount = !!code && code !== "0x";
  return { isSafeApp, isSafe: isSafeApp || isContractAccount, mode: isSafeApp ? "safe-app" : isContractAccount ? "safe-wc" : "eoa" } as const;
};
```

## 2. Why `useScaffoldWriteContract` must not be used for Safe writes

`hooks/scaffold-eth/useScaffoldWriteContract.ts` wraps every write in `useTransactor`
(`hooks/scaffold-eth/useTransactor.tsx`), which does:

```ts
transactionHash = await walletClient.sendTransaction(tx);   // → safeTxHash under a Safe
transactionReceipt = await publicClient.waitForTransactionReceipt({ hash: transactionHash });
```

`publicClient` is the plain HTTP RPC client. The Safe Apps provider only translates a safeTxHash
into a real hash for `eth_getTransactionReceipt` calls that go **through the wallet provider**;
the HTTP RPC has never heard of that hash, so the loading toast "Waiting for transaction to
complete" never resolves — and with a 3-of-6 Safe the real execution may be days away anyway.
Reads are unaffected: keep using `useScaffoldReadContract` everywhere.

## 3. `useSafeAwareWrite` — the write pattern for this page

```ts
// hooks/operators/useSafeAwareWrite.ts
"use client";
import { useState } from "react";
import { type Abi, type Address, type Hex, encodeFunctionData } from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { getParsedError } from "~~/utils/scaffold-eth"; // utils/scaffold-eth/getParsedError.ts, re-exported by the index
import { useIsSafeAccount } from "./useIsSafeAccount";

export type WriteParams = {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
  /** account to simulate as; defaults to the connected account (use the Safe when unconnected) */
  simulateAs?: Address;
};

export type WriteStatus =
  | "idle" | "simulating" | "sim-ok" | "sim-fail" | "awaiting-wallet" | "proposed" | "sent" | "confirmed" | "error";

export const useSafeAwareWrite = () => {
  const { address: account } = useAccount();
  const { isSafe } = useIsSafeAccount();
  const publicClient = usePublicClient({ chainId: 1 });
  const { writeContractAsync } = useWriteContract();
  const [status, setStatus] = useState<WriteStatus>("idle");
  const [hash, setHash] = useState<Hex>();
  const [error, setError] = useState<string>();

  const simulate = async (p: WriteParams) => {
    if (!publicClient) return false;
    setStatus("simulating");
    setError(undefined);
    try {
      await publicClient.simulateContract({
        address: p.address,
        abi: p.abi,
        functionName: p.functionName,
        args: p.args as any,
        account: p.simulateAs ?? account,
      } as any);
      setStatus("sim-ok");
      return true;
    } catch (e) {
      setError(getParsedError(e));
      setStatus("sim-fail");
      return false;
    }
  };

  const write = async (p: WriteParams) => {
    if (!(await simulate(p))) return;
    setStatus("awaiting-wallet");
    try {
      const h = await writeContractAsync({
        address: p.address,
        abi: p.abi,
        functionName: p.functionName,
        args: p.args as any,
        chainId: 1,
      } as any);
      setHash(h);
      if (isSafe) {
        setStatus("proposed"); // do NOT wait for a receipt; callers refetch their gating reads
      } else {
        setStatus("sent");
        publicClient?.waitForTransactionReceipt({ hash: h }).then(r => {
          setStatus(r.status === "success" ? "confirmed" : "error");
        }).catch(() => setStatus("error"));
      }
    } catch (e) {
      setError(getParsedError(e));
      setStatus("error");
    }
  };

  const calldata = (p: WriteParams) =>
    encodeFunctionData({ abi: p.abi, functionName: p.functionName, args: p.args as any });

  const reset = () => { setStatus("idle"); setHash(undefined); setError(undefined); };

  return { status, hash, error, simulate, write, calldata, reset, isSafe };
};
```

Usage in a wizard step (address/abi come from `useDeployedContractInfo({ contractName: "BondingRegistry" })`):

```tsx
const { data: registry } = useDeployedContractInfo({ contractName: "BondingRegistry" });
const w = useSafeAwareWrite();
const params = registry && {
  address: registry.address, abi: registry.abi,
  functionName: "bondCiphernodeFor", args: [operator, need], simulateAs: safe,
};
// Simulate button → w.simulate(params); Propose button → w.write(params)
// Copy calldata → { to: registry.address, value: "0", data: w.calldata(params) }
```

Gating reads (`allowance`, `getCiphernodeBond`, `isRegistered`, …) already poll via
`refetchInterval`; when a read flips, the wizard step advances on its own and you call `w.reset()`.
While `status === "proposed"`, show the Safe queue link and the safeTxHash; a direct link to the
Safe transaction is
`https://app.safe.global/transactions/tx?safe=eth:<safe>&id=multisig_<safe>_<safeTxHash>`.

## 4. Simulating as the Safe while *not* connected as the Safe
`simulateContract({ account: safeAddress })` is an `eth_call` with `from = safe`; no signature is
needed, so the page can dry-run every step for a given Safe from any wallet (or no wallet). Use
`NEXT_PUBLIC_SAFE_ADDRESS` as the default `simulateAs`. Expected simulated outcomes for a brand-new
operator: `bondCiphernodeFor` → `NotBondOwner` until set-bond-owner; then an ERC-20 allowance
error until `FOLD.approve`; `addTicketBalanceFor` → `NotRegistered` until registered.

## 5. Calldata export (fallback path)
Always render, for the current action: target address, `value: 0`, hex `data` from
`encodeFunctionData`, and a one-line "what it does". The user can paste this into Safe's
*Transaction Builder* app (custom data) or ABI.ninja. This is also what the fork test replays.

## 6. Operator discovery when logs are unavailable
Public RPCs reject `eth_getLogs` over large ranges. The Safe Transaction Service is a free,
unauthenticated read and lists every executed Safe transaction:

```ts
import { decodeFunctionData } from "viem";

export const discoverOperatorsFromSafeHistory = async (safe: Address, registry: Address, abi: Abi) => {
  const url = `https://safe-transaction-mainnet.safe.global/api/v1/safes/${safe}/multisig-transactions/?to=${registry}&executed=true&limit=100`;
  const res = await fetch(url);
  if (!res.ok) return [] as Address[];
  const { results } = (await res.json()) as { results: { data: Hex | null; isSuccessful: boolean }[] };
  const ops = new Set<string>();
  for (const tx of results) {
    if (!tx.data || !tx.isSuccessful) continue;
    try {
      const { functionName, args } = decodeFunctionData({ abi, data: tx.data });
      if (["bondCiphernodeFor", "registerOperatorFor", "addTicketBalanceFor"].includes(functionName)) {
        ops.add((args as readonly [Address, ...unknown[]])[0].toLowerCase());
      }
    } catch { /* not a registry call */ }
  }
  return [...ops] as Address[];
};
```

Prefer `useScaffoldEventHistory` on `BondOwnerSet` (filter `bondOwner = safe`) when an Alchemy key
is configured; use the Safe API as a fallback and merge with the manual localStorage list.

## 7. Optional: batching approve + action into one Safe transaction
Inside the Safe App iframe, `@safe-global/safe-apps-sdk` (`new SafeAppsSDK().txs.send({ txs: [approveTx, bondTx] })`)
submits a single multisend proposal, halving signer round-trips. Not required for v1 and not
available in WalletConnect mode; if added, keep the per-call Simulate step and the calldata export.
