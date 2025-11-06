"use client";
import { useState, useEffect, useMemo } from "react";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import { useAccount, useBalance, useReadContract } from "wagmi";
import { ERC20_ABI, POPULAR_TOKENS } from "../lib/constants";
import { formatTokenBalance, formatCurrency } from "../lib/tokenUtils";
import styles from "./page.module.css";

interface TokenBalanceData {
  address: string;
  symbol: string;
  name: string;
  balanceFormatted: string;
  decimals: number;
}

export default function Home() {
  const { isFrameReady, setFrameReady } = useMiniKit();
  const { address, isConnected } = useAccount();
  const [showRewards, setShowRewards] = useState(false);
  const [selectedTokens, setSelectedTokens] = useState<Set<string>>(new Set());

  // Initialize the miniapp
  useEffect(() => {
    if (!isFrameReady) {
      setFrameReady();
    }
  }, [isFrameReady, setFrameReady]);

  // Fetch ETH balance
  const { data: ethBalance } = useBalance({
    address: address,
    query: {
      enabled: !!address,
      refetchInterval: 5000, // 5초마다 새로고침
    },
  });

  // Fetch USDC balance
  const { data: usdcBalance } = useReadContract({
    address: POPULAR_TOKENS[0].address as `0x${string}`,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
      refetchInterval: 5000,
    },
  });

  // Fetch WETH balance
  const { data: wethBalance } = useReadContract({
    address: POPULAR_TOKENS[1].address as `0x${string}`,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
      refetchInterval: 5000,
    },
  });

  // Fetch DAI balance
  const { data: daiBalance } = useReadContract({
    address: POPULAR_TOKENS[2].address as `0x${string}`,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
      refetchInterval: 5000,
    },
  });

  // Combine ETH and token balances
  const allTokenBalances = useMemo(() => {
    const balances: TokenBalanceData[] = [];

    // Add ETH balance if available
    if (ethBalance && parseFloat(ethBalance.formatted) > 0) {
      balances.push({
        address: "0x0000000000000000000000000000000000000000",
        symbol: "ETH",
        name: "Ethereum",
        balanceFormatted: formatTokenBalance(ethBalance.value, 18),
        decimals: 18,
      });
    }

    // Add USDC balance
    if (usdcBalance && parseFloat(formatTokenBalance(usdcBalance as bigint, POPULAR_TOKENS[0].decimals)) > 0) {
      balances.push({
        address: POPULAR_TOKENS[0].address,
        symbol: POPULAR_TOKENS[0].symbol,
        name: POPULAR_TOKENS[0].name,
        balanceFormatted: formatTokenBalance(usdcBalance as bigint, POPULAR_TOKENS[0].decimals),
        decimals: POPULAR_TOKENS[0].decimals,
      });
    }

    // Add WETH balance
    if (wethBalance && parseFloat(formatTokenBalance(wethBalance as bigint, POPULAR_TOKENS[1].decimals)) > 0) {
      balances.push({
        address: POPULAR_TOKENS[1].address,
        symbol: POPULAR_TOKENS[1].symbol,
        name: POPULAR_TOKENS[1].name,
        balanceFormatted: formatTokenBalance(wethBalance as bigint, POPULAR_TOKENS[1].decimals),
        decimals: POPULAR_TOKENS[1].decimals,
      });
    }

    // Add DAI balance
    if (daiBalance && parseFloat(formatTokenBalance(daiBalance as bigint, POPULAR_TOKENS[2].decimals)) > 0) {
      balances.push({
        address: POPULAR_TOKENS[2].address,
        symbol: POPULAR_TOKENS[2].symbol,
        name: POPULAR_TOKENS[2].name,
        balanceFormatted: formatTokenBalance(daiBalance as bigint, POPULAR_TOKENS[2].decimals),
        decimals: POPULAR_TOKENS[2].decimals,
      });
    }

    return balances;
  }, [ethBalance, usdcBalance, wethBalance, daiBalance]);

  // Mock data for rewards (will be replaced with actual data later)
  const mockSwapStats = {
    totalSwapAmount: 1234.56,
    rewards: 123.45,
  };

  const handleTokenToggle = (symbol: string) => {
    setSelectedTokens((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(symbol)) {
        newSet.delete(symbol);
      } else {
        newSet.add(symbol);
      }
      return newSet;
    });
  };

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.totalSwap}>
          <div className={styles.label}>Total Swap</div>
          <div className={styles.value}>
            ${formatCurrency(mockSwapStats.totalSwapAmount.toString())}
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
                <span>${formatCurrency(mockSwapStats.totalSwapAmount.toString())}</span>
              </div>
              <div className={styles.rewardsItem}>
                <span>Available Rewards:</span>
                <span className={styles.rewardsAmount}>
                  ${formatCurrency(mockSwapStats.rewards.toString())}
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
          <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
            지갑을 연결해주세요
          </div>
        ) : allTokenBalances.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
            보유한 토큰이 없습니다
          </div>
        ) : (
          <div className={styles.tokenList}>
            {allTokenBalances.map((token) => {
              const isSelected = selectedTokens.has(token.symbol);
              return (
                <div
                  key={token.address}
                  className={`${styles.tokenItem} ${isSelected ? styles.tokenItemSelected : ''}`}
                  onClick={() => handleTokenToggle(token.symbol)}
                >
                  <div className={styles.tokenInfo}>
                    <div className={styles.tokenSymbol}>{token.symbol}</div>
                    <div className={styles.tokenName}>{token.name}</div>
                  </div>
                  <div className={styles.tokenBalanceSection}>
                    <div className={styles.tokenBalance}>
                      {token.balanceFormatted} {token.symbol}
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => handleTokenToggle(token.symbol)}
                    onClick={(e) => e.stopPropagation()}
                    className={styles.tokenCheckbox}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Fixed Bottom Button */}
      <div className={styles.bottomButtonContainer}>
        <button 
          className={styles.swapButton}
          disabled={selectedTokens.size === 0}
        >
          {selectedTokens.size === 0
            ? "Select tokens to swap"
            : `Swap to USDC`}
        </button>
      </div>
    </div>
  );
}
