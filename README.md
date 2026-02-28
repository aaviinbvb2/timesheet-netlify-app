# Timesheet App (Netlify Deployable)

This is a **real app** (not local-only). It uses:
- Netlify Functions (API)
- Netlify Blobs (server-side storage for users, submissions, and proof files)

## Deploy (best)
### 1) Git-based deploy
1. Create a Git repo and commit all files from this folder.
2. Netlify → Add new site → Import from Git.
3. Build settings:
   - Build command: (leave blank)
   - Publish directory: `.`
4. Environment variables (Site configuration → Environment variables):
   - `ADMIN_PASSWORD` = your admin password (example `admin123`)
5. Deploy.

### 2) Manual deploy (ZIP drag/drop)
Netlify supports drag/drop for static files, but **functions require a build step** (dependency install).
So use Git deploy for the best experience.

## Usage
- User: `/index.html`
- Admin: `/admin.html`

Admin password is checked server-side via `ADMIN_PASSWORD` env var.

## Storage
All stored in Netlify Blobs store `timesheet`:
- Users: key `users`
- Submissions: `sub:<weekStartISO>:<enterpriseId>`
- Proof upload: `proof:<weekStartISO>:<enterpriseId>` (binary + metadata)

## Notes
- Proof files are stored in Blobs; this build stores filename + bytes for audit.
- If you want: a Proof download/view button in Admin report table, tell me and I’ll add it.
