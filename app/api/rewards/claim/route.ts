import { NextRequest, NextResponse } from 'next/server';

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

