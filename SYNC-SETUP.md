# Putting the tracker on the phone as well as the computer

The tracker still keeps every entry inside the browser on each device, and still
works with no internet at all. What is new is a small sync server of your own on
Cloudflare. Once both devices point at it, anything typed on one appears on the
other within a few seconds.

You only have to do the setup below once.

---

## Part 1 — put the sync server online (about ten minutes, on the computer)

Everything here is run from the `worker` folder of this project.

### 1. Sign in to Cloudflare

```
npx wrangler login
```

A browser window opens. If you have no Cloudflare account yet, create a free one
first at https://dash.cloudflare.com/sign-up — the free plan is far more than this
needs.

### 2. Create the database that holds the entries

```
npx wrangler d1 create gm-tracker-sync
```

It prints a block that contains a `database_id`, a long string of letters and
numbers. Open `worker/wrangler.jsonc` and replace `PUT-YOUR-DATABASE-ID-HERE`
with it.

### 3. Create the tables

```
npx wrangler d1 execute gm-tracker-sync --remote --file=schema.sql
```

### 4. Choose a sync password

```
npx wrangler secret put SYNC_TOKEN
```

It asks you to type a value. Type a long password of your own and keep it —
you type the same one on the computer and on the phone. Anyone who has both the
address and this password can read and change the entries, so treat it like the
key to the office.

### 5. Publish the server

```
npx wrangler deploy
```

It prints the address, which looks like:

```
https://gm-tracker-sync.YOUR-NAME.workers.dev
```

Write that address down. Opening it in a browser should show
`{"ok":true,"service":"gm-tracker-sync"}`.

---

## Part 2 — connect the computer

1. Open the tracker: https://ewkena2-ops.github.io/gm-tracker/
2. Go to **Setup & Backup**.
3. In **Phone and computer together**, type the sync address and the sync
   password.
4. Press **Connect this device**. The label at the top of that box changes to
   **Connected**.

Everything already on the computer is sent up at that moment.

## Part 3 — connect the phone

1. Open the same address on the phone: https://ewkena2-ops.github.io/gm-tracker/
2. Go to **Setup & Backup**, type the same sync address and the same sync
   password, and press **Connect this device**.

The entries from the computer appear within a few seconds.

Add the page to the phone's home screen so it opens like an app: in Chrome,
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

## Cost

Cloudflare's free plan covers this comfortably. Two devices syncing every few
seconds all day is a few thousand small requests, against a free allowance of
100,000 requests a day.

## Keep saving backup files

Sync is not a backup: a day deleted on one device is deleted on both. Keep using
**Save backup file** each week.

---

## Changing the sync password later

```
npx wrangler secret put SYNC_TOKEN
npx wrangler deploy
```

Then press **Connect this device** again on both devices with the new password.
