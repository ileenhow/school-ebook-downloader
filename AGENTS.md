# Repository Instructions

## Release

- Only create a release when the user explicitly authorizes it. A release writes a commit and tag and pushes both to GitHub.
- Run `nvm use` first, then create releases from a clean, up-to-date `main` branch with `pnpm release:version <patch|minor|major|x.y.z>`.
- Do not manually edit only one version field. The release command updates both `package.json` and `public/manifest.json`, runs the full release build, commits `release: vX.Y.Z`, creates the matching annotated tag, and atomically pushes `main` and the tag to `origin`.
- A pushed `v*.*.*` tag triggers the Release workflow. After the shared build succeeds, Chrome Web Store and Microsoft Edge Add-ons remain behind their separate GitHub Environment approval nodes.
- Do not approve either store publication unless the user explicitly requests that store to be published.
