/**
 * Platform identity, single source of truth.
 *
 * The platform is 1-MI (Migration Intelligence): the operating system behind
 * Foundation-1 — the migration platform, Dawn, and the sales harness.
 *
 * Compatibility surfaces that intentionally DO NOT rename (zero breakage):
 *   - ONEOS_* environment variable names
 *   - foundation1_* / oneos_* Supabase table names
 *   - the 1os.foundation-1.co.za mail hostnames
 * Any future physical renames go through here and its companions first.
 */
export const PLATFORM_NAME = "1-MI";
export const PLATFORM_FULL_NAME = "Foundation-1 1-MI";

export function platformLabel(suffix?: string) {
  return suffix ? `${PLATFORM_NAME} ${suffix}` : PLATFORM_NAME;
}
