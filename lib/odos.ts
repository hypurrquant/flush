import type { Address } from 'viem';

export interface OdosSwapInput {
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  userAddr: string;
  slippageLimitPercent?: number;
}

export interface OdosQuoteResponse {
  pathId: string;
  inputTokens: Array<{
    tokenAddress: string;
    amount: string;
  }>;
  outputTokens: Array<{
    tokenAddress: string;
    amount: string;
  }>;
  path: unknown[];
  gasEstimate: number;
  outputAmounts: string[];
}

export interface OdosAssembleResponse {
  gasPrice: string;
  transaction: {
    to: string;
    data: string;
    value: string;
  };
  pathId: string;
}

const ODOS_API_BASE_URL = 'https://api.odos.xyz';

/**
 * Get quote for swapping multiple tokens to USDC using Odos API
 * According to Odos docs: https://docs.odos.xyz/build/api-docs
 */
export async function getOdosQuote(
  inputs: OdosSwapInput[],
  chainId: number = 8453 // Base chain ID
): Promise<OdosQuoteResponse> {
  // Odos API expects a single output token for batch swaps
  const outputToken = inputs[0].tokenOut;
  
  const response = await fetch(`${ODOS_API_BASE_URL}/sor/quote/v2`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chainId,
      inputTokens: inputs.map((input) => ({
        tokenAddress: input.tokenIn,
        amount: input.amountIn,
      })),
      outputTokens: [
        {
          tokenAddress: outputToken,
        },
      ],
      userAddr: inputs[0].userAddr,
      slippageLimitPercent: inputs[0].slippageLimitPercent || 0.5,
    }),
  });

  if (!response.ok) {
    let errorMessage: string;
    try {
      const errorData = await response.json();
      errorMessage = errorData.message || response.statusText;
    } catch {
      errorMessage = await response.text() || response.statusText;
    }
    throw new Error(`Odos quote failed: ${errorMessage}`);
  }

  return response.json();
}

/**
 * Assemble transaction data for batch swap using Odos API
 * IMPORTANT: Use the call data provided by Odos API directly. Do not modify it.
 * Reference: https://docs.odos.xyz/build/api-docs
 */
export async function assembleOdosSwap(
  pathId: string,
  userAddr: string,
  slippageLimitPercent: number = 0.5,
  chainId: number = 8453 // Base chain ID
): Promise<OdosAssembleResponse> {
  const response = await fetch(`${ODOS_API_BASE_URL}/sor/assemble`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      userAddr,
      pathId,
      slippageLimitPercent,
      chainId,
    }),
  });

  if (!response.ok) {
    let errorMessage: string;
    try {
      const errorData = await response.json();
      errorMessage = errorData.message || response.statusText;
    } catch {
      errorMessage = await response.text() || response.statusText;
    }
    throw new Error(`Odos assemble failed: ${errorMessage}`);
  }

  return response.json();
}

/**
 * Prepare batch swap using Odos API
 * This handles multiple tokens swapping to a single output token (USDC)
 */
export async function prepareOdosBatchSwap(
  tokens: Array<{
    address: Address;
    amount: bigint;
    decimals: number;
  }>,
  usdcAddress: Address,
  userAddress: Address,
  slippageLimitPercent: number = 0.5
): Promise<{
  quote: OdosQuoteResponse;
  transaction: OdosAssembleResponse;
}> {
  // Prepare input tokens for Odos API
  const inputs: OdosSwapInput[] = tokens.map((token) => ({
    tokenIn: token.address.toLowerCase(),
    tokenOut: usdcAddress.toLowerCase(),
    amountIn: token.amount.toString(),
    userAddr: userAddress.toLowerCase(),
    slippageLimitPercent,
  }));

  // Get quote
  const quote = await getOdosQuote(inputs);

  // Assemble transaction
  const transaction = await assembleOdosSwap(
    quote.pathId,
    userAddress.toLowerCase(),
    slippageLimitPercent
  );

  return {
    quote,
    transaction,
  };
}

