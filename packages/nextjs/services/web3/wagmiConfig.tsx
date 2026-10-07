import { wagmiConnectors } from "./wagmiConnectors";
import { Chain, createClient, fallback, http } from "viem";
import { hardhat, mainnet } from "viem/chains";
import { createConfig } from "wagmi";
import scaffoldConfig, { DEFAULT_ALCHEMY_API_KEY, ScaffoldConfig } from "~~/scaffold.config";
import { getAlchemyHttpUrl } from "~~/utils/scaffold-eth";

const { targetNetworks } = scaffoldConfig;

// One retry, not viem's three: a rate-limited RPC must not see every refused request four times.
const RETRY = { retryCount: 1 } as const;
const rpc = (url?: string) => http(url, RETRY);

// We always want to have mainnet enabled (ENS resolution, ETH price, etc). But only once.
export const enabledChains = targetNetworks.find((network: Chain) => network.id === 1)
  ? targetNetworks
  : ([...targetNetworks, mainnet] as const);

export const wagmiConfig = createConfig({
  chains: enabledChains,
  connectors: wagmiConnectors(),
  ssr: true,
  client({ chain }) {
    // Extra fallback for mainnet.
    const mainnetFallbackWithDefaultRPC = [rpc("https://mainnet.rpc.buidlguidl.com")];
    let rpcFallbacks = [...(chain.id === mainnet.id ? mainnetFallbackWithDefaultRPC : []), rpc()];

    const rpcOverrideUrl = (scaffoldConfig.rpcOverrides as ScaffoldConfig["rpcOverrides"])?.[chain.id];

    if (rpcOverrideUrl) {
      rpcFallbacks = [rpc(rpcOverrideUrl), ...rpcFallbacks];
    } else {
      const alchemyHttpUrl = getAlchemyHttpUrl(chain.id);
      if (alchemyHttpUrl) {
        const isUsingDefaultKey = scaffoldConfig.alchemyApiKey === DEFAULT_ALCHEMY_API_KEY;
        // If using default Scaffold-ETH 2 API key, we prioritize the default RPC
        rpcFallbacks = isUsingDefaultKey
          ? [...rpcFallbacks, rpc(alchemyHttpUrl)]
          : [rpc(alchemyHttpUrl), ...rpcFallbacks];
      }
    }

    return createClient({
      chain,
      transport: fallback(rpcFallbacks, RETRY),
      // Every eth_call issued in the same tick (ENS lookups, single reads) goes out as one
      // Multicall3 request. The RPC counts requests, not calls, so this is most of the budget.
      batch: { multicall: { batchSize: 32_768, wait: 16 } },
      ...(chain.id !== (hardhat as Chain).id
        ? {
            pollingInterval: scaffoldConfig.pollingInterval,
          }
        : {}),
    });
  },
});
