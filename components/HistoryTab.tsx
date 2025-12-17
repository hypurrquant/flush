"use client";
import { useState, useEffect } from "react";
import { TokenImage } from "./TokenImage";
import styles from "../app/page.module.css";

interface HistoryTabProps {
  address: string | undefined;
  tokenList: Array<{
    address: string;
    symbol: string;
    name: string;
    decimals: number;
    image: string | null;
  }>;
}

interface SwapRecord {
  id: string;
  user_address: string;
  total_swap_amount: string;
  fees: string;
  token_addresses: string[];
  amounts: string[];
  tx_hash?: string;
  output_token?: string;
  output_amount?: string;
  created_at: string;
}

interface GroupedSwaps {
  [date: string]: SwapRecord[];
}

export function HistoryTab({ address, tokenList }: HistoryTabProps) {
  const [swaps, setSwaps] = useState<SwapRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!address) return;

    async function fetchSwapHistory() {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/swaps?userAddress=${address}`);
        if (response.ok) {
          const data = await response.json();
          setSwaps(data.swaps || []);
        } else {
          const errorData = await response.json();
          setError(errorData.error || 'Failed to fetch swap history');
        }
      } catch (err) {
        console.error('Failed to fetch swap history:', err);
        setError('Failed to fetch swap history');
      } finally {
        setIsLoading(false);
      }
    }

    fetchSwapHistory();
  }, [address]);

  const getTokenInfo = (tokenAddress: string) => {
    const normalizedAddress = tokenAddress.toLowerCase();
    return tokenList.find(t => t.address.toLowerCase() === normalizedAddress) || {
      symbol: tokenAddress.slice(0, 6) + '...',
      name: 'Unknown Token',
      decimals: 18,
      image: null,
      address: tokenAddress,
    };
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
      });
    }
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const groupSwapsByDate = (swaps: SwapRecord[]): GroupedSwaps => {
    return swaps.reduce((groups: GroupedSwaps, swap) => {
      const date = new Date(swap.created_at).toDateString();
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(swap);
      return groups;
    }, {});
  };

  const _formatAmount = (amount: string, decimals: number) => {
    const num = parseFloat(amount) / Math.pow(10, decimals);
    if (num < 0.0001) return '<0.0001';
    if (num < 1) return num.toFixed(4);
    if (num < 1000) return num.toFixed(2);
    return num.toLocaleString('en-US', { maximumFractionDigits: 2 });
  };

  if (isLoading) {
    return (
      <div className={styles.loadingIndicator}>
        <div className={styles.loadingSpinner}></div>
        <div className={styles.loadingText}>Loading swap history...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.historyEmpty}>
        <div className={styles.historyEmptyIcon}>⚠️</div>
        <div className={styles.historyEmptyText}>{error}</div>
      </div>
    );
  }

  if (swaps.length === 0) {
    return (
      <div className={styles.historyEmpty}>
        <div className={styles.historyEmptyIcon}>📜</div>
        <div className={styles.historyEmptyTitle}>No swap history yet</div>
        <div className={styles.historyEmptyText}>
          Your swap transactions will appear here
        </div>
      </div>
    );
  }

  const groupedSwaps = groupSwapsByDate(swaps);
  const sortedDates = Object.keys(groupedSwaps).sort(
    (a, b) => new Date(b).getTime() - new Date(a).getTime()
  );

  return (
    <div className={styles.historyContainer}>
      {/* Stats Summary */}
      <div className={styles.historyStats}>
        <div className={styles.historyStatItem}>
          <div className={styles.historyStatValue}>
            ${swaps.reduce((sum, s) => sum + parseFloat(s.total_swap_amount || '0'), 0).toFixed(2)}
          </div>
          <div className={styles.historyStatLabel}>Total Swapped</div>
        </div>
        <div className={styles.historyStatItem}>
          <div className={styles.historyStatValue}>{swaps.length}</div>
          <div className={styles.historyStatLabel}>Transactions</div>
        </div>
        <div className={styles.historyStatItem}>
          <div className={styles.historyStatValue}>
            ${swaps.reduce((sum, s) => sum + parseFloat(s.fees || '0'), 0).toFixed(2)}
          </div>
          <div className={styles.historyStatLabel}>Fees Paid</div>
        </div>
      </div>

      {/* Swap List */}
      <div className={styles.historyList}>
        {sortedDates.map((dateKey) => (
          <div key={dateKey} className={styles.historyDateGroup}>
            <div className={styles.historyDateHeader}>
              {formatDate(groupedSwaps[dateKey][0].created_at)}
            </div>
            {groupedSwaps[dateKey].map((swap) => {
              const inputTokens = swap.token_addresses || [];
              const isBatchSwap = inputTokens.length > 1;

              return (
                <div key={swap.id} className={styles.historyItem}>
                  <div className={styles.historyItemLeft}>
                    <div className={styles.historyItemIcon}>
                      {isBatchSwap ? (
                        <div className={styles.historyBatchIcon}>
                          <span>{inputTokens.length}</span>
                        </div>
                      ) : (
                        inputTokens[0] && (
                          <TokenImage
                            src={getTokenInfo(inputTokens[0]).image}
                            alt={getTokenInfo(inputTokens[0]).symbol}
                            width={36}
                            height={36}
                            className={styles.historyTokenImage}
                          />
                        )
                      )}
                    </div>
                    <div className={styles.historyItemInfo}>
                      <div className={styles.historyItemTitle}>
                        {isBatchSwap ? (
                          <>Batch Swap ({inputTokens.length} tokens)</>
                        ) : (
                          <>
                            {inputTokens[0] ? getTokenInfo(inputTokens[0]).symbol : 'Unknown'} → USDC
                          </>
                        )}
                      </div>
                      <div className={styles.historyItemTokens}>
                        {inputTokens.slice(0, 3).map((addr, idx) => (
                          <span key={addr} className={styles.historyTokenBadge}>
                            {getTokenInfo(addr).symbol}
                            {idx < Math.min(inputTokens.length, 3) - 1 && ', '}
                          </span>
                        ))}
                        {inputTokens.length > 3 && (
                          <span className={styles.historyTokenBadge}>
                            +{inputTokens.length - 3} more
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className={styles.historyItemRight}>
                    <div className={styles.historyItemAmount}>
                      +${parseFloat(swap.total_swap_amount || '0').toFixed(2)}
                    </div>
                    <div className={styles.historyItemMeta}>
                      <span className={styles.historyItemTime}>
                        {formatTime(swap.created_at)}
                      </span>
                      <span className={styles.historyItemStatus}>
                        ✓
                      </span>
                    </div>
                    {swap.tx_hash && (
                      <a
                        href={`https://basescan.org/tx/${swap.tx_hash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.historyItemLink}
                        onClick={(e) => e.stopPropagation()}
                      >
                        View →
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
