import { MigrationAssessmentForm } from "@/components/migration/MigrationAssessmentForm";
import styles from "@/components/migration/migration.module.css";

const PREVIEW_ITEMS = [
  {
    title: "Ten-year utility exposure",
    copy: "Escalation-modelled projection of your current electricity path.",
  },
  {
    title: "UFMS solar saving range",
    copy: "Low, base, and high saving estimates from observed partner proposal patterns.",
  },
  {
    title: "Wheeling estimate",
    copy: "Conservative and PV-only reference tariff comparisons.",
  },
  {
    title: "Illustrative combined scenarios",
    copy: "Split-portfolio solar and wheeling saving scenarios side by side.",
  },
];

export function MigrationStart() {
  return (
    <section className={styles.startSection}>
      <div className={styles.startShell}>
        <div className={styles.startHeader}>
          <div>
            <h1 className={styles.sectionTitle}>Instant Migration Assessment</h1>
            <p className={styles.sectionCopy}>
              Enter your monthly electricity spend. The full report generates instantly — no account
              required.
            </p>
          </div>
        </div>
        <div className={styles.startPanel}>
          <MigrationAssessmentForm paneClass={styles.startPane} />
          <aside className={styles.startPane}>
            <span className={styles.cardLabel}>What you&apos;ll see</span>
            <h2 className={styles.cardTitle}>
              Understand your ten-year electricity exposure and indicative saving range.
            </h2>
            <div className={styles.previewList}>
              {PREVIEW_ITEMS.map((item) => (
                <div className={styles.previewItem} key={item.title}>
                  <span className={styles.previewItemDot} />
                  <div>
                    <p className={styles.previewItemTitle}>{item.title}</p>
                    <p className={styles.previewItemCopy}>{item.copy}</p>
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
