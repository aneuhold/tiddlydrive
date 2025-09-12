# Tiddly Drive

[![Open App](https://img.shields.io/badge/Open%20App-tiddlydrive.tonyneuhold.com-0a7250?style=for-the-badge&logo=google-chrome&logoColor=white)](https://tiddlydrive.tonyneuhold.com)

Tiddly Drive lets you open and save single-file TiddlyWiki documents on Google Drive. This repository contains a modernized implementation built with Svelte.

Huge thanks to the original creator LordRatte for the all the years of supporting this project and all the original code!!! See [the original repo here](https://github.com/tiddlydrive/tiddlydrive.github.io).

## User guide (normal usage)

1. Install the Tiddly Drive app from the production site.
2. In Google Drive, right-click a TiddlyWiki HTML file and choose “Open with → Tiddly Drive”.
3. The wiki opens and manages its own saves; the app integrates with Google Drive to store changes safely.
4. Settings are available via the gear button in the app. Autosave and hotkey preferences can be adjusted there.

Notes:

- The app requests minimal Drive access (drive.file). If access changes are needed, it will prompt for consent.
- Shared drives are supported.

## Development

See the [development guide](./docs/development.md) for setup and testing instructions.
