import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// Get current week start (Monday)
function getCurrentWeekStart(): Date {
  const today = new Date();
  const day = today.getDay();
  const diff = today.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
  const monday = new Date(today.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

// Get week start for a given date
function getWeekStart(date: Date): Date {
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(date);
  monday.setDate(diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

// Get days of a week
function getWeekDays(weekStart: Date): string[] {
  const days: string[] = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + i);
    days.push(date.toISOString().split('T')[0]);
  }
  return days;
}

export async function GET(request: NextRequest) {
  try {
    // Check if Supabase is configured
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      return NextResponse.json(
        { error: 'Supabase not configured' },
        { status: 503 }
      );
    }

    const { searchParams } = new URL(request.url);
    const userAddress = searchParams.get('userAddress');

    if (!userAddress) {
      return NextResponse.json(
        { error: 'Missing userAddress parameter' },
        { status: 400 }
      );
    }

    const normalizedAddress = userAddress.toLowerCase();

    // Get all swaps for the user
    const { data: swaps, error: swapsError } = await supabase
      .from('swaps')
      .select('*')
      .eq('user_address', normalizedAddress)
      .order('created_at', { ascending: false });

    if (swapsError) {
      console.error('Supabase error:', swapsError);
      return NextResponse.json(
        { error: 'Failed to fetch swaps', details: swapsError.message },
        { status: 500 }
      );
    }

    const currentWeekStart = getCurrentWeekStart();
    const currentWeekDays = getWeekDays(currentWeekStart);

    // Calculate daily check-ins for current week
    const dailyCheckIns = currentWeekDays.map(date => {
      const daySwaps = swaps?.filter(swap => {
        const swapDate = new Date(swap.created_at).toISOString().split('T')[0];
        return swapDate === date;
      }) || [];

      const totalSwapAmount = daySwaps.reduce((sum, swap) => {
        return sum + (parseFloat(swap.total_swap_amount || '0') || 0);
      }, 0);

      return {
        date,
        swapAmount: totalSwapAmount,
        checked: totalSwapAmount >= 1.0, // Minimum $1 required
      };
    });

    // Calculate current week stats
    const currentWeekStats = {
      checkedDays: dailyCheckIns.filter(c => c.checked).length,
      totalDays: 7,
      totalSwapAmount: dailyCheckIns.reduce((sum, c) => sum + c.swapAmount, 0),
    };

    // Calculate weekly rewards for past weeks
    const weeklyRewards: Array<{
      weekStart: string;
      weekEnd: string;
      totalDays: number;
      checkedDays: number;
      rewardAmount: number;
      claimed: boolean;
    }> = [];

    // Group swaps by week
    const swapsByWeek = new Map<string, typeof swaps>();
    swaps?.forEach(swap => {
      const swapDate = new Date(swap.created_at);
      const weekStart = getWeekStart(swapDate);
      const weekKey = weekStart.toISOString().split('T')[0];
      
      if (!swapsByWeek.has(weekKey)) {
        swapsByWeek.set(weekKey, []);
      }
      swapsByWeek.get(weekKey)!.push(swap);
    });

    // Calculate rewards for each week
    for (const [weekKey, weekSwaps] of swapsByWeek.entries()) {
      const weekStartDate = new Date(weekKey);
      const weekDays = getWeekDays(weekStartDate);
      const weekEndDate = new Date(weekStartDate);
      weekEndDate.setDate(weekEndDate.getDate() + 6);

      // Count checked days
      const checkedDays = weekDays.filter(date => {
        const daySwaps = weekSwaps.filter(swap => {
          const swapDate = new Date(swap.created_at).toISOString().split('T')[0];
          return swapDate === date;
        });
        const totalSwapAmount = daySwaps.reduce((sum, swap) => {
          return sum + (parseFloat(swap.total_swap_amount || '0') || 0);
        }, 0);
        return totalSwapAmount >= 1.0;
      }).length;

      // Calculate reward (example: $10 per week if all 7 days checked)
      const rewardAmount = checkedDays >= 7 ? 10 : 0;

      // Check if reward was claimed (you'll need to add a claims table)
      // For now, we'll check if the week is in the past
      const isPastWeek = weekEndDate < currentWeekStart;
      const claimed = isPastWeek && checkedDays >= 7; // Auto-claim for past weeks (you can change this logic)

      weeklyRewards.push({
        weekStart: weekKey,
        weekEnd: weekEndDate.toISOString().split('T')[0],
        totalDays: 7,
        checkedDays,
        rewardAmount,
        claimed,
      });
    }

    // Sort by week start (newest first)
    weeklyRewards.sort((a, b) => b.weekStart.localeCompare(a.weekStart));

    return NextResponse.json({
      success: true,
      dailyCheckIns,
      currentWeekStats,
      weeklyRewards,
    });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userAddress, weekStart } = body;

    if (!userAddress || !weekStart) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // Here you would implement the claim logic
    // For now, we'll just return success
    // In a real implementation, you would:
    // 1. Verify the user is eligible
    // 2. Transfer the reward tokens
    // 3. Mark the reward as claimed in the database

    return NextResponse.json({
      success: true,
      message: 'Reward claimed successfully',
    });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
