import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';

const ERC20_ABI = [
  {
    constant: true,
    inputs: [{ name: '_owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: 'balance', type: 'uint256' }],
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    type: 'function',
  },
] as const;

const publicClient = createPublicClient({
  chain: base,
  transport: http(process.env.NEXT_PUBLIC_BASE_RPC_URL),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get('address');
    const tokenAddress = searchParams.get('tokenAddress');

    if (!address || !tokenAddress) {
      return NextResponse.json(
        { error: 'Missing address or tokenAddress parameter' },
        { status: 400 }
      );
    }

    // Fetch token balance
    const balance = await publicClient.readContract({
      address: tokenAddress as `0x${string}`,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [address as `0x${string}`],
    }) as bigint;

    return NextResponse.json({
      balance: balance.toString(),
    });
  } catch (error) {
    console.error('Token balance API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch token balance', balance: '0' },
      { status: 500 }
    );
  }
}

