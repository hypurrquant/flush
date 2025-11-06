import { createBaseAccountSDK, getCryptoKeyAccount, base } from '@base-org/account';
import { numberToHex, encodeFunctionData, type Address, type Hex, createPublicClient, http } from 'viem';
import { base as baseChain } from 'viem/chains';
import { ERC20_ABI } from './constants';

// Odos Router address on Base
const ODOS_ROUTER_ADDRESS = '0x4e3288c9ca110bcc42bfa01046729385107d5f02' as Address;

/**
 * Check if token approval is sufficient for swap
 */
export async function checkTokenApproval(
  tokenAddress: Address,
  ownerAddress: Address,
  amount: bigint,
  spenderAddress: Address = ODOS_ROUTER_ADDRESS
): Promise<{ approved: boolean; currentAllowance: bigint; needsApproval: boolean }> {
  try {
    const publicClient = createPublicClient({
      chain: baseChain,
      transport: http(),
    });

    const currentAllowance = await publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [ownerAddress, spenderAddress],
    }) as bigint;

    const approved = currentAllowance >= amount;
    const needsApproval = !approved;

    return {
      approved,
      currentAllowance: currentAllowance as bigint,
      needsApproval,
    };
  } catch (error) {
    console.error('Error checking token approval:', error);
    // If we can't check, assume approval is needed for safety
    return {
      approved: false,
      currentAllowance: 0n,
      needsApproval: true,
    };
  }
}

/**
 * Create approve call data
 * Uses max uint256 for unlimited approval to avoid repeated approvals
 */
export function createApproveCall(
  tokenAddress: Address,
  spenderAddress: Address,
  _amount: bigint
): { to: Address; value: Hex; data: Hex } {
  // Use max uint256 for unlimited approval (more gas efficient in long run)
  // This way user only needs to approve once per token
  const MAX_UINT256 = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
  
  return {
    to: tokenAddress,
    value: '0x0' as Hex,
    data: encodeFunctionData({
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [spenderAddress, MAX_UINT256],
    }),
  };
}

/**
 * Send batch transaction using Base Account SDK
 */
export async function sendBatchTransaction(
  calls: Array<{ to: Address; value: Hex; data: Hex }>,
  chainId: number = base.constants.CHAIN_IDS.base
): Promise<string> {
  try {
    console.log('\n🚀 Preparing to send batch transaction via Base Account SDK...');
    
    const sdk = createBaseAccountSDK({
      appName: 'Flush Swap',
      appLogoUrl: 'https://base.org/logo.png',
      appChainIds: [base.constants.CHAIN_IDS.base],
    });

    const provider = sdk.getProvider();
    const cryptoAccount = await getCryptoKeyAccount();
    const fromAddress = cryptoAccount?.account?.address as Address;

    if (!fromAddress) {
      throw new Error('No account found');
    }

    console.log('👤 From Address:', fromAddress);
    console.log('⛓️  Chain ID:', chainId, `(0x${chainId.toString(16)})`);
    console.log('📦 Number of Calls:', calls.length);
    
    const formattedCalls = calls.map((call, index) => {
      console.log(`\n  Call ${index + 1}:`);
      console.log('    to:', call.to);
      console.log('    value:', call.value);
      console.log('    data:', call.data.substring(0, 66) + '...' + (call.data.length > 66 ? call.data.substring(call.data.length - 20) : ''));
      console.log('    data length:', call.data.length, 'bytes');
      
      return {
        to: call.to,
        value: call.value,
        data: call.data,
      };
    });

    const requestParams = {
      version: '2.0.0',
      from: fromAddress,
      chainId: numberToHex(chainId),
      atomicRequired: true, // All calls must succeed or all fail
      calls: formattedCalls,
    };

    console.log('\n📤 Sending wallet_sendCalls request:');
    console.log('  Method: wallet_sendCalls');
    console.log('  Params:', JSON.stringify({
      ...requestParams,
      calls: requestParams.calls.map(c => ({
        to: c.to,
        value: c.value,
        data: c.data.substring(0, 20) + '...' + c.data.substring(c.data.length - 20)
      }))
    }, null, 2));

    const result = await provider.request({
      method: 'wallet_sendCalls',
      params: [requestParams],
    });

    console.log('\n✅ Batch transaction sent successfully!');
    console.log('  Result:', result);
    return result as string;
  } catch (error: unknown) {
    console.error('Batch transaction failed:', error);

    if (error && typeof error === 'object' && 'code' in error) {
      const errorWithCode = error as { code: number; message?: string };
      if (errorWithCode.code === 4001) {
        throw new Error('User rejected the transaction');
      } else if (errorWithCode.code === 5740) {
        throw new Error('Batch too large for wallet to process');
      } else if (errorWithCode.code === -32602) {
        throw new Error('Invalid request format');
      } else {
        throw new Error(errorWithCode.message || 'Unknown error');
      }
    } else if (error instanceof Error) {
      throw error;
    } else {
      throw new Error('Unknown error');
    }
  }
}

/**
 * Check wallet capabilities for batch transactions
 */
export async function checkBatchCapabilities(): Promise<boolean> {
  try {
    const sdk = createBaseAccountSDK({
      appName: 'Flush Swap',
      appLogoUrl: 'https://base.org/logo.png',
      appChainIds: [base.constants.CHAIN_IDS.base],
    });

    const provider = sdk.getProvider();
    const cryptoAccount = await getCryptoKeyAccount();
    const address = cryptoAccount?.account?.address as Address;

    if (!address) {
      return false;
    }

    const capabilities = await provider.request({
      method: 'wallet_getCapabilities',
      params: [address],
    }) as Record<number, { atomicBatch?: { supported: boolean } }>;

    const baseCapabilities = capabilities[base.constants.CHAIN_IDS.base];

    if (baseCapabilities?.atomicBatch?.supported) {
      console.log('Atomic batching is supported');
      return true;
    } else {
      console.log('Atomic batching is not supported');
      return false;
    }
  } catch (error) {
    console.error('Failed to check capabilities:', error);
    return false;
  }
}
