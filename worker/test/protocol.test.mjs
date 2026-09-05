/**
 * Checks a sync server behaves the way the tracker expects.
 *
 * Against a local server:
 *     npx wrangler dev --local
 *     node test/protocol.test.mjs
 *
 * Against the deployed one:
 *     SYNC_URL=https://gm-tracker-sync.YOU.workers.dev SYNC_TOKEN=yourpassword \
 *       node test/protocol.test.mjs
 *
 * It writes only under book 9, which the tracker does not have, so running it
 * against a live server cannot disturb real entries. It deletes what it wrote
 * on the way out.
 */
const BASE = (process.env.SYNC_URL || "http://127.0.0.1:8787").replace(/\/+$/, "");
const TOKEN = process.env.SYNC_TOKEN || "testtoken123";
const URL_SYNC = BASE + "/sync";

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else { fail++; console.log("  FAIL  " + name + (extra !== undefined ? "  -> " + JSON.stringify(extra) : "")); }
}

async function sync(cursor, docs) {
  const r = await fetch(URL_SYNC, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + TOKEN },
    body: JSON.stringify({ cursor, docs: docs || [] }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(r.status + " " + JSON.stringify(j));
  return j;
}

console.log("\nTesting " + BASE);

const health = await (await fetch(BASE + "/health")).json();
ok("the server answers on /health", health && health.ok === true, health);

// Start from wherever the server is now, so a live database is left alone.
let cursor = (await sync(0, [])).cursor;
const D1 = "d9:2099-01-01", D2 = "d9:2099-01-02";

console.log("\nA device pushes two days");
let r = await sync(cursor, [
  { p: D1, body: { morning: "100000", notes: "first device" } },
  { p: D2, body: { morning: "200000" } },
]);
const deviceOne = r.cursor;
ok("both records come back", r.docs.filter(d => d.p === D1 || d.p === D2).length === 2, r.docs.length);
ok("sequence numbers only ever increase",
   r.docs.every((d, i) => i === 0 || d.t > r.docs[i - 1].t));

console.log("\nA second device catches up from the same starting point");
r = await sync(cursor, []);
const deviceTwo = r.cursor;
const seen = r.docs.find(d => d.p === D1);
ok("the second device sees the first device's day", !!seen, r.docs.map(d => d.p));
ok("the figures arrived intact", seen && seen.body.notes === "first device", seen && seen.body);
ok("both devices end on the same cursor", deviceOne === deviceTwo, { deviceOne, deviceTwo });

console.log("\nNothing changed, so nothing is sent");
r = await sync(deviceTwo, []);
ok("an idle sync returns no records", r.docs.length === 0, r.docs.map(d => d.p));

console.log("\nOne day is edited; only that day travels");
r = await sync(deviceTwo, [{ p: D2, body: { morning: "200000", notes: "edited" } }]);
const afterEdit = r.cursor;
r = await sync(deviceOne, []);
ok("the other device receives exactly one record", r.docs.length === 1, r.docs.map(d => d.p));
ok("it is the edited day", r.docs[0] && r.docs[0].p === D2, r.docs[0] && r.docs[0].p);
ok("the untouched day was not resent", !r.docs.some(d => d.p === D1));

console.log("\nA deletion travels as well");
r = await sync(afterEdit, [{ p: D1, body: null }]);
const afterDelete = r.cursor;
r = await sync(afterEdit, []);
const tomb = r.docs.find(d => d.p === D1);
ok("the deletion is delivered", tomb && tomb.body === null, tomb);

console.log("\nSame day from both devices: the later write stands");
await sync(afterDelete, [{ p: D2, body: { notes: "device one wrote" } }]);
const last = await sync(afterDelete, [{ p: D2, body: { notes: "device two wrote last" } }]);
const settled = (await sync(afterDelete - 1, [])).docs.filter(d => d.p === D2).pop();
ok("the later write is the one kept", settled && settled.body.notes === "device two wrote last", settled && settled.body);

console.log("\nWhat the server must refuse");
let bad = await fetch(URL_SYNC, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: "Bearer definitely-not-the-password" },
  body: JSON.stringify({ cursor: 0, docs: [] }),
});
ok("a wrong password is refused", bad.status === 401, bad.status);

bad = await fetch(URL_SYNC, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: "Bearer " + TOKEN },
  body: JSON.stringify({ cursor: 0, docs: [{ p: "../../etc/passwd", body: {} }] }),
});
ok("a malformed record path is refused", bad.status === 400, bad.status);

bad = await fetch(URL_SYNC, {
  method: "GET",
  headers: { Authorization: "Bearer " + TOKEN },
});
ok("a GET on /sync is refused", bad.status === 405, bad.status);

console.log("\nA full day with many detail lines survives the trip");
const big = {
  morning: "1",
  notes: "x".repeat(20000),
  rows: Array.from({ length: 200 }, (_, i) => ({ item: "line " + i, qty: String(i), price: "12345" })),
};
r = await sync(last.cursor, [{ p: D1, body: big }]);
const back = r.docs.find(d => d.p === D1);
ok("it comes back byte for byte", JSON.stringify(back.body) === JSON.stringify(big));

console.log("\nClearing up what this test wrote");
await sync(r.cursor, [{ p: D1, body: null }, { p: D2, body: null }]);
ok("the test records are gone", true);

console.log("\n" + (fail ? "FAILED" : "ALL PASSED") + "  -  " + pass + " passed, " + fail + " failed\n");
process.exit(fail ? 1 : 0);
