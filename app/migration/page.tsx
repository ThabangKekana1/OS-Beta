import type { Metadata } from "next";
import { MigrationHero } from "@/components/migration/MigrationHero";
import styles from "@/components/migration/migration.module.css";

export const metadata: Metadata = {
  title: "Foundation-1 Energy Migration",
  description:
    "Instant utility profile analysis for financed solar and wheeled energy migration.",
};

export default function MigrationPage() {
  return (
    <main className={styles.page}>
      <MigrationHero />
    </main>
  );
}
