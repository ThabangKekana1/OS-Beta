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
  // No external links, no partner-name leaks even by accident.
  out = out.replace(/https?:\/\/\S+/g, "");
  for (const banned of ["Nedbank", "Eqstra", "Green Share", "Greenshare", "UFMS"]) {
    out = out.replace(new RegExp(banned, "gi"), "our funding partner");
  }
  return out.trim();
}
