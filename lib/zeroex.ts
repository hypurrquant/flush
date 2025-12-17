import type { Address } from 'viem';

const ZEROEX_API_BASE_URL = 'https://api.0x.org';
const BASE_CHAIN_ID = '8453';

// 0x API key - should be set in environment variables
const ZEROEX_API_KEY = process.env.NEXT_PUBLIC_ZEROEX_API_KEY || '';

// Fee configuration
export const FEE_CONFIG = {
  // Fee in basis points (100 = 1%)
  swapFeeBps: 100, // 1% fee
  // Wallet address to receive fees
  swapFeeRecipient: process.env.NEXT_PUBLIC_FEE_RECIPIENT || '',
};

export interface ZeroExPriceResponse {
  blockNumber: string;
  buyAmount: string;
  buyToken: string;
  fees: {
    integratorFee: {
      amount: string;
      token: string;
      type: string;
    } | null;
    zeroExFee: {
      amount: string;
      token: string;
      type: string;
    } | null;
    gasFee: {
      amount: string;
      token: string;
      type: string;
    } | null;
  };
  gas: string;
  gasPrice: string;
  issues: {
    allowance: {
      actual: string;
      spender: string;
    } | null;
    balance: {
      token: string;
      actual: string;
      expected: string;
    } | null;
    simulationIncomplete: boolean;
    invalidSourcesPassed: string[];
  };
  liquidityAvailable: boolean;
  minBuyAmount: string;
  route: {
    fills: Array<{
      from: string;
      to: string;
      source: string;
      proportionBps: string;
    }>;
    tokens: Array<{
      address: string;
      symbol: string;
    }>;
  };
  sellAmount: string;
  sellToken: string;
  tokenMetadata: {
    buyToken: {
      buyTaxBps: string | null;
      sellTaxBps: string | null;
    };
    sellToken: {
      buyTaxBps: string | null;
      sellTaxBps: string | null;
    };
  };
  totalNetworkFee: string;
  zid: string;
}

export interface ZeroExQuoteResponse extends ZeroExPriceResponse {
  allowanceTarget: string;
  transaction: {
    to: string;
    data: string;
    value: string;
    gas: string;
    gasPrice: string;
  };
  permit2: {
    type: string;
    hash: string;
    eip712: unknown;
  } | null;
}

export interface ZeroExSwapInput {
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  taker: string;
  slippageBps?: number;
  swapFeeBps?: number;
  swapFeeRecipient?: string;
  swapFeeToken?: string;
}

/**
 * Get indicative price from 0x API (no commitment)
 */
export async function getZeroExPrice(
  sellToken: string,
  buyToken: string,
  sellAmount: string,
  taker: string,
  slippageBps: number = 50, // 0.5% default
  includeFee: boolean = true
): Promise<ZeroExPriceResponse> {
  const params = new URLSearchParams({
    chainId: BASE_CHAIN_ID,
    sellToken,
    buyToken,
    sellAmount,
    taker,
    slippageBps: slippageBps.toString(),
  });

  // Add fee parameters if enabled
  if (includeFee && FEE_CONFIG.swapFeeRecipient) {
    params.append('swapFeeBps', FEE_CONFIG.swapFeeBps.toString());
    params.append('swapFeeRecipient', FEE_CONFIG.swapFeeRecipient);
    params.append('swapFeeToken', buyToken); // Collect fee in output token (USDC)
  }

  const url = `${ZEROEX_API_BASE_URL}/swap/allowance-holder/price?${params.toString()}`;

  console.log('0x Price API Request:', url);

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      '0x-api-key': ZEROEX_API_KEY,
      '0x-version': 'v2',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('0x Price API Error:', errorText);
    throw new Error(`0x price failed (${response.status}): ${errorText}`);
  }

  return response.json();
}

/**
 * Get firm quote from 0x API (includes transaction data)
 */
