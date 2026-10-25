# Irfan Autos: Inventory module (Next.js + Supabase, Vercel-ready)

Mobile-first stock screens. No users or login yet (that is a later module).

## 1. Database
1. Create a Supabase project.
2. SQL Editor: run `supabase/migrations/0001_inventory.sql`, then `0002_settings.sql` (list visibility, CP rename).

## 2. Run locally
```bash
npm install
cp .env.example .env.local     # fill SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
npm run import                 # loads data/products_all_pages_1-106.xlsx
npm run dev                    # http://localhost:3000
```
`npm run import` is safe to re-run. It prints a summary and writes `import-report.txt` listing any rows whose
Rack/Location cells could not be paired unambiguously.

### Rack / Location columns (comma separated)
- one location: all racks go in it
- same count of locations and racks: paired by position (`Godown 1, Market` + `G1-03, M-02`)
- anything else: all racks go under the first location and the row is listed in `import-report.txt`
- racks with no location go to a location called `Main`
- the single `Stock` number goes to the product's first location as an opening-stock movement

## 3. Deploy to Vercel
Push to GitHub, import the repo in Vercel, add the same two env vars, deploy.

**Important:** there is no login yet, so anyone who knows the URL can read and change stock.
Turn on Vercel "Deployment Protection" (Settings > Deployment Protection) until the Users module exists.

## API (shared by web and the Android app)
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/inventory/products?q=&filter=all\|low\|out\|norack&list=<id>&offset=&limit=` | paged list + `total` |
| POST | `/api/inventory/products` | create |
| GET / PATCH | `/api/inventory/products/:id` | detail with per-location stock, racks, history / edit |
| POST | `/api/inventory/products/:id/adjust` | `{location_id, type: receive\|issue\|adjust, qty, note}` |
| GET | `/api/inventory/meta` | lists, locations, companies, brands |

## Layout
- Phone and tablet (under 1024px): card list, bottom navigation, bottom-sheet stock changes.
- Desktop (1024px and up): dark side menu, top bar and the stock-by-location table from the original index.html.

## Settings
`/settings`: switch price lists on or off (hidden lists are left out of the Stock screen; nothing is deleted)
and add stock locations (name, type, number of racks, optional rack prefix; racks are numbered 01, 02, 03…).
The setting is shared by everyone until the Users module exists.

## Prices
CP is the **counter price** (selling price). It is stored in `products.cp` and shown on every stock row.
