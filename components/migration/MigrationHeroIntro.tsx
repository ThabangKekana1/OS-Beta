"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { BeginButton } from "@/components/migration/BeginButton";
import styles from "@/components/migration/migration.module.css";

const HERO_TITLE = "Your power, restored.";

export function MigrationHeroIntro() {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [titleWidth, setTitleWidth] = useState<number | null>(null);

  useLayoutEffect(() => {
    const title = titleRef.current;
    if (!title) return;

    const updateTitleWidth = () => {
      const textRange = document.createRange();
      textRange.selectNodeContents(title);
      const textRect = textRange.getBoundingClientRect();
      const titleRect = title.getBoundingClientRect();
      const availableWidth = window.innerWidth - titleRect.left - 16;

      setTitleWidth(Math.max(0, Math.min(textRect.width, availableWidth)));
    };

    updateTitleWidth();
    const animationFrame = window.requestAnimationFrame(updateTitleWidth);
    document.fonts?.ready.then(updateTitleWidth).catch(() => undefined);

    const observer = new ResizeObserver(updateTitleWidth);
    observer.observe(title);
    window.addEventListener("resize", updateTitleWidth);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      observer.disconnect();
      window.removeEventListener("resize", updateTitleWidth);
    };
  }, []);

  return (
    <div
      className={styles.heroMain}
      style={titleWidth ? ({ "--hero-heading-width": `${titleWidth}px` } as React.CSSProperties) : undefined}
    >
      <span className={styles.heroEyebrow}>Energy Migration Platform</span>
      <h1 ref={titleRef} className={styles.heroTitle}>
        {HERO_TITLE}
      </h1>
      <p className={styles.heroText}>
        Financed clean-energy migration for businesses ready to lower costs, reduce grid
        dependence, and move into a more resilient future.
      </p>
      <div className={styles.buttonRow}>
        <BeginButton />
      </div>
    </div>
  );
}
