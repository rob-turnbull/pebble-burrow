# Pebble Burrow

Two little beings on a hill that follows your real sky, weather and seasons. Feed them cheese, wash them, boing them, hug them, play games, dress them up, furnish their burrow, and trade postcards with friends. They grow up with you, and they remember. **Nothing here ever dies**: neglect only means a nap, and coming back makes them glow.

A personal, clean-room recreation of the gentle virtual-pet idea behind tummygotcheese.com. All art, names and code are original.

## Deploy to GitHub Pages (about 3 minutes)

1. On GitHub, create a new **public** repository named `pebble-burrow`. Don't add a README.
2. On the empty repo page, click **uploading an existing file**, drag in **everything inside this folder** (`index.html`, `sw.js`, `manifest.webmanifest`, `.nojekyll`, and the `css`, `js`, `icons`, `tests` folders), and commit.
3. Go to **Settings → Pages**. Under *Build and deployment*, set Source to **Deploy from a branch**, branch **main**, folder **/ (root)**, then save.
4. After a minute or two it's live at **https://rob-turnbull.github.io/pebble-burrow/**.

Or from a terminal:

```bash
cd pebble-burrow
git init -b main && git add -A && git commit -m "Pebble Burrow v2"
gh repo create pebble-burrow --public --source=. --push
gh api -X POST repos/{owner}/pebble-burrow/pages -f "source[branch]=main" -f "source[path]=/"
```

## Install it like an app

Open the site on each device, then:

- **iPhone/iPad:** Safari → Share → **Add to Home Screen**.
- **Android:** Chrome → ⋮ → **Install app** (or tap the install button inside the burrow).
- **Desktop Chrome/Edge:** the install icon in the address bar.

It opens full screen and works offline. Installing also matters on iPhone: Safari can clear storage for websites you haven't opened in 7 days, but not for home-screen apps.

## Sync across devices

Your burrow is saved in the browser first. To carry it between devices, it also saves to one **secret gist** on your GitHub account.

1. Create a fine-grained token at <https://github.com/settings/personal-access-tokens/new>.
   - Name: `pebble burrow`. Pick an expiration.
   - Repository access: **Public repositories (read-only)** is fine; it doesn't use repos.
   - Account permissions → **Gists → Read and write**. Nothing else.
2. In the burrow: **settings → sync across devices**, paste the token, **connect**.
3. On another device: open the site, choose **"already have a burrow on another device?"** on the egg screen (or settings → sync), paste the same token.

How it behaves:

- Every change you make syncs a few seconds later, again when you leave the app, and every 5 minutes while it's open.
- Each sync reads the gist, **merges** it with this device, and writes back. Care on two devices at the same time all counts: feasts, hugs and boings are counted per device, the feast book and album are combined, and the freshest care wins the stats. Renames and settings keep the newest change.
- "Start a new burrow" replaces the old one on every device.
- The token never leaves the device except to talk to GitHub, and it isn't written into the save.
- The gist is a file named `pebble-burrow.json`. Don't rename it; that's how other devices find it.
- When the token expires, sync pauses (the pill turns red). Make a new token and connect again; your gist is kept.

No GitHub? The **backup code** in settings copies the whole burrow as text. Paste it into "restore" anywhere.

## Sky and weather

