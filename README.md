# Ciphernode Console

A dashboard for running [Interfold](https://theinterfold.com) ciphernodes when the wallet that posts the collateral is a **Gnosis Safe** (or any wallet). Interfold's own operator UI cannot connect a Safe or WalletConnect; this one can, and it handles many nodes at once.

**Live:** https://interfold-console.vercel.app · Built by [BuidlGuidl](https://buidlguidl.com) on Scaffold-ETH 2. Not affiliated with the Interfold team.

## What it does

- **Connect as the bond owner.** Open the site as a Safe App (Safe{Wallet} → Apps → My custom apps → add `https://interfold-console.vercel.app`), pair through WalletConnect, or connect a plain wallet. Nothing is shown until a wallet is connected.
- **See every node you fund.** Nodes that named your wallet as bond owner are found on-chain; each row shows status, bond, tickets and the node's gas balance.
- **Know whether each node is actually up, and on which version.** The Status pill is on-chain collateral only ("Eligible"). The Software column comes from a probe that dials each node's libp2p port every 10 minutes and reads the version the node announces; nothing runs on the node. See *Node liveness probe* below.
- **Set a node up in four steps:** authorize the bond owner (sent by the node's own key), bond 32,000 FOLD, register, buy sUSDS tickets. Each step is simulated as the bond owner before it is sent, and Safe proposals are never awaited; the page follows the chain.
- **One Safe transaction instead of five.** Approve, bond, register, approve and buy tickets are bundled into a single MultiSend proposal, for one node or several.
- **Or export the bundle.** Download a Safe Transaction Builder file that any signer imports to create the same bundle. This works with no wallet connected: paste a node's operator key on the *Set up a node* tab and get the file.
- **Requirements checked live:** FOLD for the bond (locked or vesting FOLD counts), sUSDS per ticket (it must be sUSDS, not USDS) and ETH on the node's hot wallet.
- **Later:** buy more tickets, unbond, remove tickets, deregister and claim exits.

## For node operators

On the machine running the node, print its operator key and authorize the wallet that will fund it:

```
interfold wallet get
interfold ciphernode set-bond-owner --owner <bond-owner-address>
```

Keep that hot wallet topped up with a little ETH (it pays gas for the node's duties) and never hold FOLD or sUSDS on it. The bond owner does the rest from the console.

`interfold-peers.sh` (repo root) samples UDP 9091 with tcpdump on the node host to show how many peers you are exchanging traffic with. Run it with sudo on the node, not in the browser.

## Node liveness probe

Optional. Everything else works without it.

A ciphernode answers the standard libp2p identify handshake to any peer that connects to it, and in that answer it announces `interfold-ciphernode/<version>`. The registry cannot tell you this, and nothing on-chain links an operator key to a machine, so the console asks each operator for one thing, once: the node's libp2p peer ID (`interfold net get-peer-id`, stable across IP changes, not secret). They paste it under *Monitoring* on the *Set up a node* page; the bond owner can also paste it from the node's guide. Changing an existing entry needs a signature from the operator key or the bond owner.

`probe/probe.mjs` reads that registry, looks each peer ID up in the network's DHT, dials the node wherever it is now, and records whether it answered and which version it reported. `.github/workflows/probe.yaml` runs it every 10 minutes and publishes `probe.json` on the `probe-data` branch (one force-pushed commit, so the branch never grows). The console fetches that file and shows the result in the Software column and on each node's page.

To turn it on for your own deployment:

1. Add an Upstash Redis store (Vercel Marketplace → Upstash, or any Upstash database) and set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` on the deployment. Without them the API answers `enabled: false` and the UI hides itself.
2. Set the repo variable `PEER_REGISTRY_URL` to `https://<your console>/api/peer-ids` so the workflow reads your registry, and `NEXT_PUBLIC_PROBE_URL` to your fork's `probe-data` raw URL.
3. Enable the "Probe ciphernodes" workflow and run it once by hand.

`probe/nodes.json` accepts fixed entries (a public IP or a peer ID) for nodes you do not want to register through the UI. To run the probe locally:

```
cd probe && npm install && npm run probe
```

The probe also dials the Interfold bootstrap peer, which seeds the DHT and acts as a control: if that fails the run is marked failed, because then the probe itself is broken rather than your nodes. The probe presents the network identity a node expects (network id, protocol version, mainnet deployment fingerprint) so nodes accept the connection; those constants are in `probe/probe.mjs` and follow `crates/net/src/network.rs` in the Interfold repo. A contract redeploy or a protocol version bump means updating them.

"Answered on 0.16.0" proves the process is up, reachable and on that build. It does not prove the node has synced chain events or holds its key material.

## Run it yourself

```
yarn install
yarn start        # http://localhost:3000, Ethereum mainnet only
```

Copy `packages/nextjs/.env.example` to `.env.local` and set `NEXT_PUBLIC_ALCHEMY_API_KEY` for reliable node discovery. Deploys to Vercel with `yarn vercel:yolo --prod`.

Code lives in `packages/nextjs`: `components/interfold/` (pages and panels), `hooks/interfold/` (reads, the Safe-aware write and batch hooks), `utils/interfold/` (batch planner, Transaction Builder export, error decoding), `contracts/externalContracts.ts` (verified ABIs). Contract notes for contributors: `.claude/skills/interfold-operator-ui/`.

## Contracts (Ethereum mainnet)

| | Address |
|---|---|
| BondingRegistry | `0x0ec90465095C21830BEcED07e032809A2Bd2915F` |
| FOLD | `0xE172e9B6cfBeeB5593bDcE3f077356FDb33af904` |
| sUSDS | `0xa3931d71877C0E7a3148CB7Eb4463524FEc27fbD` |
| InterfoldTicketToken | `0xC0B5b49a3949eC4B520eF21BaCFE16e3695F3B5D` |

Two things that trip people up: FOLD is approved to the **BondingRegistry**, sUSDS is approved to the **InterfoldTicketToken**; and every amount is in 18-decimal wei, so 32,000 FOLD is `32000000000000000000000`. The console gets both right for you.

## License

MIT. Built on [Scaffold-ETH 2](https://scaffoldeth.io).
