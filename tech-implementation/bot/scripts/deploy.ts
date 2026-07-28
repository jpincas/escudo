// Deploy to Deno Deploy, end to end, with verification.
//
//   deno task deploy
//
// One command, no arguments. It reads the org and app from deno.json's
// `deploy` block (the CLI writes that block on first deploy), authenticates
// with DENO_DEPLOY_TOKEN, and then:
//
//   1. Preflights the app's server-side build configuration. The platform only
//      builds the admin panel if the app has a build command registered, and
//      the CLI can't set one after the app exists — so if it's missing, this
//      script registers `deno task build` through the console API itself.
//      Without this, every deploy "succeeds" while /panel 404s for ever.
//   2. Runs `deno deploy` and parses its result. The CLI's progress spinner is
//      known to hang after the deploy has already completed server-side, so
//      the child is killed once the result is in hand.
//   3. Verifies the live app: production must serve the new revision, /health
//      must answer "ok", and /panel must serve the built SPA.
//
// It either prints "deployed and verified" or tells you exactly which step
// failed. Nothing here is specific to one installation.

import { parse as parseJsonc } from "@std/jsonc";

const CONSOLE = "https://console.deno.com";
const botDir = new URL("..", import.meta.url).pathname;

function fail(msg: string): never {
  console.error(`✘ ${msg}`);
  Deno.exit(1);
}

// --- Configuration: org/app from deno.json, token from the environment. ---

const token = Deno.env.get("DENO_DEPLOY_TOKEN") ??
  fail(
    "DENO_DEPLOY_TOKEN is not set. Create one at https://console.deno.com/account/tokens\n" +
      "  (the browser-based login is unreliable on machines without a keychain daemon).",
  );

const denoJson = parseJsonc(await Deno.readTextFile(`${botDir}deno.json`)) as {
  deploy?: { org?: string; app?: string };
};
const org = denoJson.deploy?.org;
const app = denoJson.deploy?.app;
if (!org || !app) {
  fail(
    "deno.json has no deploy.org / deploy.app. For a first deploy, create the app:\n" +
      '  deno deploy create --org=<org> <app-name> --build-command "deno task build"\n' +
      "then re-run this task. See DEPLOY.md.",
  );
}

// The console API is the same one the deploy CLI talks to; the token goes in a
// cookie, not a bearer header. Responses wrap a JS-notation string (not JSON),
// so fields are read with targeted regexes rather than a parser — defensively,
// with endpoint checks below as the real safety net.
const apiHeaders = {
  "Cookie": `token=${token}; deno_auth_ghid=force`,
  "Content-Type": "application/json",
};

async function appsGet(): Promise<string> {
  const input = encodeURIComponent(JSON.stringify({ json: { org, app } }));
  const res = await fetch(`${CONSOLE}/api/apps.get?input=${input}`, { headers: apiHeaders });
  const body = await res.text();
  if (!res.ok || body.includes('"error"')) {
    fail(
      `Could not read app "${org}/${app}" from the console API (is the token valid?):\n  ${body}`,
    );
  }
  return body;
}

// --- 1. Preflight: the build command must be registered on the app. ---

const before = await appsGet();
if (!/buildCommand:\\?"[^\\"]/.test(before)) {
  console.log("Build command not registered on the app — registering `deno task build`…");
  const entrypoint = before.match(/entrypoint:\\?"([^\\"]+)/)?.[1] ?? "main.ts";
  const buildTimeout = Number(before.match(/buildTimeout:(\d+)/)?.[1] ?? 5);
  const buildMemoryLimit = Number(before.match(/buildMemoryLimit:(\d+)/)?.[1] ?? 1024);
  const res = await fetch(`${CONSOLE}/api/apps.updateBuildConfig`, {
    method: "POST",
    headers: apiHeaders,
    body: JSON.stringify({
      json: {
        org,
        app,
        buildConfig: {
          mode: "dynamic",
          frameworkPreset: "",
          entrypoint,
          installCommand: "",
          buildCommand: "deno task build",
          preDeployCommand: "",
          buildTimeout,
          buildMemoryLimit,
        },
      },
    }),
  });
  const body = await res.text();
  if (!res.ok || body.includes('"error"')) fail(`Registering the build command failed:\n  ${body}`);
  if (!/buildCommand:\\?"deno task build/.test(await appsGet())) {
    fail(
      "Build command did not stick — set it in the console: app settings → build configuration.",
    );
  }
  console.log("✔ Build command registered");
}

