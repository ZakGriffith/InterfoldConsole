import { type Abi, type AbiFunction, type Address, type Hex, encodeFunctionData, keccak256, toHex } from "viem";
import { type OperatorStatus } from "~~/hooks/interfold/useFleetStatus";
import { type OwnerFunds } from "~~/hooks/interfold/useOwnerFunds";
import { type RegistryParams } from "~~/hooks/interfold/useRegistryParams";
import { FOLD, REGISTRY, SUSDS, TICKET_TOKEN } from "~~/utils/interfold/contracts";
import { fmtTokens, maxBig, sameAddr } from "~~/utils/interfold/format";

/** One inner call of a Safe MultiSend batch (always value 0 here). */
export type BatchCall = {
  to: Address;
  data: Hex;
  abi: Abi;
  functionName: string;
  args: readonly unknown[];
  /** Human line for the plan table. */
  summary: string;
  /** Which node this call is for (approvals are shared and have none). */
  operator?: Address;
};

export const contractName = (a: Address): string =>
  sameAddr(a, REGISTRY.address)
    ? "BondingRegistry"
    : sameAddr(a, FOLD.address)
      ? "FOLD"
      : sameAddr(a, SUSDS.address)
        ? "sUSDS"
        : sameAddr(a, TICKET_TOKEN.address)
          ? "InterfoldTicketToken"
          : a;

export const makeCall = (
  to: Address,
  abi: Abi,
  functionName: string,
  args: readonly unknown[],
  summary: string,
  operator?: Address,
): BatchCall => ({
  to,
  abi,
  functionName,
  args,
  summary,
  operator,
  data: encodeFunctionData({ abi, functionName, args: args as any }),
});

export type PlanNode = { operator: Address; status?: OperatorStatus; label?: string; ticketsWanted?: bigint };

export type Plan = {
  calls: BatchCall[];
  /** Nodes that could not be included and why. */
  skipped: { operator: Address; reason: string }[];
  totalFold: bigint;
  totalSusds: bigint;
  warnings: string[];
};

/**
 * Compiles every remaining bond-owner step for the given nodes into one ordered call list:
 * approve FOLD once (sum) → bond each → register each → approve sUSDS once (sum) → tickets each.
 * Nothing is included for nodes that have not authorized this bond owner; that step belongs to the
 * node's own key and cannot ride in a Safe batch. Amounts are 18-decimal wei throughout.
 */
export const planOnboarding = (
  owner: Address,
  nodes: PlanNode[],
  params: RegistryParams | undefined,
  funds: OwnerFunds | undefined,
  opts?: {
    /** Build the calls even if the node has not named this owner yet (offline export for a Safe that will). */
    assumeAuthorized?: boolean;
  },
): Plan => {
  const calls: BatchCall[] = [];
  const skipped: Plan["skipped"] = [];
  const warnings: string[] = [];
  if (!params) return { calls, skipped, totalFold: 0n, totalSusds: 0n, warnings: ["Registry parameters not loaded."] };

  type Ready = { op: Address; need: bigint; register: boolean; ticketCost: bigint; label?: string };
  const ready: Ready[] = [];
  const minTickets = maxBig(1n, params.minTicketBalance);

  for (const n of nodes) {
    const s = n.status;
    if (!s) {
      skipped.push({ operator: n.operator, reason: "status not loaded yet" });
      continue;
    }
    if (!opts?.assumeAuthorized && !sameAddr(s.bondOwner, owner)) {
      skipped.push({
        operator: n.operator,
        reason:
          s.bondOwner === "0x0000000000000000000000000000000000000000"
            ? "node has not run set-bond-owner yet"
            : "bond owner is another wallet",
      });
      continue;
    }
    if (s.exitInProgress) {
      skipped.push({ operator: n.operator, reason: "exit in progress" });
      continue;
    }
    const need = maxBig(params.requiredCiphernodeBond - s.bond, 0n);
    const willBeBonded = s.bond + need >= params.requiredCiphernodeBond;
    const register = !s.isRegistered && willBeBonded;
    const wanted = n.ticketsWanted ?? maxBig(minTickets - s.availableTickets, 0n);
    const ticketCost = s.isRegistered || register ? wanted * params.ticketPrice : 0n;
    if (need === 0n && !register && ticketCost === 0n) {
      skipped.push({ operator: n.operator, reason: "nothing left to do" });
      continue;
    }
    ready.push({ op: n.operator, need, register, ticketCost, label: n.label });
  }

  const totalFold = ready.reduce((a, r) => a + r.need, 0n);
  const totalSusds = ready.reduce((a, r) => a + r.ticketCost, 0n);
  const tag = (r: Ready) => (r.label ? `${r.label} (${r.op.slice(0, 6)}…)` : `${r.op.slice(0, 6)}…${r.op.slice(-4)}`);

  if (totalFold > 0n && (!funds || funds.foldAllowance < totalFold)) {
    calls.push(
      makeCall(
        FOLD.address,
        FOLD.abi as Abi,
        "approve",
        [REGISTRY.address, totalFold],
        `Approve ${fmtTokens(totalFold, "FOLD")} for the BondingRegistry`,
      ),
    );
  }
  for (const r of ready)
    if (r.need > 0n)
      calls.push(
        makeCall(
          REGISTRY.address,
          REGISTRY.abi as Abi,
          "bondCiphernodeFor",
          [r.op, r.need],
          `Bond ${fmtTokens(r.need, "FOLD")} for ${tag(r)}`,
          r.op,
        ),
      );
  for (const r of ready)
    if (r.register)
      calls.push(
        makeCall(REGISTRY.address, REGISTRY.abi as Abi, "registerOperatorFor", [r.op], `Register ${tag(r)}`, r.op),
      );
  if (totalSusds > 0n && (!funds || funds.susdsAllowance < totalSusds)) {
    calls.push(
      makeCall(
        SUSDS.address,
        SUSDS.abi as Abi,
        "approve",
        [TICKET_TOKEN.address, totalSusds],
        `Approve ${fmtTokens(totalSusds, "sUSDS")} for the InterfoldTicketToken`,
      ),
    );
  }
  for (const r of ready)
    if (r.ticketCost > 0n)
      calls.push(
        makeCall(
          REGISTRY.address,
          REGISTRY.abi as Abi,
          "addTicketBalanceFor",
          [r.op, r.ticketCost],
          `Buy ${(r.ticketCost / params.ticketPrice).toString()} ticket(s) (${fmtTokens(r.ticketCost, "sUSDS")}) for ${tag(r)}`,
          r.op,
        ),
      );

  if (funds && totalFold > funds.foldBalance)
    warnings.push(
      `Needs ${fmtTokens(totalFold, "FOLD")} but the bond owner holds ${fmtTokens(funds.foldBalance, "FOLD")}.`,
    );
  if (funds && totalSusds > funds.susdsBalance)
    warnings.push(
      `Needs ${fmtTokens(totalSusds, "sUSDS")} but the bond owner holds ${fmtTokens(funds.susdsBalance, "sUSDS")}.`,
    );

  return { calls, skipped, totalFold, totalSusds, warnings };
};

