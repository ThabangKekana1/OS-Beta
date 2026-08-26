"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useMigrationDashboardUnlockedProfile,
  useStoredMigrationAssessment,
} from "@/components/migration/MigrationState";
import styles from "@/components/migration/migration.module.css";

const WEBSITE_ORIGIN = process.env.NEXT_PUBLIC_WEBSITE_ORIGIN ?? "https://foundation-1.co.za";
const WEBSITE_ASSESSMENT_URL = `${WEBSITE_ORIGIN}/pricing`;

export function MigrationShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const stored = useStoredMigrationAssessment();
  const unlockedProfile = useMigrationDashboardUnlockedProfile();
  const isLandingPage = pathname === "/" || pathname === "/migration";
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
            <span className={styles.brandName}>Foundation—1 <span className={styles.brandPill}>Migration OS</span></span>
          </Link>
          <div className={styles.navLinks}>
            {hasDashboardSession ? (
              <>
                <a href={WEBSITE_ASSESSMENT_URL}>
                  Assessment
                </a>
                <Link
                  href="/migration/proposal-status"
                  className={pathname === "/migration/proposal-status" ? styles.navLinkActive : undefined}
                >
                  Decision report
                </Link>
              </>
            ) : (
              (pathname === "/migration/proposal-status" || pathname?.startsWith("/migration/dashboard")) && (
                <Link
                  href="/migration/proposal-status"
                  className={pathname === "/migration/proposal-status" ? styles.navLinkActive : undefined}
                >
                  Decision report
                </Link>
              )
            )}
          </div>
        </nav>
      </div>
      {children}
    </main>
  );
}
