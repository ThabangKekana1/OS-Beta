import { ArrowRight } from "lucide-react";
import Link from "next/link";
import styles from "@/components/migration/migration.module.css";

const trustIndicators = [
  "Zero upfront capital required",
  "Financed energy infrastructure",
  "Solar and wheeling pathways",
  "Proposal-ready utility analysis",
  "Built for South African businesses",
  "Institutional infrastructure finance",
];

export function MigrationHero() {
  return (
    <section className={styles.hero}>
      <div className={styles.shell}>
        <div className={styles.heroGrid}>
          <div>
            <span className={styles.heroEyebrow}>Energy Migration Platform</span>
            <h1 className={styles.heroTitle}>
              Find out if your electricity bill qualifies for financed energy migration.
            </h1>
            <p className={styles.heroText}>
              Enter your utility profile and get an instant report — solar suitability,
              wheeling access, and potential monthly savings. No account required.
            </p>
            <div className={styles.buttonRow}>
              <Link href="/migration/start" className={styles.primaryButton}>
                Start Assessment
                <ArrowRight size={14} strokeWidth={2.5} />
              </Link>
              <Link href="/migration/dashboard" className={styles.secondaryButton}>
                Dashboard
              </Link>
            </div>
          </div>
          <div className={styles.trustGrid} aria-label="Trust indicators">
            {trustIndicators.map((item) => (
              <div className={styles.trustItem} key={item}>
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
