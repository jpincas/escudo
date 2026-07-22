// Rendering the alert message.
//
// Telegram parse mode is HTML, not MarkdownV2: MarkdownV2 requires escaping
// sixteen characters including "." and "-", which appear in ordinary names and
// timestamps. HTML needs three. In a system whose whole job is to post a
// legible message under stress, the fragile escaper is the wrong trade.

import type { Category, Config } from "./config.ts";
import type { Incident } from "./store/types.ts";
import { strings, t } from "./i18n/mod.ts";

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Category as configured, falling back to the id if a village invents one. */
export function resolveCategory(
  config: Config,
  id: string,
): { emoji: string; label: string; category: Category | null } {
  const category = config.categories.find((c) => c.id === id) ?? null;
  const label = category?.label ?? strings(config.village.locale).categories[id] ?? id;
  return { emoji: category?.emoji ?? "🚨", label, category };
}

/**
 * Quiet categories arrive without noise. An unknown id — a village that
 * invented one, or a stale incident — is treated as an alarm: erring towards
 * waking people is the safe direction.
 */
export function isQuiet(config: Config, categoryId: string): boolean {
  return resolveCategory(config, categoryId).category?.urgency === "quiet";
}

/** Wall-clock time in the village's own timezone — never the server's. */
export function formatTime(config: Config, isoTimestamp: string): string {
  return new Intl.DateTimeFormat(config.village.locale, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: config.village.timezone,
  }).format(new Date(isoTimestamp));
}

/**
 * The alert as it appears in the village group. Cancelled alerts keep their
 * original text, struck through, with a plain "cancelled" line underneath —
 * deleting them would erase the record, and shouting about the false alarm
 * would make the next person hesitate before pressing (Protocolo Escudo).
 */
export function formatAlert(config: Config, incident: Incident): string {
  const s = strings(config.village.locale);
  const { emoji, label } = resolveCategory(config, incident.category);
  const quiet = isQuiet(config, incident.category);

  // Shouting is for emergencies. A quiet request keeps its sentence case and
  // loses the siren, so the two are never mistaken for each other at a glance.
  const header = quiet
    ? t(s.alert.quietHeader, { emoji, category: escapeHtml(label) })
    : t(s.alert.header, {
      emoji,
      category: escapeHtml(label.toLocaleUpperCase(config.village.locale)),
    });
  const from = t(s.alert.from, {
    who: escapeHtml(incident.reporterName),
    time: formatTime(config, incident.createdAt),
  });

  // For a device alert the address is not a detail, it is the payload: a wall
  // unit carries no GPS, so this line is the only thing telling a responder
  // where to go. It sits directly under the attribution, above the fold.
  const where = incident.reporterAddress
    ? t(s.alert.at, { address: escapeHtml(incident.reporterAddress) })
    : null;

  if (incident.cancelledAt) {
    return [
      `<s>${header}`,
      ...(where ? [from, `${where}</s>`] : [`${from}</s>`]),
      "",
      `❌ ${escapeHtml(s.alert.cancelled)}`,
    ].join("\n");
  }

  // No emergency numbers on a quiet request. Printing 062 under "I need a hand
  // with the shutter" is how people learn to stop reading that line.
  if (quiet) {
    return [
      `<b>${header}</b>`,
      from,
      ...(where ? [where] : []),
      "",
      escapeHtml(s.alert.quietRespond),
    ]
      .join("\n");
  }

  return [
    `<b>${header}</b>`,
    from,
    ...(where ? [where] : []),
    "",
    escapeHtml(s.alert.respond),
    escapeHtml(config.alerts.emergencyLine),
  ].join("\n");
}

/**
 * The drill message. Deliberately not an alert: it is loud, because the only
 * thing a drill tests is whether phones make a noise, but it is labelled so
 * plainly that nobody gets in a car. It is also not an incident — a drill in
 * the log would pollute the numbers the drill exists to produce.
 */
export function formatDrill(config: Config, isoTimestamp: string): string {
  const s = strings(config.village.locale);
  return [
    `<b>${escapeHtml(s.drill.header)}</b>`,
    t(s.drill.from, {
      village: escapeHtml(config.village.name),
      time: formatTime(config, isoTimestamp),
    }),
    "",
    escapeHtml(s.drill.body),
  ].join("\n");
}

/** Caption for the map pin posted once a reporter shares their location. */
export function formatLocationCaption(config: Config, incident: Incident): string {
  const s = strings(config.village.locale);
  return t(s.alert.locationCaption, { who: escapeHtml(incident.reporterName) });
}

/** Body of the pinned board that carries the category buttons. */
export function formatBoard(config: Config): string {
  const s = strings(config.village.locale);
  // Board copy is authored with Markdown-style *bold* because that reads
  // cleanly in the locale files; escape first, then convert that one construct.
  const title = escapeHtml(s.board.title).replace(/\*([^*]+)\*/g, "<b>$1</b>");
  return [title, "", `<i>${escapeHtml(s.board.hint)}</i>`].join("\n");
}
