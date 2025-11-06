"use client";
import styles from "../app/page.module.css";

interface BottomNavigationProps {
  activeTab: 'balance' | 'swapHistory' | 'hideSmallBalance';
  onTabChange: (tab: 'balance' | 'swapHistory' | 'hideSmallBalance') => void;
}

export function BottomNavigation({ activeTab, onTabChange }: BottomNavigationProps) {
  // Only show navigation for balance and swapHistory tabs
  const isBalanceActive = activeTab === 'balance';
  const isHistoryActive = activeTab === 'swapHistory';
  
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
    </div>
  );
}