export async function getZeroExQuote(
  sellToken: string,
  buyToken: string,
  sellAmount: string,
  taker: string,
  slippageBps: number = 50,
  includeFee: boolean = true
): Promise<ZeroExQuoteResponse> {
  const params = new URLSearchParams({
    chainId: BASE_CHAIN_ID,
    sellToken,
    buyToken,
    sellAmount,
    taker,
    slippageBps: slippageBps.toString(),
  });

  // Add fee parameters if enabled
  if (includeFee && FEE_CONFIG.swapFeeRecipient) {
    params.append('swapFeeBps', FEE_CONFIG.swapFeeBps.toString());
    params.append('swapFeeRecipient', FEE_CONFIG.swapFeeRecipient);
    params.append('swapFeeToken', buyToken); // Collect fee in output token (USDC)
  }

  const url = `${ZEROEX_API_BASE_URL}/swap/allowance-holder/quote?${params.toString()}`;

  console.log('0x Quote API Request:', url);

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      '0x-api-key': ZEROEX_API_KEY,
      '0x-version': 'v2',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('0x Quote API Error:', errorText);
    throw new Error(`0x quote failed (${response.status}): ${errorText}`);
  }

  return response.json();
}

/**
 * Get quotes for multiple tokens swapping to a single output token
 * Since 0x doesn't support multi-input swaps, we get individual quotes
 */
export async function getZeroExMultiQuotes(
  inputTokens: Array<{
    tokenAddress: string;
    amount: string;
    symbol?: string;
  }>,
  outputTokenAddress: string,
  taker: string,
  slippageBps: number = 50,
  includeFee: boolean = true
): Promise<{
  quotes: ZeroExQuoteResponse[];
  totalBuyAmount: bigint;
  totalFeeAmount: bigint;
}> {
  const quotes: ZeroExQuoteResponse[] = [];
  let totalBuyAmount = 0n;
  let totalFeeAmount = 0n;

  for (const token of inputTokens) {
    try {
      const quote = await getZeroExQuote(
        token.tokenAddress,
        outputTokenAddress,
        token.amount,
        taker,
        slippageBps,
        includeFee
      );

      quotes.push(quote);
      totalBuyAmount += BigInt(quote.buyAmount);

      if (quote.fees.integratorFee) {
        totalFeeAmount += BigInt(quote.fees.integratorFee.amount);
      }
    } catch (error) {
      console.error(`Failed to get quote for ${token.symbol || token.tokenAddress}:`, error);
      throw error;
    }
  }

  return {
    quotes,
    totalBuyAmount,
    totalFeeAmount,
  };
}

/**
 * Prepare batch swap transactions using 0x API
 * Returns array of transaction calls for batch execution
 */
export async function prepareZeroExBatchSwap(
  tokens: Array<{
    address: Address;
    amount: bigint;
    decimals: number;
    symbol?: string;
  }>,
  outputTokenAddress: Address,
  userAddress: Address,
  slippageBps: number = 50
): Promise<{
  quotes: ZeroExQuoteResponse[];
  transactions: Array<{
    to: string;
    data: string;
    value: string;
  }>;
  totalBuyAmount: bigint;
  totalFeeAmount: bigint;
  allowanceTarget: string;
}> {
  const inputTokens = tokens.map((token) => ({
    tokenAddress: token.address.toLowerCase(),
    amount: token.amount.toString(),
    symbol: token.symbol,
  }));

  const { quotes, totalBuyAmount, totalFeeAmount } = await getZeroExMultiQuotes(
    inputTokens,
    outputTokenAddress.toLowerCase(),
    userAddress.toLowerCase(),
    slippageBps,
    true // include fee
  );

  // Extract transactions from quotes
  const transactions = quotes.map((quote) => ({
    to: quote.transaction.to,
    data: quote.transaction.data,
    value: quote.transaction.value,
  }));

  // All quotes should have the same allowanceTarget
  const allowanceTarget = quotes[0]?.allowanceTarget || '';

  return {
    quotes,
    transactions,
    totalBuyAmount,
    totalFeeAmount,
    allowanceTarget,
  };
}

/**
 * Format quote response for UI display (compatible with existing Odos format)
 */
