#!/usr/bin/env bash
# Pinned upstream CLI; credentials are never supplied to this process.
set -euo pipefail
umask 077
mode=${1:-tree}
case "$mode" in install|staged|tree|history) ;; *) echo 'Usage: gitleaks.sh install|staged|tree|history' >&2; exit 2 ;; esac
root=$(git rev-parse --show-toplevel)
cd "$root"
version=8.30.1
case "$(uname -s)" in Darwin) os=darwin ;; Linux) os=linux ;; MINGW*|MSYS*|CYGWIN*) os=windows ;; *) echo 'Unsupported scanner platform' >&2; exit 2 ;; esac
case "$(uname -m)" in arm64|aarch64) arch=arm64 ;; x86_64|amd64) arch=x64 ;; *) echo 'Unsupported scanner architecture' >&2; exit 2 ;; esac
suffix=tar.gz
binary=gitleaks
if [ "$os" = windows ]; then suffix=zip; binary=gitleaks.exe; fi
asset="gitleaks_${version}_${os}_${arch}.${suffix}"
expected=$(awk -v asset="$asset" '$2 == asset { print $1 }' .security/gitleaks-checksums.txt)
if [ "${#expected}" -ne 64 ]; then echo 'Missing pinned scanner checksum' >&2; exit 2; fi
cache=$(git rev-parse --git-path security-tools)
mkdir -p "$cache"
cache=$(cd "$cache" && pwd)
archive="$cache/$asset"
scratch=$(mktemp -d "$cache/scan.XXXXXXXX")
trap 'rm -rf "$scratch"' EXIT
if [ ! -f "$archive" ]; then
  curl --fail --silent --show-error --location --retry 2 --connect-timeout 15 --max-time 120 \
    "https://github.com/gitleaks/gitleaks/releases/download/v${version}/${asset}" -o "$scratch/download"
  mv "$scratch/download" "$archive"
fi
if command -v sha256sum >/dev/null 2>&1; then
  actual=$(sha256sum "$archive" | awk '{print $1}')
else
  actual=$(shasum -a 256 "$archive" | awk '{print $1}')
fi
if [ "$actual" != "$expected" ]; then echo 'Scanner archive checksum mismatch; refusing to run' >&2; exit 2; fi
if [ "$os" = windows ]; then unzip -p "$archive" "$binary" > "$scratch/$binary"; else tar -xzf "$archive" -C "$scratch" "$binary"; fi
chmod +x "$scratch/$binary"
if [ "$("$scratch/$binary" version)" != "$version" ]; then echo 'Scanner version mismatch' >&2; exit 2; fi
if [ "$mode" = install ]; then echo "Gitleaks $version verified"; exit 0; fi
args=()
case "$mode" in
  staged) args=(git --pre-commit --staged "$root") ;;
  history)
    if [ "$(git rev-parse --is-shallow-repository)" != false ]; then echo 'History scan requires a full clone' >&2; exit 2; fi
    args=(git --log-opts=--all "$root") ;;
  tree)
    mkdir "$scratch/tree"
    git archive --format=tar HEAD > "$scratch/tree.tar"
    tar -xf "$scratch/tree.tar" -C "$scratch/tree"
    args=(dir "$scratch/tree") ;;
esac
# Emit only location metadata, never source lines, matches or credential values.
status=0
"$scratch/$binary" "${args[@]}" --config "$root/.gitleaks.toml" \
  --gitleaks-ignore-path "$root/.gitleaksignore" --ignore-gitleaks-allow \
  --redact=100 --no-banner --no-color --log-level=error --timeout=180 \
  --report-format=template --report-template "$root/.security/report.tmpl" --report-path "$scratch/report" \
  >/dev/null 2>&1 || status=$?
if [ "$status" -eq 0 ]; then
  echo "Secret scan passed ($mode)"
elif [ "$status" -eq 1 ] && [ -s "$scratch/report" ]; then
  echo 'Potential credentials detected; commit/release blocked:' >&2
  cat "$scratch/report" >&2
else
  echo "Secret scanner failed (exit $status); commit/release blocked" >&2
  exit 2
fi
exit "$status"
