const ROOT_URL =
  process.env.NEXT_PUBLIC_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3000');

/**
 * MiniApp configuration object. Must follow the Farcaster MiniApp specification.
 *
 * @see {@link https://miniapps.farcaster.xyz/docs/guides/publishing}
 */
export const minikitConfig = {
  accountAssociation: {
    header: "",
    payload: "",
    signature: ""
  },
  baseBuilder: {
    ownerAddress: "0x..."
  },
  miniapp: {
    version: "1",
    name: "Flush", 
    subtitle: "Multiswap your tokens at once", 
    description: "Multiswap your tokens into one with a single transaction. Clean up dust tokens, consolidate your portfolio, and save on gas fees effortlessly.",
    screenshotUrls: [
      `${ROOT_URL}/screenshot.png`,
      `${ROOT_URL}/screenshot-portrait.png`
    ],
    iconUrl: `${ROOT_URL}/icon.png`,
    splashImageUrl: `${ROOT_URL}/splash.png`,
    splashBackgroundColor: "#0052FF",
    homeUrl: ROOT_URL,
    webhookUrl: `${ROOT_URL}/api/webhook`,
    primaryCategory: "finance",
    tags: ["finance", "defi", "swap", "wallet", "base"],
    heroImageUrl: `${ROOT_URL}/hero.png`, 
    tagline: "Multiswap tokens in one tap",
    ogTitle: "Flush - Multi-Swap Made Easy",
    ogDescription: "Multi-swap all your Base tokens into one with a single transaction. The easiest way to consolidate your wallet.",
    ogImageUrl: `${ROOT_URL}/hero.png`,
    noindex: false
  },
} as const;

