import { NextRequest, NextResponse } from 'next/server';

/**
 * Notification API endpoint
 * This endpoint should be called to send notifications to users
 * 
 * Note: In production, this should integrate with Farcaster's notification system
 * via the webhook URL configured in minikit.config.ts
 */

interface NotificationRequest {
  fid: string;
  title: string;
  body: string;
  targetURL: string;
}

// Rate limiting: track notifications per user per day
const userNotificationCounts = new Map<string, { count: number; resetTime: number }>();
const MAX_NOTIFICATIONS_PER_DAY = 100;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

function checkRateLimit(fid: string): boolean {
  const now = Date.now();
  const userData = userNotificationCounts.get(fid);

  if (!userData || now > userData.resetTime) {
    // Reset or initialize
    userNotificationCounts.set(fid, {
      count: 1,
      resetTime: now + DAY_IN_MS,
    });
    return true;
  }

  if (userData.count >= MAX_NOTIFICATIONS_PER_DAY) {
    return false;
  }

  userData.count++;
  return true;
}

export async function POST(request: NextRequest) {
  try {
    const requestBody: NotificationRequest = await request.json();
    const { fid, title, body, targetURL } = requestBody;

    // Validate input
    if (!fid || !title || !body || !targetURL) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate lengths
    if (title.length > 32) {
      return NextResponse.json(
        { error: 'Title exceeds 32 characters' },
        { status: 400 }
      );
    }

    if (body.length > 128) {
      return NextResponse.json(
        { error: 'Body exceeds 128 characters' },
        { status: 400 }
      );
    }

    if (targetURL.length > 1024) {
      return NextResponse.json(
        { error: 'targetURL exceeds 1024 characters' },
        { status: 400 }
      );
    }

    // Validate targetURL is on same domain
    const appUrl = process.env.NEXT_PUBLIC_URL || 'http://localhost:3000';
    try {
      const targetUrlObj = new URL(targetURL, appUrl);
      const appUrlObj = new URL(appUrl);
      if (targetUrlObj.hostname !== appUrlObj.hostname) {
        return NextResponse.json(
          { error: 'targetURL must be on the same domain' },
          { status: 400 }
        );
      }
    } catch {
      return NextResponse.json(
        { error: 'Invalid targetURL format' },
        { status: 400 }
      );
    }

    // Check rate limit
    if (!checkRateLimit(fid)) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Maximum 100 notifications per day.' },
        { status: 429 }
      );
    }

    // In production, this should send the notification via Farcaster's webhook system
    // For now, we'll just log it
    console.log('Notification sent:', {
      fid,
      title,
      body,
      targetURL,
    });

    // TODO: Integrate with Farcaster notification system via webhook
    // The webhook URL is configured in minikit.config.ts as webhookUrl

    return NextResponse.json({
      success: true,
      message: 'Notification queued',
    });
  } catch (error) {
    console.error('Error processing notification:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

