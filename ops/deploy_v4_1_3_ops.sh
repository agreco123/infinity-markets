#!/usr/bin/env bash
# v4.1.3 — post-deploy operational runner.
#
# Runs all three operational seeders in order:
#   V41P-3  seed_erie_butler_acs.js      (Erie + Butler ACS re-sweep)
#   V41P-4  refresh_public_builders.js   (EDGAR cache refresh)
#   V41P-5  seedCommunities.js            (NHS rescrape for Cranberry + Newstead ZIPs)
#
# Expects to be executed from the repo root (the directory containing 'server/').
#
# Env required:
#   SUPABASE_URL
#   SUPABASE_SERVICE_ROLE_KEY  (or SUPABASE_SERVICE_KEY)
#   CENSUS_API_KEY
#
# Usage:
#   ./ops/deploy_v4_1_2_ops.sh --dry-run            # plan-check only
#   ./ops/deploy_v4_1_2_ops.sh                       # run all three live
#   ./ops/deploy_v4_1_2_ops.sh --only=acs            # run just V41P-3
#   ./ops/deploy_v4_1_2_ops.sh --only=edgar          # run just V41P-4
#   ./ops/deploy_v4_1_2_ops.sh --only=nhs            # run just V41P-5
#
# Exit code: 0 = success, 1 = any step failed.

set -euo pipefail

DRY_RUN=0
ONLY=""
VERBOSE=""

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --verbose) VERBOSE="--verbose" ;;
    --only=*)  ONLY="${arg#--only=}" ;;
    *) echo "unknown arg: $arg"; exit 1 ;;
  esac
done

if [ ! -d server/scripts ]; then
  echo "ERROR: run from repo root (expected ./server/scripts to exist)"
  exit 1
fi

# Env check (strict unless --dry-run).
missing=()
if [ -z "${SUPABASE_URL:-}" ]; then missing+=("SUPABASE_URL"); fi
if [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}${SUPABASE_SERVICE_KEY:-}" ]; then missing+=("SUPABASE_SERVICE_ROLE_KEY"); fi
if [ -z "${CENSUS_API_KEY:-}" ]; then missing+=("CENSUS_API_KEY"); fi
if [ "${#missing[@]}" -gt 0 ] && [ "$DRY_RUN" -eq 0 ]; then
  echo "ERROR: env missing: ${missing[*]}"
  echo "Either export the vars or re-run with --dry-run"
  exit 1
fi

run_step() {
  local name="$1"; shift
  local cmd="$1"; shift
  echo ""
  echo "================================================================"
  echo " $name"
  echo "================================================================"
  if [ "$DRY_RUN" -eq 1 ]; then
    echo "[dry-run] would execute: $cmd $*"
    return 0
  fi
  echo "[run] $cmd $*"
  eval "$cmd $*"
}

# ── V41P-3 — Erie + Butler ACS re-sweep ────────────────────────────
if [ -z "$ONLY" ] || [ "$ONLY" = "acs" ]; then
  run_step "V41P-3  Erie + Butler ACS re-sweep" \
    "node server/scripts/seed_erie_butler_acs.js" "--target=42_049 $VERBOSE"
  run_step "V41P-3  Butler ACS re-sweep" \
    "node server/scripts/seed_erie_butler_acs.js" "--target=42_019 $VERBOSE"
fi

# ── V41P-4 — EDGAR public-builder refresh ──────────────────────────
if [ -z "$ONLY" ] || [ "$ONLY" = "edgar" ]; then
  run_step "V41P-4  Public-builder EDGAR refresh" \
    "node server/scripts/refresh_public_builders.js" "$VERBOSE"
fi

# ── V41P-5 — NHS rescrape (Cranberry + Newstead ZIPs) ──────────────
if [ -z "$ONLY" ] || [ "$ONLY" = "nhs" ]; then
  # Cranberry / Butler County ZIPs
  run_step "V41P-5  NHS rescrape: Cranberry (Butler Co PA)" \
    "node server/scripts/seedCommunities.js" "16066 16046 16002 16033 16059"
  # Newstead / PA Erie County ZIPs (not NY — Newstead fixture is PA Erie)
  # Adjust ZIPs to your actual Newstead/Erie coverage on deploy.
  run_step "V41P-5  NHS rescrape: Newstead (PA Erie Co)" \
    "node server/scripts/seedCommunities.js" "16428 16423 16410 16412 16415"
fi

echo ""
echo "================================================================"
if [ "$DRY_RUN" -eq 1 ]; then
  echo " DRY-RUN complete. Remove --dry-run to execute."
else
  echo " ALL OPS COMPLETE. Regenerate Cranberry + Newstead to verify."
fi
echo "================================================================"
