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
