"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import {
  clearMigrationDashboardUnlock,
  clearStoredMigrationAssessment,
  useMigrationDashboardUnlockedProfile,
  useStoredMigrationAssessment,
} from "@/components/migration/MigrationState";
import styles from "@/components/migration/migration.module.css";

export function MigrationShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const stored = useStoredMigrationAssessment();
  const unlockedProfile = useMigrationDashboardUnlockedProfile();
  const isSuccessPage = pathname === "/migration/success";
  const hasDashboardSession = Boolean(
    stored?.profileId && stored.registration && unlockedProfile === stored.profileId,
  );

  function logout() {
    clearStoredMigrationAssessment();
    clearMigrationDashboardUnlock();
    window.location.assign("/migration");
  }

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
                <Link
                  href="/migration/upload"
                  className={pathname?.startsWith("/migration/upload") ? styles.navLinkActive : undefined}
                >
                  Upload
                </Link>
                <Link
                  href="/migration/dashboard"
                  className={pathname?.startsWith("/migration/dashboard") ? styles.navLinkActive : undefined}
                >
                  Dashboard
                </Link>
                <button className={styles.navLogout} type="button" onClick={logout}>
                  <LogOut size={13} strokeWidth={2.2} />
                  Logout
                </button>
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
