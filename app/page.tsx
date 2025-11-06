"use client";
import { useState, useEffect, useMemo, useCallback } from "react";
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
import { formatTokenBalance, formatCurrency } from "../lib/tokenUtils";
import { fetchPopularTokensList, type TokenInfo } from "../lib/tokenList";
import { USDC_ADDRESS } from "../lib/constants";
import { testOdosQuote, assembleOdosSwap, type OdosQuoteResponse } from "../lib/odos";
import { checkTokenApproval, createApproveCall, checkBatchCapabilities } from "../lib/batchSwap";
import { sendNotification, NotificationTemplates } from "../lib/notifications";
import { TokenImage } from "../components/TokenImage";
import { OnboardingModal } from "../components/OnboardingModal";
import { BottomNavigation } from "../components/BottomNavigation";
import type { Hex, Address as ViemAddress } from "viem";
import { numberToHex } from "viem";
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
  const [tokenList, setTokenList] = useState<TokenInfo[]>([]);
  const [tokenBalances, setTokenBalances] = useState<Map<string, bigint>>(new Map());
  const [tokenPrices, setTokenPrices] = useState<Map<string, number>>(new Map());
  const [isLoadingTokens, setIsLoadingTokens] = useState(false);
  const [hideDustTokens, setHideDustTokens] = useState(true); // 기본값: dust token 숨김
  const [activeTab, setActiveTab] = useState<'balance' | 'swapHistory' | 'hideSmallBalance'>('balance');
  const [isTestingQuote, setIsTestingQuote] = useState(false);
  const [quoteResult, setQuoteResult] = useState<OdosQuoteResponse | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showOutputTokenSelector, setShowOutputTokenSelector] = useState(false);
  const [swapCalls, setSwapCalls] = useState<Array<{ to: Hex; data: Hex; value: bigint }> | null>(null);
  const [isAssembling, setIsAssembling] = useState(false);
  const [approvalStatuses, setApprovalStatuses] = useState<Map<string, { approved: boolean; needsApproval: boolean; currentAllowance: bigint }>>(new Map());
  const [isCheckingApprovals, setIsCheckingApprovals] = useState(false);
  const [batchSupported, setBatchSupported] = useState<boolean | null>(null);
  const [isCheckingBatchSupport, setIsCheckingBatchSupport] = useState(false);
  const [transactionQueue, setTransactionQueue] = useState<Array<{ to: ViemAddress; value: bigint; data: Hex }>>([]);
  const [currentTransactionIndex, setCurrentTransactionIndex] = useState<number>(-1);
  const [walletType, setWalletType] = useState<'coinbase-smart-wallet' | 'eoa' | 'unknown' | null>(null);
  const [isCheckingWalletType, setIsCheckingWalletType] = useState(false);
  
  // Onboarding state
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  
  // User FID for notifications
  const [userFid, setUserFid] = useState<string | null>(null);
  
  // Odos API 설정
  const [slippageLimitPercent, setSlippageLimitPercent] = useState(0.5);
  const [outputTokenAddress, setOutputTokenAddress] = useState<string>(USDC_ADDRESS); // 기본값: USDC
  
  const DUST_THRESHOLD = 1; // $1 미만을 dust로 간주

  // Initialize the miniapp
  useEffect(() => {
    if (!isFrameReady) {
      setFrameReady();
    }
  }, [isFrameReady, setFrameReady]);

  // Check if user has seen onboarding
  useEffect(() => {
    const hasSeenOnboarding = localStorage.getItem('flush-onboarding-seen');
    if (!hasSeenOnboarding && !isConnected) {
      setShowOnboarding(true);
    }
  }, [isConnected]);

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

  // Mark onboarding as seen when user connects wallet or closes onboarding
  const handleOnboardingComplete = useCallback(() => {
    localStorage.setItem('flush-onboarding-seen', 'true');
    setShowOnboarding(false);
    setOnboardingStep(0);
  }, []);

  const handleOnboardingNext = useCallback(() => {
    setOnboardingStep((prev) => {
      if (prev < 2) {
        return prev + 1;
      } else {
        handleOnboardingComplete();
        return prev;
      }
    });
  }, [handleOnboardingComplete]);

  const handleOnboardingSkip = useCallback(() => {
    handleOnboardingComplete();
  }, [handleOnboardingComplete]);

  // Close output token selector when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (showOutputTokenSelector && !target.closest(`.${styles.outputTokenSelector}`)) {
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
    return allTokenBalances.find(t => t.address.toLowerCase() === outputTokenAddress.toLowerCase()) || 
           tokenList.find(t => t.address.toLowerCase() === outputTokenAddress.toLowerCase()) || {
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
    
    return Array.from(tokens.values());
  }, [allTokenBalances, tokenList]);

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
      } else {
        newSet.add(symbol);
      }
      return newSet;
    });
  }, []);

  // Test Odos Quote API v3 with selected tokens
  const handleTestQuote = useCallback(async () => {
    if (!address || selectedTokens.size === 0) {
      alert('토큰을 선택해주세요');
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

          const normalizedAddress = tokenAddress.toLowerCase();
          
          // 출력 토큰과 같은 토큰은 제외
          if (normalizedAddress === outputTokenAddressLower) {
            const outputTokenSymbol = allTokenBalances.find(
              t => t.address.toLowerCase() === outputTokenAddressLower
            )?.symbol || '출력 토큰';
            console.warn(`${outputTokenSymbol}는 출력 토큰이므로 입력에서 제외됩니다`);
            return;
          }
          
          // 중복 제거: 같은 토큰 주소가 있으면 잔액을 합산
          if (tokenDataMap.has(normalizedAddress)) {
            const existingBalance = tokenDataMap.get(normalizedAddress) || 0n;
            tokenDataMap.set(normalizedAddress, existingBalance + balance);
          } else {
            tokenDataMap.set(normalizedAddress, balance);
          }
        });

      // Map을 배열로 변환하고 잔액이 0보다 큰 것만 필터링
      const selectedTokenData = Array.from(tokenDataMap.entries())
        .filter(([_, amount]) => amount > 0n)
        .map(([tokenAddress, amount]) => ({
          tokenAddress,
          amount: amount.toString(),
        }));

      if (selectedTokenData.length === 0) {
        const outputTokenSymbol = allTokenBalances.find(
          t => t.address.toLowerCase() === outputTokenAddressLower
        )?.symbol || '출력 토큰';
        
        const hasOutputTokenOnly = Array.from(selectedTokens).every(symbol => {
          const token = allTokenBalances.find(t => t.symbol === symbol);
          return token && token.address.toLowerCase() === outputTokenAddressLower;
        });
        
        if (hasOutputTokenOnly) {
          throw new Error(`${outputTokenSymbol}는 출력 토큰이므로 스왑할 수 없습니다. 다른 토큰을 선택해주세요.`);
        }
        throw new Error('스왑할 토큰이 없습니다');
      }

      console.log('Testing Odos Quote API v3 with inputTokens:', selectedTokenData);

      // Step 1: Generate a quote using Odos API v3
      // Reference: https://docs.odos.xyz/build/quickstart/sor
      const quote = await testOdosQuote(
        selectedTokenData,
        outputTokenAddress.toLowerCase(),
        address.toLowerCase(),
        slippageLimitPercent,
        base.id
      );

      console.log('Odos Quote API v3 Response:', quote);
      console.log('Quote Details:', {
        pathId: quote.pathId,
        inputTokens: quote.inTokens,
        outputTokens: quote.outTokens,
        inputAmounts: quote.inAmounts,
        outputAmounts: quote.outAmounts,
        gasEstimate: quote.gasEstimate,
        priceImpact: quote.priceImpact,
        netOutValue: quote.netOutValue,
      });
      setQuoteResult(quote);
      setSwapCalls(null); // Reset swap calls when new quote is generated
      setApprovalStatuses(new Map()); // Reset approval statuses
      
      // Check approval statuses for all input tokens
      if (quote.inTokens && quote.inAmounts && address) {
        setIsCheckingApprovals(true);
        const statusMap = new Map<string, { approved: boolean; needsApproval: boolean; currentAllowance: bigint }>();
        
        // First, assemble to get router address
        try {
          // Assemble transaction using pathId from quote
          // Paths are valid for 60 seconds after the quote is received
          const assembleResult = await assembleOdosSwap(
            quote.pathId,
            address.toLowerCase(),
            slippageLimitPercent, // Optional: slippage tolerance
            base.id, // Optional: chain ID
            false // simulate: false (we're handling gas estimation ourselves)
          );
          const odosRouterAddress = assembleResult.transaction.to as ViemAddress;
          
          // Check each token
          const approvalPromises = quote.inTokens.map(async (tokenAddress) => {
            const tokenAddr = tokenAddress as ViemAddress;
            
            // Skip ETH
            if (tokenAddr.toLowerCase() === '0x0000000000000000000000000000000000000000') {
              statusMap.set(tokenAddr.toLowerCase(), { approved: true, needsApproval: false, currentAllowance: 0n });
              return;
            }
            
            // Check with max uint256 to see if unlimited approval exists
            const MAX_UINT256 = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
            const approval = await checkTokenApproval(tokenAddr, address as ViemAddress, MAX_UINT256, odosRouterAddress);
            statusMap.set(tokenAddr.toLowerCase(), approval);
          });
          
          await Promise.all(approvalPromises);
          setApprovalStatuses(statusMap);
        } catch (error) {
          console.error('Error checking approvals:', error);
        } finally {
          setIsCheckingApprovals(false);
        }
      }
    } catch (error) {
      console.error('Quote API test error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Quote API 호출 실패';
      setQuoteError(errorMessage);
    } finally {
      setIsTestingQuote(false);
    }
  }, [address, selectedTokens, outputTokenAddress, slippageLimitPercent, allTokenBalances, tokenBalances, ethBalance]);

  // Assemble and execute swap transaction with approve checks
  const handleExecuteSwap = useCallback(async () => {
    if (!quoteResult || !address) return;

    setIsAssembling(true);
    try {
      // Assemble transaction using pathId from quote
      // Paths are valid for 60 seconds after the quote is received
      const assembleResult = await assembleOdosSwap(
        quoteResult.pathId,
        address.toLowerCase(),
        slippageLimitPercent, // Optional: slippage tolerance
        base.id, // Optional: chain ID
        false // simulate: false (we're handling gas estimation ourselves)
      );

      console.log('Assemble result:', assembleResult);

      const odosRouterAddress = assembleResult.transaction.to as ViemAddress;
      console.log('📋 Odos Router Address:', odosRouterAddress);
      
      const calls: Array<{ to: ViemAddress; value: Hex; data: Hex }> = [];

      // Check approvals for each input token
      if (quoteResult.inTokens && quoteResult.inAmounts) {
        console.log(`\n🔍 Checking approvals for ${quoteResult.inTokens.length} input token(s)...`);
        
        for (let i = 0; i < quoteResult.inTokens.length; i++) {
          const tokenAddress = quoteResult.inTokens[i] as ViemAddress;
          const amount = BigInt(quoteResult.inAmounts[i] || '0');
          
          console.log(`\n📦 Token ${i + 1}/${quoteResult.inTokens.length}:`);
          console.log('  - Address:', tokenAddress);
          console.log('  - Amount:', amount.toString());

          // Skip ETH (native token doesn't need approval)
          if (tokenAddress.toLowerCase() === '0x0000000000000000000000000000000000000000') {
            console.log('  - Type: ETH (native token, no approval needed)');
            continue;
          }

          // Check if approval is needed (including WETH)
          // Check with max uint256 to see if unlimited approval exists
          const MAX_UINT256 = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
          console.log('  - Checking approval status...');
          
          const approval = await checkTokenApproval(tokenAddress, address as ViemAddress, MAX_UINT256, odosRouterAddress);
          
          console.log('  - Current Allowance:', approval.currentAllowance.toString());
          console.log('  - Approved:', approval.approved);
          console.log('  - Needs Approval:', approval.needsApproval);
          
          if (approval.needsApproval) {
            console.log(`  ✅ Adding approve call for token ${tokenAddress}`);
            const approveCall = createApproveCall(tokenAddress, odosRouterAddress, amount);
            console.log('  - Approve Call Details:', {
              to: approveCall.to,
              value: approveCall.value,
              data: approveCall.data.substring(0, 20) + '...' + approveCall.data.substring(approveCall.data.length - 20),
              dataLength: approveCall.data.length
            });
            calls.push(approveCall);
          } else {
            console.log(`  ⏭️  Token ${tokenAddress} already has unlimited approval, skipping`);
          }
        }
      }

      // Add the swap transaction call
      console.log(`\n🔄 Adding swap transaction call:`);
      console.log('  - To:', odosRouterAddress);
      console.log('  - Value:', assembleResult.transaction.value);
      console.log('  - Data:', assembleResult.transaction.data.substring(0, 50) + '...' + assembleResult.transaction.data.substring(assembleResult.transaction.data.length - 50));
      console.log('  - Data Length:', assembleResult.transaction.data.length);
      
      const swapCall = {
        to: odosRouterAddress,
        data: assembleResult.transaction.data as Hex,
        value: numberToHex(BigInt(assembleResult.transaction.value || '0')) as Hex,
      };
      
      calls.push(swapCall);

      console.log(`\n📊 Final Batch Calls Summary:`);
      console.log(`  - Total Calls: ${calls.length}`);
      console.log(`  - Approve Calls: ${calls.length - 1}`);
      console.log(`  - Swap Call: 1`);
      console.log('\n📋 Complete Calls Array:');
      calls.forEach((call, index) => {
        console.log(`\n  Call ${index + 1}:`);
        console.log('    to:', call.to);
        console.log('    value:', call.value);
        
        // Decode function selector for approve calls
        if (call.data.startsWith('0x095ea7b3')) {
          console.log('    type: ERC20 Approve');
          console.log('    function: approve(address spender, uint256 amount)');
          // Decode approve parameters
          const spender = '0x' + call.data.substring(34, 74);
          const amount = call.data.substring(74);
          console.log('    spender:', spender);
          console.log('    amount:', amount === 'f'.repeat(64) ? 'MAX_UINT256 (unlimited)' : BigInt('0x' + amount).toString());
        } else {
          console.log('    type: Odos Swap');
          console.log('    function: swapMultiCompact (or similar Odos function)');
        }
        
        console.log('    data:', call.data.substring(0, 66) + '...' + (call.data.length > 66 ? call.data.substring(call.data.length - 20) : ''));
        console.log('    data length:', call.data.length, 'bytes');
      });
      
      console.log('\n🔗 Full Calls Object:', JSON.stringify(calls.map(c => ({
        to: c.to,
        value: c.value,
        data: c.data.substring(0, 20) + '...' + c.data.substring(c.data.length - 20),
        type: c.data.startsWith('0x095ea7b3') ? 'ERC20 Approve' : 'Odos Swap'
      })), null, 2));

      // Check if batch transactions are supported
      console.log('\n🔍 Checking batch transaction support...');
      const batchSupported = await checkBatchCapabilities();
      console.log('📊 Batch Support:', batchSupported ? '✅ Supported' : '❌ Not supported');
      
      if (batchSupported && calls.length > 1) {
        // Use Base Account SDK for batch transaction
        console.log('✅ Using batch transaction (Base Account SDK)');
        setSwapCalls(calls.map(call => ({
          ...call,
          value: BigInt(call.value),
        })));
        setTransactionQueue([]);
        setCurrentTransactionIndex(-1);
      } else {
        if (!batchSupported && calls.length > 1) {
          console.warn('⚠️ Batch transactions not supported. Will execute calls sequentially.');
          // Store all calls in queue for sequential execution
          setTransactionQueue(calls.map(call => ({
            to: call.to,
            data: call.data,
            value: BigInt(call.value),
          })));
          setCurrentTransactionIndex(0); // Start with first transaction
          setSwapCalls(null); // Don't use batch
        } else {
          // Only swap transaction, no approve needed
          console.log('✅ Only swap transaction needed');
          setSwapCalls([{
            to: odosRouterAddress,
            data: assembleResult.transaction.data as Hex,
            value: BigInt(assembleResult.transaction.value || '0'),
          }]);
          setTransactionQueue([]);
          setCurrentTransactionIndex(-1);
        }
      }
    } catch (error) {
      console.error('Assemble error:', error);
      const errorMessage = error instanceof Error ? error.message : '트랜잭션 준비 실패';
      setQuoteError(errorMessage);
    } finally {
      setIsAssembling(false);
    }
  }, [quoteResult, address, slippageLimitPercent]);

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
        
        {/* Output Token Selector */}
        {isConnected && (
          <div className={styles.outputTokenSelector}>
            <div className={styles.outputTokenLabel}>출력 토큰:</div>
            <button
              onClick={() => setShowOutputTokenSelector(!showOutputTokenSelector)}
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
              <div className={styles.outputTokenDropdown}>
                <div className={styles.outputTokenDropdownHeader}>출력 토큰 선택</div>
                <div className={styles.outputTokenList}>
                  {availableOutputTokens.map((token) => {
                    const isSelected = token.address.toLowerCase() === outputTokenAddress.toLowerCase();
                    return (
                      <button
                        key={token.address}
                        onClick={() => {
                          setOutputTokenAddress(token.address);
                          setShowOutputTokenSelector(false);
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
                            <path d="M13.3333 4L6 11.3333L2.66667 8" stroke="#f7d954" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* Settings & Wallet Connection */}
        <div className={styles.headerActions}>
          {isConnected && (
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={styles.settingsButton}
              title="설정"
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
              <h2>스왑 설정</h2>
              <button onClick={() => setShowSettings(false)} className={styles.closeButton}>
                ×
              </button>
            </div>
            
            <div className={styles.settingsBody}>
              {/* Slippage Tolerance */}
              <div className={styles.settingsItem}>
                <label className={styles.settingsLabel}>
                  슬리피지 허용 범위 (%)
                  <span className={styles.settingsDescription}>
                    가격 변동 허용 범위입니다. 기본값: 0.5%
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
          setSwapCalls(null);
        }}>
          <div className={styles.settingsModalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.settingsHeader}>
              <h2>✓ Quote 성공!</h2>
              <button onClick={() => {
                setQuoteResult(null);
                setSwapCalls(null);
              }} className={styles.closeButton}>
                ×
              </button>
            </div>
            
            <div className={styles.settingsBody}>
              {/* Approval Status & Swap Preview */}
              {isCheckingApprovals ? (
                <div className={styles.quoteInfoRow}>
                  <div className={styles.quoteInfoLabel}>Approve 상태 확인 중...</div>
                  <div className={styles.quoteInfoValue}>⏳</div>
                </div>
              ) : quoteResult.inTokens && quoteResult.inTokens.length > 0 && (
                <div className={styles.swapPreviewSection}>
                  <div className={styles.swapPreviewHeader}>스왑 미리보기</div>
                  
                  {/* Input Tokens */}
                  <div className={styles.swapPreviewTokens}>
                    <div className={styles.swapPreviewLabel}>입력</div>
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
                                {amountNum.toLocaleString('en-US', { maximumFractionDigits: 6 })} {symbol}
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
                                  Approve 필요
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
                    <div className={styles.swapPreviewLabel}>출력</div>
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
                                {amountNum.toLocaleString('en-US', { maximumFractionDigits: 6 })} {symbol}
                              </div>
                              <div className={styles.swapPreviewTokenSubtext}>
                                최소: {minReceived.toLocaleString('en-US', { maximumFractionDigits: 6 })} {symbol}
                              </div>
                            </div>
                            <div className={styles.swapPreviewTokenStatus}>
                              <span className={styles.approvalBadge} style={{ background: 'rgba(34, 197, 94, 0.1)', color: '#86efac' }}>
                                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ marginRight: '0.25rem' }}>
                                  <path d="M11.6667 3.5L5.25 9.91667L2.33333 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                                수령 예정
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
                          <div className={styles.swapPreviewSummaryLabel}>예상 트랜잭션</div>
                          <div className={styles.swapPreviewSummaryValue}>
                            {needsApprovalCount > 0 ? (
                              <span>
                                {needsApprovalCount}개 approve + 1개 swap = 총 {totalTransactions}개
                              </span>
                            ) : (
                              <span style={{ color: '#86efac' }}>1개 swap만 실행</span>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                    
                    {quoteResult.gasEstimateValue !== undefined && (
                      <>
                        <div className={styles.swapPreviewSummaryRow}>
                          <div className={styles.swapPreviewSummaryLabel}>예상 가스 비용</div>
                          <div className={styles.swapPreviewSummaryValue}>
                            ${quoteResult.gasEstimateValue.toFixed(4)}
                          </div>
                        </div>
                        {quoteResult.gasEstimateValue > 2 && (
                          <div style={{
                            padding: '0.75rem',
                            background: 'rgba(251, 191, 36, 0.1)',
                            border: '1px solid rgba(251, 191, 36, 0.3)',
                            borderRadius: '8px',
                            fontSize: '0.75rem',
                            color: '#fbbf24',
                            marginTop: '0.5rem'
                          }}>
                            💡 가스비 절약 팁: 이미 approve된 토큰은 다음 스왑부터 가스비가 절약됩니다. 첫 스왑은 approve 비용이 포함되어 가스비가 높을 수 있습니다.
                          </div>
                        )}
                      </>
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
                      return `${minReceived.toLocaleString('en-US', { maximumFractionDigits: 6 })} ${outputSymbol}`;
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
                <summary className={styles.quoteDetailsSummary}>더 보기</summary>
                <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {quoteResult.gasEstimate !== undefined && (
                    <div className={styles.quoteInfoRow}>
                      <div className={styles.quoteInfoLabel}>Gas Estimate</div>
                      <div className={styles.quoteInfoValue}>{quoteResult.gasEstimate.toLocaleString()}</div>
                    </div>
                  )}
                  
                  {quoteResult.gasEstimateValue !== undefined && (
                    <div className={styles.quoteInfoRow}>
                      <div className={styles.quoteInfoLabel}>Gas Cost</div>
                      <div className={styles.quoteInfoValue}>${quoteResult.gasEstimateValue.toFixed(4)}</div>
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
                    지갑 정보 확인 중...
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
                    ✅ Smart Wallet 감지됨 - 배치 트랜잭션 및 가스비 스폰서링 지원
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
                    ⚠️ EOA 지갑 - 배치 트랜잭션 미지원. Approve와 Swap이 순차적으로 실행됩니다.
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
                    ✅ EOA 지갑 - 배치 트랜잭션 지원됨
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
                    ⚠️ 배치 트랜잭션 미지원 - Approve와 Swap이 별도로 실행될 수 있습니다
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
                    ✅ 배치 트랜잭션 지원됨 - Approve와 Swap이 한 번에 실행됩니다
                  </div>
                ) : null}
                
                {!swapCalls && currentTransactionIndex === -1 ? (
                  <button
                    onClick={handleExecuteSwap}
                    disabled={isAssembling}
                    className={styles.swapButton}
                    style={{ fontSize: '0.875rem', padding: '0.75rem' }}
                  >
                    {isAssembling ? '스왑 실행 중...' : '스왑 실행하기'}
                  </button>
                ) : currentTransactionIndex >= 0 && transactionQueue.length > 0 ? (
                  // Sequential execution mode (batch not supported)
                  <>
                    <div style={{ 
                      padding: '0.75rem', 
                      background: 'rgba(251, 191, 36, 0.1)', 
                      border: '1px solid rgba(251, 191, 36, 0.3)',
                      borderRadius: '8px',
                      fontSize: '0.75rem',
                      color: '#fbbf24',
                      marginBottom: '0.75rem'
                    }}>
                      순차 실행 모드: {currentTransactionIndex + 1}/{transactionQueue.length}번째 트랜잭션
                      {transactionQueue[currentTransactionIndex]?.data.startsWith('0x095ea7b3') && ' (Approve)'}
                      {!transactionQueue[currentTransactionIndex]?.data.startsWith('0x095ea7b3') && ' (Swap)'}
                    </div>
                    <Transaction
                      key={`tx-${currentTransactionIndex}`} // Force remount for each transaction
                      chainId={base.id}
                      calls={[transactionQueue[currentTransactionIndex]]}
                      resetAfter={0} // Don't auto-reset, we'll handle it manually
                      isSponsored={true}
                      onStatus={(status) => {
                        console.log(`Transaction ${currentTransactionIndex + 1}/${transactionQueue.length} status:`, status);
                        if (status.statusName === 'success') {
                          // Move to next transaction automatically
                          setTimeout(() => {
                            if (currentTransactionIndex < transactionQueue.length - 1) {
                              console.log(`✅ Transaction ${currentTransactionIndex + 1} completed. Moving to next...`);
                              setCurrentTransactionIndex(currentTransactionIndex + 1);
                            } else {
                              // All transactions completed
                              console.log('✅ All transactions completed!');
                              
                              // Send success notification
                              if (userFid && selectedTokens.size > 0) {
                                const notification = NotificationTemplates.swapSuccess(
                                  selectedTokens.size,
                                  outputToken.symbol
                                );
                                sendNotification(userFid, notification).catch(console.error);
                              }
                              
                              setQuoteResult(null);
                              setSwapCalls(null);
                              setTransactionQueue([]);
                              setCurrentTransactionIndex(-1);
                              setSelectedTokens(new Set()); // Clear selection after successful swap
                            }
                          }, 500); // Short delay before moving to next
                        } else if (status.statusName === 'error') {
                          console.error('Transaction failed:', status.statusData);
                          
                          // Send failure notification
                          if (userFid) {
                            const notification = NotificationTemplates.swapFailed();
                            sendNotification(userFid, notification).catch(console.error);
                          }
                          
                          // Reset on error
                          setTransactionQueue([]);
                          setCurrentTransactionIndex(-1);
                        }
                      }}
                    >
                      <TransactionButton 
                        className={styles.swapButton}
                        text={
                          transactionQueue[currentTransactionIndex]?.data.startsWith('0x095ea7b3')
                            ? `Approve 실행 (${currentTransactionIndex + 1}/${transactionQueue.length})`
                            : `스왑 실행 (${currentTransactionIndex + 1}/${transactionQueue.length})`
                        }
                      />
                      <TransactionStatus>
                        <TransactionStatusLabel />
                        <TransactionStatusAction />
                      </TransactionStatus>
                    </Transaction>
                  </>
                ) : swapCalls ? (
                  // Batch execution mode (batch supported)
                  <>
                    {swapCalls.length > 1 && (
                      <div style={{ 
                        padding: '0.75rem', 
                        background: 'rgba(34, 197, 94, 0.1)', 
                        border: '1px solid rgba(34, 197, 94, 0.3)',
                        borderRadius: '8px',
                        fontSize: '0.75rem',
                        color: '#86efac',
                        marginBottom: '0.75rem'
                      }}>
                        {swapCalls.length - 1}개의 approve 트랜잭션과 스왑이 배치로 실행됩니다
                      </div>
                    )}
                    <Transaction
                      chainId={base.id}
                      calls={swapCalls}
                      isSponsored={true}
                      onStatus={(status) => {
                        console.log('Transaction status:', status);
                        if (status.statusName === 'success') {
                          // Send success notification
                          if (userFid && selectedTokens.size > 0) {
                            const notification = NotificationTemplates.swapSuccess(
                              selectedTokens.size,
                              outputToken.symbol
                            );
                            sendNotification(userFid, notification).catch(console.error);
                          }
                          
                          setQuoteResult(null);
                          setSwapCalls(null);
                          setSelectedTokens(new Set()); // Clear selection after successful swap
                        } else if (status.statusName === 'error') {
                          // Send failure notification
                          if (userFid) {
                            const notification = NotificationTemplates.swapFailed();
                            sendNotification(userFid, notification).catch(console.error);
                          }
                        }
                      }}
                    >
                      <TransactionButton className={styles.swapButton} />
                      {swapCalls.length > 1 && (
                        <div style={{ fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.6)', textAlign: 'center', marginTop: '0.5rem' }}>
                          {swapCalls.length}개 트랜잭션이 배치로 실행됩니다
                        </div>
                      )}
                      <TransactionStatus>
                        <TransactionStatusLabel />
                        <TransactionStatusAction />
                      </TransactionStatus>
                    </Transaction>
                  </>
                ) : null}
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

      {/* Hide Small Balance Toggle - moved to header area */}
      {isConnected && allTokenBalances.length > 0 && (
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

      {/* Onboarding Modal */}
      <OnboardingModal
        showOnboarding={showOnboarding && !isConnected}
        onboardingStep={onboardingStep}
        onNext={handleOnboardingNext}
        onSkip={handleOnboardingSkip}
      />

      {/* Body - Tab Content */}
      <div className={styles.body}>
        {!isConnected && !showOnboarding ? (
          <div className={styles.onboardingSection}>
            <div className={styles.onboardingContent}>
              <h2 className={styles.onboardingTitle}>Welcome to Flush</h2>
              <p className={styles.onboardingDescription}>
                Consolidate your tokens in one transaction
              </p>
              <div className={styles.onboardingSteps}>
                <div className={styles.onboardingStep}>
                  <div className={styles.onboardingStepNumber}>1</div>
                  <div className={styles.onboardingStepText}>
                    Connect your wallet to see your token balances
                  </div>
                </div>
                <div className={styles.onboardingStep}>
                  <div className={styles.onboardingStepNumber}>2</div>
                  <div className={styles.onboardingStepText}>
                    Select tokens you want to swap
                  </div>
                </div>
                <div className={styles.onboardingStep}>
                  <div className={styles.onboardingStepNumber}>3</div>
                  <div className={styles.onboardingStepText}>
                    Choose your output token and execute the swap
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : activeTab === 'balance' ? (
          <>
            {isLoadingTokens ? (
              <div className={styles.loadingIndicator}>
                <div className={styles.loadingSpinner}></div>
                <div className={styles.loadingText}>Loading tokens...</div>
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
                  const isUSDC = token.address.toLowerCase() === USDC_ADDRESS.toLowerCase();
                  const isDisabled = isUSDC; // USDC는 출력 토큰이므로 선택 불가
                  
                  return (
                    <div
                      key={token.address}
                      className={`${styles.tokenItem} ${isSelected ? styles.tokenItemSelected : ''} ${isDisabled ? styles.tokenItemDisabled : ''}`}
                      onClick={() => !isDisabled && handleTokenToggle(token.symbol)}
                      style={{ 
                        opacity: isDisabled ? 0.5 : 1,
                        cursor: isDisabled ? 'not-allowed' : 'pointer'
                      }}
                    >
                      <div className={styles.tokenInfo}>
                        <TokenChip 
                          token={tokenForChip}
                          onClick={() => !isDisabled && handleTokenToggle(token.symbol)}
                        />
                        <div className={styles.tokenName}>
                          {token.name}
                          {isDisabled && <span style={{ fontSize: '0.7rem', color: 'rgba(255, 255, 255, 0.5)', marginLeft: '0.25rem' }}>(출력 토큰)</span>}
                        </div>
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
                        disabled={isDisabled}
                        onChange={() => !isDisabled && handleTokenToggle(token.symbol)}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isDisabled) {
                            e.preventDefault();
                          }
                        }}
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
          disabled={selectedTokens.size === 0 || isTestingQuote}
          onClick={handleTestQuote}
          style={{ marginBottom: selectedTokens.size > 0 ? '0.5rem' : '0' }}
        >
          {isTestingQuote
            ? "Testing Quote API..."
            : selectedTokens.size === 0
            ? "Select tokens to test"
            : `Test Quote API (${selectedTokens.size} → ${outputToken.symbol})`}
        </button>
        {selectedTokens.size > 0 && (
          <button 
            className={styles.swapButton}
            disabled={selectedTokens.size === 0}
            style={{ opacity: 0.5 }}
          >
            Swap to {outputToken.symbol} (Coming Soon)
          </button>
        )}
      </div>

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
