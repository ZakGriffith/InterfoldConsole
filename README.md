# Ciphernode Console (BuidlGuidl)

An independent Scaffold-ETH 2 app (not affiliated with Interfold) that gives a bond owner that is a **Gnosis Safe** the full operator flow of [dashboard.theinterfold.com](https://dashboard.theinterfold.com/#operator), which cannot connect a Safe or WalletConnect. It bonds 32k FOLD, registers, buys sUSDS tickets, monitors and exits Interfold ciphernodes, for many nodes at once.

- **Run it:** `yarn install && yarn start` → http://localhost:3000 (mainnet only; no local chain needed).
- **As a Safe App:** app.safe.global → Apps → *My custom apps* → *Add custom Safe App* → `http://localhost:3000` (or the deployed URL). The `safe` connector auto-connects. WalletConnect from Safe{Wallet} works too.
- **Keys:** copy `packages/nextjs/.env.example` to `.env.local`. `NEXT_PUBLIC_ALCHEMY_API_KEY` makes operator discovery (`BondOwnerSet` event scan) reliable. Nothing is shown until a wallet connects; the bond owner is always the connected Safe (or, for a node's hot wallet, the Safe it names).
- **Where things live:** page `packages/nextjs/app/page.tsx` → `components/interfold/*` (wizard, fleet table, exit panel), `hooks/interfold/*` (reads + the Safe-aware write hook), `utils/interfold/*`, contracts in `contracts/externalContracts.ts`, theme (its own dark look, not Interfold's) in `styles/interfold.css`.
- **Batching:** any node whose operator has run `set-bond-owner` can have approve → bond → register → approve → tickets proposed as **one** Safe transaction (per node in its guide, or several nodes at once via the fleet table checkboxes). The whole batch is pre-flighted with `eth_simulateV1` as the Safe; delivery is EIP-5792 `wallet_sendCalls` (one MultiSend proposal inside the Safe App / Safe{Wallet}), with a Transaction Builder JSON export as the fallback. `setBondOwner` itself is sent by each node key and never needs Safe signatures.
- **Every write is simulated first** with `from = bond owner` (an `eth_call`, no signature) and the exact calldata can be copied for the Safe Transaction Builder / abi.ninja. Safe writes resolve to a *safeTxHash* and are never awaited; the UI advances from polled reads.
- Background and contract facts: `.claude/skills/interfold-operator-ui/`.

---

# 🏗 Scaffold-ETH 2

<h4 align="center">
  <a href="https://docs.scaffoldeth.io">Documentation</a> |
  <a href="https://scaffoldeth.io">Website</a>
</h4>

🧪 An open-source, up-to-date toolkit for building decentralized applications (dapps) on the Ethereum blockchain. It's designed to make it easier for developers to create and deploy smart contracts and build user interfaces that interact with those contracts.

> [!NOTE]
> 🤖 Scaffold-ETH 2 is AI-ready! It has everything agents need to build on Ethereum. Check `.agents/`, `.claude/`, `.opencode` or `.cursor/` for more info.

⚙️ Built using NextJS, RainbowKit, Foundry/Hardhat, Wagmi, Viem, and Typescript.

- ✅ **Contract Hot Reload**: Your frontend auto-adapts to your smart contract as you edit it.
- 🪝 **[Custom hooks](https://docs.scaffoldeth.io/hooks/)**: Collection of React hooks wrapper around [wagmi](https://wagmi.sh/) to simplify interactions with smart contracts with typescript autocompletion.
- 🧱 [**Components**](https://docs.scaffoldeth.io/components/): Collection of common web3 components to quickly build your frontend.
- 🔥 **Burner Wallet & Local Faucet**: Quickly test your application with a burner wallet and local faucet.
- 🔐 **Integration with Wallet Providers**: Connect to different wallet providers and interact with the Ethereum network.

![Debug Contracts tab](https://github.com/scaffold-eth/scaffold-eth-2/assets/55535804/b237af0c-5027-4849-a5c1-2e31495cccb1)

## Requirements

Before you begin, you need to install the following tools:

- [Node (>= v22.10.0)](https://nodejs.org/en/download/)
- Yarn ([v1](https://classic.yarnpkg.com/en/docs/install/) or [v2+](https://yarnpkg.com/getting-started/install))
- [Git](https://git-scm.com/downloads)

## Quickstart

To get started with Scaffold-ETH 2, follow the steps below:

1. Install the latest version of Scaffold-ETH 2

```
npx create-eth@latest
```

This command will install all the necessary packages and dependencies, so it might take a while.

> [!NOTE]
> You can also initialize your project with one of our extensions to add specific features or starter-kits. Learn more in our [extensions documentation](https://docs.scaffoldeth.io/extensions/).

2. Run a local network in the first terminal:

```
yarn chain
```

This command starts a local Ethereum network that runs on your local machine and can be used for testing and development. Learn how to [customize your network configuration](https://docs.scaffoldeth.io/quick-start/environment#1-initialize-a-local-blockchain).

3. On a second terminal, deploy the test contract:

```
yarn deploy
```

This command deploys a test smart contract to the local network. You can find more information about how to customize your contract and deployment script in our [documentation](https://docs.scaffoldeth.io/quick-start/environment#2-deploy-your-smart-contract).

4. On a third terminal, start your NextJS app:

```
yarn start
```

Visit your app on: `http://localhost:3000`. You can interact with your smart contract using the `Debug Contracts` page. You can tweak the app config in `packages/nextjs/scaffold.config.ts`.

**What's next**:

Visit the [What's next section of our docs](https://docs.scaffoldeth.io/quick-start/environment#whats-next) to learn how to:

- Edit your smart contracts
- Edit your deployment scripts
- Customize your frontend
- Edit the app config
- Writing and running tests
- [Setting up external services and API keys](https://docs.scaffoldeth.io/deploying/deploy-smart-contracts#configuration-of-third-party-services-for-production-grade-apps)

## Documentation

Visit our [docs](https://docs.scaffoldeth.io) to learn all the technical details and guides of Scaffold-ETH 2.

To know more about its features, check out our [website](https://scaffoldeth.io).

## Contributing to Scaffold-ETH 2

We welcome contributions to Scaffold-ETH 2!

Please see [CONTRIBUTING.MD](https://github.com/scaffold-eth/scaffold-eth-2/blob/main/CONTRIBUTING.md) for more information and guidelines for contributing to Scaffold-ETH 2.
