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
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M12 6V12L16 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span className={styles.bottomNavLabel}>Balance</span>
      </button>
      <button
        className={`${styles.bottomNavItem} ${isHistoryActive ? styles.bottomNavItemActive : ''}`}
        onClick={() => onTabChange('swapHistory')}
        aria-label="Swap History"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M3 3H21L20 21H4L3 3Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M8 12L12 16L16 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M12 8V16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span className={styles.bottomNavLabel}>History</span>
      </button>
      <button
        className={`${styles.bottomNavItem} ${isRewardsActive ? styles.bottomNavItemActive : ''}`}
        onClick={() => onTabChange('rewards')}
        aria-label="Rewards"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM12 20C7.59 20 4 16.41 4 12C4 7.59 7.59 4 12 4C16.41 4 20 7.59 20 12C20 16.41 16.41 20 12 20Z" fill="currentColor"/>
          <path d="M12.5 7H10.5C9.67 7 9 7.67 9 8.5C9 9.33 9.67 10 10.5 10H13.5C14.33 10 15 10.67 15 11.5C15 12.33 14.33 13 13.5 13H10.5M11 7V6M11 14V13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span className={styles.bottomNavLabel}>Rewards</span>
      </button>
    </div>
  );
}

