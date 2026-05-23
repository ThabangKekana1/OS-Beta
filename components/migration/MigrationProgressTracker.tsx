import styles from "@/components/migration/migration.module.css";

const steps = [
  "Assessment Generated",
  "Business Details Captured",
  "Utility Profile Uploaded",
  "Partner Proposal Review",
  "Term Sheet Review",
  "Approval + Deployment",
];

export function MigrationProgressTracker({ activeIndex = 0 }: { activeIndex?: number }) {
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
            <span>{step}</span>
          </li>
        );
      })}
    </ol>
  );
}
