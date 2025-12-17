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
  inTokens: string[];                  // 입력 토큰 주소 배열
  outTokens: string[];                 // 출력 토큰 주소 배열
  inAmounts: string[];                 // 입력 토큰 수량 배열
  outAmounts: string[];                // 출력 토큰 수량 배열
  gasEstimate: number;                 // 예상 가스 사용량
  dataGasEstimate?: number;            // 데이터 가스 예상량
  gweiPerGas?: number;                 // 가스당 Gwei
  gasEstimateValue?: number;           // 예상 가스 비용 (USD)
  inValues?: number[];                 // 입력 토큰 가치 (USD)
  outValues?: number[];                // 출력 토큰 가치 (USD)
  netOutValue?: number;                // 순 출력 가치 (USD)
  priceImpact?: number;                // 가격 영향 (%)
  percentDiff?: number;                // 가격 차이 (%)
  permit2Message?: unknown | null;     // Permit2 메시지
  permit2Hash?: string | null;         // Permit2 해시
  pathViz?: unknown | null;             // 경로 시각화 데이터
  blockNumber?: number;                // 블록 번호
  // 하위 호환성을 위한 필드
  inputTokens?: Array<{
    tokenAddress: string;
    amount: string;
  }>;
  outputTokens?: Array<{
    tokenAddress: string;
    amount: string;
  }>;
  path?: unknown[];
  outputAmounts?: string[];
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
 * Get quote for swapping multiple tokens to USDC using Odos API v3
 * According to Odos docs: https://docs.odos.xyz/build/quickstart/sor
 * 
 * Required parameters:
 * - chainId: the ID of the chain
 * - inputTokens: list of token addresses and input amounts (1-6 input assets)
 * - outputTokens: list of token addresses and output proportions (1-6 output assets, proportions must total 1)
 * - slippageLimitPercent: slippage tolerance (1 = 1%)
 * - userAddr: checksummed address of the user
 * 
 * Recommended optional parameters:
 * - referralCode: referral code for tracking (defaults to 0)
 * - disableRFQs: disable RFQ liquidity sources (defaults to true for reliability)
 * - compact: enable compact call data (defaults to true)
 */
export async function getOdosQuote(
  inputTokens: Array<{
    tokenAddress: string;
    amount: string;
  }>,
  outputTokenAddress: string,
  userAddr: string,
  slippageLimitPercent: number = 0.5,
  chainId: number = 8453, // Base chain ID
  options?: OdosQuoteOptions
): Promise<OdosQuoteResponse> {
  const requestBody: Record<string, unknown> = {
    chainId,
    inputTokens,
    outputTokens: [
      {
        tokenAddress: outputTokenAddress,
        proportion: 1, // Required: proportions must total 1
      },
    ],
    userAddr,
    slippageLimitPercent,
    // Recommended optional parameters
    referralCode: options?.referralCode ?? 0,
    disableRFQs: options?.disableRFQs ?? true, // Default to true for reliability
    compact: options?.compact ?? true, // Default to true for compact call data
  };

  // Additional optional parameters
  if (options) {
    if (options.simple !== undefined) requestBody.simple = options.simple;
    if (options.likeAsset !== undefined) requestBody.likeAsset = options.likeAsset;
    if (options.gasPrice) requestBody.gasPrice = options.gasPrice;
    if (options.sourceBlacklist) requestBody.sourceBlacklist = options.sourceBlacklist;
    if (options.sourceWhitelist) requestBody.sourceWhitelist = options.sourceWhitelist;
    if (options.poolBlacklist) requestBody.poolBlacklist = options.poolBlacklist;
    if (options.pathVizImage !== undefined) requestBody.pathVizImage = options.pathVizImage;
  }

  console.log('Odos Quote API v3 Request:', JSON.stringify(requestBody, null, 2));

  let response: Response;
  try {
    response = await fetch(`${ODOS_API_BASE_URL}/sor/quote/v3`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });
  } catch (error) {
    console.error('Odos Quote API v3 Fetch Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Network error';
    throw new Error(`Failed to fetch from Odos API: ${errorMessage}. Please check your internet connection.`);
  }

  if (!response.ok) {
    let errorMessage: string;
    try {
      const errorText = await response.text();
      console.error('Odos Quote API v3 Error Response (raw):', errorText);
      try {
        const errorData = JSON.parse(errorText) as { message?: string; error?: string; detail?: string };
        errorMessage = errorData.message || errorData.error || errorData.detail || JSON.stringify(errorData);
        console.error('Odos Quote API v3 Error Response (parsed):', errorData);
      } catch {
        errorMessage = errorText || response.statusText;
      }
    } catch {
      errorMessage = response.statusText || 'Unknown error';
    }
    throw new Error(`Odos quote failed (${response.status}): ${errorMessage}`);
  }

  return response.json();
}

