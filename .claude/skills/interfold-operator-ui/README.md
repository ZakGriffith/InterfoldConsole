# interfold-operator-ui — Claude Code skill

A skill that teaches Claude Code how to build a Safe-friendly Interfold ciphernode operator
console inside a fresh Scaffold-ETH 2 clone.

## Install

```bash
git clone https://github.com/scaffold-eth/scaffold-eth-2 interfold-console
cd interfold-console && yarn install
mkdir -p .claude/skills
cp -r /path/to/interfold-operator-ui .claude/skills/interfold-operator-ui
```

Then in Claude Code inside that repo:

```
/interfold-operator-ui build the /operators page for the buidlguidl.eth Safe
```

or just describe the task — the skill description triggers automatically on Interfold / Safe /
externalContracts work.

## Contents

- `SKILL.md` — instructions Claude follows (setup steps, page architecture, gotchas, verification).
- `references/contracts.md` — addresses, live parameters, function semantics, errors.
- `references/safe-and-se2.md` — Safe App / WalletConnect handling and the write hook pattern.
- `assets/externalContracts.ts` — drop-in `packages/nextjs/contracts/externalContracts.ts` with
  verified ABIs (BondingRegistry, FOLD, sUSDS, tFOLD) on mainnet.
- `assets/manifest.json` — Safe App manifest for `packages/nextjs/public/manifest.json`.

Facts were verified on 2026-08-24; re-check `requiredCiphernodeBond`, `ticketPrice`, `exitDelay`
before relying on them — they are owner-settable.
