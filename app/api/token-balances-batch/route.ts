import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';

const ERC20_ABI = [
  {
    inputs: [{ name: '_owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: 'balance', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

const publicClient = createPublicClient({
  chain: base,
  transport: http(process.env.NEXT_PUBLIC_BASE_RPC_URL),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { address, tokenAddresses } = body;

    if (!address || !tokenAddresses || !Array.isArray(tokenAddresses)) {
      return NextResponse.json(
        { error: 'Missing address or tokenAddresses parameter' },
        { status: 400 }
      );
    }

    // Filter out invalid addresses
    const validTokenAddresses = tokenAddresses.filter(
      (addr: string) => addr && addr.trim() !== '' && addr.startsWith('0x')
    );

    if (validTokenAddresses.length === 0) {
      return NextResponse.json({ balances: {} });
    }

    // Use multicall to fetch all balances in a single RPC call
    const contracts = validTokenAddresses.map((tokenAddress: string) => ({
      address: tokenAddress as `0x${string}`,
      abi: ERC20_ABI,
      functionName: 'balanceOf' as const,
      args: [address as `0x${string}`],
    }));

    const results = await publicClient.multicall({
      contracts: contracts as Parameters<typeof publicClient.multicall>[0]['contracts'],
      allowFailure: true, // Allow individual calls to fail without failing the whole batch
    });

    // Build response object
    const balances: Record<string, string> = {};
    validTokenAddresses.forEach((tokenAddress: string, index: number) => {
      const result = results[index];
      if (result.status === 'success') {
        balances[tokenAddress.toLowerCase()] = (result.result as bigint).toString();
      } else {
        balances[tokenAddress.toLowerCase()] = '0';
      }
    });

    return NextResponse.json({ balances });
  } catch (error) {
    console.error('Token balances batch API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch token balances', balances: {} },
      { status: 500 }
    );
  }
}