/**
 * Assemble transaction data for batch swap using Odos API
 * IMPORTANT: Use the call data provided by Odos API directly. Do not modify it.
 * Reference: https://docs.odos.xyz/build/quickstart/sor
 * 
 * Required parameters:
 * - userAddr: the checksummed address used to generate the quote
 * - pathId: the pathId from quote response (valid for 60 seconds)
 * 
 * Optional parameters:
 * - simulate: set to true if user isn't doing their own estimate gas call (defaults to false)
 * - slippageLimitPercent: slippage tolerance (optional, can be omitted if same as quote)
 * - chainId: chain ID (optional, can be omitted if same as quote)
 */
export async function assembleOdosSwap(
  pathId: string,
  userAddr: string,
  slippageLimitPercent?: number,
  chainId?: number,
  simulate: boolean = false
): Promise<OdosAssembleResponse> {
  const requestBody: Record<string, unknown> = {
    userAddr,
    pathId,
    simulate,
  };

  // Optional parameters - only include if provided
  if (slippageLimitPercent !== undefined) {
    requestBody.slippageLimitPercent = slippageLimitPercent;
  }
  if (chainId !== undefined) {
    requestBody.chainId = chainId;
  }

  console.log('Odos Assemble API Request:', JSON.stringify(requestBody, null, 2));

  let response: Response;
  try {
    response = await fetch(`${ODOS_API_BASE_URL}/sor/assemble`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });
  } catch (error) {
    console.error('Odos Assemble API Fetch Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Network error';
    throw new Error(`Failed to fetch from Odos API: ${errorMessage}. Please check your internet connection.`);
  }

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
 * Prepare batch swap using Odos API v3
 * This handles multiple tokens swapping to a single output token (USDC)
 * Follows the structure from: https://docs.odos.xyz/build/quickstart/sor
 */
export async function prepareOdosBatchSwap(
  tokens: Array<{
    address: Address;
    amount: bigint;
    decimals: number;
  }>,
  usdcAddress: Address,
  userAddress: Address,
  slippageLimitPercent: number = 0.5,
  chainId: number = 8453
): Promise<{
  quote: OdosQuoteResponse;
  transaction: OdosAssembleResponse;
}> {
  // Prepare input tokens for Odos API v3
  const inputTokens = tokens.map((token) => ({
    tokenAddress: token.address.toLowerCase(),
    amount: token.amount.toString(),
  }));

  // Step 1: Generate a quote using v3 API
  const quote = await getOdosQuote(
    inputTokens,
    usdcAddress.toLowerCase(),
    userAddress.toLowerCase(),
    slippageLimitPercent,
    chainId
  );

  // Step 2: Assemble the transaction using pathId from quote
  // Paths are valid for 60 seconds after the quote is received
  const transaction = await assembleOdosSwap(
    quote.pathId,
    userAddress.toLowerCase(),
    slippageLimitPercent,
    chainId,
    false // simulate: false (we're handling gas estimation ourselves)
  );

  return {
    quote,
    transaction,
  };
}

export interface OdosQuoteOptions {
  simple?: boolean;              // 간단한 모드 (빠른 응답)
  disableRFQs?: boolean;          // RFQ 거래소 비활성화 (기본값: true)
  likeAsset?: boolean;            // 같은 자산 타입만 라우팅
  gasPrice?: string;              // 가스 가격 (선택사항)
  sourceBlacklist?: string[];     // 제외할 유동성 소스
  sourceWhitelist?: string[];     // 사용할 유동성 소스만
  poolBlacklist?: string[];        // 제외할 풀 ID
  pathVizImage?: boolean;         // 경로 시각화 이미지
  compact?: boolean;              // V2 compact call data 사용
  referralCode?: number;          // Odos Partner Code
}

/**
 * Test function to call Odos quote API v3 with selected tokens
 * This is a helper function for testing the API call
 * Follows the structure from: https://docs.odos.xyz/build/quickstart/sor
 */
export async function testOdosQuote(
  inputTokens: Array<{
    tokenAddress: string;
    amount: string;
  }>,
  outputTokenAddress: string,
  userAddr: string,
  slippageLimitPercent: number = 0.5,
  chainId: number = 8453,
  options?: OdosQuoteOptions
): Promise<OdosQuoteResponse> {
  console.log('Testing Odos Quote API v3 with:', {
    chainId,
    inputTokens,
    outputTokenAddress,
    userAddr,
    slippageLimitPercent,
    options,
  });

  return getOdosQuote(
    inputTokens,
    outputTokenAddress,
    userAddr,
    slippageLimitPercent,
    chainId,
    options
  );
}

