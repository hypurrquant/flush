import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

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
        { error: 'Failed to fetch rewards', details: error.message },
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

    // Calculate rewards (example: 10% of fees back)
    const rewardRate = 0.1; // 10%
    const rewards = totalFees * rewardRate;

    return NextResponse.json({
      success: true,
      totalSwapAmount,
      totalFees,
      rewards,
      rewardRate,
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

