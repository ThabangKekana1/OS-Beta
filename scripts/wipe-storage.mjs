import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter(Boolean)
    .filter((l) => !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);

const sb = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
);

async function wipe(prefix = "") {
  const { data, error } = await sb.storage
    .from("oneos-client-documents")
    .list(prefix, { limit: 1000 });
  if (error) {
    console.error(error);
    return;
  }
  for (const item of data) {
    const path = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.id === null) {
      await wipe(path);
    } else {
      const { error: rmErr } = await sb.storage
        .from("oneos-client-documents")
        .remove([path]);
      if (rmErr) console.error("rm", path, rmErr);
      else console.log("removed", path);
    }
  }
}

await wipe();
console.log("done");
