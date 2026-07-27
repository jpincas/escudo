// Village configuration.
//
// Two sources, deliberately separated:
//   • config.yaml — village *policy*: name, language, categories, retention.
//     Committed, because none of it identifies a deployment and Deno Deploy
//     only ever sees uploaded source.
//   • environment — everything that wires up *this* deployment: the bot token
//     and the group chat id it talks to. Nothing instance-specific is committed.
//
// Adopting a new village means editing config.yaml and setting the env vars.
// If anything is missing or malformed we throw at boot: a silently
// half-configured alert system is worse than one that refuses to start.

import { parse as parseYaml } from "@std/yaml";
import { z } from "zod";
import { isLocale, type Locale, LOCALES } from "./i18n/mod.ts";

const CategorySchema = z.object({
  id: z.string().min(1),
  emoji: z.string().min(1),
  /** Overrides the built-in i18n label for this category. */
  label: z.string().min(1).optional(),
  /**
   * How loudly this category arrives.
   *
   *   alarm — the default. Posts with notification: a siren in every house.
   *   quiet — posts silently. For "I need a hand", which is a real need but
   *           not an emergency, and which must never cost the alarm its edge.
   *
   * The quiet tier exists to protect the loud one: people mute groups that
   * make noise, and a muted group is the single biggest failure in the system.
   *
   * Optional rather than defaulted, so that omitting it — in config.yaml or in
   * a hand-built Config — means "alarm". Nothing reads it except a check for
   * "quiet", and erring towards waking people is the safe direction.
   */
  urgency: z.enum(["alarm", "quiet"]).optional(),
});

export type Category = z.infer<typeof CategorySchema>;

const VillageConfigSchema = z.object({
  village: z.object({
    name: z.string().min(1),
    locale: z.string().refine(isLocale, {
      message: `must be one of: ${Object.keys(LOCALES).join(", ")}`,
    }),
    timezone: z.string().min(1),
  }),
  categories: z.array(CategorySchema).min(1),
  alerts: z.object({
    emergency_line: z.string().min(1),
    dedupe_seconds: z.number().int().nonnegative().default(60),
  }),
  data: z.object({
    retention_days: z.number().int().positive().default(365),
  }),
  devices: z.object({
    /**
     * Shop-bought alarm devices send no heartbeat and no battery telemetry, so
     * a scheduled test is the only proof one still works. Past this many days
     * without a real alert or a test, the panel marks it caducado.
     */
    prove_within_days: z.number().int().positive().default(60),
  }).default({ prove_within_days: 60 }),
});

export type VillageConfig = z.infer<typeof VillageConfigSchema>;

export interface Config {
  village: { name: string; locale: Locale; timezone: string };
  telegram: { groupChatId: number };
  categories: Category[];
  alerts: { emergencyLine: string; dedupeSeconds: number };
  data: { retentionDays: number };
  devices: { proveWithinDays: number };
  secrets: {
    botToken: string;
    webhookSecret: string;
    /**
     * Twilio account auth token, which is what signs the bridge's webhooks.
     *
     * Unset means the village has no bridge yet, and the two /bridge routes are
     * not mounted at all. There is deliberately no unauthenticated mode: an
     * open bridge lets anyone who finds the URL raise the village.
     */
    twilioAuthToken: string | undefined;
    zadarmaApiSecret: string | undefined;
    zadarmaIvrPlayId: string | undefined;
  };
  runtime: {
    kvPath: string | undefined;
    port: number;
    /**
     * Whether to believe `x-forwarded-for` and refuse anything from outside
     * Zadarma's range.
     *
     * **Off by default, deliberately.** It was on, and in Bercianos it refused
     * every genuine call: the address Deploy's proxy reports is not one of
     * Zadarma's, and the failure is silent from the village's side — the phone
     * rings, the greeting plays, and nobody is told. A check that can only ever
     * fail closed on the alarm path has to earn its place, and this one cannot:
     * the signature is an HMAC over the caller and the call time, keyed with the
     * account secret, and an attacker who has that has the API too. The IP range
     * adds a second lock against a threat the first one already stops.
     *
     * Kept because it is free where it does work — a deployment behind a proxy
     * you control, whose `x-forwarded-for` you have actually verified. Turn it
     * on there with ESCUDO_BRIDGE_CHECK_SOURCE_IP, having made a real call first.
     */
    checkSourceIp: boolean;
    /**
     * Where this bot is reachable from a browser, e.g.
     * https://escudo-bot.jpincas.deno.net. Only /panel needs it, to build a
     * link an admin can open; unset simply means no panel links.
     */
    publicUrl: string | undefined;
    /**
     * How Telegram reaches us, decided once at boot:
     *
     *   webhook — a public URL is set; Telegram POSTs to a secret path.
     *   polling — no public URL; we dial out with getUpdates.
     *   offline — ESCUDO_TELEGRAM=off; no bot, no network, no group. The alert
     *             path's Notifier prints to the terminal so the panel can be
     *             developed without touching the real village.
     */
    telegramMode: "webhook" | "polling" | "offline";
  };
}

