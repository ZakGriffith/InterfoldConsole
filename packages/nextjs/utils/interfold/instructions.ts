import { type Address } from "viem";
import { LINKS } from "~~/utils/interfold/contracts";
import { fmtTokens } from "~~/utils/interfold/format";

type Params = { requiredCiphernodeBond: bigint; ticketPrice: bigint } | undefined;

/**
 * Plain-text brief to hand to the person running a ciphernode whose collateral this bond owner
 * will post. Everything they must do happens on their node; everything else happens here.
 */
export const operatorInstructions = (owner: Address, params: Params, ownerName?: string): string => {
  const who = ownerName ? `${ownerName} (${owner})` : owner;
  const bond = params ? fmtTokens(params.requiredCiphernodeBond, "FOLD") : "the ciphernode bond";
  const ticket = params ? fmtTokens(params.ticketPrice, "sUSDS") : "the ticket price";
  return [
    `Interfold ciphernode onboarding for bond owner ${who}`,
    ``,
    `1. Run your ciphernode and note its operator key (the address the node signs with):`,
    `     interfold wallet get`,
    `   Fund that hot wallet with a little ETH for gas (keep it above 0.01 ETH). Never hold FOLD or sUSDS on it.`,
    ``,
    `2. Authorize the bond owner. This is sent by your operator key and lets the bond owner post collateral for you:`,
    `     interfold ciphernode set-bond-owner --owner ${owner}`,
    ``,
    `3. Send the bond owner your operator key address. They will then bond ${bond}, register the node, and buy`,
    `   tickets (${ticket} each) from their wallet; nothing else is needed from you on-chain.`,
    ``,
    `4. Keep the node online. A registered node that misses duties is slashable; check with:`,
    `     interfold ciphernode status`,
    ``,
    `Docs: ${LINKS.docs}`,
    `Official dashboard (read-only with your operator key): ${LINKS.dashboard}`,
  ].join("\n");
};
