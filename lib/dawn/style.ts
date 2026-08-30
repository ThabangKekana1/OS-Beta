/**
 * DAWN — the style contract, enforced in code, not just in the prompt.
 * Lives alone so the simulation harness exercises the exact production path
 * without importing the persistence stack.
 */
import { DAWN_VIEWS } from "./prompt";

export function enforceStyle(text: string): string {
  let out = text.trim();
  // The founder's hard rule: no em dashes anywhere, ever.
  out = out.replace(/\u2014/g, ", ").replace(/ ,/g, ",");
  // Only whitelisted dawn: links survive.
  out = out.replace(/\((dawn:[^)]*)\)/g, (match, link: string) => {
    const view = link.replace("dawn:view/", "");
    return link.startsWith("dawn:view/") && (DAWN_VIEWS as readonly string[]).includes(view)
      ? match
      : "(dawn:view/home)";
  });
  // No external links.
  out = out.replace(/https?:\/\/\S+/g, "");
  // Partner disclosure is allowed since 30 August 2026 (Nedbank CIB owns the
  // on-site infrastructure; GreenShare VPP backs the PPA). Internal product
  // codenames still never reach a client.
  for (const banned of ["Eqstra", "UFMS"]) {
    out = out.replace(new RegExp(banned, "gi"), "the funded programme");
  }
  return out.trim();
}
