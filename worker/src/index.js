/**
 * GM Tracker sync server.
 *
 * One endpoint, POST /sync, does a pull and a push in the same round trip.
 * The tracker keeps working entirely on its own in the browser; this server
 * only carries changes between the PC and the phone.
 *
 * Request  { cursor: <number>, docs: [ { p, body } ... ] }
 *   cursor  the highest t this device has already seen. 0 asks for everything.
 *   docs    the documents changed on this device since its last sync.
 *           body is a JSON-serialisable object, or null to delete.
 *
 * Response { cursor: <number>, docs: [ { p, t, body } ... ], now, count }
 *   docs    every document on the server with t greater than the cursor sent,
 *           which includes the ones just pushed so the device learns the t
 *           the server stamped on them.
 *
 * Writes are last-writer-wins per document. The documents are one per day and
 * one per book, so two devices only ever collide when both edited the very
 * same day between two syncs.
 */

const MAX_BODY_BYTES = 5 * 1024 * 1024;   // a whole 60-day book is far below this
const MAX_DOCS_PER_PUSH = 500;
const MAX_PULL = 2000;

function cors(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { "Content-Type": "application/json; charset=utf-8", ...cors(origin) },
  });
}

/** Constant-time-ish compare so a wrong token cannot be guessed a byte at a time. */
function tokenOk(given, expected) {
  if (typeof given !== "string" || typeof expected !== "string") return false;
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

function bearer(request) {
  const h = request.headers.get("Authorization") || "";
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1].trim() : "";
}

/** A document path: "b0", "b1", or "d0:2026-09-05". Kept deliberately narrow. */
function validPath(p) {
  return typeof p === "string" && p.length > 0 && p.length <= 64 && /^[A-Za-z0-9:_.-]+$/.test(p);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "*";

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors(origin) });
    }

    if (url.pathname === "/" || url.pathname === "/health") {
      return json({ ok: true, service: "gm-tracker-sync" }, 200, origin);
    }

    if (url.pathname !== "/sync") {
      return json({ error: "not_found" }, 404, origin);
    }

    if (!env.SYNC_TOKEN) {
      return json({ error: "server_not_configured", detail: "SYNC_TOKEN secret is not set" }, 500, origin);
    }
    if (!tokenOk(bearer(request), env.SYNC_TOKEN)) {
      return json({ error: "unauthorised" }, 401, origin);
    }
    if (request.method !== "POST") {
      return json({ error: "method_not_allowed" }, 405, origin);
    }

    const rawLen = Number(request.headers.get("Content-Length") || 0);
    if (rawLen > MAX_BODY_BYTES) {
      return json({ error: "too_large" }, 413, origin);
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return json({ error: "bad_json" }, 400, origin);
    }

    const cursor = Number.isFinite(payload && payload.cursor) ? Math.max(0, Math.floor(payload.cursor)) : 0;
    const incoming = Array.isArray(payload && payload.docs) ? payload.docs : [];

    if (incoming.length > MAX_DOCS_PER_PUSH) {
      return json({ error: "too_many_docs", limit: MAX_DOCS_PER_PUSH }, 400, origin);
    }

    // Validate before touching the database, so a bad push writes nothing at all.
    const writes = [];
    for (const d of incoming) {
      if (!d || !validPath(d.p)) {
        return json({ error: "bad_path", detail: String(d && d.p) }, 400, origin);
      }
      const body = d.body === null || d.body === undefined ? null : JSON.stringify(d.body);
      writes.push({ p: d.p, body });
    }

    try {
      if (writes.length) {
        // Reserve a block of sequence numbers in one statement, so two devices
        // pushing at the same moment can never be handed the same t.
        const seq = await env.DB
          .prepare("UPDATE meta SET v = v + ?1 WHERE k = 'seq' RETURNING v")
          .bind(writes.length)
          .first();
        if (!seq) {
          return json({ error: "not_initialised", detail: "run the schema.sql migration" }, 500, origin);
        }
        const end = Number(seq.v);
        let t = end - writes.length;   // first reserved number, exclusive lower bound

        const stmt = env.DB.prepare(
          "INSERT INTO docs (p, t, body) VALUES (?1, ?2, ?3) " +
          "ON CONFLICT(p) DO UPDATE SET t = excluded.t, body = excluded.body"
        );
        await env.DB.batch(writes.map((w) => stmt.bind(w.p, ++t, w.body)));
      }

      const res = await env.DB
        .prepare("SELECT p, t, body FROM docs WHERE t > ?1 ORDER BY t ASC LIMIT ?2")
        .bind(cursor, MAX_PULL)
        .all();

      const rows = res.results || [];
      const docs = rows.map((r) => ({
        p: r.p,
        t: Number(r.t),
        body: r.body === null ? null : JSON.parse(r.body),
      }));

      // Only advance the cursor past what was actually sent. If the page limit
      // was hit, the device syncs again straight away and picks up the rest.
      const newCursor = docs.length ? docs[docs.length - 1].t : cursor;

      return json(
        { cursor: newCursor, docs, count: docs.length, more: rows.length === MAX_PULL, now: Date.now() },
        200,
        origin
      );
    } catch (err) {
      return json({ error: "server_error", detail: String(err && err.message || err) }, 500, origin);
    }
  },
};
