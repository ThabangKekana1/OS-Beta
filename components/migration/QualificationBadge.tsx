import styles from "@/components/migration/migration.module.css";

export function QualificationBadge({ status }: { status: string }) {
  return <span className={styles.badge}>{status}</span>;
}
