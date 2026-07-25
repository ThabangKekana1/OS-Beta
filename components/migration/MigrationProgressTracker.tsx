import styles from "@/components/migration/migration.module.css";

/** The full Foundation-1 journey (S0–S9), in client language. */
const DEFAULT_STEPS = [
  "First report · no bills",
  "Complete bill pack",
  "Foundation-1 assessment",
  "Post-assessment EOI",
  "Formal UFMS proposal",
  "Signed formal proposal",
  "Direct bank KYC",
  "Funding review",
  "Terms & close",
];

export function MigrationProgressTracker({
  activeIndex = 0,
  steps = DEFAULT_STEPS,
}: {
  activeIndex?: number;
  steps?: string[];
}) {
  return (
    <ol className={styles.progressList}>
      {steps.map((step, index) => {
        const isDone = index < activeIndex;
        const isActive = index === activeIndex;
        const className = [
          styles.progressItem,
          isDone ? styles.progressItemDone : "",
          isActive ? styles.progressItemActive : "",
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <li className={className} key={step}>
            <span className={styles.progressDot}>{isDone ? "✓" : index + 1}</span>
            <span aria-current={isActive ? "step" : undefined}>{step}</span>
          </li>
        );
      })}
    </ol>
  );
}
