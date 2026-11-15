import { http, createConfig } from "wagmi";
import { injected } from "wagmi/connectors";
import { arcTestnet } from "@/lib/chain";

export const wagmiConfig = createConfig({
  chains: [arcTestnet],
  connectors: [injected()],
  transports: {
    [arcTestnet.id]: http(process.env.NEXT_PUBLIC_RPC_URL || "https://rpc.testnet.arc.io"),
  },
  ssr: true,
});
