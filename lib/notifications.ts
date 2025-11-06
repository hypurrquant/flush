/**
 * Notification utility functions following Base Mini App Notification Guidelines
 * 
 * Guidelines:
 * - Title: Max 32 characters
 * - Body: Max 128 characters
 * - targetURL: Max 1024 characters, must be on same domain
 * - Frequency: Max 1 per 30 seconds, max 100 per day
 * - Only send meaningful notifications
 */

export interface NotificationPayload {
  title: string; // Max 32 characters
  body: string; // Max 128 characters
  targetURL: string; // Max 1024 characters, same domain
}

// Rate limiting: track last notification time
let lastNotificationTime: number = 0;
const MIN_NOTIFICATION_INTERVAL = 30000; // 30 seconds

/**
 * Send a notification to the user
 * This should be called from the server-side webhook endpoint
 */
export async function sendNotification(
  fid: string,
  notification: NotificationPayload
): Promise<boolean> {
  // Validate notification payload
  if (notification.title.length > 32) {
    console.error('Notification title exceeds 32 characters');
    return false;
  }

  if (notification.body.length > 128) {
    console.error('Notification body exceeds 128 characters');
    return false;
  }

  if (notification.targetURL.length > 1024) {
    console.error('Notification targetURL exceeds 1024 characters');
    return false;
  }

  // Rate limiting check (client-side, server should also check)
  const now = Date.now();
  if (now - lastNotificationTime < MIN_NOTIFICATION_INTERVAL) {
    console.warn('Notification rate limit: too soon after last notification');
    return false;
  }

  lastNotificationTime = now;

  try {
    // Call webhook endpoint to send notification
    const response = await fetch('/api/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fid,
        ...notification,
      }),
    });

    if (!response.ok) {
      console.error('Failed to send notification:', await response.text());
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error sending notification:', error);
    return false;
  }
}

/**
 * Notification templates following best practices
 */
export const NotificationTemplates = {
  swapSuccess: (tokenCount: number, outputToken: string): NotificationPayload => ({
    title: 'Swap Completed',
    body: `Successfully swapped ${tokenCount} token${tokenCount > 1 ? 's' : ''} to ${outputToken}`,
    targetURL: '/',
  }),

  swapFailed: (): NotificationPayload => ({
    title: 'Swap Failed',
    body: 'Your swap transaction failed. Tap to try again.',
    targetURL: '/',
  }),

  dustTokensReminder: (count: number): NotificationPayload => ({
    title: 'Clean Up Dust Tokens',
    body: `You have ${count} dust token${count > 1 ? 's' : ''}. Consolidate them now to save on gas fees.`,
    targetURL: '/',
  }),
};

