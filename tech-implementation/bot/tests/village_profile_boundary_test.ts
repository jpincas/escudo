// Enforces spec 2026-07-27 §3.3 as more than a comment: the alert path must
// never read the village's public profile. Naming and module placement are
// the first two defences (see VillageProfile's own doc in src/store/types.ts)
// — this is the third, a hermetic scan that fails the moment anyone imports
// or calls the forbidden names from a file on the alert path.
//
// The scanned set is derived from the tree, not a hand-maintained list: a
// hardcoded list of "alert-path files" silently stops covering a file the
// day someone adds one and forgets to list it — proven live in review, where
// a throwaway src/telegram/probe_tmp.ts that leaked the record still passed
// the earlier version of this test. Walking every .ts file under src/ plus
// main.ts, and excluding only the files legitimately allowed to name the
// record, means a new file anywhere in the tree is covered automatically.

import { assertEquals } from "@std/assert";

const SRC_ROOT = new URL("../src/", import.meta.url);
const MAIN_TS = new URL("../main.ts", import.meta.url);

/**
 * The only files allowed to name the record: where it's defined, its two
 * store implementations, and the one route file allowed to read or write it
 * — the panel API, which is the editor's own backend (spec 3.3: "Its only
 * consumers are the welcome page and its own editor screen"). Keyed by path
 * relative to src/.
 */
const ALLOWED = new Set([
  "store/types.ts",
  "store/kv.ts",
  "store/memory.ts",
  "panel/api.ts",
]);

/** Any of these appearing outside an allowed file means it reaches the profile. */
const FORBIDDEN = [
  "VillageProfile",
  "getVillageProfile",
  "putVillageProfile",
  "emptyVillageProfile",
];

/** Recursively collects every `.ts` file under `dir`, keyed by its path relative to `dir`. */
async function collectTsFiles(
  dir: URL,
  relativePrefix: string,
  out: Map<string, URL>,
): Promise<void> {
  for await (const entry of Deno.readDir(dir)) {
    const relPath = relativePrefix + entry.name;
    if (entry.isDirectory) {
      await collectTsFiles(new URL(entry.name + "/", dir), relPath + "/", out);
    } else if (entry.isFile && entry.name.endsWith(".ts")) {
      out.set(relPath, new URL(entry.name, dir));
    }
  }
}

Deno.test("no alert-path file references the village's public profile", async () => {
  const files = new Map<string, URL>();
  await collectTsFiles(SRC_ROOT, "", files);
  files.set("main.ts", MAIN_TS);

  const offenders: string[] = [];
  for (const [relative, url] of files) {
    if (ALLOWED.has(relative)) continue;

    const text = await Deno.readTextFile(url);
    for (const name of FORBIDDEN) {
      if (text.includes(name)) offenders.push(`${relative} references ${name}`);
    }
  }

  assertEquals(offenders, []);
});
