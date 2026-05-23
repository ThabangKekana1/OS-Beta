import Link from "next/link";
import { ArrowRight } from "lucide-react";
import styles from "@/components/migration/migration.module.css";

type NextActionPanelProps = {
  title: string;
  copy: string;
  primaryHref: string;
  primaryLabel: string;
  secondaryHref?: string;
  secondaryLabel?: string;
};

export function NextActionPanel({
  title,
  copy,
  primaryHref,
  primaryLabel,
  secondaryHref,
  secondaryLabel,
}: NextActionPanelProps) {
  return (
    <section className={`${styles.panel} ${styles.form}`} aria-label="Next action">
      <h2 className={styles.sectionTitle}>{title}</h2>
      <p className={styles.sectionCopy}>{copy}</p>
      <div className={styles.buttonRow}>
        <Link href={primaryHref} className={styles.primaryButton}>
          {primaryLabel}
          <ArrowRight size={16} strokeWidth={2} />
        </Link>
        {secondaryHref && secondaryLabel ? (
          <Link href={secondaryHref} className={styles.secondaryButton}>
            {secondaryLabel}
          </Link>
        ) : null}
      </div>
    </section>
  );
}
