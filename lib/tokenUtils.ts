import { formatUnits } from 'viem';
import { ERC20_ABI } from './constants';
import type { Address } from 'viem';

export interface TokenBalance {
  address: Address;
  symbol: string;
  name: string;
  balance: string;
  balanceFormatted: string;
  decimals: number;
}

export function formatTokenBalance(balance: bigint, decimals: number): string {
  return formatUnits(balance, decimals);
}

export function formatCurrency(value: string): string {
  const num = parseFloat(value);
  if (num === 0) return '0';
  if (num < 0.0001) return '<0.0001';
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
}

