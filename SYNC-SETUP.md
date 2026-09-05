# Putting the tracker on the phone as well as the computer

The tracker still keeps every entry inside the browser on each device, and still
works with no internet at all. What is new is a sync server of your own on
Cloudflare. Once both devices point at it, anything typed on one appears on the
other within a few seconds.

**The server is already built and running.** Part 1 below is done. You only need
Part 2 and Part 3.

- Tracker: https://ewkena2-ops.github.io/gm-tracker/
- Sync address: `https://gm-tracker-sync.ewkena2.workers.dev`
- Sync password: kept in Cloudflare, not in this file. See *Changing the sync
  password* at the bottom if you ever need to set a new one.

---

## Part 2 — connect the computer

1. Open the tracker: https://ewkena2-ops.github.io/gm-tracker/
2. Go to **Setup & Backup**.
3. Find **Phone and computer together**. Type the sync address and the sync
   password.
4. Press **Connect this device**. The label in that box changes to **Connected**.

Everything already on the computer is sent up at that moment.

Connect the computer before the phone if you can. The order is not critical: a
device that has entries of its own keeps them and sends them up, rather than
taking blank settings from a device that has none.

## Part 3 — connect the phone

1. Open the same address on the phone: https://ewkena2-ops.github.io/gm-tracker/
2. Go to **Setup & Backup**, type the same sync address and the same sync
   password, and press **Connect this device**.

The entries from the computer appear within a few seconds.

Add the page to the phone's home screen so it opens like an app. In Chrome, use
the three-dot menu, then **Add to Home screen**.

---

## If the computer's entries are in a different browser

The tracker stores entries per browser. If the entries you want are in a browser
or a copy of the file that you are not going to connect, move them across once:

1. In the browser that **has** the entries: **Setup & Backup**, then
   **Save backup file**.
2. In the tracker page you **are** connecting: **Setup & Backup**, then
   **Restore from backup file**, and pick that file.
3. Then press **Connect this device**.

One backup file holds both books.

---

## How it decides who wins

- Entries are kept as one record per day, plus one record per book's settings.
- Two devices only clash when both changed **the same day** between two syncs.
  The one that typed later wins that day. Every other day is untouched.
- Which book you have open is **not** carried across. The computer and the phone
  can sit on different books.
- With no internet the app carries on as normal. Whatever was typed offline is
  sent up the next time the device is online.
- **Disconnect** only stops the carrying. Nothing on the device is erased.

## Keep saving backup files

Sync is not a backup. A day deleted on one device is deleted on both. Keep using
**Save backup file** each week.

## Cost

Cloudflare's free plan covers this comfortably. Two devices syncing every few
seconds all day is a few thousand small requests, against a free allowance of
100,000 requests a day.

---

## Part 1 — how the server was set up (already done)

Kept for reference, and in case it ever has to be rebuilt. Run from the `worker`
folder.

```
npx wrangler login
npx wrangler d1 create gm-tracker-sync      # put the database_id in wrangler.jsonc
npx wrangler d1 execute gm-tracker-sync --remote --file=schema.sql
npx wrangler secret put SYNC_TOKEN          # type the sync password
npx wrangler deploy
```

Note that `wrangler login` opens a browser and waits for it to call back to
`localhost:8976`. If that call cannot reach the machine, the login times out with
*Timed out waiting for authorization code* even though the browser said
Authorize. It has to be run where the browser can reach it.

## Checking the server still works

```
cd worker
SYNC_URL=https://gm-tracker-sync.ewkena2.workers.dev SYNC_TOKEN=your-password \
  node test/protocol.test.mjs
```

It writes only under book 9, which the tracker does not have, and deletes what it
wrote, so it is safe to run against the live server.

## Changing the sync password

```
cd worker
npx wrangler secret put SYNC_TOKEN
npx wrangler deploy
```

Then press **Connect this device** again on both devices with the new password.
