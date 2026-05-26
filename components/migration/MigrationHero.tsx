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
      </ul>
    </section>
  );
}
