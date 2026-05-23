"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "@/components/migration/migration.module.css";

export function MigrationShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const onReport = pathname === "/migration/report";
  const onDashboard = pathname?.startsWith("/migration/dashboard");

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <nav className={styles.nav} aria-label="Migration navigation">
          <Link href="/migration" className={styles.brand}>
            <Image
              src="/favicon.png"
              alt="Foundation-1"
              width={26}
              height={26}
              className={styles.brandIcon}
            />
            <span className={styles.brandName}>Foundation-1</span>
            <span className={styles.brandPill}>Migration</span>
          </Link>
          <div className={styles.navLinks}>
            {(onReport || onDashboard) && (
              <Link href="/migration/report">Report</Link>
            )}
          </div>
        </nav>
      </div>
      {children}
    </main>
  );
}
