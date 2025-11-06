import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userAddress, totalSwapAmount, fees, tokenAddresses, amounts } = body;

    if (!userAddress || !totalSwapAmount) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Insert swap record
    const { data, error } = await supabase
      .from('swaps')
      .insert({
        user_address: userAddress,
        total_swap_amount: totalSwapAmount,
        fees: fees || 0,
        token_addresses: tokenAddresses || [],
        amounts: amounts || [],
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json(
        { error: 'Failed to save swap record', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userAddress = searchParams.get('userAddress');

    if (!userAddress) {
      return NextResponse.json(
        { error: 'Missing userAddress parameter' },
        { status: 400 }
      );
    }

    // Get user's total swap stats
    const { data, error } = await supabase
      .from('swaps')
      .select('total_swap_amount, fees')
      .eq('user_address', userAddress.toLowerCase());

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch swap stats', details: error.message },
        { status: 500 }
      );
    }

    const totalSwapAmount = data?.reduce(
      (sum, record) => sum + (parseFloat(record.total_swap_amount) || 0),
      0
    ) || 0;

    const totalFees = data?.reduce(
      (sum, record) => sum + (parseFloat(record.fees) || 0),
      0
    ) || 0;

    return NextResponse.json({
      success: true,
      totalSwapAmount,
      totalFees,
      swapCount: data?.length || 0,
    });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}


