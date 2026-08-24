---
name: interfold-operator-ui
description: Build or extend a Scaffold-ETH 2 page that onboards and manages Interfold ciphernodes (bond 32k FOLD, register, buy sUSDS tickets, monitor, exit) from a Gnosis Safe such as buidlguidl.eth, because the official Interfold operator UI cannot connect a Safe or WalletConnect. Use whenever the task touches the operator console page, Interfold/FOLD/sUSDS/BondingRegistry contracts in externalContracts.ts, Safe-App or WalletConnect transaction handling in SE-2, or multi-node ciphernode management.
---

# Interfold Operator Console (Scaffold-ETH 2)

You are building a **bond-owner console**: a Next.js page inside a Scaffold-ETH 2 (SE-2) clone that
lets a Gnosis Safe do everything the Interfold operator website does, for **many** ciphernodes.
The Safe is the bond owner and holds the money; each node's hot wallet is the "operator".
Everything below was verified against verified Solidity source and live mainnet reads on
2026-08-24. Read `references/contracts.md` before writing any contract call and
`references/safe-and-se2.md` before writing any transaction code.

## Non-negotiable facts (each one has already cost a real human a Safe round-trip)

1. **Two different approval spenders.**
   - `FOLD.approve(spender = BondingRegistry)` — `bondCiphernodeFor` pulls FOLD into the registry.
   - `sUSDS.approve(spender = InterfoldTicketToken)` — `addTicketBalanceFor` pulls sUSDS via
     `ticketToken.depositFrom(msg.sender, …)`. Approving the registry for sUSDS does nothing.
2. **All amounts are 18-decimal token wei, never counts.** `addTicketBalanceFor(op, 2)` succeeds and
   buys 2 wei of ticket balance (= 0 tickets). One ticket = `ticketPrice` = `1000e18` sUSDS shares.
   Bond = `requiredCiphernodeBond` = `32000e18` FOLD. Always `parseUnits(x, 18)`; always read the
   live values from the registry rather than hard-coding them in logic.
3. **`…For(operator, …)` functions: the parameter is the hot wallet, the caller is the Safe.**
   `onlyBondOwner(operator)` checks `msg.sender == bondOwnerOf(operator)`. The Safe address never
   goes in a parameter. If `bondOwnerOf(op) != safe`, nothing else can proceed — the operator must
   first run `interfold ciphernode set-bond-owner --owner <safe>` (or call `setBondOwner(safe)`
   from the hot wallet).
4. **Locked (airdrop/vesting) FOLD is bondable.** `transferableBalanceOf(safe)` can be 0 while
   bonding 32k succeeds: the registry credits `_bondedByOwner` *before* pulling tokens, and the
   token lock formula counts bonded balance. Do **not** gate bonding on `transferableBalanceOf`;
   gate on `balanceOf(safe) >= amount` and `allowance(safe, registry) >= amount`.
5. **sUSDS is a yield-bearing ERC-4626 share, not $1.** 1 sUSDS ≈ 1.107 USDS on 2026-08-24. Show
   the USDS value via `sUSDS.convertToAssets(shares)`; never label a share count as dollars.
6. **A Safe write does not return an on-chain tx hash.** Under the Safe-App or WalletConnect
   connector, `writeContractAsync` resolves with a *safeTxHash* (or blocks until execution).
   SE-2's `useScaffoldWriteContract` → `useTransactor` then calls
   `publicClient.waitForTransactionReceipt(safeTxHash)` and spins forever. **Do not use
   `useScaffoldWriteContract` / `useTransactor` for Safe writes.** Use wagmi `useWriteContract`
   directly, treat the resolved value as "proposed", and drive UI state purely from polled reads.
   Ready hook pattern: `references/safe-and-se2.md`.
7. **Pre-flight every write with `publicClient.simulateContract({ account: safe, … })`.** The Safe
   is 3-of-6, so a revert discovered after collecting signatures wastes days. `eth_call` with
   `from = safe` needs no signature and decodes custom errors via the ABI shipped in this skill.
