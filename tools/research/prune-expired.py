#!/usr/bin/env python3
"""Admin-only Firebase RTDB cleanup; no match content leaves the runner.

Requires a narrowly managed Google service account JSON from an Actions secret.
Without --apply the script only dry-runs. NEVER print records or credentials.
Usage: python tools/research/prune-expired.py [--apply]
"""
import argparse
import json
import os
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

DB = "https://mygame-df915-default-rtdb.firebaseio.com"
ROOT = "shokokuResearchV1"
MAX_PER_RUN = 50


def run(apply=False):
    secret = os.environ.get("SHOKOKU_FIREBASE_MAINTENANCE_SA_JSON", "")
    if not secret:
        print("Research cleanup skipped: maintenance secret is not configured")
        return 0
    # Import only after checking configuration so local dry runs need no SDK.
    from google.oauth2 import service_account
    from google.auth.transport.requests import Request
    import requests

    info = json.loads(secret)
    credentials = service_account.Credentials.from_service_account_info(
        info, scopes=[
            "https://www.googleapis.com/auth/firebase.database",
            "https://www.googleapis.com/auth/userinfo.email",
        ]
    )
    credentials.refresh(Request())
    headers = {"Authorization": "Bearer " + credentials.token}
    now_ms = int(time.time() * 1000)
    # Firebase REST requires an index on expiresAt (documented in rules guide).
    r = requests.get(
        DB + "/" + ROOT + ".json",
        params={
            "orderBy": '"expiresAt"',
            "endAt": str(now_ms),
            "limitToFirst": str(MAX_PER_RUN),
        },
        headers=headers,
        timeout=30,
    )
    r.raise_for_status()
    rows = r.json() or {}
    if not isinstance(rows, dict):
        raise ValueError("Unexpected Firebase cleanup response")
    eligible = []
    for key, item in rows.items():
        if not re.fullmatch(r"[a-zA-Z0-9-]{20,80}", key):
            continue
        if not isinstance(item, dict):
            continue
        expires = item.get("expiresAt")
        if not isinstance(expires, (int, float)) or expires > now_ms:
            continue
        eligible.append(key)
    # Quota buckets contain Firebase anonymous auth UIDs. Remove whole
    # UTC-day buckets after 14 days too; otherwise pseudonymous IDs accumulate.
    cutoff = (datetime.now(timezone.utc).date() - timedelta(days=14)).isoformat()
    quotas = requests.get(
        DB + "/shokokuResearchRateV1.json",
        params={
            "orderBy": '"$key"',
            "endAt": json.dumps(cutoff),
            "limitToFirst": "30",
        },
        headers=headers,
        timeout=30,
    )
    quotas.raise_for_status()
    days = quotas.json() or {}
    if not isinstance(days, dict):
        raise ValueError("Unexpected quota cleanup response")
    old_days = [key for key in days if re.fullmatch(r"\\d{4}-\\d{2}-\\d{2}", key)
                and key <= cutoff]
    if apply:
        for key in eligible:
            url = DB + "/" + ROOT + "/" + quote(key, safe="") + ".json"
            reply = requests.delete(url, headers=headers, timeout=25)
            reply.raise_for_status()
        for day in old_days:
            url = DB + "/shokokuResearchRateV1/" + quote(day, safe="") + ".json"
            reply = requests.delete(url, headers=headers, timeout=25)
            reply.raise_for_status()
    # Log only counts. Never print private keys, client IDs or match payloads.
    print("Research cleanup: matches eligible=%d deleted=%d, quota days eligible=%d deleted=%d" %
          (len(eligible), len(eligible) if apply else 0,
           len(old_days), len(old_days) if apply else 0))
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    try:
        sys.exit(run(args.apply))
    except Exception as e:
        # External library error bodies can include data; never print payloads.
        print("Research cleanup FAILED; check Firebase IAM, rules and expiresAt index")
        sys.exit(1)
