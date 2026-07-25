// Registers ESM resolver hooks so node --test can import app modules that use
// the "@/" path alias and extensionless TypeScript imports (Node >= 22.6
// strips types natively; this only fixes RESOLUTION, not transpilation).
import { register } from "node:module";

register(new URL("./resolve-ts-alias.mjs", import.meta.url));
