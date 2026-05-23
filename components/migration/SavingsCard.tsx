import styles from "@/components/migration/migration.module.css";

type SavingsCardProps = {
  label?: string;
  title: string;
  rows: Array<{ label: string; value: string }>;
  children?: React.ReactNode;
};

export function SavingsCard({ label, title, rows, children }: SavingsCardProps) {
  return (
    <article className={styles.card}>
      {label ? <span className={styles.cardLabel}>{label}</span> : null}
      <h3 className={styles.cardTitle}>{title}</h3>
      <div className={styles.cardRows}>
        {rows.map((row) => (
          <div className={styles.row} key={`${title}-${row.label}`}>
            <span>{row.label}</span>
            <strong>{row.value}</strong>
          </div>
        ))}
      </div>
      {children}
    </article>
  );
}