export function formatZeroExQuotesForUI(
  quotes: ZeroExQuoteResponse[],
  inputTokens: Array<{ symbol: string; decimals: number }>,
  outputTokenDecimals: number = 6
): {
  inTokens: string[];
  outTokens: string[];
  inAmounts: string[];
  outAmounts: string[];
  gasEstimate: number;
  netOutValue: number;
  priceImpact: number;
  feeAmount: string;
} {
  const inTokens = quotes.map((q) => q.sellToken);
  const outTokens = quotes.map((q) => q.buyToken);
  const inAmounts = quotes.map((q) => q.sellAmount);
  const outAmounts = quotes.map((q) => q.buyAmount);

  const totalGas = quotes.reduce((sum, q) => sum + parseInt(q.gas), 0);
  const totalBuyAmount = quotes.reduce((sum, q) => sum + BigInt(q.buyAmount), 0n);
  const totalFee = quotes.reduce((sum, q) => {
    return sum + BigInt(q.fees.integratorFee?.amount || '0');
  }, 0n);

  // Calculate net output value in USD (assuming output is USDC with 6 decimals)
  const netOutValue = Number(totalBuyAmount) / Math.pow(10, outputTokenDecimals);

  return {
    inTokens,
    outTokens,
    inAmounts,
    outAmounts,
    gasEstimate: totalGas,
    netOutValue,
    priceImpact: 0, // 0x doesn't provide this directly
    feeAmount: totalFee.toString(),
  };
}

/**
 * Test function to verify 0x API connection
 */
export async function testZeroExQuote(
  sellToken: string,
  buyToken: string,
  sellAmount: string,
  taker: string
): Promise<ZeroExPriceResponse> {
  console.log('Testing 0x API with:', {
    sellToken,
    buyToken,
    sellAmount,
    taker,
  });

  return getZeroExPrice(sellToken, buyToken, sellAmount, taker, 50, true);
}

// ============================================
// Odos-compatible interface for easy migration
// ============================================

export interface ZeroExCombinedQuote {
  // Odos-compatible fields
  pathId: string; // We'll use a generated ID
  inTokens: string[];
  outTokens: string[];
  inAmounts: string[];
  outAmounts: string[];
  gasEstimate: number;
  netOutValue: number;
  priceImpact: number;
  // 0x specific fields
  quotes: ZeroExQuoteResponse[];
  totalBuyAmount: string;
  totalFeeAmount: string;
  allowanceTarget: string;
  transactions: Array<{
    to: string;
    data: string;
    value: string;
  }>;
  // Retry count (how many retries were needed)
  retryCount?: number;
}

/**
 * Get combined quote for multiple tokens (Odos-compatible interface)
 * This calls the server-side API route to avoid CORS issues
 */
export async function getZeroExCombinedQuote(
  inputTokens: Array<{
    tokenAddress: string;
    amount: string;
  }>,
  outputTokenAddress: string,
  userAddr: string,
  slippageBps: number = 50,
  _chainId: number = 8453
): Promise<ZeroExCombinedQuote> {
  console.log('0x Combined Quote Request (via server):', {
    inputTokens,
    outputTokenAddress,
    userAddr,
    slippageBps,
  });

  // Call server-side API route to avoid CORS issues
  const response = await fetch('/api/zeroex-quote', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      inputTokens,
      outputTokenAddress,
      userAddr,
      slippageBps,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    console.error('0x Quote API Error:', errorData);
    throw new Error(errorData.error || `0x quote failed (${response.status})`);
  }

  const combinedQuote = await response.json();
  console.log('0x Combined Quote Response:', combinedQuote);

  return combinedQuote as ZeroExCombinedQuote;
}

/**
 * Get transaction data for batch swap (replaces assembleOdosSwap)
 * For 0x, we already have transaction data from quotes
 */
export function getZeroExTransactions(
  combinedQuote: ZeroExCombinedQuote
): {
  transaction: {
    to: string;
    data: string;
    value: string;
  };
  transactions: Array<{
    to: string;
    data: string;
    value: string;
  }>;
  allowanceTarget: string;
} {
  // For single token swap, return the first transaction
  // For multiple tokens, return all transactions for batch execution
  return {
    transaction: combinedQuote.transactions[0],
    transactions: combinedQuote.transactions,
    allowanceTarget: combinedQuote.allowanceTarget,
  };
}
