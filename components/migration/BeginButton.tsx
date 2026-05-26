"use client";

import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import styles from "@/components/migration/migration.module.css";

export function BeginButton() {
  const router = useRouter();
  const [launching, setLaunching] = useState(false);

  useEffect(() => {
    router.prefetch("/migration/start");
  }, [router]);

  useEffect(() => {
    if (!launching) return;
    const t = window.setTimeout(() => {
      router.push("/migration/start");
    }, 5000);
    return () => window.clearTimeout(t);
  }, [launching, router]);

  return (
    <>
      <button
        type="button"
        onClick={() => setLaunching(true)}
        className={`${styles.primaryButton} ${styles.heroButton}`}
        disabled={launching}
      >
        Begin
        <ArrowRight size={14} strokeWidth={2.5} />
      </button>
      {launching ? (
        <div className={styles.launchOverlay} role="status" aria-live="polite">
          <div className={styles.launchOrb} aria-hidden="true">
            <span className={styles.launchOrbRing} />
            <span className={styles.launchOrbRing} />
            <span className={styles.launchOrbRing} />
            <span className={styles.launchOrbCore} />
          </div>
          <div className={styles.launchCopy}>
            <span className={styles.launchLabel}>Foundation-1</span>
            <span className={styles.launchHeadline}>Preparing your migration</span>
            <span className={styles.launchSub}>Connecting securely to the platform&hellip;</span>
          </div>
        </div>
      ) : null}
    </>
  );
}
