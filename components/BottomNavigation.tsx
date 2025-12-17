"use client";
import styles from "../app/page.module.css";

interface BottomNavigationProps {
  activeTab: 'balance' | 'swapHistory' | 'rewards' | 'hideSmallBalance';
  onTabChange: (tab: 'balance' | 'swapHistory' | 'rewards' | 'hideSmallBalance') => void;
}

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
        <span className={styles.bottomNavLabel}>Balance</span>
      </button>
      <button
        className={`${styles.bottomNavItem} ${isHistoryActive ? styles.bottomNavItemActive : ''}`}
        onClick={() => onTabChange('swapHistory')}
        aria-label="Swap History"
      >
        <span className={styles.bottomNavLabel}>History</span>
      </button>
      <button
        className={`${styles.bottomNavItem} ${isRewardsActive ? styles.bottomNavItemActive : ''}`}
        onClick={() => onTabChange('rewards')}
        aria-label="Rewards"
      >
        <span className={styles.bottomNavLabel}>Rewards</span>
      </button>
    </div>
  );
}

