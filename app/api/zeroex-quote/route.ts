import { NextRequest, NextResponse } from 'next/server';

const ZEROEX_API_BASE_URL = 'https://api.0x.org';
const BASE_CHAIN_ID = '8453';

const ZEROEX_API_KEY = process.env.NEXT_PUBLIC_ZEROEX_API_KEY || '';
const FEE_RECIPIENT = process.env.NEXT_PUBLIC_FEE_RECIPIENT || '';
const SWAP_FEE_BPS = 100; // 1% fee

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000; // 1 second

interface QuoteInput {
  tokenAddress: string;
  amount: string;
}

interface CombinedQuoteResponse {
  pathId: string;
  inTokens: string[];
  outTokens: string[];
  inAmounts: string[];
  outAmounts: string[];
  gasEstimate: number;
  netOutValue: number;
  priceImpact: number;
  quotes: unknown[];
  totalBuyAmount: string;
  totalFeeAmount: string;
  allowanceTarget: string;
  transactions: Array<{
    to: string;
    data: string;
    value: string;
  }>;
  retryCount?: number;
}

/**
 * Sleep helper for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch quote for a single token with retry logic
 */
async function fetchSingleQuoteWithRetry(
  token: QuoteInput,
  outputTokenAddress: string,
  userAddr: string,
  slippageBps: number
): Promise<{ quote: unknown; retries: number }> {
  const params = new URLSearchParams({
    chainId: BASE_CHAIN_ID,
    sellToken: token.tokenAddress,
    buyToken: outputTokenAddress,
    sellAmount: token.amount,
    taker: userAddr,
    slippageBps: slippageBps.toString(),
  });

  if (FEE_RECIPIENT) {
    params.append('swapFeeBps', SWAP_FEE_BPS.toString());
    params.append('swapFeeRecipient', FEE_RECIPIENT);
    params.append('swapFeeToken', outputTokenAddress);
  }

  const url = `${ZEROEX_API_BASE_URL}/swap/allowance-holder/quote?${params.toString()}`;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`[0x] Retry ${attempt}/${MAX_RETRIES - 1} for ${token.tokenAddress}...`);
        await sleep(RETRY_DELAY_MS * attempt); // Exponential backoff
      }

      console.log(`[0x] Fetching quote (attempt ${attempt + 1}):`, url);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          '0x-api-key': ZEROEX_API_KEY,
          '0x-version': 'v2',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[0x] Quote API Error (attempt ${attempt + 1}):`, response.status, errorText);

        // Don't retry on client errors (4xx) except for rate limiting (429)
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          throw new Error(`0x quote failed for ${token.tokenAddress}: ${errorText}`);
        }

        lastError = new Error(`0x quote failed (${response.status}): ${errorText}`);
        continue;
      }

      const quote = await response.json();
      console.log(`[0x] Quote for ${token.tokenAddress}: ${quote.sellAmount} -> ${quote.buyAmount} (attempt ${attempt + 1})`);

      return { quote, retries: attempt };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');
      console.error(`[0x] Quote fetch error (attempt ${attempt + 1}):`, lastError.message);

      // If it's a non-retryable error, throw immediately
      if (lastError.message.includes('0x quote failed for')) {
        throw lastError;
      }
    }
  }

  throw lastError || new Error(`Failed to get quote after ${MAX_RETRIES} attempts`);
}

/**
 * Get quotes for all tokens with retry logic
 */
async function getQuotesWithRetry(
  inputTokens: QuoteInput[],
  outputTokenAddress: string,
  userAddr: string,
  slippageBps: number
): Promise<CombinedQuoteResponse> {
  if (!ZEROEX_API_KEY) {
    throw new Error('0x API key not configured');
  }

  console.log('[0x] Starting quote request...');

  const quotes = [];
  let totalBuyAmount = BigInt(0);
  let totalFeeAmount = BigInt(0);
  let totalGas = 0;
  let totalRetries = 0;

  for (const token of inputTokens) {
    const { quote, retries } = await fetchSingleQuoteWithRetry(
      token,
      outputTokenAddress,
      userAddr,
      slippageBps
    );

    quotes.push(quote);
    totalRetries += retries;

    totalBuyAmount += BigInt((quote as { buyAmount: string }).buyAmount);
    totalGas += parseInt((quote as { gas: string }).gas);

    const fees = (quote as { fees?: { integratorFee?: { amount: string } } }).fees;
    if (fees?.integratorFee?.amount) {
      totalFeeAmount += BigInt(fees.integratorFee.amount);
    }
  }

  if (quotes.length === 0) {
    throw new Error('No quotes received from 0x');
  }

  const inTokens = quotes.map((q) => (q as { sellToken: string }).sellToken);
  const outTokens = quotes.map((q) => (q as { buyToken: string }).buyToken);
  const inAmounts = quotes.map((q) => (q as { sellAmount: string }).sellAmount);
  const outAmounts = quotes.map((q) => (q as { buyAmount: string }).buyAmount);
  const transactions = quotes.map((q) => {
    const tx = (q as { transaction: { to: string; data: string; value: string } }).transaction;
    return {
      to: tx.to,
      data: tx.data,
      value: tx.value,
    };
  });
  const allowanceTarget = (quotes[0] as { allowanceTarget: string }).allowanceTarget;
  const pathId = `0x-batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const netOutValue = Number(totalBuyAmount) / 1e6;

  console.log(`[0x] Quote successful (total retries: ${totalRetries})`);

  return {
    pathId,
    inTokens,
    outTokens,
    inAmounts,
    outAmounts,
    gasEstimate: totalGas,
    netOutValue,
    priceImpact: 0,
    quotes,
    totalBuyAmount: totalBuyAmount.toString(),
    totalFeeAmount: totalFeeAmount.toString(),
    allowanceTarget,
    transactions,
    retryCount: totalRetries,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { inputTokens, outputTokenAddress, userAddr, slippageBps = 50 } = body;

    if (!inputTokens || !outputTokenAddress || !userAddr) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    console.log('Quote API Request:', { inputTokens, outputTokenAddress, userAddr, slippageBps });

    const combinedQuote = await getQuotesWithRetry(
      inputTokens,
      outputTokenAddress,
      userAddr,
      slippageBps
    );

    console.log('Combined quote:', {
      pathId: combinedQuote.pathId,
      inTokens: combinedQuote.inTokens,
      outTokens: combinedQuote.outTokens,
      totalBuyAmount: combinedQuote.totalBuyAmount,
      totalFeeAmount: combinedQuote.totalFeeAmount,
      retryCount: combinedQuote.retryCount,
    });

    return NextResponse.json(combinedQuote);
  } catch (error) {
    console.error('Quote API Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
