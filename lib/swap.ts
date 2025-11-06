// Uniswap V3 SwapRouter02 on Base
export const UNISWAP_V3_ROUTER = '0x2626664c2603336E57B271c5C0b26F421741e481' as const;

// ERC20 ABI with approve function
export const ERC20_ABI_WITH_APPROVE = [
  {
    constant: true,
    inputs: [{ name: '_owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: 'balance', type: 'uint256' }],
    type: 'function',
  },
  {
    constant: false,
    inputs: [
      { name: '_spender', type: 'address' },
      { name: '_value', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    type: 'function',
  },
  {
    constant: true,
    inputs: [
      { name: '_owner', type: 'address' },
      { name: '_spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'symbol',
    outputs: [{ name: '', type: 'string' }],
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'name',
    outputs: [{ name: '', type: 'string' }],
    type: 'function',
  },
] as const;

// Simplified swap function for batch transactions
// In production, you'd use Uniswap V3 Router's exactInputSingle or similar
export interface SwapParams {
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
  amountOutMinimum: bigint;
  recipient: string;
  deadline: bigint;
  sqrtPriceLimitX96?: bigint;
}

