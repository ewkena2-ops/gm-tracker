-- One row per synced document.
--   p    the document path: "b0" / "b1" for a book's settings,
--        "d0:2026-09-05" for one day inside book 0.
--   t    the sequence number the server stamped on the last write.
--        Strictly increasing across the whole table, so a client only
--        has to remember the highest t it has seen.
--   body the document as JSON text, or NULL for a deleted document
--        (a tombstone, so the other device learns about the deletion).
CREATE TABLE IF NOT EXISTS docs (
  p    TEXT PRIMARY KEY,
  t    INTEGER NOT NULL,
  body TEXT
);
CREATE INDEX IF NOT EXISTS docs_t ON docs(t);

-- A single counter row that hands out t values.
CREATE TABLE IF NOT EXISTS meta (
  k TEXT PRIMARY KEY,
  v INTEGER NOT NULL
);
INSERT OR IGNORE INTO meta(k, v) VALUES ('seq', 0);
