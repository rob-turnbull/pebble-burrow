# Pebble Burrow

Two little beings on a hill that follows your real sky and weather. Feed them cheese, wash them, boing them, hug them. **Nothing here ever dies**: neglect only means a nap, and coming back makes them glow.

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

- Every change you make pushes a few seconds later, and again when you leave the app.
- Opening the app (or coming back to it after a minute) pulls. The newer save wins.
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
js/app.js             rendering, actions, loops
tests/                node --test unit tests
```

## Tests

```bash
npm test     # or: node --test tests/*.test.mjs
```

14 tests cover the nothing-dies rule, napping, waking, weather/night multipliers, birthday detection, backup codes, v1→v2 migration, last-writer-wins sync, sunrise/sunset accuracy (Hillsboro, Oct 30) and polar night.

## Local preview

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

The service worker only runs over https, so offline mode is only active on the deployed site.
