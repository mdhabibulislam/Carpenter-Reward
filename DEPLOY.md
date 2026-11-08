# Deploy: GitHub + Vercel

The app has two parts:

| Part | Where | What |
|---|---|---|
| **Website + server code** (this zip) | GitHub repo #1 (can be private or public) → deployed by Vercel | Pages in `src/`, server functions in `api/` |
| **Your data** (uploads, people, login codes) | GitHub repo #2 — **must be Private** | Written only by the server, using a secret token |

SRs and managers sign in on any phone; the server sends each person **only** their own territory/area/zone rows.

---

## 1. Create the PRIVATE data repo
1. GitHub → **New repository** → name e.g. `acs-data`.
2. Choose **Private**.
3. Tick **Add a README file** (the repo needs a first commit). → **Create**.

## 2. Create a GitHub token (only for the data repo)
1. GitHub → your photo → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. **Repository access → Only select repositories →** `acs-data`.
3. **Repository permissions → Contents → Read and write.** Leave everything else as "No access".
4. Set an expiry date you will remember, **Generate**, and copy the token (starts with `github_pat_`).

## 3. Put this code on GitHub
1. Unzip this file.
2. GitHub → **New repository** → e.g. `acs-rewards` → Create.
3. **Upload files** → drag in everything from the unzipped folder (including the `api`, `src`, `public` folders and `vercel.json`) → **Commit**.

## 4. Deploy on Vercel
1. vercel.com → **Add New → Project → Import** the `acs-rewards` repo. Framework is detected as **Vite** (settings come from `vercel.json`).
2. Before clicking Deploy, open **Environment Variables** and add:

| Name | Value |
|---|---|
| `GITHUB_TOKEN` | the token from step 2 |
| `GITHUB_REPO` | `your-github-name/acs-data` |
| `GITHUB_BRANCH` | `main` |
| `SESSION_SECRET` | a long random text (64 characters) |
| `CODE_PEPPER` | a *different* long random text (64 characters) |

   Make random text with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   or any password generator (letters + numbers, 64 long).

3. **Deploy**. Open the site → **First-time setup** → create the Super Admin login code.
4. Super Admin → **Upload data** (the Excel), then **People & login codes** to add SRs/managers.

## Important
- **Never** put the token or secrets in a file in GitHub — only in Vercel's Environment Variables.
- **Do not change `CODE_PEPPER` later** — every login code would stop working (you would have to set them again).
  Changing `SESSION_SECRET` only signs everyone out.
- If you change an Environment Variable, Vercel needs a **Redeploy** (Deployments → ⋯ → Redeploy).
- If the token expires, the site shows a message on the login page; make a new token and update `GITHUB_TOKEN`.
- Every save is a commit in `acs-data`, so you have a full history and can undo from GitHub.
- Real Excel files are blocked by `.gitignore`; only the blank templates in `public/templates` are included.

## Run on your laptop (optional)
```
npm install
npm run dev
```
`npm run dev` keeps data in the browser only (no GitHub needed) — for trying changes.
