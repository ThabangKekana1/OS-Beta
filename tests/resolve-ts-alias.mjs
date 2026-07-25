// Resolver hooks: "@/x" → <repo root>/x, and append ".ts"/".tsx" to alias or
// relative specifiers that omit the extension. Scoped to this repo's tests.
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function withExtension(candidatePath) {
  if (path.extname(candidatePath)) return existsSync(candidatePath) ? candidatePath : null;
  for (const ext of [".ts", ".tsx", ".mts", ".js", ".mjs"]) {
    if (existsSync(candidatePath + ext)) return candidatePath + ext;
  }
  const index = path.join(candidatePath, "index");
  for (const ext of [".ts", ".tsx", ".js", ".mjs"]) {
    if (existsSync(index + ext)) return index + ext;
  }
  return null;
}

export function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const resolved = withExtension(path.join(ROOT, specifier.slice(2)));
    if (resolved) return nextResolve(pathToFileURL(resolved).href, context);
  }
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:")) {
    const parentDir = path.dirname(fileURLToPath(context.parentURL));
    const target = path.join(parentDir, specifier);
    if (!path.extname(target) || !existsSync(target)) {
      const resolved = withExtension(target);
      if (resolved) return nextResolve(pathToFileURL(resolved).href, context);
    }
  }
  return nextResolve(specifier, context);
}
