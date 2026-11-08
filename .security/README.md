# Repository security

This repository uses the MIT-licensed Gitleaks CLI (8.30.1, maintained for security
patches), not the separately licensed organization Action. Official release
archives are pinned by SHA-256 in `gitleaks-checksums.txt`. Review upstream security
releases and update the version and all checksums together. Never use an unpinned
download or bypass a failed checksum.

## Local setup

Node projects install Husky during their normal development dependency install.
Other projects: install `pre-commit` in your development environment, then run
`pre-commit install`. Hooks apply only to this checkout. Repeat setup after cloning;
Git does not install hooks merely because configuration files exist.

Run `bash .security/gitleaks.sh install` once to download and verify the scanner.
The hook can also bootstrap it on first use. A failed download or scan blocks the
commit. macOS/Linux and Windows Git Bash are supported (Git, curl, tar/unzip and
SHA-256 tooling are required). No business dependencies or production credentials
are needed for scanning. Archives are cached under this checkout's Git directory.

Commands:

- `bash .security/gitleaks.sh staged`: scan the index, including partially staged files.
- `bash .security/gitleaks.sh tree`: scan tracked content of HEAD, for deployment gates.
- `bash .security/gitleaks.sh history`: scan all fetched branches/tags; requires a full clone.

Untracked local `.env` files are not scanned. Tracked environment files are scanned.
No source lines or secret values are emitted; reports contain file, line, rule and
commit information only. Scanner errors fail closed.

## CI and dependencies

`Repository security` runs on push, pull requests, manual dispatch and Mondays at
09:15 Asia/Shanghai. It is also reusable as a prerequisite in release workflows.
It has read-only repository access, never inherits deployment secrets, and does
not install or execute business dependencies. Releases must depend on its success
for the same commit; a separate workflow's red status alone is not a deployment gate.

Dependabot checks the repository's supported manifests and GitHub Actions every
Monday at 09:00 Asia/Shanghai. Ordinary updates have a seven-day cooldown, grouped
minor/patch updates, separate major updates and a three-PR limit per ecosystem.
Security updates are not delayed by that cadence. Review and test every PR; there
is no automatic merge and dependency alerts alone do not stop all deployments.
No paid security product or additional billing is required by this configuration.

## Findings and limitations

Treat plausible real credentials as compromised: stop the affected release,
confirm ownership, revoke/rotate, then document resolution. Deleting a file or
rewriting history does not invalidate credentials. Do not print values in issues,
logs, commits or reports. Do not automatically test a leaked key against a provider.

For a proven fixture/false positive, use a documented exact fingerprint in
`.gitleaksignore` or a rule restricted to both the exact file and exact dummy value.
Never exclude a whole test directory or all history. Inline `gitleaks:allow`
comments are deliberately ignored. Previously real keys require documented
revocation before historical fingerprint suppression.

Local hooks can be bypassed. Actions detect a push after upload. These checks do
not replace server-side push protection, credential least privilege, or review.
GitHub can disable scheduled workflows in public repositories after 60 days of
inactivity; check the Actions page and re-enable them when resuming development.
Native security alerts and workflow failure notifications use GitHub notification
preferences. Inspect existing alerts after initial enablement: historical alerts
may not each generate a notification.

Dependabot covers supported manifests, not arbitrary packages downloaded by
scripts, every runtime end-of-life date, or every possible vulnerability. Review
unsupported dependencies separately. This setup does not change production token
permissions, application behavior, or database schemas.

## Repository coverage

Enabled ecosystems: github-actions, npm.
