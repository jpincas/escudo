// Fire a correctly signed NOTIFY_START at a running bot.
//
// This is how the bridge gets tested before there is a number to dial, and how
// it gets diagnosed afterwards. It speaks exactly what Zadarma speaks — the same
// form fields, the same signature encoding — so a call that works here and fails
// from a real handset is a Zadarma-side configuration problem, not a code one.
//
//   deno task test-call                                  # against localhost
//   deno task test-call https://escudo-bot.<org>.deno.net +34600111222
//
// Against production this will be refused on source IP, and that is correct: the
// request is not coming from 185.45.152.40/30. Run it against `deno task dev`,
// where the check is off, or set ESCUDO_BRIDGE_CHECK_SOURCE_IP=false for as long
// as it takes to prove the path and then put it back.

const base = (Deno.args[0] ?? "http://localhost:8000").replace(/\/$/, "");
const caller = Deno.args[1] ?? "+34600111222";
const did = Deno.args[2] ?? "+34987000000";

const secret = Deno.env.get("ESCUDO_ZADARMA_API_SECRET");
if (!secret) {
  console.error(
    "Missing ESCUDO_ZADARMA_API_SECRET. It must be the same secret the target is running with,\n" +
      "or the signature will be refused — which is the check working, not a bug.",
  );
  Deno.exit(1);
}

/**
 * base64(hex(HMAC-SHA1(caller_id + called_did + call_start))).
 *
 * The hex step is the one everybody gets wrong; see src/bridge/zadarma.ts.
 */
async function sign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return btoa(
    Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, "0")).join(""),
  );
}

// Zadarma's own format: local time, space-separated, no timezone.
const callStart = new Date().toISOString().slice(0, 19).replace("T", " ");

const params = {
  event: "NOTIFY_START",
  caller_id: caller,
  called_did: did,
  call_start: callStart,
  pbx_call_id: `test-${callStart}`,
};

const url = `${base}/bridge/voice`;

// The handshake first: Zadarma performs it when the URL is saved, and a URL that
// fails it is never accepted at all — so it is worth proving separately.
const echo = await fetch(`${url}?zd_echo=escudo-test`);
const echoed = await echo.text();
console.log(
  echo.ok && echoed === "escudo-test"
    ? "✔ zd_echo handshake — Zadarma will accept this URL"
    : `✘ zd_echo handshake returned ${echo.status} "${echoed}" — Zadarma would refuse this URL`,
);

const res = await fetch(url, {
  method: "POST",
  headers: {
    "content-type": "application/x-www-form-urlencoded",
    "signature": await sign(params.caller_id + params.called_did + params.call_start),
  },
  body: new URLSearchParams(params),
});

const body = await res.text();
console.log(`\n${res.status} ${body}`);

if (res.status === 403) {
  console.log(
    "\nRefused. Either the source-IP check is on and this machine is not Zadarma\n" +
      "(expected against production), or the secret here differs from the target's.",
  );
} else if (res.ok) {
  console.log(
    `\n✔ Accepted. A registered ${caller} has now raised the village; an unregistered one\n` +
      "is in the panel inbox. Check whichever you expected — a silent group is the\n" +
      "correct response to an unknown number, not a failure.",
  );
}
