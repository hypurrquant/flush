import { NextRequest, NextResponse } from 'next/server';

// DIA Oracle API를 사용하여 토큰 주소로 가격 정보 제공
const DIA_API_BASE_URL = 'https://api.diadata.org/v1';
const BLOCKCHAIN_NAME = 'Base'; // Base 네트워크

// ETH는 native token이므로 특별 처리 (WETH 주소 사용 또는 특별 주소)
const ETH_ADDRESS = '0x0000000000000000000000000000000000000000';
const WETH_ADDRESS = '0x4200000000000000000000000000000000000006'; // Base WETH

/**
 * Get token price from DIA Oracle by address
 * @param address - Token contract address
 */
async function getDIAPriceByAddress(address: string): Promise<number | null> {
  try {
    // ETH의 경우 WETH 주소 사용
    const queryAddress = address.toLowerCase() === ETH_ADDRESS.toLowerCase() 
      ? WETH_ADDRESS 
      : address.toLowerCase();

    const response = await fetch(
      `${DIA_API_BASE_URL}/assetQuotation/${BLOCKCHAIN_NAME}/${queryAddress}`,
      {
        headers: {
          'Accept': 'application/json',
        },
      }
    );

    if (!response.ok) {
      // If Base doesn't work, try Ethereum for ETH
      if (queryAddress === WETH_ADDRESS && address.toLowerCase() === ETH_ADDRESS.toLowerCase()) {
        const ethResponse = await fetch(
          `${DIA_API_BASE_URL}/assetQuotation/Ethereum/${ETH_ADDRESS}`,
          {
            headers: {
              'Accept': 'application/json',
            },
          }
        );
        if (ethResponse.ok) {
          const ethData = await ethResponse.json();
          return ethData.Price || null;
        }
      }
      return null;
    }

    const data = await response.json();
    if (data && typeof data.Price === 'number') {
      return data.Price;
    }

    return null;
  } catch (error) {
    console.error(`Failed to fetch DIA price for address ${address}:`, error);
    return null;
  }
}

/**
 * Get token price by symbol (fallback)
 * @param symbol - Token symbol
 */
async function getDIAPriceBySymbol(symbol: string): Promise<number | null> {
  try {
    const response = await fetch(
      `${DIA_API_BASE_URL}/quotation/${symbol.toUpperCase()}`,
      {
        headers: {
          'Accept': 'application/json',
        },
      }
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    if (data && typeof data.Price === 'number') {
      return data.Price;
    }

    return null;
  } catch (error) {
    console.error(`Failed to fetch DIA price for symbol ${symbol}:`, error);
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbols = searchParams.get('symbols');
    const addresses = searchParams.get('addresses');

    const prices: Record<string, number | null> = {};

    // Fetch prices by addresses (primary method)
    if (addresses) {
      const addressList = addresses.split(',');
      const pricePromises = addressList.map(async (address) => {
        const trimmedAddress = address.trim();
        const price = await getDIAPriceByAddress(trimmedAddress);
        return { address: trimmedAddress.toLowerCase(), price };
      });

      const results = await Promise.all(pricePromises);
      results.forEach(({ address, price }) => {
        prices[address] = price;
      });
    }

    // Fetch prices by symbols (fallback for ETH and other tokens)
    if (symbols) {
      const symbolList = symbols.split(',');
      const pricePromises = symbolList.map(async (symbol) => {
        const trimmedSymbol = symbol.trim().toUpperCase();
        
        // If we already have price for this symbol from address lookup, skip
        if (trimmedSymbol === 'ETH' && prices[WETH_ADDRESS.toLowerCase()]) {
          return { symbol: trimmedSymbol, price: prices[WETH_ADDRESS.toLowerCase()] };
        }
        
        const price = await getDIAPriceBySymbol(trimmedSymbol);
        return { symbol: trimmedSymbol, price };
      });

      const results = await Promise.all(pricePromises);
      results.forEach(({ symbol, price }) => {
        // Only add if we don't already have a price for this symbol
        if (!prices[symbol] || prices[symbol] === null) {
          prices[symbol] = price;
        }
      });
    }

    return NextResponse.json({ prices });
  } catch (error) {
    console.error('Token price API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch token prices', prices: {} },
      { status: 500 }
    );
  }
}

