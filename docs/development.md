# Development Guide

This project is a modernized Tiddly Drive app built with Svelte 5 and Vite. It includes a Drive-integrated app under `app/` and root scripts to build assets.

## Prerequisites

- Node.js 18+ and pnpm
- A Google Cloud project with OAuth Client ID configured for Web
- Optional: Image tooling for icons (`librsvg` providing `rsvg-convert`, and `imagemagick` for `convert`), if you plan to rebuild branding assets

## Quick start

1. Install dependencies:

   ```sh
   pnpm run i
   ```

2. Launch the app (SvelteKit dev server at port 4317):

   ```sh
   pnpm dev
   ```

3. Open the dev loader URL to simulate Drive "Open with" (uses the state param):

   http://localhost:4317/?state=%7B%22ids%22:%5B%221ujSre3E0f8HxLW4pqSTh5bFeztEB5zTx%22%5D,%22action%22:%22open%22,%22userId%22:%22me%22,%22resourceKeys%22:%7B%7D%7D

   Tip: You can also pass a simpler `?id=<DRIVE_FILE_ID>` during development; the app supports either `id` or `state`.

## Testing saves during development

- Open the app via the dev URL above with a valid Drive file id you can edit.
- When the wiki loads, TiddlyWiki manages when to save. The app hooks into TW’s saver to upload to Drive.
- The implementation uses media uploads (Drive v3) plus ETag (If-Match) for conflict safety, and coalesces rapid autosaves to prevent interleaving.

## Building & assets

- Build the Svelte app:

  ```sh
  pnpm build
  ```

- Rebuild branding icons (requires the tools mentioned above):

  ```sh
  pnpm run icons:all
  ```

## Troubleshooting

- If you see a Google login popup on startup without a file id, ensure you’re loading the app with either `?id=` or `?state=`.
- 403 Permission errors: open the file via Drive with the installed app, or temporarily re-consent (the app will retry with `prompt=consent`).
- 409/412 conflicts: another client or newer version exists on Drive. Reload before continuing.
