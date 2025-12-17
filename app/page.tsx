"use client";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
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
  Avatar,
  Name,
  Identity,
  EthBalance,
} from "@coinbase/onchainkit/identity";
import {
  Transaction,
  TransactionButton,
  TransactionStatus,
  TransactionStatusLabel,
  TransactionStatusAction,
} from "@coinbase/onchainkit/transaction";
import { useAccount, useBalance, usePublicClient } from "wagmi";
import { base } from "wagmi/chains";
import { formatTokenBalance } from "../lib/tokenUtils";
import { fetchPopularTokensList, type TokenInfo } from "../lib/tokenList";
import { USDC_ADDRESS } from "../lib/constants";
import { getZeroExCombinedQuote, getZeroExTransactions, type ZeroExCombinedQuote, FEE_CONFIG } from "../lib/zeroex";
import { checkTokenApproval, createApproveCall, checkBatchCapabilities } from "../lib/batchSwap";
import { sendNotification, NotificationTemplates } from "../lib/notifications";
import { TokenImage } from "../components/TokenImage";
import { BottomNavigation } from "../components/BottomNavigation";
import { RewardsTab } from "../components/RewardsTab";
import { HistoryTab } from "../components/HistoryTab";
import type { Hex, Address as ViemAddress } from "viem";
import { parseEventLogs } from "viem";
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
  const publicClient = usePublicClient();
  const [selectedTokens, setSelectedTokens] = useState<Set<string>>(new Set());
  const [tokenAmounts, setTokenAmounts] = useState<Map<string, number>>(new Map()); // percentage 0-100
  const [tokenList, setTokenList] = useState<TokenInfo[]>([]);
  const [tokenBalances, setTokenBalances] = useState<Map<string, bigint>>(new Map());
  const [tokenPrices, setTokenPrices] = useState<Map<string, number>>(new Map());
  const [isLoadingTokens, setIsLoadingTokens] = useState(false);
  const [hideDustTokens, setHideDustTokens] = useState(true);
  const [activeTab, setActiveTab] = useState<'balance' | 'swapHistory' | 'rewards' | 'hideSmallBalance'>('balance');
  const [isTestingQuote, setIsTestingQuote] = useState(false);
  const [quoteResult, setQuoteResult] = useState<ZeroExCombinedQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showOutputTokenSelector, setShowOutputTokenSelector] = useState(false);
  const [_isAssembling, setIsAssembling] = useState(false);
  const [approvalStatuses, setApprovalStatuses] = useState<Map<string, { approved: boolean; needsApproval: boolean; currentAllowance: bigint }>>(new Map());
  const [isCheckingApprovals, setIsCheckingApprovals] = useState(false);
  const [batchSupported, setBatchSupported] = useState<boolean | null>(null);
  const [isCheckingBatchSupport, setIsCheckingBatchSupport] = useState(false);
  const [walletType, setWalletType] = useState<'coinbase-smart-wallet' | 'eoa' | 'unknown' | null>(null);
  const [isCheckingWalletType, setIsCheckingWalletType] = useState(false);
  
  // User FID for notifications
  const [userFid, setUserFid] = useState<string | null>(null);
  
  // Swap success modal
  const [swapSuccessData, setSwapSuccessData] = useState<{
    inputTokens: Array<{ symbol: string; amount: string; address: string; image: string | null }>;
    outputTokens: Array<{ symbol: string; amount: string; address: string; image: string | null }>;
    transactionHash?: string;
  } | null>(null);
  
  // Auto-swap after approve
  const [readyToSwap, setReadyToSwap] = useState(false);
  const swapButtonWrapperRef = useRef<HTMLDivElement>(null);

  // Transaction simulation state
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationResult, setSimulationResult] = useState<'success' | 'failed' | null>(null);
  const [pendingApprovals, setPendingApprovals] = useState<Array<{ tokenAddress: string; symbol: string }>>([]);
  const [isApproving, setIsApproving] = useState(false);
  
  // Transaction error state
  const [swapError, setSwapError] = useState<{
    message: string;
    isSimulationError: boolean;
    canRetry: boolean;
  } | null>(null);
  
  // Swap API settings
  const [slippageLimitPercent, setSlippageLimitPercent] = useState(0.5);
  const [outputTokenAddress, setOutputTokenAddress] = useState<string>(USDC_ADDRESS); // default: USDC

  const DUST_THRESHOLD = 1; // Consider tokens under $1 as dust

  // Initialize the miniapp
  useEffect(() => {
    if (!isFrameReady) {
      setFrameReady();
    }
  }, [isFrameReady, setFrameReady]);

  // Get user FID for notifications
  useEffect(() => {
    async function fetchUserFid() {
      try {
        const response = await fetch('/api/auth');
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.user?.fid) {
            setUserFid(data.user.fid);
          }
        }
      } catch (error) {
        console.warn('Failed to fetch user FID:', error);
      }
    }
    
    if (isConnected) {
      fetchUserFid();
    }
  }, [isConnected]);

  // Auto-trigger swap after approve completes
  useEffect(() => {
    if (readyToSwap && swapButtonWrapperRef.current) {
      // Small delay to ensure UI is updated
      const timer = setTimeout(() => {
        const button = swapButtonWrapperRef.current?.querySelector('button');
        if (button) {
          console.log('Auto-triggering swap after approve...');
          button.click();
        }
        setReadyToSwap(false);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [readyToSwap]);

  // Close output token selector when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (showOutputTokenSelector && 
          !target.closest(`.${styles.outputTokenSelectorWrapper}`) &&
          !target.closest(`.${styles.outputTokenDropdown}`)) {
        setShowOutputTokenSelector(false);
      }
    };

    if (showOutputTokenSelector) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showOutputTokenSelector]);

  // Debug: Log outputTokenAddress changes
  useEffect(() => {
    console.log('outputTokenAddress changed to:', outputTokenAddress);
  }, [outputTokenAddress]);

  // Check wallet type and batch transaction capabilities when connected
  useEffect(() => {
    async function checkWalletCapabilities() {
      if (!isConnected || !address) {
        setBatchSupported(null);
        setWalletType(null);
        return;
      }

      setIsCheckingBatchSupport(true);
      setIsCheckingWalletType(true);

      try {
        // Check batch capabilities first
        console.log('🔍 Checking wallet batch transaction capabilities...');
        const supported = await checkBatchCapabilities();
        console.log('📊 Batch transaction support:', supported ? '✅ Supported' : '❌ Not supported');
        setBatchSupported(supported);

        // Try to detect wallet type by checking bytecode
        // Smart Wallets have bytecode, EOAs don't
        if (publicClient) {
          try {
            const bytecode = await publicClient.getBytecode({ address: address as `0x${string}` });
            if (bytecode && bytecode !== '0x') {
              // Has bytecode - likely a Smart Wallet
              console.log('🔍 Wallet has bytecode - likely Smart Wallet');
              // Note: We can't definitively confirm it's Coinbase Smart Wallet without UserOperation
              // But we can assume Smart Wallets support batch transactions
              if (supported) {
                setWalletType('coinbase-smart-wallet'); // Assume Coinbase if batch is supported
              } else {
                setWalletType('unknown');
              }
            } else {
              // No bytecode - EOA wallet
              console.log('📱 EOA Wallet detected (no bytecode)');
              setWalletType('eoa');
            }
          } catch (error) {
            console.warn('Failed to check wallet bytecode:', error);
            setWalletType('unknown');
          }
        } else {
          setWalletType('unknown');
        }
      } catch (error) {
        console.error('Failed to check wallet capabilities:', error);
        setBatchSupported(false);
        setWalletType('unknown');
      } finally {
        setIsCheckingBatchSupport(false);
        setIsCheckingWalletType(false);
      }
    }

    checkWalletCapabilities();
  }, [isConnected, address, publicClient]);

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
        // Filter out tokens with empty or invalid addresses before setting tokenList
        const validTokens = tokens.filter(token => token.address && token.address.trim() !== '');
        setTokenList(validTokens);

        // Fetch balances for all tokens via API
        const balancePromises = validTokens.map(async (token) => {
          try {
            if (!token.address || token.address.trim() === '') {
              return { address: token.address, balance: 0n };
            }
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
      // Filter out tokens with empty or invalid addresses
      const validTokens = tokenList.filter(token => 
        token.address && 
        token.address.trim() !== ''
      );
      
      if (validTokens.length === 0) return;
      
      const balancePromises = validTokens.map(async (token) => {
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

  // 출력 토큰 정보 가져오기
  const outputToken = useMemo(() => {
    if (outputTokenAddress === "0x0000000000000000000000000000000000000000") {
      return {
        address: "0x0000000000000000000000000000000000000000",
        symbol: "ETH",
        name: "Ethereum",
        image: "https://wallet-api-production.s3.amazonaws.com/uploads/tokens/eth_288.png",
      };
    }
    const found = allTokenBalances.find(t => t.address.toLowerCase() === outputTokenAddress.toLowerCase()) || 
                  tokenList.find(t => t.address.toLowerCase() === outputTokenAddress.toLowerCase());
    if (found) {
      return found;
    }
    return {
      address: outputTokenAddress,
      symbol: "UNKNOWN",
      name: "Unknown Token",
      image: null,
    };
  }, [outputTokenAddress, allTokenBalances, tokenList]);

  // 출력 토큰으로 사용 가능한 토큰 목록 (보유한 토큰 + 인기 토큰)
  const availableOutputTokens = useMemo(() => {
    const tokens = new Map<string, TokenBalanceData | TokenInfo>();
    
    // 보유한 토큰 추가
    allTokenBalances.forEach(token => {
      tokens.set(token.address.toLowerCase(), token);
    });
    
    // 인기 토큰 추가 (보유하지 않은 경우)
    tokenList.forEach(token => {
      if (!tokens.has(token.address.toLowerCase())) {
        tokens.set(token.address.toLowerCase(), token);
      }
    });
    
    // ETH 추가
    tokens.set("0x0000000000000000000000000000000000000000", {
      address: "0x0000000000000000000000000000000000000000",
      symbol: "ETH",
      name: "Ethereum",
      balanceFormatted: "0",
      decimals: 18,
      image: "https://wallet-api-production.s3.amazonaws.com/uploads/tokens/eth_288.png",
      chainId: base.id,
    });
    
    // USDC 추가 (항상 사용 가능)
    tokens.set(USDC_ADDRESS.toLowerCase(), {
      address: USDC_ADDRESS,
      symbol: "USDC",
      name: "USD Coin",
      balanceFormatted: "0",
      decimals: 6,
      image: "https://wallet-api-production.s3.amazonaws.com/uploads/tokens/usdc_288.png",
      chainId: base.id,
    });
    
    const result = Array.from(tokens.values());
    console.log('Available output tokens:', result.length, result.map(t => ({ symbol: t.symbol, address: t.address })));
    console.log('Output token address state:', outputTokenAddress);
    return result;
  }, [allTokenBalances, tokenList, outputTokenAddress]);

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

  const handleTokenToggle = useCallback((symbol: string) => {
    setSelectedTokens((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(symbol)) {
        newSet.delete(symbol);
        // Remove from tokenAmounts when deselected
        setTokenAmounts((prevAmounts) => {
          const newAmounts = new Map(prevAmounts);
          newAmounts.delete(symbol);
          return newAmounts;
        });
      } else {
        newSet.add(symbol);
        // Set default 100% when selected
        setTokenAmounts((prevAmounts) => {
          const newAmounts = new Map(prevAmounts);
          newAmounts.set(symbol, 100);
          return newAmounts;
        });
      }
      return newSet;
    });
  }, []);

  // Update token amount percentage
  const handleTokenAmountChange = useCallback((symbol: string, percentage: number) => {
    setTokenAmounts((prev) => {
      const newAmounts = new Map(prev);
      newAmounts.set(symbol, Math.max(0, Math.min(100, percentage)));
      return newAmounts;
    });
  }, []);

  // Test Odos Quote API v3 with selected tokens
  const handleTestQuote = useCallback(async () => {
    if (!address || selectedTokens.size === 0) {
      alert('Please select tokens to swap');
      return;
    }

    setIsTestingQuote(true);
    setQuoteError(null);
    setQuoteResult(null);

    try {
      // Get selected tokens with their balances
      const tokenDataMap = new Map<string, bigint>();
      const outputTokenAddressLower = outputTokenAddress.toLowerCase();
      
      allTokenBalances
        .filter((token) => selectedTokens.has(token.symbol))
        .forEach((token) => {
          // Get balance from tokenBalances map or ETH balance
          let balance: bigint;
          let tokenAddress: string;

          if (token.address === "0x0000000000000000000000000000000000000000") {
            // ETH - use WETH address for Odos API
            balance = ethBalance?.value || 0n;
            tokenAddress = "0x4200000000000000000000000000000000000006"; // WETH on Base
          } else {
            balance = tokenBalances.get(token.address) || 0n;
            tokenAddress = token.address;
          }

          // Apply percentage from tokenAmounts (default 100%)
          const percentage = tokenAmounts.get(token.symbol) || 100;
          balance = (balance * BigInt(percentage)) / 100n;

          const normalizedAddress = tokenAddress.toLowerCase();
          
          // Exclude tokens that are the same as output token
          if (normalizedAddress === outputTokenAddressLower) {
            const outputTokenSymbol = allTokenBalances.find(
              t => t.address.toLowerCase() === outputTokenAddressLower
            )?.symbol || 'output token';
            console.warn(`${outputTokenSymbol} is excluded from input as it is the output token`);
            return;
          }
          
          // Deduplicate: sum balances for the same token address
          if (tokenDataMap.has(normalizedAddress)) {
            const existingBalance = tokenDataMap.get(normalizedAddress) || 0n;
            tokenDataMap.set(normalizedAddress, existingBalance + balance);
          } else {
            tokenDataMap.set(normalizedAddress, balance);
          }
        });

      // Convert Map to array and filter only balances greater than 0
      const selectedTokenData = Array.from(tokenDataMap.entries())
        .filter(([_, amount]) => amount > 0n)
        .map(([tokenAddress, amount]) => ({
          tokenAddress,
          amount: amount.toString(),
        }));

      if (selectedTokenData.length === 0) {
        const outputTokenSymbol = allTokenBalances.find(
          t => t.address.toLowerCase() === outputTokenAddressLower
        )?.symbol || 'output token';

        const hasOutputTokenOnly = Array.from(selectedTokens).every(symbol => {
          const token = allTokenBalances.find(t => t.symbol === symbol);
          return token && token.address.toLowerCase() === outputTokenAddressLower;
        });

        if (hasOutputTokenOnly) {
          throw new Error(`${outputTokenSymbol} is the output token and cannot be swapped. Please select other tokens.`);
        }
        throw new Error('No tokens to swap');
      }

      console.log('Testing 0x Quote API with inputTokens:', selectedTokenData);

      // Step 1: Generate a quote using 0x API
      // Convert slippage from percent to basis points (0.5% -> 50 bps)
      const slippageBps = Math.round(slippageLimitPercent * 100);

      const quote = await getZeroExCombinedQuote(
        selectedTokenData,
        outputTokenAddress.toLowerCase(),
        address.toLowerCase(),
        slippageBps,
        base.id
      );

      console.log('0x Quote API Response:', quote);
      console.log('Quote Details:', {
        pathId: quote.pathId,
        inputTokens: quote.inTokens,
        outputTokens: quote.outTokens,
        inputAmounts: quote.inAmounts,
        outputAmounts: quote.outAmounts,
        gasEstimate: quote.gasEstimate,
        priceImpact: quote.priceImpact,
        netOutValue: quote.netOutValue,
        totalFeeAmount: quote.totalFeeAmount,
        allowanceTarget: quote.allowanceTarget,
      });
      setQuoteResult(quote);
      setApprovalStatuses(new Map()); // Reset approval statuses
      setSimulationResult(null); // Reset simulation result
      setIsSimulating(false);
      setPendingApprovals([]);

      // Check approval statuses for all input tokens
      if (quote.inTokens && quote.inAmounts && address) {
        setIsCheckingApprovals(true);
        const statusMap = new Map<string, { approved: boolean; needsApproval: boolean; currentAllowance: bigint }>();

        try {
          // 0x already provides the allowanceTarget in the quote
          const allowanceTarget = quote.allowanceTarget as ViemAddress;

          // Check each token with actual swap amount
          const approvalPromises = quote.inTokens.map(async (tokenAddress, index) => {
            const tokenAddr = tokenAddress as ViemAddress;
            const amount = BigInt(quote.inAmounts?.[index] || '0');

            // Skip ETH
            if (tokenAddr.toLowerCase() === '0x0000000000000000000000000000000000000000') {
              statusMap.set(tokenAddr.toLowerCase(), { approved: true, needsApproval: false, currentAllowance: 0n });
              return;
            }

            // Check with actual swap amount
            const approval = await checkTokenApproval(tokenAddr, address as ViemAddress, amount, allowanceTarget);
            statusMap.set(tokenAddr.toLowerCase(), approval);
          });

          await Promise.all(approvalPromises);
          setApprovalStatuses(statusMap);

          // Set pending approvals for tokens that need approval
          const pending: Array<{ tokenAddress: string; symbol: string }> = [];
          statusMap.forEach((status, tokenAddress) => {
            if (status.needsApproval) {
              const token = allTokenBalances.find(t => t.address.toLowerCase() === tokenAddress.toLowerCase()) ||
                           tokenList.find(t => t.address.toLowerCase() === tokenAddress.toLowerCase());
              if (token) {
                pending.push({ tokenAddress, symbol: token.symbol });
              }
            }
          });
          setPendingApprovals(pending);
        } catch (error) {
          console.error('Error checking approvals:', error);
        } finally {
          setIsCheckingApprovals(false);
        }
      }
    } catch (error) {
      console.error('Quote API test error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Quote API call failed';
      setQuoteError(errorMessage);
    } finally {
      setIsTestingQuote(false);
    }
  }, [address, selectedTokens, outputTokenAddress, slippageLimitPercent, allTokenBalances, tokenBalances, ethBalance, tokenList]);

  // Prepare swap transaction calls (used as Promise for Transaction component)
  // This only includes swap call, not approve calls (approve is handled separately)
  const prepareSwapCalls = useCallback(async (): Promise<Array<{ to: ViemAddress; value: bigint; data: Hex }>> => {
    if (!quoteResult || !address) {
      throw new Error('Quote result or address is missing');
    }

    setIsAssembling(true);
    try {
      // 0x provides transaction data directly in the quote
      const { transactions } = getZeroExTransactions(quoteResult);

      console.log('0x Transactions:', transactions);

      // Convert all swap transactions to the expected format
      const calls: Array<{ to: ViemAddress; value: bigint; data: Hex }> = transactions.map((tx, index) => {
        console.log(`\n🔄 Swap transaction ${index + 1}:`);
        console.log('  - To:', tx.to);
        console.log('  - Value:', tx.value);
        console.log('  - Data:', tx.data.substring(0, 50) + '...' + tx.data.substring(tx.data.length - 50));
        console.log('  - Data Length:', tx.data.length);

        return {
          to: tx.to as ViemAddress,
          data: tx.data as Hex,
          value: BigInt(tx.value || '0'),
        };
      });

      console.log(`\n📊 Swap Call Summary:`);
      console.log(`  - Total Swap Calls: ${calls.length}`);
      console.log(`  - Fee: ${FEE_CONFIG.swapFeeBps / 100}% (${quoteResult.totalFeeAmount} wei)`);

      return calls;
    } catch (error) {
      console.error('Transaction preparation error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Transaction preparation failed';
      setQuoteError(errorMessage);
      throw error;
    } finally {
      setIsAssembling(false);
    }
  }, [quoteResult, address]);


  // Close quote modal when swap success modal is shown
  useEffect(() => {
    if (swapSuccessData) {
      setQuoteResult(null);
    }
  }, [swapSuccessData]);

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.totalValue}>
          <div className={styles.label}>Total</div>
          <div className={styles.value}>
            ${totalPortfolioValue.toFixed(2)}
          </div>
          {isConnected && totalSwappedAmount > 0 && (
            <div className={styles.totalSwapped}>
              Swapped: ${totalSwappedAmount.toFixed(2)}
            </div>
          )}
        </div>
        
        
        {/* Settings & Wallet Connection */}
        <div className={styles.headerActions}>
          {isConnected && (
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={styles.settingsButton}
              title="Settings"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M10 12.5C11.3807 12.5 12.5 11.3807 12.5 10C12.5 8.61929 11.3807 7.5 10 7.5C8.61929 7.5 7.5 8.61929 7.5 10C7.5 11.3807 8.61929 12.5 10 12.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M16.25 10C16.25 10.4167 16.25 10.8333 16.25 11.25C16.25 11.6667 16.25 12.0833 16.25 12.5L13.75 13.75C13.5833 13.8333 13.4167 13.9167 13.25 14L12 16.5C11.9167 16.6667 11.8333 16.8333 11.75 17L8.25 17C8.16667 16.8333 8.08333 16.6667 8 16.5L6.75 14C6.58333 13.9167 6.41667 13.8333 6.25 13.75L3.75 12.5C3.58333 12.4167 3.41667 12.3333 3.25 12.25L3.25 7.75C3.41667 7.66667 3.58333 7.58333 3.75 7.5L6.25 6.25C6.41667 6.16667 6.58333 6.08333 6.75 6L8 3.5C8.08333 3.33333 8.16667 3.16667 8.25 3L11.75 3C11.8333 3.16667 11.9167 3.33333 12 3.5L13.25 6C13.4167 6.08333 13.5833 6.16667 13.75 6.25L16.25 7.5C16.4167 7.58333 16.5833 7.66667 16.75 7.75L16.75 12.25C16.5833 12.3333 16.4167 12.4167 16.25 12.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          )}
          <Wallet>
            <ConnectWallet>
              <Avatar className="h-6 w-6" />
              <Name />
            </ConnectWallet>
            <WalletDropdown>
              <Identity className="px-4 pt-3 pb-2">
                <Avatar />
                <Name />
                <EthBalance />
              </Identity>
              <WalletDropdownDisconnect />
            </WalletDropdown>
          </Wallet>
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && isConnected && (
        <div className={styles.settingsModal} onClick={() => setShowSettings(false)}>
          <div className={styles.settingsModalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.settingsHeader}>
              <h2>Swap Settings</h2>
              <button onClick={() => setShowSettings(false)} className={styles.closeButton}>
                ×
              </button>
            </div>
            
            <div className={styles.settingsBody}>
              {/* Protocol Fees */}
              <div className={styles.settingsItem} style={{ marginBottom: '1.5rem' }}>
                <label className={styles.settingsLabel} style={{ marginBottom: '0.75rem' }}>
                  Protocol Fees
                </label>
                <div style={{
                  padding: '1rem',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  fontSize: '0.875rem',
                  lineHeight: '1.6',
                  color: 'rgba(255, 255, 255, 0.8)'
                }}>
                  <p style={{ margin: '0 0 0.75rem 0', fontWeight: '600' }}>
                    Odos Protocol Fees
                  </p>
                  <ul style={{ margin: '0', paddingLeft: '1.25rem', listStyle: 'disc' }}>
                    <li style={{ marginBottom: '0.5rem' }}>
                      <strong>Volatile & Custom Assets:</strong> 0.15% (15 bps)
                    </li>
                    <li style={{ marginBottom: '0.5rem' }}>
                      <strong>Stablecoin Swaps:</strong> 0.03% (3 bps)
                    </li>
                  </ul>
                  <p style={{ margin: '0.75rem 0 0 0', fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.6)' }}>
                    Fees are applied in addition to gas and potential slippage. Users control slippage and gas settings.
                  </p>
                </div>
              </div>

              {/* Slippage Tolerance */}
              <div className={styles.settingsItem}>
                <label className={styles.settingsLabel}>
                  Slippage Tolerance (%)
                  <span className={styles.settingsDescription}>
                    Allowed price change. Default: 0.5%
                  </span>
                </label>
                <input
                  type="number"
                  min="0.1"
                  max="50"
                  step="0.1"
                  value={slippageLimitPercent}
                  onChange={(e) => setSlippageLimitPercent(parseFloat(e.target.value) || 0.5)}
                  className={styles.settingsInput}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quote Result Modal */}
      {quoteResult && (
        <div className={styles.settingsModal} onClick={() => {
          setQuoteResult(null);
        }}>
          <div className={styles.settingsModalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.settingsHeader}>
              <h2>✓ Quote Success!</h2>
              <button onClick={() => {
                setQuoteResult(null);
              }} className={styles.closeButton}>
                ×
              </button>
            </div>
            
            <div className={styles.settingsBody}>
              {/* Approval Status & Swap Preview */}
              {isCheckingApprovals ? (
                <div className={styles.quoteInfoRow}>
                  <div className={styles.quoteInfoLabel}>Checking approval status...</div>
                  <div className={styles.quoteInfoValue}>⏳</div>
                </div>
              ) : quoteResult.inTokens && quoteResult.inTokens.length > 0 && (
                <div className={styles.swapPreviewSection}>
                  <div className={styles.swapPreviewHeader}>Swap Preview</div>
                  
                  {/* Input Tokens */}
                  <div className={styles.swapPreviewTokens}>
                    <div className={styles.swapPreviewLabel}>Input</div>
                    <div className={styles.swapPreviewTokenList}>
                      {quoteResult.inTokens.map((tokenAddress, idx) => {
                        const tokenAddr = tokenAddress.toLowerCase();
                        const amount = quoteResult.inAmounts?.[idx] || '0';
                        const tokenInfo = allTokenBalances.find(t => t.address.toLowerCase() === tokenAddr) ||
                                         tokenList.find(t => t.address.toLowerCase() === tokenAddr) ||
                                         (tokenAddr === '0x0000000000000000000000000000000000000000' ? { symbol: 'ETH', decimals: 18, image: 'https://wallet-api-production.s3.amazonaws.com/uploads/tokens/eth_288.png' } : null) ||
                                         (tokenAddr === '0x4200000000000000000000000000000000000006' ? { symbol: 'WETH', decimals: 18 } : null);
                        const symbol = tokenInfo?.symbol || 'TOKEN';
                        const decimals = tokenInfo?.decimals || 18;
                        const amountNum = parseFloat(amount) / Math.pow(10, decimals);
                        const approvalStatus = approvalStatuses.get(tokenAddr);
                        const isETH = tokenAddr === '0x0000000000000000000000000000000000000000';
                        
                        return (
                          <div key={idx} className={styles.swapPreviewTokenItem}>
                            {tokenInfo?.image && (
                              <TokenImage
                                src={tokenInfo.image}
                                alt={symbol}
                                width={32}
                                height={32}
                                className={styles.swapPreviewTokenImage}
                              />
                            )}
                            <div className={styles.swapPreviewTokenInfo}>
                              <div className={styles.swapPreviewTokenAmount}>
                                {(amountNum || 0).toLocaleString('en-US', { maximumFractionDigits: 6 })} {symbol}
                              </div>
                            </div>
                            <div className={styles.swapPreviewTokenStatus}>
                              {isETH ? (
                                <span className={styles.approvalBadge} style={{ background: 'rgba(34, 197, 94, 0.1)', color: '#86efac' }}>
                                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ marginRight: '0.25rem' }}>
                                    <path d="M11.6667 3.5L5.25 9.91667L2.33333 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                  </svg>
                                  Native
                                </span>
                              ) : approvalStatus?.approved ? (
                                <span className={styles.approvalBadge} style={{ background: 'rgba(34, 197, 94, 0.1)', color: '#86efac' }}>
                                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ marginRight: '0.25rem' }}>
                                    <path d="M11.6667 3.5L5.25 9.91667L2.33333 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                  </svg>
                                  Approved
                                </span>
                              ) : (
                                <span className={styles.approvalBadge} style={{ background: 'rgba(251, 191, 36, 0.1)', color: '#fbbf24' }}>
                                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ marginRight: '0.25rem' }}>
                                    <path d="M7 4.66667V7M7 9.33333H7.01167M12.8333 7C12.8333 10.2217 10.2217 12.8333 7 12.8333C3.77833 12.8333 1.16667 10.2217 1.16667 7C1.16667 3.77833 3.77833 1.16667 7 1.16667C10.2217 1.16667 12.8333 3.77833 12.8333 7Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                  </svg>
                                  Needs Approval
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  
                  {/* Arrow */}
                  <div className={styles.swapPreviewArrow}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                      <path d="M5 12H19M19 12L12 5M19 12L12 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  
                  {/* Output Tokens */}
                  <div className={styles.swapPreviewTokens}>
                    <div className={styles.swapPreviewLabel}>Output</div>
                    <div className={styles.swapPreviewTokenList}>
                      {quoteResult.outTokens.map((tokenAddress, idx) => {
                        const tokenAddr = tokenAddress.toLowerCase();
                        const amount = quoteResult.outAmounts?.[idx] || '0';
                        const tokenInfo = allTokenBalances.find(t => t.address.toLowerCase() === tokenAddr) ||
                                         tokenList.find(t => t.address.toLowerCase() === tokenAddr) ||
                                         (tokenAddr === '0x0000000000000000000000000000000000000000' ? { symbol: 'ETH', decimals: 18, image: 'https://wallet-api-production.s3.amazonaws.com/uploads/tokens/eth_288.png' } : null) ||
                                         (tokenAddr === '0x4200000000000000000000000000000000000006' ? { symbol: 'WETH', decimals: 18 } : null);
                        const symbol = tokenInfo?.symbol || 'TOKEN';
                        const decimals = tokenInfo?.decimals || 18;
                        const amountNum = parseFloat(amount) / Math.pow(10, decimals);
                        const minReceived = amountNum * (1 - slippageLimitPercent / 100);
                        
                        return (
                          <div key={idx} className={styles.swapPreviewTokenItem}>
                            {tokenInfo?.image && (
                              <TokenImage
                                src={tokenInfo.image}
                                alt={symbol}
                                width={32}
                                height={32}
                                className={styles.swapPreviewTokenImage}
                              />
                            )}
                            <div className={styles.swapPreviewTokenInfo}>
                              <div className={styles.swapPreviewTokenAmount}>
                                {(amountNum || 0).toLocaleString('en-US', { maximumFractionDigits: 6 })} {symbol}
                              </div>
                              <div className={styles.swapPreviewTokenSubtext}>
                                Min: {(minReceived || 0).toLocaleString('en-US', { maximumFractionDigits: 6 })} {symbol}
                              </div>
                            </div>
                            <div className={styles.swapPreviewTokenStatus}>
                              <span className={styles.approvalBadge} style={{ background: 'rgba(34, 197, 94, 0.1)', color: '#86efac' }}>
                                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ marginRight: '0.25rem' }}>
                                  <path d="M11.6667 3.5L5.25 9.91667L2.33333 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                                To Receive
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  
                  {/* Transaction Summary */}
                  <div className={styles.swapPreviewSummary}>
                    {(() => {
                      const needsApprovalCount = Array.from(approvalStatuses.values()).filter(s => s.needsApproval).length;
                      const totalTransactions = needsApprovalCount + 1; // approve + swap
                      
                      return (
                        <div className={styles.swapPreviewSummaryRow}>
                          <div className={styles.swapPreviewSummaryLabel}>Expected Transactions</div>
                          <div className={styles.swapPreviewSummaryValue}>
                            {needsApprovalCount > 0 ? (
                              <span>
                                {needsApprovalCount} approve + 1 swap = {totalTransactions} total
                              </span>
                            ) : (
                              <span style={{ color: '#86efac' }}>1 swap only</span>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                    
                    {quoteResult.gasEstimate != null && quoteResult.gasEstimate > 0 && (
                      <div className={styles.swapPreviewSummaryRow}>
                        <div className={styles.swapPreviewSummaryLabel}>Estimated Gas</div>
                        <div className={styles.swapPreviewSummaryValue}>
                          {quoteResult.gasEstimate.toLocaleString()} units
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              {/* Minimum Received */}
              {quoteResult.outAmounts && quoteResult.outAmounts.length > 0 && (
                <div className={styles.quoteInfoRow}>
                  <div className={styles.quoteInfoLabel}>Minimum Received</div>
                  <div className={styles.quoteInfoValue}>
                    {(() => {
                      const outputToken = quoteResult.outTokens?.[0];
                      const outputAmount = quoteResult.outAmounts[0];
                      const outputTokenInfo = allTokenBalances.find(t => t.address.toLowerCase() === outputToken?.toLowerCase()) ||
                                             tokenList.find(t => t.address.toLowerCase() === outputToken?.toLowerCase()) ||
                                             (outputToken?.toLowerCase() === '0x0000000000000000000000000000000000000000' ? { symbol: 'ETH', decimals: 18 } : null) ||
                                             (outputToken?.toLowerCase() === '0x4200000000000000000000000000000000000006' ? { symbol: 'WETH', decimals: 18 } : null);
                      const outputSymbol = outputTokenInfo?.symbol || 'TOKEN';
                      const outputAmountNum = parseFloat(outputAmount) / Math.pow(10, outputTokenInfo?.decimals || 18);
                      // Apply slippage
                      const minReceived = outputAmountNum * (1 - slippageLimitPercent / 100);
                      return `${(minReceived || 0).toLocaleString('en-US', { maximumFractionDigits: 6 })} ${outputSymbol}`;
                    })()}
                  </div>
                </div>
              )}
              
              {/* Price Impact */}
              {quoteResult.priceImpact !== undefined && (
                <div className={styles.quoteInfoRow}>
                  <div className={styles.quoteInfoLabel}>Price Impact</div>
                  <div className={styles.quoteInfoValue} style={{
                    color: quoteResult.priceImpact < 0.01 ? 'rgba(255, 255, 255, 0.6)' :
                           quoteResult.priceImpact < 1 ? '#f7d954' : '#fca5a5'
                  }}>
                    {quoteResult.priceImpact < 0.01 ? '< 0.01%' : `${quoteResult.priceImpact.toFixed(2)}%`}
                  </div>
                </div>
              )}
              
              {/* Additional Details (Collapsible) */}
              <details className={styles.quoteDetails}>
                <summary className={styles.quoteDetailsSummary}>More Details</summary>
                <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {quoteResult.gasEstimate != null && (
                    <div className={styles.quoteInfoRow}>
                      <div className={styles.quoteInfoLabel}>Gas Estimate</div>
                      <div className={styles.quoteInfoValue}>{quoteResult.gasEstimate.toLocaleString()} units</div>
                    </div>
                  )}

                  {quoteResult.netOutValue !== undefined && (
                    <div className={styles.quoteInfoRow}>
                      <div className={styles.quoteInfoLabel}>Net Out Value</div>
                      <div className={styles.quoteInfoValue}>${quoteResult.netOutValue.toFixed(2)}</div>
                    </div>
                  )}
                  
                  <div className={styles.quoteInfoRow}>
                    <div className={styles.quoteInfoLabel}>Path ID</div>
                    <div className={styles.quoteInfoValue}>
                      <code className={styles.quoteResultCode}>{quoteResult.pathId}</code>
                    </div>
                  </div>
                </div>
              </details>
              
              {/* Swap Execution */}
              <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {/* Wallet Type & Batch Support Status */}
                {isCheckingBatchSupport || isCheckingWalletType ? (
                  <div style={{ 
                    padding: '0.75rem', 
                    background: 'rgba(255, 255, 255, 0.05)', 
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '8px',
                    fontSize: '0.75rem',
                    color: 'rgba(255, 255, 255, 0.6)',
                    textAlign: 'center'
                  }}>
                    Checking wallet info...
                  </div>
                ) : walletType === 'coinbase-smart-wallet' && batchSupported === true ? (
                  <div style={{ 
                    padding: '0.75rem', 
                    background: 'rgba(34, 197, 94, 0.1)', 
                    border: '1px solid rgba(34, 197, 94, 0.3)',
                    borderRadius: '8px',
                    fontSize: '0.75rem',
                    color: '#86efac'
                  }}>
                    ✅ Smart Wallet detected - Batch transactions and gas sponsorship supported
                  </div>
                ) : walletType === 'eoa' && batchSupported === false ? (
                  <div style={{ 
                    padding: '0.75rem', 
                    background: 'rgba(251, 191, 36, 0.1)', 
                    border: '1px solid rgba(251, 191, 36, 0.3)',
                    borderRadius: '8px',
                    fontSize: '0.75rem',
                    color: '#fbbf24'
                  }}>
                    ⚠️ EOA Wallet - Batch transactions not supported. Approve and Swap will execute sequentially.
                  </div>
                ) : walletType === 'eoa' && batchSupported === true ? (
                  <div style={{ 
                    padding: '0.75rem', 
                    background: 'rgba(34, 197, 94, 0.1)', 
                    border: '1px solid rgba(34, 197, 94, 0.3)',
                    borderRadius: '8px',
                    fontSize: '0.75rem',
                    color: '#86efac'
                  }}>
                    ✅ EOA Wallet - Batch transactions supported
                  </div>
                ) : batchSupported === false ? (
                  <div style={{ 
                    padding: '0.75rem', 
                    background: 'rgba(251, 191, 36, 0.1)', 
                    border: '1px solid rgba(251, 191, 36, 0.3)',
                    borderRadius: '8px',
                    fontSize: '0.75rem',
                    color: '#fbbf24'
                  }}>
                    ⚠️ Batch transactions not supported - Approve and Swap may execute separately
                  </div>
                ) : batchSupported === true ? (
                  <div style={{ 
                    padding: '0.75rem', 
                    background: 'rgba(34, 197, 94, 0.1)', 
                    border: '1px solid rgba(34, 197, 94, 0.3)',
                    borderRadius: '8px',
                    fontSize: '0.75rem',
                    color: '#86efac'
                  }}>
                    ✅ Batch transactions supported - Approve and Swap will execute together
                  </div>
                ) : null}
                
                {/* Error Message in Quote Modal */}
                {swapError && (
                  <div style={{ 
                    padding: '0.75rem', 
                    background: 'rgba(252, 165, 165, 0.1)', 
                    border: '1px solid rgba(252, 165, 165, 0.3)',
                    borderRadius: '8px',
                    fontSize: '0.875rem',
                    color: '#fca5a5',
                    marginBottom: '0.75rem'
                  }}>
                    {swapError.message}
                  </div>
                )}
                
                {quoteResult && (() => {
                  const needsApprovalCount = Array.from(approvalStatuses.values()).filter(s => s.needsApproval).length;
                  
                  // If there's an error, show retry options
                  if (swapError) {
                    return (
                      <div style={{ display: 'flex', gap: '0.75rem' }}>
                        {swapError.isSimulationError ? (
                          <button
                            onClick={async () => {
                              setSwapError(null);
                              setSimulationResult(null);
                            }}
                            className={styles.swapButton}
                            style={{ flex: 1 }}
                          >
                            Try Again
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={async () => {
                                setSwapError(null);
                                if (selectedTokens.size > 0 && address) {
                                  await handleTestQuote();
                                }
                              }}
                              className={styles.swapButton}
                              style={{ flex: 1, background: '#fbbf24', color: '#000' }}
                            >
                              Find New Route
                            </button>
                            <button
                              onClick={() => {
                                setSwapError(null);
                                setSimulationResult(null);
                              }}
                              className={styles.swapButton}
                              style={{ flex: 1 }}
                            >
                              Try Again
                            </button>
                          </>
                        )}
                      </div>
                    );
                  }
                  
                  // If simulation failed, show "Find New Route" button
                  if (simulationResult === 'failed') {
                    return (
                      <button
                        onClick={async () => {
                          setSimulationResult(null);
                          setQuoteResult(null);
                          if (selectedTokens.size > 0 && address) {
                            await handleTestQuote();
                          }
                        }}
                        className={styles.swapButton}
                        style={{ background: '#fbbf24', color: '#000' }}
                      >
                        Find New Route
                      </button>
                    );
                  }
                  
                  // If approvals are needed, show approve button first
                  if (needsApprovalCount > 0 && pendingApprovals.length > 0) {
                    // Prepare approve calls
                    const prepareApproveCalls = async (): Promise<Array<{ to: ViemAddress; value: bigint; data: Hex }>> => {
                      if (!quoteResult || !address) {
                        throw new Error('Quote result or address is missing');
                      }

                      // 0x provides allowanceTarget directly in the quote
                      const allowanceTarget = quoteResult.allowanceTarget as ViemAddress;
                      const approveCalls: Array<{ to: ViemAddress; value: bigint; data: Hex }> = [];

                      if (quoteResult.inTokens && quoteResult.inAmounts) {
                        for (let i = 0; i < quoteResult.inTokens.length; i++) {
                          const tokenAddress = quoteResult.inTokens[i] as ViemAddress;
                          const amount = BigInt(quoteResult.inAmounts[i] || '0');

                          if (tokenAddress.toLowerCase() === '0x0000000000000000000000000000000000000000') {
                            continue;
                          }

                          const approval = await checkTokenApproval(
                            tokenAddress,
                            address as ViemAddress,
                            amount,
                            allowanceTarget
                          );

                          if (approval.needsApproval) {
                            const approveCall = createApproveCall(tokenAddress, allowanceTarget, amount);
                            approveCalls.push({
                              to: approveCall.to,
                              data: approveCall.data,
                              value: BigInt(approveCall.value),
                            });
                          }
                        }
                      }

                      return approveCalls;
                    };
                    
                    return (
                      <Transaction
                        chainId={base.id}
                        calls={prepareApproveCalls}
                        isSponsored={true}
                        onStatus={(status) => {
                          console.log('Approve transaction status:', status);
                          if (status.statusName === 'init') {
                            setIsApproving(true);
                          } else if (status.statusName === 'success') {
                            // Approve completed, update approval statuses
                            const updatedStatuses = new Map(approvalStatuses);
                            pendingApprovals.forEach(token => {
                              const status = updatedStatuses.get(token.tokenAddress.toLowerCase());
                              if (status) {
                                updatedStatuses.set(token.tokenAddress.toLowerCase(), {
                                  ...status,
                                  approved: true,
                                  needsApproval: false,
                                });
                              }
                            });
                            setApprovalStatuses(updatedStatuses);
                            setPendingApprovals([]);
                            setIsApproving(false);
                            // Trigger simulation after approvals complete
                            setSimulationResult(null);
                            // Auto-trigger swap after approve
                            setReadyToSwap(true);
                          } else if (status.statusName === 'error') {
                            setIsApproving(false);
                          }
                        }}
                      >
                        <TransactionButton
                          className={styles.swapButton}
                          text={isApproving ? 'Approving...' : `Approve ${needsApprovalCount} token${needsApprovalCount > 1 ? 's' : ''}`}
                        />
                        <TransactionStatus>
                          <TransactionStatusLabel />
                          <TransactionStatusAction />
                        </TransactionStatus>
                      </Transaction>
                    );
                  }
                  
                  // If simulating, show loading state
                  if (isSimulating) {
                    return (
                      <button className={styles.swapButton} disabled>
                        Simulating...
                      </button>
                    );
                  }

                  // Show swap button - clicking will trigger simulation first
                  const buttonText = 'Execute Swap';

                  // Prepare swap calls (0x quote already includes validated transaction data)
                  const prepareSwapCallsWithSimulation = async (): Promise<Array<{ to: ViemAddress; value: bigint; data: Hex }>> => {
                    if (!address) {
                      throw new Error('Address is required');
                    }

                    // 0x quotes are already validated, so we skip the simulation step
                    // If the quote is stale, the transaction will fail and user can retry
                    console.log('✅ 0x quote is pre-validated, proceeding with swap');
                    setSimulationResult('success');

                    return await prepareSwapCalls();
                  };
                  
                  return (
                    <Transaction
                      chainId={base.id}
                      calls={prepareSwapCallsWithSimulation}
                      isSponsored={true}
                      onStatus={async (status) => {
                        console.log('Transaction status:', status);
                        console.log('Transaction statusData:', status.statusData);
                        if (status.statusName === 'success') {
                          // Parse transaction receipt and prepare success data
                          const statusData = status.statusData as { transactionReceipts?: Array<{ transactionHash?: string }>; transactionHash?: string };
                          const receipts = statusData?.transactionReceipts;
                          const transactionHash = receipts?.[0]?.transactionHash || statusData?.transactionHash;
                          
                          console.log('Transaction hash:', transactionHash);
                          
                          // Fetch actual token transfers from transaction logs
                          const inputTokensData: Array<{ symbol: string; amount: string; address: string; image: string | null }> = [];
                          const outputTokensData: Array<{ symbol: string; amount: string; address: string; image: string | null }> = [];
                          
                          if (transactionHash && publicClient && address) {
                            try {
                              // Get transaction receipt
                              const receipt = await publicClient.getTransactionReceipt({
                                hash: transactionHash as Hex,
                              });
                              
                              // Parse Transfer events from logs
                              const transferEvents = parseEventLogs({
                                abi: [{
                                  type: 'event',
                                  name: 'Transfer',
                                  inputs: [
                                    { type: 'address', indexed: true, name: 'from' },
                                    { type: 'address', indexed: true, name: 'to' },
                                    { type: 'uint256', indexed: false, name: 'value' },
                                  ],
                                }],
                                logs: receipt.logs,
                              });
                              
                              const userAddressLower = address.toLowerCase();
                              
                              // Group transfers by token address
                              const tokenTransfers = new Map<string, { sent: bigint; received: bigint; address: string }>();
                              
                              for (const event of transferEvents) {
                                if (event.eventName === 'Transfer') {
                                  const from = (event.args as { from: string; to: string; value: bigint }).from.toLowerCase();
                                  const to = (event.args as { from: string; to: string; value: bigint }).to.toLowerCase();
                                  const value = (event.args as { from: string; to: string; value: bigint }).value;
                                  const tokenAddress = event.address.toLowerCase();
                                  
                                  // Only track transfers involving the user
                                  if (from === userAddressLower || to === userAddressLower) {
                                    if (!tokenTransfers.has(tokenAddress)) {
                                      tokenTransfers.set(tokenAddress, { sent: BigInt(0), received: BigInt(0), address: event.address });
                                    }
                                    
                                    const transfer = tokenTransfers.get(tokenAddress)!;
                                    if (from === userAddressLower) {
                                      transfer.sent += value;
                                    }
                                    if (to === userAddressLower) {
                                      transfer.received += value;
                                    }
                                  }
                                }
                              }
                              
                              // Convert to display format
                              for (const [tokenAddress, transfer] of tokenTransfers.entries()) {
                                const token = allTokenBalances.find(t => t.address.toLowerCase() === tokenAddress) ||
                                             tokenList.find(t => t.address.toLowerCase() === tokenAddress);
                                
                                if (token) {
                                  const decimals = token.decimals || 18;
                                  
                                  if (transfer.sent > 0) {
                                    const formattedAmount = (transfer.sent / BigInt(10 ** decimals)).toString();
                                    inputTokensData.push({
                                      symbol: token.symbol,
                                      amount: formattedAmount,
                                      address: transfer.address,
                                      image: token.image || null,
                                    });
                                  }
                                  
                                  if (transfer.received > 0) {
                                    const formattedAmount = (transfer.received / BigInt(10 ** decimals)).toString();
                                    outputTokensData.push({
                                      symbol: token.symbol,
                                      amount: formattedAmount,
                                      address: transfer.address,
                                      image: token.image || null,
                                    });
                                  }
                                }
                              }
                            } catch (error) {
                              console.error('Error parsing transaction logs:', error);
                              // Fallback to quote data if log parsing fails
                              if (quoteResult?.inTokens && quoteResult?.inAmounts) {
                                quoteResult.inTokens.forEach((tokenAddress, index) => {
                                  const token = allTokenBalances.find(t => t.address.toLowerCase() === tokenAddress.toLowerCase()) ||
                                               tokenList.find(t => t.address.toLowerCase() === tokenAddress.toLowerCase());
                                  if (token) {
                                    const amount = quoteResult.inAmounts?.[index] || '0';
                                    const decimals = token.decimals || 18;
                                    const formattedAmount = (BigInt(amount) / BigInt(10 ** decimals)).toString();
                                    inputTokensData.push({
                                      symbol: token.symbol,
                                      amount: formattedAmount,
                                      address: tokenAddress,
                                      image: token.image || null,
                                    });
                                  }
                                });
                              }
                              if (quoteResult?.outTokens && quoteResult?.outAmounts) {
                                quoteResult.outTokens.forEach((tokenAddress, index) => {
                                  const token = allTokenBalances.find(t => t.address.toLowerCase() === tokenAddress.toLowerCase()) ||
                                               tokenList.find(t => t.address.toLowerCase() === tokenAddress.toLowerCase()) ||
                                               (tokenAddress.toLowerCase() === '0x0000000000000000000000000000000000000000' ? { symbol: 'ETH', decimals: 18, image: null } : null);
                                  if (token) {
                                    const amount = quoteResult.outAmounts?.[index] || '0';
                                    const decimals = token.decimals || 18;
                                    const formattedAmount = (BigInt(amount) / BigInt(10 ** decimals)).toString();
                                    outputTokensData.push({
                                      symbol: token.symbol,
                                      amount: formattedAmount,
                                      address: tokenAddress,
                                      image: token.image || null,
                                    });
                                  }
                                });
                              }
                            }
                          } else {
                            // Fallback to quote data if no transaction hash
                            if (quoteResult?.inTokens && quoteResult?.inAmounts) {
                              quoteResult.inTokens.forEach((tokenAddress, index) => {
                                const token = allTokenBalances.find(t => t.address.toLowerCase() === tokenAddress.toLowerCase()) ||
                                             tokenList.find(t => t.address.toLowerCase() === tokenAddress.toLowerCase());
                                if (token) {
                                  const amount = quoteResult.inAmounts?.[index] || '0';
                                  const decimals = token.decimals || 18;
                                  const formattedAmount = (BigInt(amount) / BigInt(10 ** decimals)).toString();
                                  inputTokensData.push({
                                    symbol: token.symbol,
                                    amount: formattedAmount,
                                    address: tokenAddress,
                                    image: token.image || null,
                                  });
                                }
                              });
                            }
                            if (quoteResult?.outTokens && quoteResult?.outAmounts) {
                              quoteResult.outTokens.forEach((tokenAddress, index) => {
                                const token = allTokenBalances.find(t => t.address.toLowerCase() === tokenAddress.toLowerCase()) ||
                                             tokenList.find(t => t.address.toLowerCase() === tokenAddress.toLowerCase()) ||
                                             (tokenAddress.toLowerCase() === '0x0000000000000000000000000000000000000000' ? { symbol: 'ETH', decimals: 18, image: null } : null);
                                if (token) {
                                  const amount = quoteResult.outAmounts?.[index] || '0';
                                  const decimals = token.decimals || 18;
                                  const formattedAmount = (BigInt(amount) / BigInt(10 ** decimals)).toString();
                                  outputTokensData.push({
                                    symbol: token.symbol,
                                    amount: formattedAmount,
                                    address: tokenAddress,
                                    image: token.image || null,
                                  });
                                }
                              });
                            }
                          }
                          
                          console.log('Input tokens data:', inputTokensData);
                          console.log('Output tokens data:', outputTokensData);
                          
                          // Ensure we have at least some data to show
                          if (inputTokensData.length === 0 && outputTokensData.length === 0) {
                            console.warn('No token data found, using quote data as fallback');
                            // Use quote data as final fallback
                            if (quoteResult?.inTokens && quoteResult?.inAmounts) {
                              quoteResult.inTokens.forEach((tokenAddress, index) => {
                                const token = allTokenBalances.find(t => t.address.toLowerCase() === tokenAddress.toLowerCase()) ||
                                             tokenList.find(t => t.address.toLowerCase() === tokenAddress.toLowerCase());
                                if (token) {
                                  const amount = quoteResult.inAmounts?.[index] || '0';
                                  const decimals = token.decimals || 18;
                                  const formattedAmount = (BigInt(amount) / BigInt(10 ** decimals)).toString();
                                  inputTokensData.push({
                                    symbol: token.symbol,
                                    amount: formattedAmount,
                                    address: tokenAddress,
                                    image: token.image || null,
                                  });
                                }
                              });
                            }
                            if (quoteResult?.outTokens && quoteResult?.outAmounts) {
                              quoteResult.outTokens.forEach((tokenAddress, index) => {
                                const token = allTokenBalances.find(t => t.address.toLowerCase() === tokenAddress.toLowerCase()) ||
                                             tokenList.find(t => t.address.toLowerCase() === tokenAddress.toLowerCase()) ||
                                             (tokenAddress.toLowerCase() === '0x0000000000000000000000000000000000000000' ? { symbol: 'ETH', decimals: 18, image: null } : null);
                                if (token) {
                                  const amount = quoteResult.outAmounts?.[index] || '0';
                                  const decimals = token.decimals || 18;
                                  const formattedAmount = (BigInt(amount) / BigInt(10 ** decimals)).toString();
                                  outputTokensData.push({
                                    symbol: token.symbol,
                                    amount: formattedAmount,
                                    address: tokenAddress,
                                    image: token.image || null,
                                  });
                                }
                              });
                            }
                          }
                          
                          // Close quote modal immediately
                          setQuoteResult(null);
                          setSwapError(null); // Clear any errors
                          
                          // Show success modal
                          console.log('Setting swap success data:', { inputTokensData, outputTokensData, transactionHash });
                          setSwapSuccessData({
                            inputTokens: inputTokensData,
                            outputTokens: outputTokensData,
                            transactionHash,
                          });
                          
                          // Send success notification
                          if (userFid && selectedTokens.size > 0) {
                            const notification = NotificationTemplates.swapSuccess(
                              selectedTokens.size,
                              outputToken.symbol
                            );
                            sendNotification(userFid, notification).catch(console.error);
                          }
                          
                          setSelectedTokens(new Set()); // Clear selection after successful swap
                          setSimulationResult(null); // Reset simulation result after successful swap
                        } else if (status.statusName === 'error') {
                          console.error('Transaction error:', status.statusData);
                          
                          // Parse error message
                          const statusData = status.statusData as { error?: { message?: string; code?: string | number } };
                          const errorMessage = statusData?.error?.message || 'Transaction failed.';
                          const errorCode = statusData?.error?.code;

                          // Check if error is due to simulation failure
                          const isSimulationError = errorMessage.includes('Simulation failed') ||
                                                    errorMessage.includes('New quote fetched');

                          // Determine if user can retry
                          let canRetry = true;
                          let userFriendlyMessage = errorMessage;

                          // Handle specific error cases
                          if (errorCode === 4001 || errorMessage.includes('User rejected')) {
                            userFriendlyMessage = 'Transaction was cancelled by user.';
                            canRetry = true;
                          } else if (errorCode === -32603 || errorMessage.includes('execution reverted')) {
                            userFriendlyMessage = 'Transaction execution failed. Please check your balance or approval status.';
                            canRetry = true;
                          } else if (errorMessage.includes('insufficient funds') || errorMessage.includes('gas')) {
                            userFriendlyMessage = 'Insufficient gas. Please check your balance.';
                            canRetry = true;
                          } else if (isSimulationError) {
                            // Simulation failed - new quote was already fetched
                            setSimulationResult(null);
                            userFriendlyMessage = 'Route validation failed. New route found. Please try again.';
                            canRetry = true;
                          }
                          
                          // Show error modal
                          setSwapError({
                            message: userFriendlyMessage,
                            isSimulationError,
                            canRetry,
                          });
                          
                          // Reset simulation result if it was a simulation error
                          if (isSimulationError) {
                            setSimulationResult(null);
                          }
                          
                          // Send failure notification
                          if (userFid) {
                            const notification = NotificationTemplates.swapFailed();
                            sendNotification(userFid, notification).catch(console.error);
                          }
                        }
                      }}
                    >
                      <div ref={swapButtonWrapperRef}>
                        <TransactionButton
                          className={styles.swapButton}
                          text={buttonText}
                        />
                      </div>
                      <TransactionStatus>
                        <TransactionStatusLabel />
                        <TransactionStatusAction />
                      </TransactionStatus>
                    </Transaction>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error Modal */}
      {quoteError && (
        <div className={styles.settingsModal} onClick={() => setQuoteError(null)}>
          <div className={styles.settingsModalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.settingsHeader}>
              <h2 style={{ color: '#fca5a5' }}>Quote 실패</h2>
              <button onClick={() => setQuoteError(null)} className={styles.closeButton}>
                ×
              </button>
            </div>
            
            <div className={styles.settingsBody}>
              <div className={styles.errorMessage}>
                {quoteError}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Swap Success Modal */}
      {swapSuccessData && (
        <div className={styles.settingsModal} onClick={() => setSwapSuccessData(null)}>
          <div className={styles.settingsModalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.settingsHeader}>
              <h2 style={{ color: '#86efac' }}>✓ Swap Successful!</h2>
              <button onClick={() => setSwapSuccessData(null)} className={styles.closeButton}>
                ×
              </button>
            </div>
            
            <div className={styles.settingsBody}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {/* Input Tokens */}
                <div>
                  <div style={{ fontSize: '0.875rem', color: 'rgba(255, 255, 255, 0.6)', marginBottom: '0.75rem' }}>
                    Sent Tokens
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {swapSuccessData.inputTokens.map((token, index) => (
                      <div key={index} style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '0.75rem',
                        padding: '0.75rem',
                        background: 'rgba(255, 255, 255, 0.05)',
                        borderRadius: '8px'
                      }}>
                        {token.image && (
                          <TokenImage
                            src={token.image}
                            alt={token.symbol}
                            width={32}
                            height={32}
                            className={styles.outputTokenOptionImage}
                          />
                        )}
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '0.875rem', fontWeight: 500, color: 'white' }}>
                            -{parseFloat(token.amount).toFixed(6)} {token.symbol}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Arrow */}
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M12 5V19M12 19L19 12M12 19L5 12" stroke="#86efac" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>

                {/* Output Tokens */}
                <div>
                  <div style={{ fontSize: '0.875rem', color: 'rgba(255, 255, 255, 0.6)', marginBottom: '0.75rem' }}>
                    Received Tokens
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {swapSuccessData.outputTokens.map((token, index) => (
                      <div key={index} style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '0.75rem',
                        padding: '0.75rem',
                        background: 'rgba(34, 197, 94, 0.1)',
                        borderRadius: '8px',
                        border: '1px solid rgba(34, 197, 94, 0.3)'
                      }}>
                        {token.image && (
                          <TokenImage
                            src={token.image}
                            alt={token.symbol}
                            width={32}
                            height={32}
                            className={styles.outputTokenOptionImage}
                          />
                        )}
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#86efac' }}>
                            +{parseFloat(token.amount).toFixed(6)} {token.symbol}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>
      )}

      {/* Hide Small Balance Toggle - only show on Balance tab */}
      {isConnected && activeTab === 'balance' && allTokenBalances.length > 0 && (
        <div className={styles.dustFilterHeader}>
          <label className={styles.toggleContainer}>
            <input
              type="checkbox"
              checked={hideDustTokens}
              onChange={(e) => setHideDustTokens(e.target.checked)}
              className={styles.dustFilterCheckbox}
            />
            <span className={styles.toggleLabel}>Hide Small Balance</span>
          </label>
        </div>
      )}

      {/* Body - Tab Content */}
      <div className={styles.body}>
        {/* Landing page for non-connected users */}
        {!isConnected ? (
          <div className={styles.landingContainer}>
            {/* Hero Section */}
            <div className={styles.landingHero}>
              <div className={styles.landingLogo}>🚽</div>
              <h1 className={styles.landingTitle}>Flush</h1>
              <p className={styles.landingTagline}>
                Swap all your tokens to USDC in one click
              </p>
            </div>

            {/* Features Section */}
            <div className={styles.landingFeatures}>
              <div className={styles.featureCard}>
                <div className={styles.featureIcon}>⚡</div>
                <h3 className={styles.featureTitle}>Batch Swap</h3>
                <p className={styles.featureDesc}>
                  Select multiple tokens and swap them all at once. Save time and gas fees.
                </p>
              </div>

              <div className={styles.featureCard}>
                <div className={styles.featureIcon}>🧹</div>
                <h3 className={styles.featureTitle}>Clean Dust</h3>
                <p className={styles.featureDesc}>
                  Get rid of small token balances cluttering your wallet.
                </p>
              </div>

              <div className={styles.featureCard}>
                <div className={styles.featureIcon}>💰</div>
                <h3 className={styles.featureTitle}>Best Rates</h3>
                <p className={styles.featureDesc}>
                  Powered by 0x DEX aggregator for optimal swap routing.
                </p>
              </div>
            </div>

            {/* CTA Section */}
            <div className={styles.landingCTA}>
              <p className={styles.landingCTAText}>
                Connect your wallet to get started
              </p>
              <div className={styles.landingWalletButton}>
                <Wallet>
                  <ConnectWallet>
                    <Avatar className="h-6 w-6" />
                    <Name />
                  </ConnectWallet>
                  <WalletDropdown>
                    <Identity className="px-4 pt-3 pb-2" hasCopyAddressOnClick>
                      <Avatar />
                      <Name />
                      <EthBalance />
                    </Identity>
                    <WalletDropdownDisconnect />
                  </WalletDropdown>
                </Wallet>
              </div>
            </div>
          </div>
        ) : activeTab === 'rewards' ? (
          <RewardsTab address={address} />
        ) : activeTab === 'balance' ? (
          <>
            {isLoadingTokens ? (
              <div className={styles.loadingIndicator}>
                <div className={styles.loadingSpinner}></div>
                <div className={styles.loadingText}>Loading tokens...</div>
              </div>
            ) : allTokenBalances.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
                No tokens found
              </div>
            ) : filteredTokenBalances.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
                {hideDustTokens
                  ? `${dustTokenCount} dust token(s) under $${DUST_THRESHOLD}. Disable filter to view.`
                  : 'No tokens to display'}
              </div>
            ) : (
              <div className={styles.tokenList}>
                {filteredTokenBalances.map((token, index) => {
                  const isSelected = selectedTokens.has(token.symbol);
                  const tokenForChip = tokensForChip[index];
                  const isUSDC = token.address.toLowerCase() === USDC_ADDRESS.toLowerCase();
                  const isOutputToken = token.address.toLowerCase() === outputTokenAddress.toLowerCase();
                  const isDisabled = isOutputToken;
                  const percentage = tokenAmounts.get(token.symbol) || 100;
                  const adjustedBalance = parseFloat(token.balanceFormatted) * (percentage / 100);
                  const adjustedUsdValue = (token.usdValue || 0) * (percentage / 100);

                  return (
                    <div
                      key={token.address}
                      className={`${styles.tokenItem} ${isSelected ? styles.tokenItemSelected : ''} ${isDisabled ? styles.tokenItemDisabled : ''}`}
                      style={{
                        opacity: isDisabled ? 0.5 : 1,
                        cursor: isDisabled ? 'not-allowed' : 'pointer',
                        flexDirection: 'column',
                        alignItems: 'stretch',
                        gap: '0.5rem'
                      }}
                    >
                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}
                        onClick={() => !isDisabled && handleTokenToggle(token.symbol)}
                      >
                        <div className={styles.tokenInfo}>
                          <TokenChip
                            token={tokenForChip}
                            onClick={() => !isDisabled && handleTokenToggle(token.symbol)}
                          />
                          <div className={styles.tokenName}>
                            {token.name}
                            {isDisabled && <span style={{ fontSize: '0.7rem', color: 'rgba(255, 255, 255, 0.5)', marginLeft: '0.25rem' }}>(Output)</span>}
                          </div>
                        </div>
                        <div className={styles.tokenBalanceSection}>
                          <div className={styles.tokenBalance}>
                            {isSelected && percentage < 100
                              ? `${adjustedBalance.toFixed(4)}/${token.balanceFormatted}`
                              : token.balanceFormatted} {token.symbol}
                          </div>
                          {token.usdValue !== undefined && (
                            <div className={styles.tokenUsdtValue}>
                              {isSelected && percentage < 100
                                ? `$${adjustedUsdValue.toFixed(2)}/$${token.usdValue.toFixed(2)}`
                                : `$${token.usdValue.toFixed(2)}`}
                              {isSelected && percentage < 100 && (
                                <span style={{ color: 'rgba(255,255,255,0.4)', marginLeft: '4px' }}>
                                  ({percentage}%)
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        <div
                          className={`${styles.tokenCheckboxMinimal} ${isSelected ? styles.tokenCheckboxMinimalSelected : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!isDisabled) {
                              handleTokenToggle(token.symbol);
                            }
                          }}
                        >
                          {isSelected && (
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                              <path d="M13.3333 4L6 11.3333L2.66667 8" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </div>
                      </div>
                      {/* Amount selector - only show when selected */}
                      {isSelected && (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            paddingLeft: '0.5rem',
                            marginTop: '0.25rem'
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div style={{ display: 'flex', gap: '0.25rem' }}>
                            {[25, 50, 75, 100].map((pct) => (
                              <button
                                key={pct}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleTokenAmountChange(token.symbol, pct);
                                }}
                                style={{
                                  padding: '0.25rem 0.5rem',
                                  fontSize: '0.75rem',
                                  fontWeight: percentage === pct ? 600 : 400,
                                  background: percentage === pct ? 'rgba(147, 51, 234, 0.3)' : 'rgba(255,255,255,0.1)',
                                  border: percentage === pct ? '1px solid rgba(147, 51, 234, 0.5)' : '1px solid rgba(255,255,255,0.2)',
                                  borderRadius: '6px',
                                  color: 'white',
                                  cursor: 'pointer',
                                  minWidth: '40px',
                                  transition: 'all 0.2s ease'
                                }}
                              >
                                {pct}%
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : activeTab === 'swapHistory' ? (
          <HistoryTab
            address={address}
            tokenList={tokenList.map(t => ({
              address: t.address,
              symbol: t.symbol,
              name: t.name,
              decimals: t.decimals,
              image: t.image || null,
            }))}
          />
        ) : null}
      </div>

      {/* Fixed Bottom Button with Output Token Selector */}
      {activeTab === 'balance' && (
        <div className={styles.bottomButtonContainer}>
          {/* Selection Info Bar */}
          {isConnected && selectedTokens.size > 0 && (
            <div className={styles.selectionInfoBar}>
              <span className={styles.selectionCount}>{selectedTokens.size} selected</span>
              <button
                onClick={() => setSelectedTokens(new Set())}
                className={styles.clearButton}
              >
                Clear
              </button>
            </div>
          )}
          
          {/* One-line layout: Token button on left, Swap button on right */}
          {isConnected && (
            <div className={styles.swapButtonRow}>
              {/* Output Token Selector Button (Left) */}
              <div 
                className={styles.outputTokenSelectorWrapper}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.stopPropagation();
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('Output token button clicked, current state:', showOutputTokenSelector);
                    console.log('Available tokens:', availableOutputTokens.length);
                    setShowOutputTokenSelector((prev) => {
                      console.log('Setting showOutputTokenSelector to:', !prev);
                      return !prev;
                    });
                  }}
                  className={styles.outputTokenButton}
                >
                  {outputToken.image && (
                    <TokenImage
                      src={outputToken.image}
                      alt={outputToken.symbol}
                      width={20}
                      height={20}
                      className={styles.outputTokenImage}
                    />
                  )}
                  <span className={styles.outputTokenSymbol}>{outputToken.symbol}</span>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ marginLeft: '0.25rem' }}>
                    <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                
                {showOutputTokenSelector && (
                  <div 
                    className={styles.outputTokenDropdown} 
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className={styles.outputTokenDropdownHeader}>Select Output Token</div>
                    <div className={styles.outputTokenList}>
                      {availableOutputTokens.length === 0 ? (
                        <div style={{ padding: '1rem', textAlign: 'center', color: 'rgba(255, 255, 255, 0.5)' }}>
                          Loading tokens...
                        </div>
                      ) : (
                        availableOutputTokens.map((token) => {
                        const isSelected = token.address.toLowerCase() === outputTokenAddress.toLowerCase();
                        return (
                          <button
                            key={token.address}
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              console.log('Token selected:', token.symbol, token.address);
                              console.log('Current outputTokenAddress:', outputTokenAddress);
                              setOutputTokenAddress(token.address);
                              console.log('Setting outputTokenAddress to:', token.address);
                              setShowOutputTokenSelector(false);
                              console.log('Closing dropdown');
                            }}
                            className={`${styles.outputTokenOption} ${isSelected ? styles.outputTokenOptionSelected : ''}`}
                          >
                            {token.image && (
                              <TokenImage
                                src={token.image}
                                alt={token.symbol}
                                width={32}
                                height={32}
                                className={styles.outputTokenOptionImage}
                              />
                            )}
                            <div className={styles.outputTokenOptionInfo}>
                              <div className={styles.outputTokenOptionSymbol}>{token.symbol}</div>
                              <div className={styles.outputTokenOptionName}>{token.name}</div>
                            </div>
                            {isSelected && (
                              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                <path d="M13.3333 4L6 11.3333L2.66667 8" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            )}
                          </button>
                        );
                      }))}
                    </div>
                  </div>
                )}
              </div>
              
              {/* Swap Button (Right) */}
              <button 
                className={styles.swapButton}
                disabled={selectedTokens.size === 0 || isTestingQuote}
                onClick={handleTestQuote}
              >
                {isTestingQuote
                  ? "Getting quote..."
                  : selectedTokens.size === 0
                  ? "Select tokens to swap"
                  : (() => {
                      const totalValue = Array.from(selectedTokens).reduce((sum, symbol) => {
                        const token = allTokenBalances.find(t => t.symbol === symbol);
                        const percentage = tokenAmounts.get(symbol) || 100;
                        return sum + ((token?.usdValue || 0) * percentage / 100);
                      }, 0);
                      return `Swap for $${totalValue.toFixed(2)}`;
                    })()}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Bottom Navigation Bar */}
      {isConnected && (
        <BottomNavigation
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
      )}
    </div>
  );
}
