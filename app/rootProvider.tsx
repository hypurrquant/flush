"use client";
import { ReactNode, useState } from "react";
import { base } from "wagmi/chains";
import { OnchainKitProvider } from "@coinbase/onchainkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { getConfig } from "../lib/wagmi";
import "@coinbase/onchainkit/styles.css";

export function RootProvider({ children }: { children: ReactNode }) {
  const [config] = useState(() => getConfig());
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <OnchainKitProvider
          apiKey={process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY}
          rpcUrl={process.env.NEXT_PUBLIC_BASE_RPC_URL}
          projectId={process.env.NEXT_PUBLIC_PROJECT_ID}
          chain={base}
          config={{
            appearance: {
              name: "Flush",
              logo: "/blue-icon.png",
              theme: "base",
              mode: "auto",
            },
            wallet: {
              display: "modal",
              preference: "all", // 모든 지갑 표시 (EIP-6963 지원 지갑 포함)
            },
          }}
          miniKit={{
            enabled: true,
            autoConnect: true,
            notificationProxyUrl: undefined,
          }}
        >
          {children}
        </OnchainKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
