/**
 * OnchainKit API를 사용한 토큰 리스트 가져오기
 * OnchainKitProvider가 이미 설정되어 있으면 API Key 자동 사용됨
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
  priceUSD?: number; // 가격 정보는 별도로 가져와야 함
}

/**
 * Base 네트워크의 토큰 리스트 가져오기
 * @param search - 검색어 (symbol, name, address로 검색 가능)
 * @param limit - 최대 반환 개수
 */
export async function fetchTokensFromOnchainKit(
  search?: string,
  limit?: string
): Promise<TokenInfo[]> {
  try {
    const tokens = await getTokens({ 
      search, 
      limit: limit || '100' // 기본값 100개
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
 * 인기 토큰 심볼들로 토큰 정보 가져오기
 */
export async function fetchPopularTokens(
  symbols: string[] = ['USDC', 'WETH', 'DAI']
): Promise<TokenInfo[]> {
  try {
    const tokens: TokenInfo[] = [];
    
    for (const symbol of symbols) {
      const foundTokens = await getTokens({ 
        search: symbol, 
        limit: '1' 
      });
      
      // Check if response is an array
      if (Array.isArray(foundTokens) && foundTokens.length > 0) {
        tokens.push({
          address: foundTokens[0].address as Address,
          symbol: foundTokens[0].symbol,
          name: foundTokens[0].name,
          decimals: foundTokens[0].decimals,
          image: foundTokens[0].image,
          chainId: foundTokens[0].chainId,
        });
      }
    }
    
    return tokens;
  } catch (error) {
    console.error('Failed to fetch popular tokens:', error);
    return [];
  }
}

