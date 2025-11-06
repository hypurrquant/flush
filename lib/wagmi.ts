import { http, cookieStorage, createConfig, createStorage } from 'wagmi';
import { base } from 'wagmi/chains';
import { coinbaseWallet, injected } from 'wagmi/connectors';

export function getConfig() {
  const config = createConfig({
    chains: [base],
    connectors: [
      coinbaseWallet({
        appName: 'Flush',
      }),
      injected(), // EIP-6963 지원 지갑 (Rabby 포함)
    ],
    storage: createStorage({
      storage: cookieStorage,
    }),
    ssr: true,
    transports: {
      [base.id]: http(),
    },
  });

  return config;
}

declare module 'wagmi' {
  interface Register {
    config: ReturnType<typeof getConfig>;
  }
}

