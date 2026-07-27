// The public welcome page (spec 2026-07-27 §4), end to end and pure-render.
//
// Exercises exactly the degradation rules the spec calls out rather than
// eyeballing them: an empty profile, a failed store read, and the individual
// optional fields each missing in turn.

import { assertEquals, assertMatch, assertStringIncludes } from "@std/assert";
import { createWelcomeApi, renderWelcomePage } from "../src/web/welcome.ts";
import { formatPhoneReadable } from "../src/msisdn.ts";
import { MemoryStore } from "../src/store/memory.ts";
import { emptyVillageProfile, type Store, type VillageProfile } from "../src/store/types.ts";
import { makeConfig } from "./helpers.ts";

const BASE = "http://localhost";

const fullProfile: VillageProfile = {
  escudoPhone: "+34600111222",
  photoUrl: "https://example.org/photo.jpg",
  introText: "Bienvenidos a la Red Escudo.",
  responsiblePeople: [{ name: "Luis Pérez", role: "Suplente" }],
};

Deno.test("formatPhoneReadable groups an E.164 number for a human to read", () => {
  assertEquals(formatPhoneReadable("+34600111222"), "+34 600 111 222");
});

Deno.test("a full profile renders the crest, village name, photo, escudo number as a dial link, the emergency line, and responsible people", () => {
  const html = renderWelcomePage(makeConfig(), fullProfile);

  assertStringIncludes(html, "<svg"); // crest, inlined
  assertStringIncludes(html, "Ejemplo del Camino"); // village name, from config
  assertStringIncludes(html, 'src="https://example.org/photo.jpg"');
  assertStringIncludes(html, 'href="tel:+34600111222"');
  assertStringIncludes(html, "+34 600 111 222"); // readable, not the raw stored form alone
  assertStringIncludes(html, "062 Guardia Civil · 112 Emergencias");
  assertStringIncludes(html, "Luis Pérez");
  assertStringIncludes(html, "Suplente");
  assertStringIncludes(html, 'href="/panel"'); // admin login link
});

Deno.test("an empty profile still renders the crest, village name, emergency line and login link, and nothing else breaks", () => {
  const html = renderWelcomePage(makeConfig(), emptyVillageProfile());

  assertStringIncludes(html, "<svg");
  assertStringIncludes(html, "Ejemplo del Camino");
  assertStringIncludes(html, "062 Guardia Civil · 112 Emergencias");
  assertStringIncludes(html, 'href="/panel"');

  // Nothing from the optional fields. (The stylesheet always defines
  // .escudo-number/.people rules, so the markers checked here are the
  // rendered content, not the static CSS class names.)
  assertEquals(html.includes("<img"), false);
  assertEquals(html.includes('href="tel:'), false);
  assertEquals(html.includes("Número Escudo"), false);
  assertEquals(html.includes("Personas responsables"), false);

  // Must never render "undefined" or a broken layout.
  assertEquals(html.includes("undefined"), false);
  assertEquals(html.includes("null"), false);
});

Deno.test("a broken photo is removed client-side, not left as a dead frame, since the server never checks the URL", () => {
  const html = renderWelcomePage(makeConfig(), fullProfile);
  assertMatch(html, /<img[^>]*onerror="this\.remove\(\)"/);
});

Deno.test("each optional field degrades independently when unset", () => {
  const noPhone = renderWelcomePage(makeConfig(), { ...fullProfile, escudoPhone: null });
  assertEquals(noPhone.includes("tel:"), false);
  assertStringIncludes(noPhone, "Luis Pérez"); // the rest is unaffected

  const noPhoto = renderWelcomePage(makeConfig(), { ...fullProfile, photoUrl: null });
  assertEquals(noPhoto.includes("<img"), false);

  const noIntro = renderWelcomePage(makeConfig(), { ...fullProfile, introText: null });
  assertEquals(noIntro.includes("Bienvenidos"), false);

  const noPeople = renderWelcomePage(makeConfig(), { ...fullProfile, responsiblePeople: [] });
  assertEquals(noPeople.includes("Luis Pérez"), false);
});

Deno.test("profile text is HTML-escaped, so a stored name or intro cannot inject markup", () => {
  const html = renderWelcomePage(makeConfig(), {
    ...fullProfile,
    introText: "<script>alert(1)</script>",
    responsiblePeople: [{ name: "<b>Ana</b>", role: "Coordinadora & vecina" }],
  });
  assertEquals(html.includes("<script>"), false);
  assertStringIncludes(html, "&lt;script&gt;");
  assertEquals(html.includes("<b>Ana</b>"), false);
  assertStringIncludes(html, "Coordinadora &amp; vecina");
});

Deno.test("renders in the configured locale, in both languages", () => {
  const es = renderWelcomePage(
    makeConfig({ village: { ...makeConfig().village, locale: "es" } }),
    emptyVillageProfile(),
  );
  const en = renderWelcomePage(
    makeConfig({ village: { ...makeConfig().village, locale: "en" } }),
    emptyVillageProfile(),
  );

  assertStringIncludes(es, 'lang="es"');
  assertStringIncludes(es, "Comunidades que responden");
  assertStringIncludes(en, 'lang="en"');
  assertStringIncludes(en, "Communities that respond");
});

Deno.test("no robots restriction — the page is indexable (A7)", () => {
  const html = renderWelcomePage(makeConfig(), emptyVillageProfile());
  assertEquals(/name="robots"/i.test(html), false);
  assertEquals(/noindex/i.test(html), false);
});

// ── Wired end to end, through the real Hono app ──

function setup(): { app: ReturnType<typeof createWelcomeApi>; store: Store } {
  const store = new MemoryStore();
  return { app: createWelcomeApi(makeConfig(), store), store };
}

Deno.test("GET / is public — no session, no cookie — and serves the profile as stored", async () => {
  const { app, store } = setup();
  await store.putVillageProfile(fullProfile);

  const res = await app.request(`${BASE}/`);
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("content-type")?.includes("text/html"), true);
  const html = await res.text();
  assertStringIncludes(html, "Luis Pérez");
});

Deno.test("a store read failure falls back to the static page rather than erroring", async () => {
  const failing = new MemoryStore();
  failing.getVillageProfile = () => Promise.reject(new Error("kv unavailable"));
  const app = createWelcomeApi(makeConfig(), failing);

  const res = await app.request(`${BASE}/`);
  assertEquals(res.status, 200);
  const html = await res.text();
  assertStringIncludes(html, "Ejemplo del Camino");
  assertStringIncludes(html, "062 Guardia Civil · 112 Emergencias");
  assertStringIncludes(html, 'href="/panel"');
  assertEquals(html.includes("undefined"), false);
});