8. **Public RPCs refuse wide `eth_getLogs` and archive `eth_call`.** Event history (operator
   discovery) needs a real key: set `NEXT_PUBLIC_ALCHEMY_API_KEY` or `scaffoldConfig.rpcOverrides[1]`.

## Setting up a fresh SE-2 clone (in order)

1. `packages/nextjs/scaffold.config.ts`
   - `targetNetworks: [chains.mainnet]`
   - `pollingInterval: 15000` (reads are the source of truth; 15 s is a good tradeoff)
   - keep `onlyLocalBurnerWallet: true`
2. `packages/nextjs/contracts/externalContracts.ts` → replace with `assets/externalContracts.ts`
   from this skill (BondingRegistry, FOLD, sUSDS, InterfoldTicketToken on chainId 1, with all
   registry events + custom errors so reverts decode). Then add `deployedOnBlock` on
   `BondingRegistry`: look up the proxy's creation block on Etherscan
   (`0x0ec90465095C21830BEcED07e032809A2Bd2915F`) so `useScaffoldEventHistory` does not scan from
   genesis. If you cannot look it up, use `25_000_000` (≈ May 2026, safely before the
   2026-08-19 TGE) and say so in your summary.
3. `packages/nextjs/public/manifest.json` → replace with `assets/manifest.json` (SE-2's default is
   already Safe-App shaped; this only names it). Add CORS headers for it in `next.config.ts`:
   ```ts
   async headers() {
     return [{
       source: "/manifest.json",
       headers: [
         { key: "Access-Control-Allow-Origin", value: "*" },
         { key: "Access-Control-Allow-Methods", value: "GET" },
         { key: "Access-Control-Allow-Headers", value: "X-Requested-With, content-type, Authorization" },
       ],
     }];
   },
   ```
   Do not add `X-Frame-Options` / `frame-ancestors`: app.safe.global must be able to iframe the page.
4. `packages/nextjs/components/Header.tsx` → add `{ label: "Operators", href: "/operators" }` to
   `menuLinks`. Change nothing else there.
5. Create `packages/nextjs/app/operators/page.tsx` plus `components/operators/*`. Client components
   (`"use client"`). No new dependencies: `viem`, `wagmi`, RainbowKit (already includes
   `safeWallet`), daisyUI and heroicons ship with the template.
6. `.env.local`: `NEXT_PUBLIC_ALCHEMY_API_KEY=…` (event history),
   `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID=…` (WalletConnect mode), and
   `NEXT_PUBLIC_SAFE_ADDRESS=0x97843608a00e2bbc75ab0C1911387E002565DEDE` as the default bond owner
   shown before any wallet connects.

## Page architecture (`/operators`)

Three views on one page, top to bottom. Every number shown comes from a `useScaffoldReadContract`
(or a `useReadContracts` multicall for the table); nothing is inferred from transaction results.

### A. Bond-owner header (the Safe)
- Connected account (must equal the bond owner for writes; if a hot wallet is connected instead,
  switch into **operator mode**, below). Badge from `connector.id`: `"safe"` = Safe App iframe,
  `"walletConnect"` + contract bytecode at the account = Safe via WalletConnect, otherwise EOA.
- Capacity: `FOLD.balanceOf(safe)`, `FOLD.transferableBalanceOf(safe)` (info only),
  `BondingRegistry.totalBonded(safe)`, `sUSDS.balanceOf(safe)` (+ USDS value via
  `convertToAssets`). Derived: *nodes you can still bond* = `floor(FOLD balance /
  requiredCiphernodeBond)`; *tickets you can still buy* = `floor(sUSDS balance / ticketPrice)`.
- Network params (poll slowly): `requiredCiphernodeBond`, `ticketPrice`, `exitDelay`,
  `ciphernodeBondActiveBps`, `numActiveOperators`, `numRegisteredOperators`.
- Links: Safe queue `https://app.safe.global/transactions/queue?safe=eth:<safe>` and the
  Interfold dashboard `https://dashboard.theinterfold.com/#operator`.