/** Parse and validate the YAML half. Exported so tests can exercise it without env. */
export function parseVillageConfig(yaml: string): VillageConfig {
  const parsed = VillageConfigSchema.safeParse(parseYaml(yaml));
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  • ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid village config:\n${issues}`);
  }

  const ids = parsed.data.categories.map((c) => c.id);
  const duplicate = ids.find((id, i) => ids.indexOf(id) !== i);
  if (duplicate) {
    throw new Error(`Invalid village config:\n  • categories: duplicate id "${duplicate}"`);
  }

  // Timezone is validated by trying it — the IANA list isn't worth vendoring.
  try {
    new Intl.DateTimeFormat("en", { timeZone: parsed.data.village.timezone });
  } catch {
    throw new Error(
      `Invalid village config:\n  • village.timezone: "${parsed.data.village.timezone}" is not a known IANA timezone`,
    );
  }

  return parsed.data;
}

function required(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(
      `Missing ${name}. Set it in .env.local locally, or with \`deno deploy env add ${name} …\` in production.`,
    );
  }
  return value;
}

/**
 * An on/off env var with a default.
 *
 * Anything other than the two spellings throws rather than being read as false:
 * a typo'd `ESCUDO_BRIDGE_CHECK_SOURCE_IP=yes` silently disabling a security
 * check is exactly the failure this whole file exists to prevent.
 */
export function boolEnv(name: string, fallback: boolean): boolean {
  const raw = Deno.env.get(name);
  if (raw === undefined || raw === "") return fallback;
  if (raw === "true" || raw === "1" || raw === "on") return true;
  if (raw === "false" || raw === "0" || raw === "off") return false;
  throw new Error(`${name} must be true or false, got "${raw}".`);
}

/** Parse a chat id env var. Exported so tests can exercise it without env. */
export function chatId(name: string, raw: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value)) {
    throw new Error(
      `${name} must be a Telegram chat id (an integer, e.g. -1001234567890), got "${raw}". Run /chatid in the chat to find it.`,
    );
  }
  return value;
}

/** Load the full config: YAML file + environment secrets. */
export async function loadConfig(): Promise<Config> {
  const path = Deno.env.get("ESCUDO_CONFIG") ?? "config.yaml";

  let yaml: string;
  try {
    yaml = await Deno.readTextFile(path);
  } catch {
    throw new Error(
      `Could not read the village config at "${path}". Copy config.example.yaml to config.yaml and edit it.`,
    );
  }

  const v = parseVillageConfig(yaml);

  // Offline is the dev switch: the panel and bridge run, but nothing talks to
  // Telegram. It follows that the bot token and group id — required to reach a
  // real village — are not required here, so a fresh checkout with no secrets
  // can still `deno task dev` and work on the UI.
  const offline = Deno.env.get("ESCUDO_TELEGRAM") === "off";
  const publicUrl = Deno.env.get("ESCUDO_PUBLIC_URL") || undefined;
  const telegramMode = offline ? "offline" : publicUrl ? "webhook" : "polling";

  const botToken = offline
    ? (Deno.env.get("ESCUDO_BOT_TOKEN") ?? "")
    : required("ESCUDO_BOT_TOKEN");
  const rawGroupChatId = offline
    ? Deno.env.get("ESCUDO_GROUP_CHAT_ID")
    : required("ESCUDO_GROUP_CHAT_ID");
  const groupChatId = rawGroupChatId ? chatId("ESCUDO_GROUP_CHAT_ID", rawGroupChatId) : 0;

  return {
    village: {
      name: v.village.name,
      // Narrowed by the schema's refine(), which zod can't express in the type.
      locale: v.village.locale as Locale,
      timezone: v.village.timezone,
    },
    telegram: {
      groupChatId,
    },
    categories: v.categories,
    alerts: {
      emergencyLine: v.alerts.emergency_line,
      dedupeSeconds: v.alerts.dedupe_seconds,
    },
    data: { retentionDays: v.data.retention_days },
    devices: { proveWithinDays: v.devices.prove_within_days },
    secrets: {
      botToken,
      // Defaulting the webhook path to the token is grammY's documented
      // recommendation: the path is unguessable and already secret.
      webhookSecret: Deno.env.get("ESCUDO_WEBHOOK_SECRET") ?? botToken,
      twilioAuthToken: Deno.env.get("ESCUDO_TWILIO_AUTH_TOKEN") || undefined,
      // Zadarma signs its call notifications with the account secret — the same
      // value that signs API calls. Without it the bridge does not mount.
      zadarmaApiSecret: Deno.env.get("ESCUDO_ZADARMA_API_SECRET") || undefined,
      // Id of the recording played back to a caller, from Zadarma's PBX audio
      // library. Unset means the call is answered and hung up in silence; the
      // alarm is raised either way.
      zadarmaIvrPlayId: Deno.env.get("ESCUDO_ZADARMA_IVR_PLAY_ID") || undefined,
    },
    runtime: {
      kvPath: Deno.env.get("ESCUDO_KV_PATH") || undefined,
      port: Number(Deno.env.get("ESCUDO_PORT") ?? 8000),
      checkSourceIp: boolEnv("ESCUDO_BRIDGE_CHECK_SOURCE_IP", false),
      publicUrl,
      telegramMode,
    },
  };
}
