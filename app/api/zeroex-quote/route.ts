import { NextRequest, NextResponse } from 'next/server';

const ZEROEX_API_BASE_URL = 'https://api.0x.org';
const BASE_CHAIN_ID = '8453';

const ZEROEX_API_KEY = process.env.NEXT_PUBLIC_ZEROEX_API_KEY || '';
const FEE_RECIPIENT = process.env.NEXT_PUBLIC_FEE_RECIPIENT || '';
const SWAP_FEE_BPS = 100; // 1% fee

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

    if (!ZEROEX_API_KEY) {
      return NextResponse.json(
        { error: '0x API key not configured' },
        { status: 500 }
      );
    }

    console.log('0x Quote API Request:', { inputTokens, outputTokenAddress, userAddr, slippageBps });

    const quotes = [];
    let totalBuyAmount = BigInt(0);
    let totalFeeAmount = BigInt(0);
    let totalGas = 0;

    // Get individual quotes for each token
    for (const token of inputTokens) {
      const params = new URLSearchParams({
        chainId: BASE_CHAIN_ID,
        sellToken: token.tokenAddress,
        buyToken: outputTokenAddress,
        sellAmount: token.amount,
        taker: userAddr,
        slippageBps: slippageBps.toString(),
      });

      // Add fee parameters
      if (FEE_RECIPIENT) {
        params.append('swapFeeBps', SWAP_FEE_BPS.toString());
        params.append('swapFeeRecipient', FEE_RECIPIENT);
        params.append('swapFeeToken', outputTokenAddress);
      }

      const url = `${ZEROEX_API_BASE_URL}/swap/allowance-holder/quote?${params.toString()}`;
      console.log('Fetching 0x quote:', url);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          '0x-api-key': ZEROEX_API_KEY,
          '0x-version': 'v2',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('0x Quote API Error:', response.status, errorText);
        return NextResponse.json(
          { error: `0x quote failed for ${token.tokenAddress}: ${errorText}` },
          { status: response.status }
        );
      }

      const quote = await response.json();
      quotes.push(quote);

      totalBuyAmount += BigInt(quote.buyAmount);
      totalGas += parseInt(quote.gas);

      if (quote.fees?.integratorFee?.amount) {
        totalFeeAmount += BigInt(quote.fees.integratorFee.amount);
      }

      console.log(`Quote for ${token.tokenAddress}: ${quote.sellAmount} -> ${quote.buyAmount}`);
    }

    if (quotes.length === 0) {
      return NextResponse.json(
        { error: 'No quotes received' },
        { status: 400 }
      );
    }

    // Build combined response
    const inTokens = quotes.map((q) => q.sellToken);
    const outTokens = quotes.map((q) => q.buyToken);
    const inAmounts = quotes.map((q) => q.sellAmount);
    const outAmounts = quotes.map((q) => q.buyAmount);
    const transactions = quotes.map((q) => ({
      to: q.transaction.to,
      data: q.transaction.data,
      value: q.transaction.value,
    }));
    const allowanceTarget = quotes[0].allowanceTarget;
    const pathId = `0x-batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const netOutValue = Number(totalBuyAmount) / 1e6; // Assuming USDC with 6 decimals

    const combinedQuote = {
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
    };

    console.log('Combined quote:', {
      pathId,
      inTokens,
      outTokens,
      totalBuyAmount: totalBuyAmount.toString(),
      totalFeeAmount: totalFeeAmount.toString(),
    });

    return NextResponse.json(combinedQuote);
  } catch (error) {
    console.error('0x Quote API Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