### B. Operator fleet table (multi-node)
One row per operator address. Sources, merged and de-duplicated (lower-cased):
1. On-chain: `useScaffoldEventHistory({ contractName: "BondingRegistry", eventName: "BondOwnerSet",
   filters: { bondOwner: safe }, fromBlock: <deployedOnBlock>, watch: true })` → the `operator` arg.
2. Manual "Add operator" (address or ENS), persisted under `localStorage["interfold.operators.<safe>"]`
   with every access wrapped in try/catch.
3. Fallback when logs are unavailable: Safe Transaction Service
   `GET https://safe-transaction-mainnet.safe.global/api/v1/safes/<safe>/multisig-transactions/?to=<registry>&executed=true`
   → `decodeFunctionData` each `data` with the registry ABI → collect the `operator` arg of
   `bondCiphernodeFor` / `registerOperatorFor` / `addTicketBalanceFor`.

Columns (one `useReadContracts` multicall per row, `refetchInterval` = pollingInterval):
`bondOwnerOf`, `getCiphernodeBond` vs required, `isRegistered`, `getTicketBalance`,
`availableTickets`, `isActive`, `hasExitInProgress`, `pendingExits`, `previewClaimable`, and the
hot wallet's ETH (`useBalance`) with a warning below 0.01 ETH — the node pays gas for duties and an
empty wallet silently misses them, which is what slashing punishes. Status pill priority:
`Exit in progress` > `Not bond-owned by this Safe` > `Needs bond` > `Needs registration` >
`Needs tickets` > `Active` (green only when `isActive === true`). Clicking a row opens view C.

### C. Per-operator wizard (state machine driven by reads)
Compute the current step from reads on every render; never store "step N done" locally.

| # | Gate (read) | Action when the gate fails | Notes |
|---|---|---|---|
| 0 | `bondOwnerOf(op) === safe` | Show: on the node run `interfold ciphernode set-bond-owner --owner <safe>`; in operator mode offer `setBondOwner(safe)` | If `bondOwnerOf` is some other address, show the `proposeBondOwner` → `acceptBondOwner` two-step instead of an error |
| 1 | `getCiphernodeBond(op) >= requiredCiphernodeBond` | 1a `FOLD.approve(registry, need)` if `allowance(safe, registry) < need`; 1b `bondCiphernodeFor(op, need)` | `need = required − currentBond`. Gate 1b on `allowance >= need && balanceOf(safe) >= need`, never on transferable balance |
| 2 | `isRegistered(op)` | `registerOperatorFor(op)` | Requires the full bond; reverts otherwise |
| 3 | `availableTickets(op) >= wanted` (default 1, user-adjustable) | 3a `sUSDS.approve(ticketToken, n·ticketPrice)` if allowance short; 3b `addTicketBalanceFor(op, n·ticketPrice)` | Show the USDS cost via `convertToAssets` |
| 4 | `isActive(op)` | If false while 0–3 pass: offer `refreshOperatorStatus(op)` (anyone may call) and surface `hasExitInProgress` | Done state: green, show tickets, bond, hot-wallet ETH |

Each action button: **Simulate** (always first; show the decoded error or "would succeed") →
**Propose to Safe** (or **Send** for an EOA) → status line
`Proposed · safeTxHash 0x… · waiting for on-chain change…` → auto-advances when the gating read
flips. Also render **Copy calldata** (`encodeFunctionData`) + target address + `value: 0` for every
action so the identical call can be pasted into the Safe Transaction Builder or ABI.ninja if a
connector misbehaves.

### Operator mode (hot wallet connected)
If the connected account is not a bond owner, or the user toggles "connecting a node's hot
wallet": show only `setBondOwner(<safe>)` (pre-filled from `NEXT_PUBLIC_SAFE_ADDRESS`) and
`deregisterOperatorFor(self)` (an operator may call it). Warn that the hot wallet must hold ETH
for gas and must never hold FOLD or sUSDS.

### Exit panel (per operator, collapsed by default, destructive styling)
- `removeTicketBalanceFor(op, amount)` — tickets → exit queue.
- `unbondCiphernodeFor(op, amount)` — bond → exit queue (node goes inactive below
  `ciphernodeBondActiveBps` of required; show that threshold).
