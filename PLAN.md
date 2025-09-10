# Tiddly Drive 2 – Republication Master Plan

Comprehensive, end‑to‑end plan to republish the legacy "Tiddly Drive" Google Drive integration as a modern, compliant, free Google Workspace (Drive) application named "Tiddly Drive 2".

> This document is structured as actionable checklists. Each major section ends with concrete acceptance criteria. You can treat subsections as work packages / milestones.

---

## 0. High‑Level Overview

Goal: Offer users a way to open and seamlessly save single‑file TiddlyWiki documents stored in Google Drive directly in the browser, with minimal scopes, modern authentication (Google Identity Services), and an updated Drive integration listing (Google Workspace Marketplace) under the new product name "Tiddly Drive 2".

Key Modernization Items:

- Replace deprecated `gapi.auth2` with Google Identity Services (GIS) OAuth 2.0 token client.
- Stop using Drive v2 upload path; migrate to Drive API v3 multipart upload (`PATCH /upload/drive/v3/files/{fileId}`).
- Remove hard‑coded API key & OAuth Client ID from source; introduce environment-based build injection.
- Add privacy policy & terms of service, data handling disclosure, and branding assets.
- Implement stricter Content Security Policy (CSP) & security headers (where hosting platform allows) and drop unnecessary external calls.
- Add robust error handling & user messaging for auth, rate limits, offline, and save conflicts.
- Optional: PWA capabilities for better UX and offline caching.

---

## 1. Naming, Branding & Asset Preparation

Tasks:

1. Product Name: "Tiddly Drive 2" (verify uniqueness in Marketplace search).
2. App Icon(s): 128×128, 256×256, 512×512 PNG (square, transparent background if appropriate). Maintain thematic continuity but avoid confusion with original (adjust color palette or add "2").
3. Promotional images (if still required): Primary banner (e.g., 1280×800 or current spec), optional screenshots (min 3) showing:
   - Opening a TiddlyWiki from Drive
   - Editing & auto-save notification
   - Settings modal (saving options)
4. Short description (max current limit – typically 120 chars) & long description (focus on privacy minimalism and OSS nature).
5. Privacy Policy URL & Terms of Service URL (host within repo via GitHub Pages or custom domain).
6. Support URL (GitHub issues or a simple support page).
7. Human‑readable versioning strategy (e.g., semantic: MAJOR.MINOR.PATCH) and CHANGELOG.

Acceptance Criteria:

- All required visual assets exported & optimized (≤200KB each where possible).
- Policy & ToS pages live and publicly accessible over HTTPS.
- Descriptions drafted & internally reviewed.

---

## 2. Hosting & Domains

Chosen Approach: GitHub Pages + existing apex domain `tonyneuhold.com` using a dedicated subdomain `tiddlydrive.tonyneuhold.com` for the application and its required public policy/support documents.

Rationale:

- A single, purpose‑specific subdomain keeps OAuth & Marketplace review simpler (one origin) while preserving separation from unrelated personal content on the apex.
- Avoids need for two domains (no security benefit in this purely static, client‑only model right now).

Resulting Public URLs (planned):

- App root / Drive "Open with" launch: `https://tiddlydrive.tonyneuhold.com/`
- Privacy Policy: `https://tiddlydrive.tonyneuhold.com/privacy.html`
- Terms of Service: `https://tiddlydrive.tonyneuhold.com/terms.html`
- Support: `https://tiddlydrive.tonyneuhold.com/support.html` (or redirect to GitHub Issues)

DNS & GitHub Pages Tasks:

