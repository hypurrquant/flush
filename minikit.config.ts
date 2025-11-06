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
    subtitle: "Consolidate your tokens in one transaction", 
    description: "Consolidate your tokens in one transaction. Clean up dust tokens and save on gas fees.",
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
    tagline: "Consolidate your tokens in one transaction",
    ogTitle: "Flush - Consolidate Your Tokens",
    ogDescription: "Consolidate all your Base tokens into one with a single transaction. Save on gas fees.",
    ogImageUrl: `${ROOT_URL}/hero.png`,
    noindex: false
  },
} as const;

