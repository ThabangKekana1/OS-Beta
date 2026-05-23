import type { Metadata } from "next";
import Image from "next/image";
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
      <div className={styles.landingBrandBar} aria-label="Foundation-1 Migration">
        <div className={styles.shell}>
          <div className={styles.landingBrand}>
            <Image
              src="/favicon.png"
              alt="Foundation-1 icon"
              width={30}
              height={30}
              className={styles.brandIcon}
              priority
            />
            <span className={styles.brandName}>Foundation-1</span>
            <span className={styles.brandPill}>Migration</span>
          </div>
        </div>
      </div>
      <MigrationHero />
    </main>
  );
}