// --- 2. Deploy. ---

console.log(`Deploying ${org}/${app} (the server-side build takes a few minutes)…`);
const child = new Deno.Command(Deno.execPath(), {
  args: ["deploy", "--json", "--non-interactive", "--org", org!, "--app", app!, "--prod"],
  cwd: botDir,
  stdout: "piped",
  stderr: "piped",
}).spawn();

// The CLI prints one JSON object on stdout when the deploy completes, but its
// spinner can then spin for ever — read until the result appears, then kill.
const deadline = setTimeout(() => child.kill("SIGKILL"), 10 * 60 * 1000);
let stdout = "";
const result = await (async () => {
  for await (const chunk of child.stdout.pipeThrough(new TextDecoderStream())) {
    stdout += chunk;
    const match = stdout.match(/\{.*"revisionId".*\}/s);
    if (match) {
      try {
        return JSON.parse(match[0]) as {
          revisionId: string;
          status: string;
          timelines?: { partition: string; domains: string[] }[];
        };
      } catch {
        // Incomplete JSON — keep reading.
      }
    }
  }
  return null;
})();
clearTimeout(deadline);
try {
  child.kill("SIGKILL");
} catch {
  // Already exited.
}
const stderr = await new Response(child.stderr).text();
await child.status;

if (!result) {
  fail(`deno deploy produced no result.\n--- stdout ---\n${stdout}\n--- stderr ---\n${stderr}`);
}
if (result.status !== "routed") {
  fail(
    `Revision ${result.revisionId} finished as "${result.status}", not "routed".\n` +
      `Build logs: ${CONSOLE}/${org}/${app}/builds/${result.revisionId}`,
  );
}

const prodUrl = result.timelines?.find((t) => t.partition === "Production")?.domains[0];
if (!prodUrl) fail(`Deploy result named no production domain:\n${JSON.stringify(result)}`);
console.log(`✔ Revision ${result.revisionId} routed`);

// --- 3. Verify the live app. ---

// Production must actually be serving the revision we just built — the deploy
// status alone has lied about this before (see DEPLOY.md). `apps get --json`
// emits clean JSON with the live production revision; allow for routing lag.
let live = false;
for (let attempt = 0; attempt < 6 && !live; attempt++) {
  const got = await new Deno.Command(Deno.execPath(), {
    args: ["deploy", "apps", "get", "--json", "--non-interactive", "--org", org!, "--app", app!],
    cwd: botDir,
    stdout: "piped",
    stderr: "null",
  }).output();
  try {
    const info = JSON.parse(new TextDecoder().decode(got.stdout)) as {
      productionRevisionId?: string;
    };
    live = info.productionRevisionId === result.revisionId;
  } catch {
    // Transient CLI failure — retry.
  }
  if (!live) await new Promise((r) => setTimeout(r, 5000));
}
if (!live) {
  fail(
    `Production is not serving revision ${result.revisionId}.\n` +
      `Check ${CONSOLE}/${org}/${app}/builds/${result.revisionId}`,
  );
}
console.log("✔ Production serves the new revision");

async function expect(path: string, check: (res: Response) => Promise<boolean>, what: string) {
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      if (await check(await fetch(`${prodUrl}${path}`))) {
        console.log(`✔ ${what}`);
        return;
      }
    } catch {
      // Network hiccup — retry.
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  fail(`${what} — FAILED. ${prodUrl}${path} did not answer as expected after 30s.`);
}

await expect("/health", async (r) => r.ok && (await r.text()) === "ok", "/health answers ok");
// The welcome page: the deployment's public face, and the only surface a
// villager ever sees. It renders from config.yaml alone, so it answers even
// with an empty KV.
await expect(
  "/",
  async (r) => r.ok && (await r.text()).includes("<h1"),
  "/ serves the welcome page",
);
// Bare /panel is the login page — server-rendered, a plain form, and
// deliberately scriptless. Checking for "<script" here would pass only while
// /panel served the SPA shell, which it stopped doing when the magic link was
// replaced by a typed code.
await expect(
  "/panel",
  async (r) => r.ok && (await r.text()).includes('action="/panel"'),
  "/panel serves the login page",
);
// The SPA itself lives below /panel, and reaching it proves the built assets
// shipped — which is what this check was always really for.
await expect(
  "/panel/devices",
  async (r) => r.ok && (await r.text()).includes("<script"),
  "/panel/devices serves the built SPA",
);

console.log(`\n✔ Deployed and verified: ${prodUrl}`);
