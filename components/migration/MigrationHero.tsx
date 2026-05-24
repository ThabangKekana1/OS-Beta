import { ArrowRight } from "lucide-react";
import Link from "next/link";
import styles from "@/components/migration/migration.module.css";

const trustIndicators = [
  {
    title: "Zero Risk",
    description: "No capital required, no financial exposure",
    proof: "Fully financed by Nedbank",
    details: ["Maintained by us, Insured by us, 24 hour support"],
  },
  {
    title: "Immediate Value",
    description: "Savings from day one",
    proof: "Up to 60% cost reduction",
  },
  {
    title: "Zero Complexity",
    description: "We manage application to energisation",
    proof: "End-to-end managed process",
    details: ["Fully maintained by Foundation-1", "24-hour support"],
  },
  {
    title: "Resilience",
    description: "Energy security beyond the grid",
    proof: "56MW solar farm backing Lumen",
  },
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
            </div>
          </div>
          <div className={styles.trustGrid} aria-label="Migration value proposition">
            {trustIndicators.map((item) => (
              <div className={styles.trustItem} key={item.title}>
                <span className={styles.trustItemTitle}>{item.title}</span>
                <span className={styles.trustItemDescription}>{item.description}</span>
                <span className={styles.trustItemProof}>{item.proof}</span>
                {item.details ? (
                  <span className={styles.trustItemDetails}>
                    {item.details.join(" · ")}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
