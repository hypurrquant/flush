"use client";
import { useState, useEffect, useMemo } from "react";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import { TokenChip } from "@coinbase/onchainkit/token";
import type { Token } from "@coinbase/onchainkit/token";
import {
  ConnectWallet,
  Wallet,
  WalletDropdown,
  WalletDropdownDisconnect,
} from "@coinbase/onchainkit/wallet";
import {
  Address,
  Avatar,
  Name,
  Identity,
  EthBalance,
} from "@coinbase/onchainkit/identity";
import { useAccount, useBalance } from "wagmi";
import { base } from "wagmi/chains";
import { formatTokenBalance, formatCurrency } from "../lib/tokenUtils";
import { fetchPopularTokensList, type TokenInfo } from "../lib/tokenList";
import styles from "./page.module.css";

interface TokenBalanceData {
  address: string;
  symbol: string;
  name: string;
  balanceFormatted: string;
  decimals: number;
  image: string | null;
  chainId: number;
  priceUSD?: number;
  usdValue?: number;
}

export default function Home() {
  const { isFrameReady, setFrameReady } = useMiniKit();
  const { address, isConnected } = useAccount();
  const [selectedTokens, setSelectedTokens] = useState<Set<string>>(new Set());
  const [tokenList, setTokenList] = useState<TokenInfo[]>([]);
  const [tokenBalances, setTokenBalances] = useState<Map<string, bigint>>(new Map());
  const [tokenPrices, setTokenPrices] = useState<Map<string, number>>(new Map());
  const [isLoadingTokens, setIsLoadingTokens] = useState(false);
  const [hideDustTokens, setHideDustTokens] = useState(true); // 기본값: dust token 숨김
  const [activeTab, setActiveTab] = useState<'balance' | 'swapHistory' | 'hideSmallBalance'>('balance');
  const DUST_THRESHOLD = 1; // $1 미만을 dust로 간주

  // Initialize the miniapp
  useEffect(() => {
    if (!isFrameReady) {
      setFrameReady();
    }
  }, [isFrameReady, setFrameReady]);

  // Fetch token list from OnchainKit API
  useEffect(() => {
    async function loadTokens() {
      if (!isConnected || !address) {
        setTokenList([]);
        setTokenBalances(new Map());
        return;
      }

      setIsLoadingTokens(true);
      try {
        // Base 네트워크의 인기 토큰 목록 가져오기 (상위 30개)
        const tokens = await fetchPopularTokensList(30);
        setTokenList(tokens);

        // Fetch balances for all tokens via API
        const balancePromises = tokens.map(async (token) => {
          try {
            const response = await fetch(`/api/token-balance?address=${address}&tokenAddress=${token.address}`);
            if (response.ok) {
              const data = await response.json();
              return { address: token.address, balance: BigInt(data.balance || '0') };
            }
            return { address: token.address, balance: 0n };
          } catch (error) {
            console.error(`Failed to fetch balance for ${token.symbol}:`, error);
            return { address: token.address, balance: 0n };
          }
        });

        const balances = await Promise.all(balancePromises);
        const balanceMap = new Map<string, bigint>();
        balances.forEach(({ address, balance }) => {
          balanceMap.set(address, balance);
        });
        setTokenBalances(balanceMap);

        // Fetch token prices by symbols and addresses
        const symbols = ['ETH', ...tokens.map(t => t.symbol)];
        const addresses = ['0x0000000000000000000000000000000000000000', ...tokens.map(t => t.address)]; // Include ETH address
        try {
          const priceParams = new URLSearchParams();
          priceParams.append('symbols', symbols.join(','));
          priceParams.append('addresses', addresses.join(','));
          const priceResponse = await fetch(`/api/token-prices?${priceParams.toString()}`);
          if (priceResponse.ok) {
            const priceData = await priceResponse.json();
            const priceMap = new Map<string, number>();
            Object.entries(priceData.prices || {}).forEach(([key, price]) => {
              if (price !== null && price !== undefined) {
                // Store by symbol (uppercase) and address (lowercase)
                priceMap.set(key.toUpperCase(), price as number);
                priceMap.set(key.toLowerCase(), price as number);
                
                // Special handling for ETH: if we have WETH address price, use it for ETH symbol
                if (key.toLowerCase() === '0x4200000000000000000000000000000000000006') {
                  priceMap.set('ETH', price as number);
                }
                // If we have ETH address price, use it for ETH symbol
                if (key.toLowerCase() === '0x0000000000000000000000000000000000000000') {
                  priceMap.set('ETH', price as number);
                }
              }
            });
            setTokenPrices(priceMap);
          }
        } catch (error) {
          console.error('Failed to fetch token prices:', error);
        }
      } catch (error) {
        console.error('Failed to load tokens:', error);
        setTokenList([]);
        setTokenBalances(new Map());
      } finally {
        setIsLoadingTokens(false);
      }
    }

    loadTokens();
  }, [isConnected, address]);

  // Refetch balances periodically
  useEffect(() => {
    if (!isConnected || !address || tokenList.length === 0) return;

    const interval = setInterval(async () => {
      const balancePromises = tokenList.map(async (token) => {
        try {
          const response = await fetch(`/api/token-balance?address=${address}&tokenAddress=${token.address}`);
          if (response.ok) {
            const data = await response.json();
            return { address: token.address, balance: BigInt(data.balance || '0') };
          }
          return { address: token.address, balance: 0n };
        } catch {
          return { address: token.address, balance: 0n };
        }
      });

      const balances = await Promise.all(balancePromises);
      const balanceMap = new Map<string, bigint>();
      balances.forEach(({ address, balance }) => {
        balanceMap.set(address, balance);
      });
      setTokenBalances(balanceMap);
    }, 5000); // 5초마다 새로고침

    return () => clearInterval(interval);
  }, [isConnected, address, tokenList]);

  // Refetch prices periodically
  useEffect(() => {
    if (!isConnected || tokenList.length === 0) return;

    const interval = setInterval(async () => {
      const symbols = ['ETH', ...tokenList.map(t => t.symbol)];
      const addresses = ['0x0000000000000000000000000000000000000000', ...tokenList.map(t => t.address)]; // Include ETH address
      try {
        const priceParams = new URLSearchParams();
        priceParams.append('symbols', symbols.join(','));
        priceParams.append('addresses', addresses.join(','));
        const priceResponse = await fetch(`/api/token-prices?${priceParams.toString()}`);
        if (priceResponse.ok) {
          const priceData = await priceResponse.json();
          const priceMap = new Map<string, number>();
          Object.entries(priceData.prices || {}).forEach(([key, price]) => {
            if (price !== null && price !== undefined) {
              // Store by symbol (uppercase) and address (lowercase)
              priceMap.set(key.toUpperCase(), price as number);
              priceMap.set(key.toLowerCase(), price as number);
              
              // Special handling for ETH: if we have WETH address price, use it for ETH symbol
              if (key.toLowerCase() === '0x4200000000000000000000000000000000000006') {
                priceMap.set('ETH', price as number);
              }
              // If we have ETH address price, use it for ETH symbol
              if (key.toLowerCase() === '0x0000000000000000000000000000000000000000') {
                priceMap.set('ETH', price as number);
              }
            }
          });
          setTokenPrices(priceMap);
        }
      } catch (error) {
        console.error('Failed to fetch token prices:', error);
      }
    }, 10000); // 10초마다 가격 새로고침

    return () => clearInterval(interval);
  }, [isConnected, tokenList]);

  // Fetch ETH balance
  const { data: ethBalance } = useBalance({
    address: address,
    query: {
      enabled: !!address,
      refetchInterval: 5000,
    },
  });

  // Combine ETH and token balances with prices
  const allTokenBalances = useMemo(() => {
    const balances: TokenBalanceData[] = [];

    // Add ETH balance if available
    if (ethBalance && parseFloat(ethBalance.formatted) > 0) {
      const ethPrice = tokenPrices.get('ETH') || 0;
      const ethBalanceNum = parseFloat(ethBalance.formatted);
      const usdValue = ethPrice * ethBalanceNum;

      balances.push({
        address: "0x0000000000000000000000000000000000000000",
        symbol: "ETH",
        name: "Ethereum",
        balanceFormatted: formatTokenBalance(ethBalance.value, 18),
        decimals: 18,
        image: "https://wallet-api-production.s3.amazonaws.com/uploads/tokens/eth_288.png",
        chainId: base.id,
        priceUSD: ethPrice > 0 ? ethPrice : undefined,
        usdValue: usdValue > 0 ? usdValue : undefined,
      });
    }

    // Add ERC20 token balances
    tokenList.forEach((token) => {
      const balance = tokenBalances.get(token.address);
      if (balance && parseFloat(formatTokenBalance(balance, token.decimals)) > 0) {
        // Try to get price by symbol first, then by address
        const tokenPrice = tokenPrices.get(token.symbol.toUpperCase()) || 
                          tokenPrices.get(token.address.toLowerCase()) || 
                          0;
        const balanceNum = parseFloat(formatTokenBalance(balance, token.decimals));
        const usdValue = tokenPrice * balanceNum;

        balances.push({
          address: token.address,
          symbol: token.symbol,
          name: token.name,
          balanceFormatted: formatTokenBalance(balance, token.decimals),
          decimals: token.decimals,
          image: token.image,
          chainId: token.chainId,
          priceUSD: tokenPrice > 0 ? tokenPrice : undefined,
          usdValue: usdValue > 0 ? usdValue : undefined,
        });
      }
    });

    return balances;
  }, [ethBalance, tokenList, tokenBalances, tokenPrices]);

  // Filter dust tokens
  const filteredTokenBalances = useMemo(() => {
    if (!hideDustTokens) {
      return allTokenBalances;
    }
    return allTokenBalances.filter((token) => {
      // 가격 정보가 없거나 USD 가치가 기준값 이상인 토큰만 표시
      if (token.usdValue === undefined || token.usdValue === null) {
        return true; // 가격 정보가 없으면 표시 (dust로 간주하지 않음)
      }
      return token.usdValue >= DUST_THRESHOLD;
    });
  }, [allTokenBalances, hideDustTokens]);

  // Convert TokenBalanceData to Token format for TokenChip
  const tokensForChip: Token[] = useMemo(() => {
    return filteredTokenBalances.map((token) => ({
      address: token.address as `0x${string}`,
      chainId: token.chainId,
      decimals: token.decimals,
      image: token.image,
      name: token.name,
      symbol: token.symbol,
    }));
  }, [filteredTokenBalances]);

  // Calculate total portfolio value (only visible tokens)
  const totalPortfolioValue = useMemo(() => {
    return filteredTokenBalances.reduce((total, token) => {
      return total + (token.usdValue || 0);
    }, 0);
  }, [filteredTokenBalances]);

  // Count dust tokens
  const dustTokenCount = useMemo(() => {
    return allTokenBalances.filter((token) => {
      if (token.usdValue === undefined || token.usdValue === null) {
        return false; // 가격 정보가 없으면 dust로 간주하지 않음
      }
      return token.usdValue < DUST_THRESHOLD;
    }).length;
  }, [allTokenBalances]);

  // Mock data for swap history (will be replaced with actual data later)
  const totalSwappedAmount = 0; // TODO: Fetch from API

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
        <div className={styles.totalValue}>
          <div className={styles.label}>Total</div>
          <div className={styles.value}>
            ${formatCurrency(totalPortfolioValue.toString())}
          </div>
          {isConnected && totalSwappedAmount > 0 && (
            <div className={styles.totalSwapped}>
              Swapped: ${formatCurrency(totalSwappedAmount.toString())}
            </div>
          )}
        </div>
        {/* Wallet Connection */}
        <div className={styles.headerActions}>
          <Wallet>
            <ConnectWallet>
              <Avatar className="h-6 w-6" />
              <Name />
            </ConnectWallet>
            <WalletDropdown>
              <Identity className="px-4 pt-3 pb-2" hasCopyAddressOnClick>
                <Avatar />
                <Name />
                <Address />
                <EthBalance />
              </Identity>
              <WalletDropdownDisconnect />
            </WalletDropdown>
          </Wallet>
        </div>
      </div>

      {/* Tabs */}
      {isConnected && (
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${activeTab === 'balance' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('balance')}
          >
            Balance
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'swapHistory' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('swapHistory')}
          >
            Swap History
          </button>
          {allTokenBalances.length > 0 && (
            <label className={styles.toggleContainer}>
              <input
                type="checkbox"
                checked={hideDustTokens}
                onChange={(e) => setHideDustTokens(e.target.checked)}
                className={styles.dustFilterCheckbox}
              />
              <span className={styles.toggleLabel}>Hide Small Balance</span>
            </label>
          )}
        </div>
      )}

      {/* Body - Tab Content */}
      <div className={styles.body}>
        {!isConnected ? (
          <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
            지갑을 연결하면 토큰 잔액을 확인할 수 있습니다
          </div>
        ) : activeTab === 'balance' ? (
          <>
            {isLoadingTokens ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
                토큰 목록을 불러오는 중...
              </div>
            ) : allTokenBalances.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
                보유한 토큰이 없습니다
              </div>
            ) : filteredTokenBalances.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
                {hideDustTokens 
                  ? `Dust token ($${DUST_THRESHOLD} 미만)이 ${dustTokenCount}개 있습니다. 필터를 해제하여 확인하세요.`
                  : '표시할 토큰이 없습니다'}
              </div>
            ) : (
              <div className={styles.tokenList}>
                {filteredTokenBalances.map((token, index) => {
                  const isSelected = selectedTokens.has(token.symbol);
                  const tokenForChip = tokensForChip[index];
                  
                  return (
                    <div
                      key={token.address}
                      className={`${styles.tokenItem} ${isSelected ? styles.tokenItemSelected : ''}`}
                      onClick={() => handleTokenToggle(token.symbol)}
                    >
                      <div className={styles.tokenInfo}>
                        <TokenChip 
                          token={tokenForChip}
                          onClick={() => handleTokenToggle(token.symbol)}
                        />
                        <div className={styles.tokenName}>{token.name}</div>
                      </div>
                      <div className={styles.tokenBalanceSection}>
                        <div className={styles.tokenBalance}>
                          {token.balanceFormatted} {token.symbol}
                        </div>
                        {token.usdValue !== undefined && (
                          <div className={styles.tokenUsdtValue}>
                            ${parseFloat(token.usdValue.toString()).toFixed(2)}
                          </div>
                        )}
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
          </>
        ) : activeTab === 'swapHistory' ? (
          <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
            <div style={{ marginBottom: '1rem' }}>Swap History</div>
            <div style={{ fontSize: '0.875rem', color: 'rgba(255, 255, 255, 0.5)' }}>
              No swap history yet
            </div>
          </div>
        ) : null}
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
