import styles from "@/components/migration/migration.module.css";
import MigrationHeroBg from "@/components/migration/MigrationHeroBg";
import { MigrationHeroIntro } from "@/components/migration/MigrationHeroIntro";

export function MigrationHero() {
  return (
    <section className={styles.hero}>
      <MigrationHeroBg />
      <div className={styles.shell}>
        <div className={styles.heroGrid}>
          <MigrationHeroIntro />
        </div>
      </div>
      <ul className={styles.heroBenefits} aria-label="Why migrate with Foundation-1">
        <li>Save up to 60%</li>
        <li>Financed by us</li>
        <li>Maintained by us</li>
        <li>Insured by us</li>
        <li>Built for you</li>
        <li>
          <a href="mailto:sales@foundation-1.co.za">sales@foundation-1.co.za</a>
        </li>
        <li>
          <a href="https://x.com/Foundation1X" target="_blank" rel="noopener noreferrer">
            Twitter
          </a>
        </li>
        <li>
          <a href="https://foundation-1.co.za" target="_blank" rel="noopener noreferrer">
            Foundation-1
          </a>
        </li>
      </ul>
    </section>
  );
}