// ---------------------------------------------------------------------------
// Safe Transaction Builder export (Safe → Apps → Transaction Builder → upload JSON)
// ---------------------------------------------------------------------------

const stringifyReplacer = (_: string, value: unknown) => (value === undefined ? null : value);
const serializeJSONObject = (json: any): string => {
  if (Array.isArray(json)) return `[${json.map(el => serializeJSONObject(el)).join(",")}]`;
  if (typeof json === "object" && json !== null) {
    let acc = "";
    const keys = Object.keys(json).sort();
    acc += `{${JSON.stringify(keys, stringifyReplacer)}`;
    for (let i = 0; i < keys.length; i++) acc += `${serializeJSONObject(json[keys[i]])},`;
    return `${acc}}`;
  }
  return `${JSON.stringify(json, stringifyReplacer)}`;
};
/** Same algorithm as safe-global/safe-react-apps tx-builder `calculateChecksum`. */
const checksum = (file: Record<string, unknown> & { meta: Record<string, unknown> }) =>
  keccak256(toHex(serializeJSONObject({ ...file, meta: { ...file.meta, name: null } })));

export const txBuilderJson = (
  calls: BatchCall[],
  safe: Address,
  name: string,
  description: string,
  createdAt: number,
): string => {
  const transactions = calls.map(c => {
    const fn = (c.abi as readonly AbiFunction[]).find(x => x.type === "function" && x.name === c.functionName);
    const inputs = fn?.inputs ?? [];
    return {
      to: c.to,
      value: "0",
      data: c.data,
      contractMethod: fn
        ? {
            inputs: inputs.map(i => ({ internalType: i.internalType ?? i.type, name: i.name ?? "", type: i.type })),
            name: fn.name,
            payable: false,
          }
        : null,
      contractInputsValues: fn
        ? Object.fromEntries(inputs.map((i, k) => [i.name ?? `arg${k}`, String(c.args[k])]))
        : null,
    };
  });
  const file = {
    version: "1.0",
    chainId: "1",
    createdAt,
    meta: {
      name,
      description,
      txBuilderVersion: "1.17.1",
      createdFromSafeAddress: safe,
      createdFromOwnerAddress: "",
      checksum: "",
    },
    transactions,
  };
  // Reference validateChecksum deletes the key before hashing; a present-but-undefined key would hash differently.
  const { checksum: _omit, ...metaWithoutChecksum } = file.meta;
  void _omit;
  file.meta.checksum = checksum({ ...file, meta: metaWithoutChecksum });
  return JSON.stringify(file, null, 2);
};