- `deregisterOperatorFor(op)` — leaves the ciphernode registry and queues **both** bond and tickets.
- `claimExitsFor(op, maxTicket, maxBond)` — anyone may call after `exitDelay`; pays the **bond
  owner**. Enable only when `previewClaimable(op)` is non-zero; a non-zero `maxBond` requires the
  bond owner as caller.
All exits are blocked while a slash proposal is open (`OperatorUnderSlash`) — show that verbatim.

## Coding conventions for this page
- Reads: `useScaffoldReadContract({ contractName: "BondingRegistry", functionName, args, query: { refetchInterval } })`
  for singletons; `useReadContracts` with address/abi from `useDeployedContractInfo` for table rows.
- Writes: the `useSafeAwareWrite` pattern in `references/safe-and-se2.md`. Never `useScaffoldWriteContract`.
- Format with `formatUnits(x, 18)` + `Intl.NumberFormat`; inputs accept whole tokens/tickets and
  convert with `parseUnits`. Put the raw wei in a tooltip on every amount that will be sent.
- Errors: `getParsedError(error)` from `~~/utils/scaffold-eth` (index re-export). viem decodes
  custom errors with the ABI you passed to `simulateContract`/`writeContract`, and the shipped
  registry ABI includes every registry error **plus** the ERC-20/SafeERC20/FOLD-lock errors that
  bubble up from token pulls, so nested reverts decode too. (`getParsedErrorWithAllAbis(error, 1)` exists too, exported from
  `~~/utils/scaffold-eth/contract` — not the index; it only adds a selector lookup for signatures
  viem could not decode. Optional.) Map the common errors to plain English using the table in
  `references/contracts.md`.
- Addresses: SE-2 `<Address>` and `<AddressInput>`; ENS resolves via the mainnet client.
- Never hard-code 32000 / 1000 / 30 days in logic — read `requiredCiphernodeBond`, `ticketPrice`,
  `exitDelay`. Hard-coded addresses are fine (they live in `externalContracts.ts`).
- Chain 1 only. If `chain.id !== 1`, show a "switch to Ethereum mainnet" banner and disable writes.

## Verification checklist before claiming it works
1. `yarn next:check-types` (or `yarn lint && tsc --noEmit` in `packages/nextjs`) passes with the
   generated `externalContracts.ts`.
2. With no wallet connected, `/operators` renders the Safe's capacity from
   `NEXT_PUBLIC_SAFE_ADDRESS`, and the known operator `0x252a6c33C87C0b439671b983C3f730D2C46a5F1d`
   shows **Active**, bond 32,000, tickets 1 (live values on 2026-08-24 — re-read, do not assert).
3. Simulate every wizard action with `account: safe` against mainnet and confirm the expected
   outcome (e.g. `bondCiphernodeFor` for a fresh operator simulates to `NotBondOwner`; after
   set-bond-owner it simulates to an allowance error until approved).
4. Open the app inside app.safe.global as a custom Safe App (`http://localhost:3000`), confirm the
   `safe` connector auto-connects and the badge reads "Safe App". Propose one harmless call
   (`refreshOperatorStatus`) and confirm the UI shows "Proposed" and never hangs.
5. Fork test for writes: `yarn fork` (hardhat mainnet fork), point `rpcOverrides[1]` at it,
   `hardhat_impersonateAccount(safe)` + `hardhat_setBalance`, replay the wizard's copied calldata
   through a script, and confirm the table advances step by step.

## Reference files
- `references/contracts.md` — addresses, live parameters, every callable function with modifiers
  and semantics, spender table, exit mechanics, error → plain-English map.
- `references/safe-and-se2.md` — Safe App vs WalletConnect connection, why SE-2's transactor
  hangs, the `useSafeAwareWrite` hook, simulation, calldata export, Safe API operator discovery.
- `assets/externalContracts.ts` — drop-in for `packages/nextjs/contracts/externalContracts.ts`.
- `assets/manifest.json` — drop-in for `packages/nextjs/public/manifest.json`.
