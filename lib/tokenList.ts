/**
 * Fetch token list using OnchainKit API
 */

import { getTokens } from '@coinbase/onchainkit/api';
import type { Address } from 'viem';

export interface TokenInfo {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
  image: string | null;
  chainId: number;
  priceUSD?: number;
}

/**
 * Fetch token list from Base network
 * @param search - Search query (symbol, name, or address)
 * @param limit - Maximum number of results
 */
export async function fetchTokensFromOnchainKit(
  search?: string,
  limit?: string
): Promise<TokenInfo[]> {
  try {
    const tokens = await getTokens({ 
      search, 
      limit: limit || '100'
    });

    // Check if response is an error or token array
    if (Array.isArray(tokens)) {
      return tokens.map((token) => ({
        address: token.address as Address,
        symbol: token.symbol,
        name: token.name,
        decimals: token.decimals,
        image: token.image,
        chainId: token.chainId,
      }));
    }
    
    // If it's an error, return empty array
    return [];
  } catch (error) {
    console.error('Failed to fetch tokens from OnchainKit:', error);
    return [];
  }
}

/**
 * Base 네트워크의 인기 토큰 목록 가져오기 (상위 N개)
 * @param limit - 최대 반환 개수 (기본값: 50)
 */
export async function fetchPopularTokensList(
  limit: number = 50
): Promise<TokenInfo[]> {
  try {
    // Base 네트워크의 인기 토큰들을 가져오기 위해 limit만 설정
    const tokens = await getTokens({ 
      limit: limit.toString()
    });

    // Check if response is an error or token array
    if (Array.isArray(tokens)) {
      return tokens.map((token) => ({
        address: token.address as Address,
        symbol: token.symbol,
        name: token.name,
        decimals: token.decimals,
        image: token.image,
        chainId: token.chainId,
      }));
    }
    
    // If it's an error, return empty array
    return [];
  } catch (error) {
    console.error('Failed to fetch popular tokens list:', error);
    return [];
  }
}