- The sky follows real sunrise and sunset: dawn, day, dusk and a starry night with a moon. The burrow window glows after dark.
- Add your town in **settings → sky & weather** (search or "use my location"). Weather comes from [Open-Meteo](https://open-meteo.com) (free, no key) and refreshes every 30 minutes.
- Rain, drizzle, storms (with lightning), snow (the hill goes white), fog and clouds all show on the hill. Cold weather adds scarves.
- Location is rounded to about 1 km before it's saved.

Gameplay ties-ins: at night everything decays at half speed. Rain muddies them 1.5× faster. Snow keeps their joy up, storms make them want hugs, and cold makes tummies rumble.

## Growing up, dressing up, the album

- Beings grow by **days you tended them** (any feed, wash, boing, hug or wake counts that day): *sprout* → *young* at 7 days → *grown* at 30. Merged across devices, so days are never lost.
- **Dress up** on each card. Wearables unlock as they grow and as you care: flower crown (young), cosy scarf (10 feasts), big bow (25 hugs), star badge (grown), pumpkin hat (any Halloween), party hat (your birthday).
- **The album** keeps moments: hatching, first feasts, first rain, snow and storm, growing up, Halloweens, birthdays, a new year, and your AI friend's first visit.

## Seasons

Hemisphere-aware. Autumn leaves and a golden hill, spring petals, winter lights on the door (Dec 1 – Jan 6), and Halloween from **Oct 24 to Nov 1**: pumpkins that glow at night, bats after dusk, and costumes on the 31st.

## Nudges & AI visitor

Optional, and runs in your own Cloudflare account. See **[worker/README.md](worker/README.md)**: three commands, then paste one link into settings.

## Personalities

Every being has a temperament (shy, bouncy, sleepy, curious or bold) that shapes what they say. It's picked from the being's id, so every device agrees. They also **learn**: their favourite cheese comes from what you actually feed them, and their favourite weather from the weather you play with them in. They notice streaks ("brie 3 days in a row", "third rainy day in a row"), greet you when you come back, and chatter now and then.

## Sound and touch

Tap 🔇 to turn sound on (remembered per device). Every sound is synthesised in the browser: munches, boings, hugs, sparkles, voices pitched by species, rain on the roof, thunder after lightning, crickets on clear nights. On Android the phone gives small vibrations too (toggle in settings); iPhone doesn't allow websites to vibrate.

## Games

Tap **games**: *catch the cheese* (gold stars are worth 3), *hide and seek* (a peek gives them away if you're stuck), and *copy the pattern* for grown beings. They're no-lose: every round earns 6–30 joy and costs a little tummy.

## Inside the burrow

Tap the door or **🏠 inside**. Napping beings sleep in the bed, and the window shows your real sky and weather. **Arrange the room** to place furniture in six spots. There are 12 pieces to collect, from games, weather, seasons, feasts, growing up and postcards; "how to find the rest" lists what's left. Grown beings choose a favourite spot that suits their temperament.

## Postcards

Needs your helper (see below). Settings shows **your mailbox address**, which is safe to give friends because it can only receive postcards. Tap **💌 write one** for a note (140 characters) and a doodle. A new sender waits until you say yes, and "no thanks" removes their cards and stops future ones. Each person can send 10 a day at most. Your first card from each friend goes in the album, and the first one unlocks a painting for the room.

## Updating

Edit files, commit, push. Then bump `VERSION` in `sw.js` (e.g. `v2.0.1`) so installed copies fetch the new files. They update the next time they open.

## Project layout

```
index.html            entry point
manifest.webmanifest  install metadata
sw.js                 offline cache (bump VERSION on deploy)
css/style.css         all styles, light + dark
js/data.js            species, cheeses, names, voice lines
js/art.js             original SVG beings and eggs
js/engine.js          pure state engine (decay, naps, waking, migration)
js/sky.js             sunrise/sunset maths and day phases
js/weather.js         Open-Meteo weather, place search, rain/snow effects
js/sync.js            GitHub Gist sync
js/seasons.js         seasonal calendar
js/helper.js          talks to your Cloudflare helper (nudges, postcards)
js/personality.js     temperaments, learned likes, history-aware lines
js/sound.js           synthesised sounds, ambience, haptics
js/games.js           the three mini-games
js/room.js            inside the burrow: furniture, slots, favourite spots
js/post.js            postcard composer and cards
js/app.js             rendering, actions, loops
worker/               the optional Cloudflare helper (nudges + AI visitor)
tests/                node --test unit tests
```

## Tests

```bash
npm test     # or: node --test tests/*.test.mjs
```

54 tests cover personalities and learning, games, room unlocks and merges, the postcard mailbox (validation, approvals, blocking, rate limits, CORS), and the nothing-dies rule, napping and waking, weather and night decay, migration from older saves, merge sync (concurrent care, idempotence, order independence, starting over), growth and unlocks, Halloween and hemisphere seasons, sunrise/sunset accuracy, nudge rules (quiet hours, daily cap, gaps), Web Push encryption checked against an independent decrypt, VAPID signatures, and the AI-visitor connector end to end.

## Local preview

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

The service worker only runs over https, so offline mode is only active on the deployed site.
