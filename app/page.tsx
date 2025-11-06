"use client";
import { useState, useEffect } from "react";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { formatUnits, parseUnits, type Address } from "viem";
import { base } from "wagmi/chains";
import { ERC20_ABI, USDC_ADDRESS, POPULAR_TOKENS } from "@/lib/constants";
import { type TokenBalance, formatCurrency } from "@/lib/tokenUtils";
import styles from "./page.module.css";

interface SwapStats {
  totalSwapAmount: number;
  rewards: number;
}

export default function Home() {
  const { isFrameReady, setFrameReady, context } = useMiniKit();
  const { address, isConnected } = useAccount();
  const { writeContract, data: hash, isPending, isSuccess } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash });

  const [tokenBalances, setTokenBalances] = useState<TokenBalance[]>([]);
  const [swapStats, setSwapStats] = useState<SwapStats>({ totalSwapAmount: 0, rewards: 0 });
  const [isLoadingBalances, setIsLoadingBalances] = useState(false);
  const [showRewards, setShowRewards] = useState(false);

  // Initialize the miniapp
  useEffect(() => {
    if (!isFrameReady) {
      setFrameReady();
    }
  }, [setFrameReady, isFrameReady]);

  // Fetch swap stats
  useEffect(() => {
    if (address) {
      fetchSwapStats();
    }
  }, [address]);

  // Fetch token balances
  useEffect(() => {
    if (address && isConnected) {
      fetchTokenBalances();
    }
  }, [address, isConnected]);

  const fetchSwapStats = async () => {
    try {
      const response = await fetch(`/api/rewards?userAddress=${address}`);
      const data = await response.json();
      if (data.success) {
        setSwapStats({
          totalSwapAmount: data.totalSwapAmount || 0,
          rewards: data.rewards || 0,
        });
      }
    } catch (error) {
      console.error("Failed to fetch swap stats:", error);
    }
  };

  const fetchTokenBalances = async () => {
    if (!address) return;
    
    setIsLoadingBalances(true);
    try {
      const balances = await Promise.all(
        POPULAR_TOKENS.map(async (token) => {
          try {
            // Read balance
            const balanceResult = await readContract({
              address: token.address as Address,
              abi: ERC20_ABI,
              functionName: "balanceOf",
              args: [address],
            });

            const balance = balanceResult as bigint;
            const balanceFormatted = formatUnits(balance, token.decimals);

            return {
              address: token.address as Address,
              symbol: token.symbol,
              name: token.name,
              balance: balance.toString(),
              balanceFormatted,
              decimals: token.decimals,
            };
          } catch (error) {
            console.error(`Error fetching balance for ${token.symbol}:`, error);
            return null;
          }
        })
      );

      // Filter out null values and tokens with zero balance
      const validBalances = balances
        .filter((b): b is TokenBalance => b !== null)
        .filter((b) => parseFloat(b.balanceFormatted) > 0);

      setTokenBalances(validBalances);
    } catch (error) {
      console.error("Failed to fetch token balances:", error);
    } finally {
      setIsLoadingBalances(false);
    }
  };

  const readContract = async (params: {
    address: Address;
    abi: typeof ERC20_ABI;
    functionName: string;
    args: unknown[];
  }) => {
    // Using public client read
    const { createPublicClient, http } = await import("viem");
    const publicClient = createPublicClient({
      chain: base,
      transport: http(),
    });

    return await publicClient.readContract({
      address: params.address,
      abi: params.abi,
      functionName: params.functionName as never,
      args: params.args as never,
    });
  };

  const handleSwapToUSDC = async () => {
    if (!address || tokenBalances.length === 0) return;

    try {
      const tokensToSwap = tokenBalances.filter(
        (token) => token.address.toLowerCase() !== USDC_ADDRESS.toLowerCase()
      );

      if (tokensToSwap.length === 0) {
        alert("No tokens to swap");
        return;
      }

      // Prepare batch swap transactions
      // Note: This is a simplified implementation
      // For production, integrate with Uniswap V3 Router or 0x API
      // and use Smart Wallet's batch transaction capability

      const totalSwapAmount = tokensToSwap.reduce(
        (sum, token) => sum + parseFloat(token.balanceFormatted),
        0
      );

      // Simulate swap transaction
      // In production, you would:
      // 1. Get quotes from Uniswap Quoter or 0x API
      // 2. Prepare approve transactions for each token
      // 3. Prepare swap transactions using Uniswap Router or 0x
      // 4. Execute batch transaction using Smart Wallet

      const confirmSwap = window.confirm(
        `Swap ${tokensToSwap.length} token(s) to USDC?\n` +
        `Total value: $${formatCurrency(totalSwapAmount.toString())}\n\n` +
        `Note: This is a demo. In production, this would execute actual swaps via Uniswap or 0x API.`
      );

      if (!confirmSwap) return;

      // Save swap record to Supabase
      const swapResponse = await fetch("/api/swaps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userAddress: address,
          totalSwapAmount: totalSwapAmount.toString(),
          fees: (totalSwapAmount * 0.003).toFixed(6), // 0.3% fee estimate
          tokenAddresses: tokensToSwap.map((t) => t.address),
          amounts: tokensToSwap.map((t) => t.balance),
        }),
      });

      if (!swapResponse.ok) {
        throw new Error("Failed to save swap record");
      }

      // Refresh stats and balances
      await fetchSwapStats();
      await fetchTokenBalances();

      alert("Swap recorded successfully!");
    } catch (error) {
      console.error("Swap failed:", error);
      alert("Swap failed. Please try again.");
    }
  };

  const totalSwapValue = tokenBalances.reduce(
    (sum, token) => sum + parseFloat(token.balanceFormatted),
    0
  );

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.totalSwap}>
          <div className={styles.label}>Total Swap</div>
          <div className={styles.value}>
            ${formatCurrency(swapStats.totalSwapAmount.toString())}
          </div>
        </div>
        <button
          className={styles.rewardsButton}
          onClick={() => setShowRewards(!showRewards)}
        >
          Rewards
        </button>
      </div>

      {/* Rewards Modal */}
      {showRewards && (
        <div className={styles.rewardsModal} onClick={() => setShowRewards(false)}>
          <div className={styles.rewardsContent} onClick={(e) => e.stopPropagation()}>
            <h2>Your Rewards</h2>
            <div className={styles.rewardsInfo}>
              <div className={styles.rewardsItem}>
                <span>Total Swap Amount:</span>
                <span>${formatCurrency(swapStats.totalSwapAmount.toString())}</span>
              </div>
              <div className={styles.rewardsItem}>
                <span>Available Rewards:</span>
                <span className={styles.rewardsAmount}>
                  ${formatCurrency(swapStats.rewards.toString())}
                </span>
              </div>
            </div>
            <button
              className={styles.closeRewardsButton}
              onClick={() => setShowRewards(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Body - Token Balances */}
      <div className={styles.body}>
        {!isConnected ? (
          <div className={styles.connectPrompt}>
            <p>Please connect your wallet to view token balances</p>
          </div>
        ) : isLoadingBalances ? (
          <div className={styles.loading}>Loading balances...</div>
        ) : tokenBalances.length === 0 ? (
          <div className={styles.emptyState}>
            <p>No token balances found</p>
          </div>
        ) : (
          <div className={styles.tokenList}>
            {tokenBalances.map((token) => (
              <div key={token.address} className={styles.tokenItem}>
                <div className={styles.tokenInfo}>
                  <div className={styles.tokenSymbol}>{token.symbol}</div>
                  <div className={styles.tokenName}>{token.name}</div>
                </div>
                <div className={styles.tokenBalance}>
                  {formatCurrency(token.balanceFormatted)} {token.symbol}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Fixed Bottom Button */}
      {isConnected && tokenBalances.length > 0 && (
        <div className={styles.bottomButtonContainer}>
          <button
            className={styles.swapButton}
            onClick={handleSwapToUSDC}
            disabled={isPending || isConfirming || totalSwapValue === 0}
          >
            {isPending || isConfirming
              ? "Processing..."
              : `Swap to USDC $${formatCurrency(totalSwapValue.toString())}`}
          </button>
        </div>
      )}
    </div>
  );
}
