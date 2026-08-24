// Checklist item 5 (run from packages/nextjs with `yarn fork` running: `node ../../.claude/skills/interfold-operator-ui/assets/forktest.mjs`): replay the wizard's calldata on a hardhat mainnet fork, impersonating the Safe,
// and confirm the fleet reads advance step by step for the unbonded operator 0xCdc8….
import { createPublicClient, createTestClient, createWalletClient, http, parseUnits, encodeFunctionData, formatUnits, decodeErrorResult } from "viem";
import { mainnet } from "viem/chains";
import fs from "node:fs";

const src = fs.readFileSync("./contracts/externalContracts.ts", "utf8");
const body = src.slice(src.indexOf("const externalContracts = ") + "const externalContracts = ".length, src.lastIndexOf("as const"));
const C = eval("(" + body + ")")[1];
const REG = C.BondingRegistry, FOLD = C.FOLD, SUSDS = C.sUSDS, TT = C.InterfoldTicketToken;
const SAFE = "0x97843608a00e2bbc75ab0C1911387E002565DEDE";
const OP2 = "0xCdc8B4379dDF736f8e34B0A65585E07dE7060A84";
const RPC = "http://127.0.0.1:8545";

const chain = { ...mainnet, id: 31337 };
const pub = createPublicClient({ chain, transport: http(RPC) });
const test = createTestClient({ chain, mode: "hardhat", transport: http(RPC) });
const wallet = createWalletClient({ chain, transport: http(RPC) });
const f = x => Number(formatUnits(x, 18)).toLocaleString();

const status = async label => {
  const fns = ["bondOwnerOf", "getCiphernodeBond", "isRegistered", "isActive", "availableTickets", "getTicketBalance"];
  const r = await Promise.all(fns.map(functionName => pub.readContract({ address: REG.address, abi: REG.abi, functionName, args: [OP2] })));
  const [foldAllow, susdsAllow, foldBal, susdsBal, bonded] = await Promise.all([
    pub.readContract({ address: FOLD.address, abi: FOLD.abi, functionName: "allowance", args: [SAFE, REG.address] }),
    pub.readContract({ address: SUSDS.address, abi: SUSDS.abi, functionName: "allowance", args: [SAFE, TT.address] }),
    pub.readContract({ address: FOLD.address, abi: FOLD.abi, functionName: "balanceOf", args: [SAFE] }),
    pub.readContract({ address: SUSDS.address, abi: SUSDS.abi, functionName: "balanceOf", args: [SAFE] }),
    pub.readContract({ address: REG.address, abi: REG.abi, functionName: "totalBonded", args: [SAFE] }),
  ]);
  console.log(`[${label}] owner=${r[0] === SAFE ? "safe" : r[0]} bond=${f(r[1])} registered=${r[2]} active=${r[3]} tickets=${r[4]} ticketBal=${f(r[5])} | safe: FOLD=${f(foldBal)} sUSDS=${f(susdsBal)} totalBonded=${f(bonded)} allowFOLD=${f(foldAllow)} allowSUSDS=${f(susdsAllow)}`);
  return r;
};

// Exactly what the UI's "Copy calldata" produces.
const calldata = (abi, functionName, args) => encodeFunctionData({ abi, functionName, args });
const send = async (label, to, data) => {
  try {
    const hash = await wallet.sendTransaction({ account: SAFE, to, data, chain });
    const rc = await pub.waitForTransactionReceipt({ hash });
    console.log(`  ${label}: ${rc.status} gas=${rc.gasUsed}`);
    return rc.status === "success";
  } catch (e) {
    const w = e.walk?.(x => typeof x?.data === "string" && x.data.startsWith("0x")) ?? null;
    let dec = "";
    if (w) { try { const d = decodeErrorResult({ abi: [...REG.abi, ...FOLD.abi], data: w.data }); dec = `${d.errorName}(${d.args ?? ""})`; } catch { dec = w.data.slice(0, 10); } }
    console.log(`  ${label}: FAILED ${dec || (e.shortMessage ?? e.message).slice(0, 140)}`);
    return false;
  }
};

console.log("fork block:", await pub.getBlockNumber());
await test.impersonateAccount({ address: SAFE });
await test.setBalance({ address: SAFE, value: parseUnits("10", 18) });
const [, bond0] = await status("start");
const required = await pub.readContract({ address: REG.address, abi: REG.abi, functionName: "requiredCiphernodeBond" });
const price = await pub.readContract({ address: REG.address, abi: REG.abi, functionName: "ticketPrice" });
const need = required - bond0;

// Step 3a/3b
await send("FOLD.approve(registry, need)", FOLD.address, calldata(FOLD.abi, "approve", [REG.address, need]));
await send("bondCiphernodeFor(OP2, need)  [locked FOLD, transferable=0]", REG.address, calldata(REG.abi, "bondCiphernodeFor", [OP2, need]));
await status("after bond");
// Step 4
await send("registerOperatorFor(OP2)", REG.address, calldata(REG.abi, "registerOperatorFor", [OP2]));
await status("after register");
// Step 5a/5b (1 ticket)
await send("sUSDS.approve(ticketToken, price)", SUSDS.address, calldata(SUSDS.abi, "approve", [TT.address, price]));
await send("addTicketBalanceFor(OP2, price)", REG.address, calldata(REG.abi, "addTicketBalanceFor", [OP2, price]));
await status("after tickets");
// Negative checks the UI guards against
await send("NEGATIVE addTicketBalanceFor(OP2, 2 wei) [should succeed but buy 0 tickets]", REG.address, calldata(REG.abi, "addTicketBalanceFor", [OP2, 2n]));
await status("after 2-wei deposit");
await send("NEGATIVE bondCiphernodeFor(OP2, 1) with allowance 0", REG.address, calldata(REG.abi, "bondCiphernodeFor", [OP2, 1n]));
// Exit path
await send("unbondCiphernodeFor(OP2, 1 FOLD)", REG.address, calldata(REG.abi, "unbondCiphernodeFor", [OP2, parseUnits("1", 18)]));
const pe = await pub.readContract({ address: REG.address, abi: REG.abi, functionName: "pendingExits", args: [OP2] });
const pc = await pub.readContract({ address: REG.address, abi: REG.abi, functionName: "previewClaimable", args: [OP2] });
console.log("  pendingExits:", pe.map(String), "previewClaimable:", pc.map(String));
await send("NEGATIVE claimExitsFor(OP2, 0, 1 FOLD) before exitDelay", REG.address, calldata(REG.abi, "claimExitsFor", [OP2, 0n, parseUnits("1", 18)]));
const exitDelay = await pub.readContract({ address: REG.address, abi: REG.abi, functionName: "exitDelay" });
await test.increaseTime({ seconds: Number(exitDelay) + 60 });
await test.mine({ blocks: 1 });
const pc2 = await pub.readContract({ address: REG.address, abi: REG.abi, functionName: "previewClaimable", args: [OP2] });
console.log("  previewClaimable after exitDelay:", pc2.map(String));
await send("claimExitsFor(OP2, 0, claimable bond) after exitDelay", REG.address, calldata(REG.abi, "claimExitsFor", [OP2, 0n, pc2[1]]));
await status("after claim");
