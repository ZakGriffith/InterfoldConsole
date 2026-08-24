import { type Abi, ContractFunctionRevertedError, type Hex, decodeErrorResult } from "viem";
import externalContracts from "~~/contracts/externalContracts";
import { getParsedError } from "~~/utils/scaffold-eth/getParsedError";

const C = externalContracts[1];
/** Every custom error we ship (registry + FOLD + sUSDS + ticket token) for decoding nested reverts. */
const ALL_ERRORS_ABI: Abi = [C.BondingRegistry.abi, C.FOLD.abi, C.sUSDS.abi, C.InterfoldTicketToken.abi].flatMap(abi =>
  (abi as Abi).filter(x => x.type === "error"),
);

/**
 * Maps decoded revert names (registry, ERC-20, FOLD lock) to operator-facing sentences.
 * Input is whatever getParsedError() produced. Unknown errors pass through unchanged.
 */
const MAP: Array<[RegExp, string]> = [
  [/NotBondOwner/, "This wallet is not the bond owner for that operator. Run set-bond-owner on the node first."],
  [/NotRegistered/, "Register the operator (registerOperatorFor) before adding tickets."],
  [/AlreadyRegistered/, "This operator is already registered."],
  [/ZeroAmount/, "Amount must be greater than 0 (amounts are 18-decimal token wei)."],
  [/ZeroAddress/, "Operator address is empty."],
  [/ExitInProgress/, "An exit is queued for this operator; wait for the exit delay and claim it first."],
  [/ExitNotReady/, "The exit delay has not elapsed yet."],
  [/NothingToClaim/, "Nothing is claimable yet for this operator."],
  [/OperatorUnderSlash/, "A slash proposal is open against this operator; exits are frozen until it resolves."],
  [/InsufficientBalance/, "Trying to remove more bond or tickets than the operator holds."],
  [/InsufficientBond|NotCiphernodeBonded|NodeNotBonded/, "The full ciphernode bond must be posted before registering."],
  [/BondOwnerAlreadySet/, "A bond owner is already set for this operator. Use the propose -> accept transfer instead."],
  [/Unauthorized/, "Caller is not allowed (e.g. acceptBondOwner from a wallet that is not the pending owner)."],
  [
    /BondOwnerTransferViolatesLock/,
    "Transferring ownership would break the FOLD lock accounting for the current owner.",
  ],
  [/CiphernodeBanned|Banned/, "This operator is banned from the ciphernode registry."],
  [
    /ERC20InsufficientAllowance|SafeERC20FailedOperation|insufficient allowance|transfer amount exceeds allowance/i,
    "Approval missing or too small. Approve the right spender first: BondingRegistry for FOLD, InterfoldTicketToken for sUSDS.",
  ],
  [
    /ERC20InsufficientBalance|transfer amount exceeds balance|insufficient balance/i,
    "The bond owner does not hold enough of the token being pulled.",
  ],
  [
    /InsufficientUnlockedBalance/,
    "FOLD lock rejected the pull. This should not happen for bonding; stop and re-verify the token/registry versions.",
  ],
  [/User rejected|user rejected|rejected the request/i, "The wallet rejected the request."],
  [/Wallet not connected/i, "Connect a wallet first."],
];

export const explainError = (raw: string | undefined): string => {
  if (!raw) return "Unknown error.";
  for (const [re, text] of MAP) {
    if (re.test(raw)) return text;
  }
  return raw;
};

/** Pull just the `Name(args)` part out of a viem revert message for compact display. */
export const revertName = (raw: string | undefined): string | undefined => {
  if (!raw) return undefined;
  const m = raw.match(/([A-Z][A-Za-z0-9]+)\(([^)]*)\)/);
  return m ? `${m[1]}(${m[2]})` : undefined;
};

/**
 * Turns a viem/wagmi error into `Name(arg, …)` for custom errors, the string reason for
 * Error(string), or a readable message. SE-2's getParsedError walks to the innermost cause,
 * which for an RPC revert is the raw `{code, message, data}` object, so it reports only
 * "execution reverted"; this looks at the level viem already decoded first.
 */
export const parseContractError = (error: unknown): string => {
  const e = error as any;
  const walk = (fn: (x: any) => boolean): any => (typeof e?.walk === "function" ? e.walk(fn) : null);

  // 1. viem decoded it against the ABI passed to simulateContract / writeContract.
  const reverted = walk(x => x instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null;
  if (reverted?.data?.errorName) {
    const args = (reverted.data.args ?? []).map(a => String(a)).join(", ");
    return `${reverted.data.errorName}(${args})`;
  }
  if (reverted?.reason) return reverted.reason;

  // 2. Raw revert bytes somewhere in the chain: decode against every ABI we ship.
  const withData = walk(x => typeof x?.data === "string" && x.data.startsWith("0x") && x.data.length >= 10);
  if (withData) {
    try {
      const d = decodeErrorResult({ abi: ALL_ERRORS_ABI, data: withData.data as Hex });
      return `${d.errorName}(${(d.args ?? []).map(a => String(a)).join(", ")})`;
    } catch {
      /* unknown selector: fall through with the selector visible */
      return `Unknown revert ${String(withData.data).slice(0, 10)}`;
    }
  }

  // 3. Wallet / transport errors.
  return getParsedError(error);
};
