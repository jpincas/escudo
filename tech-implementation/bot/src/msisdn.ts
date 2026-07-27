// Phone numbers, in exactly one form.
//
// Shared by the panel (where a human types one) and the bridge (where the
// network hands one over), because the bridge finds a household by looking the
// number up by equality. A number stored as "+34 600 111 222" and delivered as
// "+34600111222" is a device that is registered and still doesn't work.
//
// Lives here rather than in src/panel/ so that nothing on the alert path has to
// import panel code.

/** E.164: a plus, a non-zero country digit, then 7–14 more. */
export const MSISDN = /^\+[1-9]\d{7,14}$/;

/**
 * Tolerate how humans type phone numbers — spaces, dashes, brackets — but store
 * exactly one form.
 */
export function normaliseMsisdn(input: string): string {
  return input.replace(/[\s\-().]/g, "");
}

/**
 * Render an E.164 number for a human to read (spec 2026-07-27 A3: "rendered
 * readably"). Groups digits in threes from the right, with no phone-number
 * library and no per-country dialling-plan table.
 *
 * This is a cosmetic heuristic, not a correct international formatter: it
 * only happens to leave the country code as its own short leading group for
 * a 2-digit code plus 9 digits — Spain's shape, and the only shape this
 * deployment has (+34 600 111 222). A different length reads oddly (a 3-digit
 * code splits across groups, e.g. +441234567890 → "+441 234 567 890"), but it
 * never throws — empty input, a bare "+", or 15 digits all just produce some
 * grouping — and it is presentation only: never used to key a lookup, so it
 * never touches the stored form, and it is not on the alert path.
 */
export function formatPhoneReadable(e164: string): string {
  const digits = e164.replace(/^\+/, "");
  const groups: string[] = [];
  for (let end = digits.length; end > 0; end -= 3) {
    groups.unshift(digits.slice(Math.max(0, end - 3), end));
  }
  return `+${groups.join(" ")}`;
}
