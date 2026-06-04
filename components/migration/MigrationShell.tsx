"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useMigrationDashboardUnlockedProfile,
  useStoredMigrationAssessment,
} from "@/components/migration/MigrationState";
import styles from "@/components/migration/migration.module.css";

export function MigrationShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const stored = useStoredMigrationAssessment();
  const unlockedProfile = useMigrationDashboardUnlockedProfile();
  const isLandingPage = pathname === "/" || pathname === "/migration";
  const isSuccessPage = pathname === "/migration/success";
  const hasDashboardSession = Boolean(
    stored?.profileId && stored.registration && unlockedProfile === stored.profileId,
  );

  return (
    <main className={`${styles.page} ${isLandingPage ? styles.homePage : ""}`}>
      <div className={`${styles.shell} ${isLandingPage ? styles.homeNavShell : ""}`}>
        <nav className={`${styles.nav} ${isLandingPage ? styles.homeNav : ""}`} aria-label="Migration navigation">
          <Link href="/" className={styles.brand}>
            <Image
              src="/foundation-1-icon.png"
              alt="Foundation-1"
              width={26}
              height={26}
              className={styles.brandIcon}
            />
            <span className={styles.brandName}>Foundation-1</span>
          </Link>
          <div className={styles.navLinks}>
            {!isSuccessPage && hasDashboardSession ? (
              <>
                <Link
                  href="/migration/start"
                  className={pathname === "/migration/start" ? styles.navLinkActive : undefined}
                >
                  Assessment
                </Link>
                <Link
                  href="/migration/report"
                  className={pathname === "/migration/report" ? styles.navLinkActive : undefined}
                >
                  Report
                </Link>
              </>
            ) : (
              (pathname === "/migration/report" || pathname?.startsWith("/migration/dashboard")) && (
                <Link href="/migration/report">Report</Link>
              )
            )}
          </div>
        </nav>
      </div>
      {children}
    </main>
  );
}
