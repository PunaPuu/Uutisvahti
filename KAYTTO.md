# Using Uutisvahti

Uutisvahti collects Azure, Microsoft 365 and Copilot news. Every hour, GitHub Actions fetches Microsoft's public feeds, publishes the news page, and sends push alerts for the new items you care about. Your computer does not need to be on.

- **Page:** https://punapuu.github.io/Uutisvahti/
- **Sources:**
  - Azure Updates
  - Microsoft 365 Roadmap
  - Azure Blog
  - Microsoft 365 / Copilot Blog
  - Official Microsoft Blog (Azure, M365 and Copilot posts only)
  - Microsoft 365 Developer Blog
  - Azure Infrastructure Blog

## On the iPhone

1. Open the page in **Safari**.
2. Tap **Share**, then **Add to Home Screen**. It now opens like an app.
3. **Filters:**
   - Tap the product chips (Azure, M365, Copilot, Other) and the status chips (GA, Preview, Rolling out, In development, Retiring, Announcement) to filter. With no chip selected, everything is shown.
   - "Other" holds Dynamics 365, Power Platform and everything else.
4. **Marks:**
   - Tap a title to open the story at Microsoft. It is then marked as read.
   - Tap ☆ to save a story; saved stories stay even after they drop out of the feed.
   - Read and saved marks are stored only on that device.

## Push alerts (ntfy)

1. Install **ntfy** from the App Store. It is free, and you don't need an account.
2. Make up a long random topic name, for example 30 letters and digits. Anyone who knows the name can read the alerts, so keep it private.
3. In ntfy, tap **+** and subscribe to that topic on the default server `ntfy.sh`.
4. Save the same name as a GitHub secret. Run this on your Mac or PC and paste the name when it asks:

   ```bash
   gh secret set NTFY_TOPIC --repo PunaPuu/Uutisvahti
   ```

5. The first run after this only remembers what already exists. Alerts start with the next new matching item.

Alerts come in one push per hour at most. Retirements are sent as high priority.

## Changing what you get

Edit [config/rules.json](config/rules.json) on GitHub. The pencil icon works from the phone too. The next hourly run uses the new rules.

| Field | What it does |
|---|---|
| `alerts.statuses` | Push for these statuses, e.g. `["Retiring", "GA"]` |
| `alerts.products` | Push for every item of a product, e.g. `["Copilot"]` |
| `alerts.keywords` | Push when a word appears, e.g. `["entra", "defender"]` |
| `exclude` | Hide items with these words everywhere |
| `include` | Words a post in the general Microsoft blog must contain to be shown |
| `feeds` | Turn a source on (`true`) or off (`false`) |
| `keepDays` | How many days of news to keep (1–365) |

Keywords match at the start of a word, so `entra` finds "Entra ID" but not "central".

## Running it on your own computer (Mac or Windows)

You need Node 22. There are no packages to install.

```bash
node src/build.mjs --out tmp/site
```

```bash
node scripts/preview.mjs tmp/site
```

Then open http://localhost:8080. The local build never sends alerts unless `NTFY_TOPIC` is set.

## If something stops

- **No updates for days:** GitHub pauses hourly runs in a repo with no commits for 60 days, and emails you first. Open **Actions → Update news → Enable workflow**, or make any commit.
- **"Couldn't refresh: …" on the page:** one source failed this hour. Its earlier items stay visible, and the next run tries again.
- **Manual run:** open **Actions → Update news → Run workflow**.
