#!/usr/bin/env python3
"""One-off safe Firebase RTDB write/read/delete probe for Shokoku only.

Uses anonymous REST like the game. Never accesses or mutates BRAWL paths.
Reserve a random 5-digit unused path with Firebase's conditional if-match:null_etag.
Always try to remove only the exact test room we created.
"""
import json
import secrets
import time
import urllib.error
import urllib.request

BASE = "https://mygame-df915-default-rtdb.firebaseio.com/shokokuRooms1v1"
MARKER = "online-ci-" + secrets.token_hex(12)


def request(url, method="GET", payload=None, headers=None):
    data = None if payload is None else json.dumps(payload, separators=(",", ":")).encode()
    req = urllib.request.Request(url, data=data, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.status, resp.read().decode()
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode()


def main():
    for _ in range(10):
        code = str(secrets.randbelow(90000) + 10000)
        url = f"{BASE}/{code}.json"
        status, content = request(url)
        if status != 200:
            raise RuntimeError(f"RTDB read failed: HTTP {status} {content[:160]}")
        if content.strip() != "null":
            continue
        ts = int(time.time() * 1000)
        payload = {
            "meta": {"version": 1, "status": "lobby", "round": 1, "createdAt": ts},
            "players": {"host": {"id": MARKER, "online": False, "ready": False, "joinedAt": ts}}
        }
        status, body = request(url, "PUT", payload, {"if-match": "null_etag", "Content-Type": "application/json"})
        if status == 412:
            continue  # A real room appeared; don't touch it.
        if status != 200:
            raise RuntimeError(f"RTDB conditional write denied/failed: HTTP {status} {body[:160]}")
        try:
            status, body = request(url)
            if status != 200 or json.loads(body).get("players", {}).get("host", {}).get("id") != MARKER:
                raise RuntimeError("RTDB read-back mismatch, refusing unsafe cleanup")
            print("PASS: anonymous RTDB conditional CREATE and READ in isolated Shokoku room", code)
        finally:
            status, body = request(url)
            if status == 200 and body.strip() != "null":
                item = json.loads(body)
                if item.get("players", {}).get("host", {}).get("id") == MARKER:
                    deleted, detail = request(url, "DELETE")
                    if deleted != 200:
                        raise RuntimeError(f"RTDB cleanup failed: HTTP {deleted}: {detail[:160]}")
                    check, remaining = request(url)
                    if check != 200 or remaining.strip() != "null":
                        raise RuntimeError("RTDB cleanup was not confirmed")
                    print("PASS: temporary test room deleted, BRAWL paths untouched")
        return
    raise RuntimeError("Could not reserve an unused 5-digit room after 10 attempts")


if __name__ == "__main__":
    main()
