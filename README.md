# Anwar Cement Sheet — Carpenter Reward Disbursement Status

> **Deploying?** See [DEPLOY.md](DEPLOY.md) — GitHub (code + private data repo) and Vercel, step by step.


Shows how much carpenter reward money was **Paid**, **Returned** or is still **Pending**, by territory, area and zone. The data comes from the Excel workbook that Super Admin uploads.

## Run it on this computer
```
npm install
npm run preview:demo      # production build, opens on http://localhost:4173
```
`npm run dev` (and `--mode demo` builds) keep the data in this browser only (IndexedDB) — handy for trying changes. The deployed site (Vercel) saves everything through the `api/` server into your private GitHub data repo instead.

## First use
1. Open the app. On first start it asks you to **create the Super Admin** (your name and a login code).
2. **Upload data:** choose the "Carpenter Reward Disbursement Status" `.xlsx` file. Every sheet is checked and shown first; press **Replace data** to save it.
3. **People & login codes:** add SR / ASM / ZSM / DGM / GM, one at a time or with the blank template (`public/templates/ACS_People_and_Login_Codes_Template.xlsx`; regenerate with `node scripts/make-people-template.mjs`).

## How the workbook is read
- **Sheets used:** monthly sheets only, by name: "May 2025", "June 2025", …, "Sep 26", "March 26 new app". Helper sheets (Sheet9, Final, Sheet31, return summaries) and "March 26 Last" (no amounts) are skipped.
- **Columns:** found by their headings, so older and newer layouts both work: carpenter ID, name, bKash, territory, area, zone, amount (`Amount` or `total_rft_quantity`), status (`Status` or `Payment`), date.
- **Status:** `PAID` → Paid · `RETURN` → Return · everything else (`PENDING FOR PAYMENT`, blank, `#REF!`, or a sheet with no status column such as Sep 26) → Pending.
- **Names:** compared loosely ("Comilla" = "Comilla Zone"; case and spaces ignored). A cell listing several names ("Barisal Sadar, Uzirpur") counts under each.

## Who sees what
| Role | Sees | Breakdown |
|---|---|---|
| SR | Their territories | Carpenter list |
| ASM | Their areas | Territories → carpenters |
| ZSM, DGM | Their zones | Areas → territories → carpenters |
| GM, Super Admin | Everything | Zones → areas → territories → carpenters |

**Downloads:** PDF for SR; Excel for everyone else. bKash numbers are masked for everyone except Super Admin.

## Security
- **Login codes:** sign-in is by login code only (8–20 letters or numbers). Codes are stored only as a hash, wrong tries are locked out after 5 attempts, and sessions end after 30 minutes idle or 5 minutes in the background on a phone.
- **Super Admin pages:** Upload and People are blocked for every other role, even by typing the address.
- **Production builds:** use the `api/` server and a private GitHub data repo (see DEPLOY.md). Secrets live only in Vercel Environment Variables.
- **Server version:** for a future server version, `supabase/migrations/0009_disbursement_status.sql` holds the same model with row-level security per territory/area/zone. The `code-login` and `manage-login-codes` Edge Functions handle code sign-in on the server. Migrations 0001–0007 belong to the earlier payment-workflow version and are no longer used by the app.
