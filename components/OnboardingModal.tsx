"use client";
import styles from "../app/page.module.css";

interface OnboardingModalProps {
  showOnboarding: boolean;
  onboardingStep: number;
  onNext: () => void;
  onSkip: () => void;
}

export function OnboardingModal({
  showOnboarding,
  onboardingStep,
  onNext,
  onSkip,
}: OnboardingModalProps) {
  if (!showOnboarding) return null;

  return (
    <div className={styles.onboardingModal}>
      <div className={styles.onboardingModalContent}>
        {onboardingStep === 0 && (
          <div className={styles.onboardingScreen}>
            <div className={styles.onboardingIcon}>💎</div>
            <h2 className={styles.onboardingTitle}>Welcome to Flush</h2>
            <p className={styles.onboardingDescription}>
              Consolidate your tokens in one transaction
            </p>
            <div className={styles.onboardingImagePlaceholder}>
              <div className={styles.onboardingImageIcon}>🔄</div>
            </div>
          </div>
        )}
        {onboardingStep === 1 && (
          <div className={styles.onboardingScreen}>
            <div className={styles.onboardingIcon}>⚡</div>
            <h2 className={styles.onboardingTitle}>Save on Gas</h2>
            <p className={styles.onboardingDescription}>
              Batch multiple swaps into a single transaction and reduce gas fees
            </p>
            <div className={styles.onboardingImagePlaceholder}>
              <div className={styles.onboardingImageIcon}>💰</div>
            </div>
          </div>
        )}
        {onboardingStep === 2 && (
          <div className={styles.onboardingScreen}>
            <div className={styles.onboardingIcon}>🎯</div>
            <h2 className={styles.onboardingTitle}>Get Started</h2>
            <p className={styles.onboardingDescription}>
              Connect your wallet to see your balances and start swapping
            </p>
            <div className={styles.onboardingImagePlaceholder}>
              <div className={styles.onboardingImageIcon}>🔗</div>
            </div>
          </div>
        )}
        <div className={styles.onboardingFooter}>
          <div className={styles.onboardingDots}>
            {[0, 1, 2].map((step) => (
              <div
                key={step}
                className={`${styles.onboardingDot} ${onboardingStep === step ? styles.onboardingDotActive : ''}`}
              />
            ))}
          </div>
          <div className={styles.onboardingActions}>
            <button
              onClick={onSkip}
              className={styles.onboardingSkipButton}
            >
              Skip
            </button>
            <button
              onClick={onNext}
              className={styles.onboardingNextButton}
            >
              {onboardingStep === 2 ? 'Get Started' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