1. Add `CNAME` record in DNS: `tiddlydrive` -> `<username>.github.io` (your GitHub Pages target) or configure Pages custom domain settings accordingly.
2. (If not already) Add/confirm `A` / `ALIAS` records for apex separately (not strictly required for the app; focus is subdomain).
3. Create / update `CNAME` file in the Pages publishing branch (or root) containing `tiddlydrive.tonyneuhold.com`.
4. Enable HTTPS & enforce it in GitHub Pages settings (automatic certificate via Let's Encrypt).
5. Add DNS TXT record for Google Search Console domain property verification (either apex or subdomain—subdomain is sufficient for OAuth domain verification if used consistently).
6. Add `/privacy.html`, `/terms.html`, `/support.html` to the deployed site (static, no tracking scripts).
7. Confirm caching headers for built assets (hashed filenames via build pipeline Section 7). If using plain root without build yet, plan migration before public listing.
8. (Optional) Configure a short redirect or canonical tag if any legacy URLs persist.

OAuth / Marketplace Considerations:

- Authorized JavaScript Origin will include: `https://tiddlydrive.tonyneuhold.com` and local dev `http://localhost:5173`.
- Do NOT add the apex `https://tonyneuhold.com` unless the app actually runs there (keeps scope of review tight).
- Privacy & Terms must resolve without redirects failing CSP (avoid meta refresh; use direct pages).

Acceptance Criteria:

- `https://tiddlydrive.tonyneuhold.com` resolves with HTTPS enforced (no mixed content, valid cert).
- CNAME / DNS propagation verified (nslookup / dig) and Pages shows “Domain is verified”.
- Domain (subdomain) verified in Google Cloud Console / Search Console for OAuth consent screen.
- Policy, Terms, Support pages publicly accessible over HTTPS at stated URLs.
- Asset build (once implemented) produces hashed filenames or documented plan to do so before release.

---

## 3. Google Cloud Project Setup

Tasks:

1. Create new Google Cloud Project: `tiddly-drive-2` (or available variant).
2. Enable APIs:
   - Google Drive API
   - (Optional) Google People API ONLY if you later need user profile; currently avoid to reduce scopes.
3. Configure OAuth Consent Screen:
   - User Type: External (publish after verification if needed; drive.file scope often requires verification but may pass streamlined review if minimal data usage & open-source).
   - Scopes: `https://www.googleapis.com/auth/drive.file` only.
   - Add app logo (≤1MB), support email, developer contact.
   - Provide detailed justification for scope (explain single‑file editing, no broad drive access, no server storage).
4. Create OAuth 2.0 Client ID (Web application):
   - Authorized JavaScript origins:
     - `https://tiddlydrive.tonyneuhold.com`
     - `http://localhost:5173` (dev / Vite preview)
     - (Optional later) staging origin if introduced (add only when real).
   - Authorized redirect URIs: If using GIS OAuth 2.0 code flow or fallback redirect, add `https://tiddlydrive.tonyneuhold.com/oauth-callback.html` (placeholder) — not strictly required for token client popup flow but harmless for future flexibility.
   - Do NOT list apex domain unless serving app from there to reduce review surface.
5. (If still needed) API Key – in modern approach w/ OAuth token only, an API key is unnecessary; plan to remove.
6. Configure Google Workspace Marketplace SDK:
   - Enable in GCP.
   - Add Drive integration (Open with): specify MIME types: `text/html` and optionally custom `application/x-tiddlywiki`.
   - App launch URL: `https://tiddlydrive.tonyneuhold.com/` (Drive will append `?state=...`).
   - Support URL: `https://tiddlydrive.tonyneuhold.com/support.html` (or GitHub Issues if preferred; ensure alignment with consent screen support link).
   - Privacy & Terms URLs: point to subdomain pages (match consent screen exactly to avoid review friction).
   - Test publication in private mode for selected test users (add their emails under OAuth Testing users list).

Acceptance Criteria:

- Project created & APIs enabled.
- OAuth consent screen in “Testing” OR published state.
- OAuth Client ID obtained & documented (not committed to repo directly).
- Marketplace SDK draft configuration saved (not yet published).

---

## 4. Drive Integration ("Open With" flow) Modern Spec

Legacy flow uses the `state` parameter containing JSON with `ids`. Modern requirements:

1. Confirm Drive still supplies `state` param (Drive Picker / Open With) – spec unchanged: `state` JSON includes `action`, `ids`, `userId`.
2. Validate `state` parsing with defensive try/catch + schema check (avoid app crash on malformed input).
3. Support multiple file IDs gracefully (currently `.pop()` discards others). For now: reject multi-selection with user message.
4. Implement fallback UI when no `state` (currently shows message) – modernize text referencing new listing name.

Acceptance Criteria:

- Documented supported query parameters and edge-case handling.

---

## 5. Authentication Modernization (Replace gapi.auth2)

Current state: Uses legacy `gapi.load('client:auth2')` and `gapi.auth2.getAuthInstance()`.

Target: Use Google Identity Services (GIS) token client:

- Load `https://accounts.google.com/gsi/client` script.
- Initialize token client: `google.accounts.oauth2.initTokenClient({ client_id, scope, callback })`.
- On need (open or save) request token (`client.requestAccessToken({prompt: ''})`).
- Remove API key usage & `gapi.client.init`. For REST calls use `fetch` with `Authorization: Bearer <token>`.

Tasks:

1. Abstract auth logic into `auth.js` (new file) for clarity.
2. Keep a reactive auth state (simple in-memory boolean + token).
3. Implement silent token refresh (re-request with prompt: '' and handle `consent_required` error by prompting user).
4. Graceful error messages for: popup blocked, user closed prompt, token expired, network errors.
5. Remove unused discovery doc logic.

Acceptance Criteria:

- No references to `gapi.auth2` or Drive v2 endpoints.
- All Drive calls succeed with GIS-provided access token.

---

## 6. Drive File Operations (API v3)

Current code issues:

- Uses `gapi.client.drive.files.get` for body download with `alt=media` (OK but will now use `fetch`).
- Uses legacy v2 upload endpoint: `/upload/drive/v2/files/{id}`.

Modern approach:

1. Download: `GET https://www.googleapis.com/drive/v3/files/{fileId}?alt=media` with Authorization header.
2. (Optional) Pre-fetch metadata: `GET /drive/v3/files/{fileId}?fields=name,mimeType,modifiedTime,version`.
3. Save (multipart upload): `PATCH https://www.googleapis.com/upload/drive/v3/files/{fileId}?uploadType=multipart`
   - Body: multipart/related with JSON metadata part (optionally empty if name unchanged) + text/html content part.
   - Set `If-Match` with file `etag` or use `If-Unmodified-Since` equivalent via `modifiedTime` to prevent overwriting external edits (conflict detection). On conflict: prompt user to reload vs force save.
4. Autosave throttle: Debounce to e.g., 2–5s after last change rather than relying solely on TiddlyWiki's internal change counter (reduce quota usage).
5. Error Handling Matrix: 401 (refresh token), 403 (quota), 409 (conflict), 429 (rate limit – backoff), 5xx (retry w/ exponential backoff up to 3 attempts).

Acceptance Criteria:

- Successful manual save & autosave flows with conflict detection.
- Clear user toast messages for success, retry, conflict, permission errors.

---

## 7. Codebase Restructuring & Build Pipeline (Lightweight)

Currently: Pure static files. Plan minimal tooling while keeping simplicity.

Tasks:

1. Introduce `/src` directory (new) for modular JS: `auth.js`, `drive.js`, `ui.js`, `main.js`.
2. Simple build using ESBuild or Vite to bundle & inject environment variables (CLIENT_ID). (Keep zero server runtime.)
3. Provide `.env.example` with `VITE_GOOGLE_CLIENT_ID=`. Never commit real values.
4. Output to `/dist`; GitHub Pages serves `dist` (or root copy via action).
5. Add GitHub Action for build & deploy (on tag push to `main`).
6. Linting: Add ESLint + Prettier baseline config.

Acceptance Criteria:

- Build script produces a single JS bundle (≤300KB minified) + hashed filename.
- No secrets committed.

---

## 8. Security & Privacy Hardening

Tasks:

1. Remove donations that trigger external scripts unless necessary (optional) – document data neutrality.
2. Add a minimal Content Security Policy meta tag (if feasible within GitHub Pages limitations) permitting only required origins (self, accounts.google.com, googleapis.com).
3. Sanitize `state` parameter and guard JSON parsing.
4. `iframe` usage: Confirm no need for `allow-same-origin` modifications; current approach loads raw HTML into `srcdoc` or legacy path – maintain but add size limit warning if file > e.g., 25MB (Drive single-file TiddlyWiki can be large; performance concerns).
5. Document that no user data persists server-side.
6. Provide explicit Privacy Policy text: Only processes selected file in-memory and updates back to Drive; no tracking.
7. Add `robots.txt` (optional) to avoid indexing of internal docs if undesirable.

Acceptance Criteria:

- Security review checklist completed (in repo `SECURITY.md`).
- CSP present & functioning (no console violations aside from Google Identity scripts).

---

## 9. UX Improvements (Optional but Recommended)

Tasks:

1. Loading skeleton / spinner replaced after file fetch or with error.
2. Non-blocking toast queue for save statuses.
3. Add explicit "Save Now" button in settings modal.
4. Conflict resolution dialog with options: (a) Reload from Drive (b) Overwrite (c) Cancel.
5. PWA (optional):
   - `manifest.webmanifest` with icons.
   - Service worker caching static assets (NOT caching Drive file content).

Acceptance Criteria:

- Manual save button works and shows same success message.
- Conflict dialog appears on simulated mismatch.

---

## 10. Accessibility & Internationalization

Tasks:

1. Add ARIA labels to buttons (settings, authenticate, etc.).
2. Ensure color contrast passes WCAG AA (check Materialize defaults).
3. Provide simple i18n structure (JSON bundles) for core strings (English default). (Optional to defer.)

Acceptance Criteria:

- Lighthouse accessibility score ≥ 90.

---

## 11. Testing & QA

Tasks:

1. Unit tests (light) for helper utilities (state parsing, debounce, multipart builder).
2. Integration manual test matrix:
   - Browsers: Chrome (latest), Firefox (legacy mode), Safari.
   - Scenarios: First auth, re-open file with existing token, autosave, manual save, conflict, offline -> edit -> save after reconnect.
3. Quota simulation: artificially return 403 & ensure UI message.
4. Performance: Measure time to load & render average (1–5MB) TiddlyWiki file (<2s target after download).
5. Basic automated smoke test using Playwright (open app with mock `state` and intercept Drive API with fixture file).

Acceptance Criteria:

- Test plan documented in `TESTING.md`.
- All critical scenarios pass.

---

## 12. Documentation

Files to add/update:

- `PLAN.md` (this doc)
- `README.md` (updated for Tiddly Drive 2, quick start, build, privacy summary)
- `CHANGELOG.md`
- `PRIVACY.md` / `privacy.html`
- `TERMS.md` / `terms.html`
- `SECURITY.md`
- `TESTING.md`
- `CONTRIBUTING.md`

Acceptance Criteria:

- All docs present & linked from README.

---

## 13. Deployment Automation

Tasks:

1. GitHub Action workflow: on push tag `v*` -> install deps, run lint, build, run tests, deploy `dist` to `gh-pages` branch or root of pages repo.
2. Optionally create draft GitHub Release with changelog notes.
3. Post-deploy script to run Lighthouse CI (optional).

Acceptance Criteria:

- Successful CI run visible in Actions.

---

## 14. Marketplace Submission Process

Tasks:

1. Internal domain testing (add test users in OAuth publishing restrictions if still in Testing mode).
2. Fill Marketplace listing: categories, pricing = Free, features bullets, data access description.
3. Upload assets & verify no policy violations.
4. Provide verification materials (open-source repo link, privacy policy, limited scopes rationale).
5. Submit for review; track status; respond to review feedback.

Acceptance Criteria:

- Listing approved & publicly searchable.

---

## 15. Post‑Launch Monitoring & Maintenance

Tasks:

1. Set up Google Cloud Monitoring (basic) for quota usage (Drive API calls).
2. GitHub Issues templates (bug, feature request).
3. Schedule quarterly dependency review & token scope audit.
4. Optional: Add simple telemetry (only anonymous performance metrics) — must update privacy if added. (Defer initially.)
5. Maintain a SECURITY.md policy for vulnerability disclosure.

Acceptance Criteria:

- At least one monitoring alert configured (quota near 80%).

---

## 16. Risk Register (Condensed)

| Risk                      | Impact                   | Mitigation                                                |
| ------------------------- | ------------------------ | --------------------------------------------------------- |
| Deprecated APIs (gapi)    | Auth failure post sunset | Migrate to GIS early (Section 5)                          |
| Scope verification delays | Launch delay             | Minimal scope + clear documentation                       |
| Large file performance    | Poor UX                  | Add size warning + optimize inline operations             |
| Conflict overwrites       | Data loss                | Implement ETag / modifiedTime check                       |
| Token popup blocked       | User stuck               | Provide explicit Authenticate button & detect popup error |

---

## 17. Implementation Order & Suggested Timeline

1. Project & OAuth setup (Sections 2–3) – Week 1
2. Auth & Drive API refactor (Sections 5–6) – Week 1–2
3. Build system & secrets handling (Section 7) – Week 2
4. Security/privacy docs & CSP (Sections 8 & 12) – Week 2
5. UX & conflict handling (Sections 6 & 9) – Week 3
6. Testing & automation (Sections 11 & 13) – Week 3
7. Marketplace listing assets & submission (Sections 1 & 14) – Week 4
8. Review feedback iteration – Week 4–5

---

## 18. Concrete Code Change Checklist

Authentication & API:

- [ ] Remove `script` loading `https://apis.google.com/js/api.js`.
- [ ] Add `https://accounts.google.com/gsi/client` script.
- [ ] Create `src/auth.js` implementing GIS token client.
- [ ] Replace `gapi.client.drive.files.get` with `fetch` call (v3).
- [ ] Replace v2 upload endpoint with v3 multipart `PATCH`.
- [ ] Add conflict detection via `If-Match` (etag) or pre-fetch + compare `modifiedTime`.

File Handling:

- [ ] Safely parse `state` param with validation.
- [ ] Support clearer error UI when `state` missing.

UI/UX:

- [ ] Update app name in HTML title & UI strings.
- [ ] Add manual "Save Now" button.
- [ ] Implement debounced autosave.
- [ ] Add conflict resolution dialog.

Security:

- [ ] Implement CSP meta tag.
- [ ] Remove hard-coded credentials; use build-time injection.
- [ ] Document third-party resources (Materialize, jQuery) or replace with lighter stack (optional modernization: remove jQuery, use native DOM).

Docs & Infra:

- [ ] Update `README.md` branding & instructions.
- [ ] Add privacy, terms, security, contributing docs.
- [ ] Add GitHub Action workflow.

Optional Enhancements:

- [ ] PWA manifest + service worker.
- [ ] Remove jQuery & Materialize (tree-shake size) – later milestone.

---

## 19. Defer / Future Considerations

- Multi-file batch operations or folder support (requires broader scope; consciously avoided now).
- Offline editing queue with later sync (complex; can be added if demand arises).
- Telemetry / anonymized usage metrics (privacy trade-off; only with explicit opt-in).
- i18n translations beyond English (after core stabilization).

---

## 20. Acceptance Summary

Success = A user can install "Tiddly Drive 2" from the Google Workspace Marketplace, open a TiddlyWiki file from Google Drive, edit it, and rely on save/autosave with minimal permissions, seeing clear feedback while no data leaves their browser except the updated file content.

---

## 21. Next Immediate Steps (Action Kickoff)

1. Configure DNS: Add CNAME for `tiddlydrive.tonyneuhold.com` -> `<username>.github.io` and create `CNAME` file in repo.
2. Wait for DNS propagation; verify HTTPS on the subdomain via GitHub Pages settings.
3. Verify subdomain in Google Search Console (TXT record) and confirm domain ownership inside Google Cloud Console.
4. Create Google Cloud project & OAuth consent screen (Testing mode) using the subdomain URLs for Privacy, Terms, Support (temporary placeholder content acceptable initially, finalize later Section 12).
5. Generate OAuth Client ID; place client id in local `.env` as `VITE_GOOGLE_CLIENT_ID=` (do not commit real value) and reference in build.
6. Begin auth refactor (Section 5) migrating from `gapi` to GIS token client.
7. Implement Drive v3 fetch & multipart save (Section 6) before UX polish.
8. Add placeholder `privacy.html`, `terms.html`, `support.html` early to avoid broken consent screen links.

---

End of Plan.
