"use client";
import { useState, useEffect } from "react";
import styles from "../app/page.module.css";

interface RewardsTabProps {
  address: string | undefined;
}

interface DailyCheckIn {
  date: string;
  swapAmount: number;
  checked: boolean;
}

interface WeeklyReward {
  weekStart: string;
  weekEnd: string;
  totalDays: number;
  checkedDays: number;
  rewardAmount: number;
  claimed: boolean;
}

export function RewardsTab({ address }: RewardsTabProps) {
  const [dailyCheckIns, setDailyCheckIns] = useState<DailyCheckIn[]>([]);
  const [weeklyRewards, setWeeklyRewards] = useState<WeeklyReward[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentWeekStats, setCurrentWeekStats] = useState({
    checkedDays: 0,
    totalDays: 7,
    totalSwapAmount: 0,
  });

  useEffect(() => {
    if (!address) return;

    async function fetchRewardsData() {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/rewards?userAddress=${address}`);
        if (response.ok) {
          const data = await response.json();
          setDailyCheckIns(data.dailyCheckIns || []);
          setWeeklyRewards(data.weeklyRewards || []);
          setCurrentWeekStats(data.currentWeekStats || { checkedDays: 0, totalDays: 7, totalSwapAmount: 0 });
        }
      } catch (error) {
        console.error('Failed to fetch rewards data:', error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchRewardsData();
    const interval = setInterval(fetchRewardsData, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, [address]);

  const handleClaimReward = async (weekStart: string) => {
    if (!address) return;

    try {
      const response = await fetch('/api/rewards/claim', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userAddress: address,
          weekStart,
        }),
      });

      if (response.ok) {
        // Refresh rewards data
        const refreshResponse = await fetch(`/api/rewards?userAddress=${address}`);
        if (refreshResponse.ok) {
          const refreshData = await refreshResponse.json();
          setWeeklyRewards(refreshData.weeklyRewards || []);
        }
      }
    } catch (error) {
      console.error('Failed to claim reward:', error);
    }
  };

  // Get current week start (Monday)
  const getCurrentWeekStart = () => {
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
    const monday = new Date(today.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    return monday.toISOString().split('T')[0];
  };

  // Get days of current week
  const getCurrentWeekDays = () => {
    const weekStart = new Date(getCurrentWeekStart());
    const days: string[] = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(weekStart);
      date.setDate(date.getDate() + i);
      days.push(date.toISOString().split('T')[0]);
    }
    return days;
  };

  const currentWeekDays = getCurrentWeekDays();
  const today = new Date().toISOString().split('T')[0];

  if (isLoading) {
    return (
      <div className={styles.loadingIndicator}>
        <div className={styles.loadingSpinner}></div>
        <div className={styles.loadingText}>Loading rewards...</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Current Week Stats */}
      <div style={{
        background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '12px',
        padding: '1.5rem',
      }}>
        <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.25rem', fontWeight: '700' }}>
          This Week&apos;s Progress
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'rgba(255, 255, 255, 0.7)' }}>Check-ins:</span>
            <span style={{ fontWeight: '600', fontSize: '1.125rem' }}>
              {currentWeekStats.checkedDays} / {currentWeekStats.totalDays} days
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'rgba(255, 255, 255, 0.7)' }}>Total Swap Amount:</span>
            <span style={{ fontWeight: '600', fontSize: '1.125rem' }}>
              ${currentWeekStats.totalSwapAmount.toFixed(2)}
            </span>
          </div>
          <div style={{
            width: '100%',
            height: '8px',
            background: 'rgba(255, 255, 255, 0.1)',
            borderRadius: '4px',
            overflow: 'hidden',
            marginTop: '0.5rem',
          }}>
            <div style={{
              width: `${(currentWeekStats.checkedDays / currentWeekStats.totalDays) * 100}%`,
              height: '100%',
              background: '#f7d954',
              transition: 'width 0.3s ease',
            }} />
          </div>
        </div>
      </div>

      {/* Daily Check-in Calendar */}
      <div style={{
        background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '12px',
        padding: '1.5rem',
      }}>
        <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', fontWeight: '600' }}>
          Daily Check-in (Min $1 swap required)
        </h3>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: '0.5rem',
        }}>
          {currentWeekDays.map((date, index) => {
            const checkIn = dailyCheckIns.find(c => c.date === date);
            const isToday = date === today;
            const isPast = date < today;
            const isChecked = checkIn?.checked || false;

            return (
              <div
                key={date}
                style={{
                  aspectRatio: '1',
                  background: isChecked
                    ? 'rgba(247, 217, 84, 0.2)'
                    : isPast
                    ? 'rgba(255, 255, 255, 0.05)'
                    : 'rgba(255, 255, 255, 0.03)',
                  border: isToday
                    ? '2px solid #f7d954'
                    : isChecked
                    ? '2px solid rgba(247, 217, 84, 0.5)'
                    : '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.25rem',
                  padding: '0.5rem',
                }}
              >
                <div style={{
                  fontSize: '0.75rem',
                  color: 'rgba(255, 255, 255, 0.6)',
                  fontWeight: '500',
                }}>
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][index]}
                </div>
                <div style={{
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  color: isChecked ? '#f7d954' : 'rgba(255, 255, 255, 0.7)',
                }}>
                  {new Date(date).getDate()}
                </div>
                {isChecked && (
                  <div style={{ fontSize: '0.75rem', color: '#f7d954' }}>✓</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Weekly Rewards History */}
      {weeklyRewards.length > 0 && (
        <div style={{
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '12px',
          padding: '1.5rem',
        }}>
          <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', fontWeight: '600' }}>
            Weekly Rewards
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {weeklyRewards.map((reward) => (
              <div
                key={reward.weekStart}
                style={{
                  padding: '1rem',
                  background: 'rgba(255, 255, 255, 0.03)',
                  borderRadius: '8px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ fontWeight: '600', marginBottom: '0.25rem' }}>
                    {new Date(reward.weekStart).toLocaleDateString()} - {new Date(reward.weekEnd).toLocaleDateString()}
                  </div>
                  <div style={{ fontSize: '0.875rem', color: 'rgba(255, 255, 255, 0.6)' }}>
                    {reward.checkedDays} / {reward.totalDays} days checked in
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
                  <div style={{ fontWeight: '700', fontSize: '1.125rem', color: '#f7d954' }}>
                    ${reward.rewardAmount.toFixed(2)}
                  </div>
                  {reward.claimed ? (
                    <div style={{ fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.5)' }}>
                      Claimed ✓
                    </div>
                  ) : (
                    <button
                      onClick={() => handleClaimReward(reward.weekStart)}
                      disabled={reward.checkedDays < reward.totalDays}
                      style={{
                        padding: '0.5rem 1rem',
                        background: reward.checkedDays >= reward.totalDays ? '#f7d954' : 'rgba(255, 255, 255, 0.1)',
                        color: reward.checkedDays >= reward.totalDays ? '#000' : 'rgba(255, 255, 255, 0.5)',
                        border: 'none',
                        borderRadius: '6px',
                        fontWeight: '600',
                        cursor: reward.checkedDays >= reward.totalDays ? 'pointer' : 'not-allowed',
                        fontSize: '0.875rem',
                      }}
                    >
                      Claim
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Info */}
      <div style={{
        padding: '1rem',
        background: 'rgba(247, 217, 84, 0.1)',
        border: '1px solid rgba(247, 217, 84, 0.3)',
        borderRadius: '8px',
        fontSize: '0.875rem',
        lineHeight: '1.6',
        color: 'rgba(255, 255, 255, 0.8)',
      }}>
        <strong>How it works:</strong>
        <ul style={{ margin: '0.5rem 0 0 0', paddingLeft: '1.25rem' }}>
          <li>Swap at least $1 each day to check in</li>
          <li>Complete 7 check-ins in a week to earn rewards</li>
          <li>Rewards are distributed weekly on Monday</li>
        </ul>
      </div>
    </div>
  );
}

