"use client";
import styles from "../app/page.module.css";

interface BottomNavigationProps {
  activeTab: 'balance' | 'swapHistory' | 'rewards' | 'hideSmallBalance';
  onTabChange: (tab: 'balance' | 'swapHistory' | 'rewards' | 'hideSmallBalance') => void;
}

// SVG Icons for bottom navigation
const WalletIcon = ({ active }: { active: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#a855f7" : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
    <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
    <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
  </svg>
);

const HistoryIcon = ({ active }: { active: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#a855f7" : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
    <path d="M12 7v5l4 2" />
  </svg>
);

const RewardsIcon = ({ active }: { active: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#a855f7" : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
    <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
    <path d="M4 22h16" />
    <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
    <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
    <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
  </svg>
);

export function BottomNavigation({ activeTab, onTabChange }: BottomNavigationProps) {
  const isBalanceActive = activeTab === 'balance';
  const isHistoryActive = activeTab === 'swapHistory';
  const isRewardsActive = activeTab === 'rewards';

  return (
    <div className={styles.bottomNav}>
      <button
        className={`${styles.bottomNavItem} ${isBalanceActive ? styles.bottomNavItemActive : ''}`}
        onClick={() => onTabChange('balance')}
        aria-label="Balance"
      >
        <WalletIcon active={isBalanceActive} />
        <span className={styles.bottomNavLabel}>Balance</span>
      </button>
      <button
        className={`${styles.bottomNavItem} ${isHistoryActive ? styles.bottomNavItemActive : ''}`}
        onClick={() => onTabChange('swapHistory')}
        aria-label="Swap History"
      >
        <HistoryIcon active={isHistoryActive} />
        <span className={styles.bottomNavLabel}>History</span>
      </button>
      <button
        className={`${styles.bottomNavItem} ${isRewardsActive ? styles.bottomNavItemActive : ''}`}
        onClick={() => onTabChange('rewards')}
        aria-label="Rewards"
      >
        <RewardsIcon active={isRewardsActive} />
        <span className={styles.bottomNavLabel}>Rewards</span>
      </button>
    </div>
  );
}

