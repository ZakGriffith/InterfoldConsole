# Interfold contracts — operator/bond-owner reference (Ethereum mainnet, chainId 1)

Verified 2026-08-24 from Sourcify-verified source (`BondingRegistry.sol`, `BondingAssetLib.sol`,
`InterfoldToken.sol`, `InterfoldTicketToken.sol`) plus live `eth_call`s. Re-read anything marked
*live* before relying on it; parameters are owner-settable.

## Addresses

| Name | Address | Notes |
|---|---|---|
| BuidlGuidl Safe (buidlguidl.eth) | `0x97843608a00e2bbc75ab0C1911387E002565DEDE` | Safe v1.3.0, threshold **3 of 6** owners. The bond owner. |
| BondingRegistry (proxy) | `0x0ec90465095C21830BEcED07e032809A2Bd2915F` | ERC-1967 proxy. **All calls go here.** |
| BondingRegistry implementation | `0x4FF6e77A10E8f06C11a4DD2A71b6AB55394640e4` | Source of the ABI only; never call it directly. |
| CiphernodeRegistry | `0xC927A5B2d8F68697bC28C0670df05178c93df2d7` | `BondingRegistry.registry()`. Sortition lives here; the console does not need to call it. |
| FOLD (InterfoldToken) | `0xE172e9B6cfBeeB5593bDcE3f077356FDb33af904` | Bond token, 18 dec. Has wallet-lock logic. |
| sUSDS (Sky savings USDS, ERC-4626) | `0xa3931d71877C0E7a3148CB7Eb4463524FEc27fbD` | Ticket collateral, 18 dec. `asset()` = USDS. |
| USDS | `0xdC035D45d973E3EC169d2276DDab16f1e407384F` | Only relevant if minting sUSDS via `sUSDS.deposit(assets, receiver)`. |
| InterfoldTicketToken (tFOLD) | `0xC0B5b49a3949eC4B520eF21BaCFE16e3695F3B5D` | `BondingRegistry.ticketToken()`. Wraps sUSDS 1:1, non-transferable, 18 dec. **sUSDS approval spender.** |
| Known operator (node #1 hot wallet) | `0x252a6c33C87C0b439671b983C3f730D2C46a5F1d` | Bonded 32k, registered, 1 ticket, `isActive = true` on 2026-08-24. Use as the smoke-test row. |
| Registry owner (protocol multisig) | `0x652a31c669f9AB37f6040f279139a75D04F2679e` | Info only. |

## Live parameters (2026-08-24)

| Getter | Value | Meaning |
|---|---|---|
| `requiredCiphernodeBond()` | `32000000000000000000000` (32,000 FOLD) | Full bond needed to register. |
| `ciphernodeBondActiveBps()` | `8000` | Node stays *active* while bond ≥ 80 % of required (matters after partial unbond / slash). |
| `ticketPrice()` | `1000000000000000000000` (1,000 sUSDS shares) | `availableTickets = ticketBalance / ticketPrice` (integer division). |
| `minTicketBalance()` | `1` (wei) | Activation threshold on raw balance; effectively "non-zero". Tickets still need full 1,000 each. |
| `exitDelay()` | `2592000` s (30 days) | Queue time before `claimExitsFor` pays out. Bounds: 1 day … cap set in contract. |
| `numActiveOperators()` | 7 | Network-wide. |
| sUSDS `convertToAssets(1e18)` | `1.1073e18` USDS | Drifts upward daily (savings rate). |
| Safe FOLD `balanceOf` / `lockedBalanceOf` / `transferableBalanceOf` | 1,968,000 / 2,000,000 / 0 | 2M airdrop under lock policy `AIRDROP_24M_SEP1`: linear vest 2026-09-01 → 2028-08-31. 32k already bonded. |
| Safe `totalBonded` | 32,000 FOLD | Sum over all operators owned by the Safe. |
| Safe sUSDS `balanceOf` | ~1,209 | Enough for one more ticket. |

## Spender table (the #1 source of failed transactions)

| You want to call | Token to approve | `approve(spender, amount)` spender | Why |
|---|---|---|---|
| `bondCiphernodeFor` | FOLD | **BondingRegistry** `0x0ec9…915F` | `_bondCiphernode` → `BondingAssetLib.transferFromExact(FOLD, msg.sender, amount)`; the lib is delegatecalled so `address(this)` = registry. |
| `addTicketBalanceFor` | sUSDS | **InterfoldTicketToken** `0xC0B5…3B5D` | `_addTicketBalance` → `ticketToken.depositFrom(msg.sender, operator, amount)` → `sUSDS.safeTransferFrom(msg.sender, ticketToken, amount)`. |

Both pulls are "exact": fee-on-transfer would revert. Approving more than needed is harmless but
approve exactly what the next call will use so the Safe queue stays legible.

## Functions the console may call (all on the BondingRegistry proxy)

`onlyBondOwner(op)` ⇒ `msg.sender == bondOwnerOf(op)`. `noExitInProgress(op)` ⇒ reverts
`ExitInProgress` while a queued exit is not yet unlocked. `noOpenSlashProposal(op)` ⇒ reverts
`OperatorUnderSlash`.

### Ownership
| Function | Caller | Semantics |
|---|---|---|
| `setBondOwner(address bondOwner)` | **the operator (hot wallet)** | Records `bondOwnerOf(msg.sender) = bondOwner`. Emits `BondOwnerSet(operator, bondOwner)`. Done from the node with `interfold ciphernode set-bond-owner --owner <safe>`. Library-enforced rules about changing an existing owner with assets in place → use the two-step below. |
| `proposeBondOwner(op, newOwner)` | current bond owner | Starts a transfer; `pendingBondOwnerOf(op)`. |
| `acceptBondOwner(op)` | pending owner | Completes the transfer; reverts `BondOwnerTransferViolatesLock` if it would break FOLD lock accounting. |
| `bondOwnerOf(op)` / `pendingBondOwnerOf(op)` | view | |

### Bond
| Function | Modifiers | Semantics |
|---|---|---|
| `bondCiphernodeFor(op, amount)` | `nonReentrant noExitInProgress` + inline `NotBondOwner` check | Credits `_bondedByOwner[owner] += amount` and `operators[op].ciphernodeBond += amount` **before** pulling FOLD (this is why locked FOLD works). Emits `CiphernodeBondUpdated(op, +amount, newBond, "BOND")`. Partial amounts allowed; registration needs the full amount. |
| `unbondCiphernodeFor(op, amount)` | `nonReentrant noExitInProgress noOpenSlashProposal onlyBondOwner` | Moves `amount` to the exit queue; node may drop below active threshold. |
| `getCiphernodeBond(op)`, `isCiphernodeBonded(op)`, `totalBonded(owner)`, `requiredCiphernodeBond()` | view | |

### Registration
| Function | Modifiers | Semantics |
|---|---|---|
| `registerOperatorFor(op)` | `noExitInProgress onlyBondOwner` | Requires full bond and not banned; adds to CiphernodeRegistry; emits `OperatorActivationChanged` when status flips. |
| `deregisterOperatorFor(op)` | `noExitInProgress noOpenSlashProposal onlyBondOwnerOrOperator` | Removes from CiphernodeRegistry and **queues bond + ticket balance for exit** (`releaseAssets`). Emits `CiphernodeDeregistrationRequested(op, unlockAt)`. |
| `isRegistered(op)`, `isActive(op)`, `hasExitInProgress(op)`, `refreshOperatorStatus(op)` (anyone), `refreshOperatorStatuses(address[])` | | `isActive` also requires `op.eligibilityVersion == eligibilityConfigurationVersion`; after a protocol config bump, call `refreshOperatorStatus` to re-evaluate. |

### Tickets
| Function | Modifiers | Semantics |
|---|---|---|
| `addTicketBalanceFor(op, amount)` | `noExitInProgress onlyBondOwner` + `NotRegistered` check | Pulls `amount` sUSDS from caller into the ticket token, mints `amount` tFOLD **to the operator**. Emits `TicketBalanceUpdated(op, +amount, newBalance, "DEPOSIT")`. Must be registered first. |
| `removeTicketBalanceFor(op, amount)` | `noExitInProgress noOpenSlashProposal onlyBondOwner` | Burns tFOLD and queues the sUSDS for exit. |
| `getTicketBalance(op)`, `availableTickets(op)`, `ticketPrice()`, `minTicketBalance()`, `ticketToken()` | view | Ticket balance is snapshotted at `requestBlock − 1` for sortition; new tickets count from the next E3. |

### Exits
| Function | Caller | Semantics |
|---|---|---|
| `pendingExits(op) → (ticket, bond)` | view | Amounts queued (unlocked or not). |
| `previewClaimable(op) → (ticket, bond)` | view | Amounts whose `exitDelay` has elapsed. |
| `claimExitsFor(op, maxTicketAmount, maxBondAmount)` | anyone; **bond owner if `maxBondAmount != 0`** | `ticketToken.payout(bondOwner, ticket)` and FOLD `transfer(bondOwner, bond)` — proceeds always go to the **bond owner**, never the operator. Re-imposes the FOLD wallet lock automatically via the token formula. Emits `AssetsClaimed`. |

## Lock mechanics (why the Safe can bond but not sell)
InterfoldToken `_update` enforces
`transferable = balance − max(0, lockedBalance − BONDING_REGISTRY.totalBonded(account))`.
Bonding raises `totalBonded` first, so exactly the bonded amount becomes movable for the pull.
Unbond + claim lowers it again. `NO_MORE_LOCKS` sunset: 2030-09-17. TGE fired 2026-08-19 14:00 UTC.
Consequence for the UI: capacity for new nodes is `floor(balanceOf(safe) / requiredCiphernodeBond)`,
independent of vesting.

## Ticket mechanics (what the user is buying)
- tFOLD is minted 1:1 for sUSDS shares; sUSDS keeps accruing the Sky savings rate while wrapped.
- Sortition: each whole ticket scores `keccak256(node, ticketNumber, e3Id, seed)`; lowest wins;
  odds scale linearly with ticket count. Submission window ~600 s at launch.
- Slashing burns tFOLD (`slashTicketBalance`) and/or confiscates bond (`slashCiphernodeBond`) for
  missed duties or malicious behaviour; some policies execute immediately with no appeal. Exits are
  frozen while a proposal is open. Nothing in this console can prevent slashing except keeping the
  node online and its hot wallet funded with ETH.

## Errors → plain English (decode with `getParsedError`; all are in the shipped BondingRegistry ABI, including the ERC-20 ones that bubble up from token pulls)
| Error | Show the user |
|---|---|
| `NotBondOwner(caller, operator)` | "This wallet is not the bond owner for {operator}. Run set-bond-owner on the node first." |
| `NotRegistered()` | "Register the operator (`registerOperatorFor`) before adding tickets." |
| `ZeroAmount()` | "Amount must be greater than 0 (remember amounts are in 18-decimal wei)." |
| `ZeroAddress()` | "Operator address is empty." |
| `ExitInProgress()` | "An exit is queued for this operator; wait for `exitDelay` and claim it first." |
| `OperatorUnderSlash()` | "A slash proposal is open against this operator; exits are frozen until it resolves." |
| `InsufficientBalance()` | "Trying to remove more bond/tickets than the operator holds." |
| `Unauthorized()` | "Caller is not allowed (e.g. acceptBondOwner from a non-pending owner)." |
| `BondOwnerTransferViolatesLock(...)` | "Transferring ownership would break the FOLD lock accounting for the current owner." |
| ERC-20 `ERC20InsufficientAllowance(spender, allowance, needed)` / `SafeERC20FailedOperation` | "Approval missing or too small — check the spender (registry for FOLD, ticket token for sUSDS)." |
| FOLD `InsufficientUnlockedBalance(account, spendable, value)` | Should not occur for bonding; if it does the bond credit path changed — stop and re-verify the source. |

## Events worth rendering (all in the shipped ABI)
`BondOwnerSet(operator idx, bondOwner idx)` — operator discovery.
`CiphernodeBondUpdated(operator idx, int256 delta, newBond, bytes32 reason idx)` and
`TicketBalanceUpdated(operator idx, int256 delta, newBalance, bytes32 reason idx)` — activity log
(reason is a bytes32 tag such as BOND / UNBOND / DEPOSIT / WITHDRAW / SLASH).
`OperatorActivationChanged(operator idx, bool active)` — the "went inactive" alert.
`CiphernodeDeregistrationRequested(operator idx, uint64 unlockAt)`, `AssetsQueuedForExit(...)`,
`AssetsClaimed(...)`, `PendingAssetsSlashed(...)`.

## Off-chain facts the node side needs (for the instructions panel)
- Node CLI: `interfold ciphernode set-bond-owner --owner <safe>`, `interfold ciphernode status`,
  `interfold nodes ps`, `interfold nodes logs <name>`, `interfold config check`, `interfold wallet get`.
- Docker: container `ciphernode`, `docker logs -f ciphernode`; UDP 9091 must be open; TCP 50505 is
  the local control port and must stay localhost-only.
- Docs: https://docs.theinterfold.com/ciphernode-operators (running, registration,
  tickets-and-sortition, exits-and-slashing). Dashboard: https://dashboard.theinterfold.com/#operator
  (connect the hot wallet there, read-only is fine).
