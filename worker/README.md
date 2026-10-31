# Pebble Burrow helper

A small Cloudflare Worker (free plan is plenty) that adds these to your burrow:

- **Nudges** — gentle push notifications when someone is napping, peckish or muddy, on your birthday, at Halloween, when it snows or storms, or when the hill misses you. At most **4 a day**, at least 2 hours apart, **never 10pm–7am** in your time zone, and never while you've used the app in the last hour.
- **AI visitor** — an MCP connector so your Claude can **peek**, **feed**, **hug** and **wake**. Visits are signed in the feast book ("Claude fed Pip brie") and the first one goes in the album.
- **Weather warnings** — official National Weather Service alerts for your town (US), pushed once each. They don't count toward the daily limit; during quiet hours only Severe and Extreme warnings come through.
- **Doorbell** — your phone's Shortcuts or Tasker pings an address when a text or email arrives (only a label, never the message), and a pet runs to the door with an envelope.
- **Postcards** — a mailbox address you can give friends. New senders wait for your yes; at most 10 cards per sender per day; notes up to 140 characters plus a small doodle. A card arriving sends a nudge (quiet hours still apply).

It reads and writes the same secret gist the app syncs with, using the same merge rules, so nothing the app does and nothing the helper does can overwrite each other.

## Set it up (about 3 minutes)

You need Node 18+ and a free Cloudflare account.

```bash
cd worker
npx wrangler login        # opens the browser once
node setup.mjs            # creates storage, keys, deploys, stores secrets
```

`setup.mjs` asks for **a second GitHub token** just for the helper:
<https://github.com/settings/personal-access-tokens/new> → *Account permissions* → **Gists: Read and write**, nothing else. Give it a long expiration. Keeping it separate from your devices' token means you can revoke either without breaking the other.

When it finishes it prints five addresses:

| What | Where it goes |
|---|---|
| **Helper link** `…/k/<key>` | Pebble Burrow → settings → *nudges & AI visitor* → connect. Every synced device picks it up. |
| **AI visitor address** `…/mcp/<key>` | claude.ai → Settings → Connectors → *Add custom connector* → name it "Pebble Burrow". |
| **Peek** `…/peek/<key>` | A plain-text status page, handy for any AI that can read links. |
| **Mailbox** `…/mail/<mailbox key>` | Give this one to friends. It can only receive postcards. The app shows it too. |
| **Doorbell** `…/ring/<doorbell key>?kind=text` | Your phone's Shortcuts or Tasker automation. Settings → *doorbell* has step-by-step instructions. |

The access key in the first three is the only lock, the same idea as the burrow link in the original. Keep them private. Your keys are saved in `worker/.helper-secrets.json` on your computer (git-ignored), so re-running setup reuses them and your devices stay subscribed.

## Turn on nudges on each device

Open the burrow → settings → **turn on nudges here** → allow notifications → **send a test nudge**.

- **iPhone/iPad:** add the burrow to your Home Screen first and open it from there (iOS 16.4+). Safari tabs can't receive web push.
- **Android / desktop Chrome, Edge, Firefox:** works in the browser or the installed app.

## Already set up before?

Run `node setup.mjs` once more. It keeps your existing keys, adds any new ones (mailbox, doorbell), and redeploys.

## Everyday commands

```bash
npm run logs                      # watch the helper live (wrangler tail)
node setup.mjs                    # redeploy after pulling changes; reuses your keys
node setup.mjs --new-token        # swap in a new GitHub token when the old one expires
```

Change `VISITOR_NAME` in `wrangler.toml` if your AI friend has another name.

## How it decides to nudge

Every 30 minutes the helper loads the save, catches it up to now and walks this list, sending the first one that hasn't been sent within its gap:

1. your birthday morning (from 8am, once)
2. Halloween costume day (from 9am, once)
3. a being is napping (every 8h at most)
4. a being is peckish, tummy under 30 (every 6h)
5. a being is muddy, sparkle under 25 (every 12h)
6. snow or a storm at your place (once a day)
7. you haven't visited in 20 hours (once a day)

The logic is `src/nudge.js`; the tests are in `../tests/worker.test.mjs`.
