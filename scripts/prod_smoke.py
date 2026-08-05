#!/usr/bin/env python3
"""
HTTP-level production smoke checks for for-promotional-use-only.com.

Override the target origin with PROMO_SMOKE_BASE (for example the https CloudFront
origin once the TLS cutover lands). Exits non-zero when any check fails.
"""

from __future__ import annotations

import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

BASE = os.environ.get("PROMO_SMOKE_BASE", "https://for-promotional-use-only.com").rstrip("/")
UA = {"User-Agent": "promo-smoke/1.0"}
CRA_MAIN_CHUNK_PATTERN = re.compile(r"/static/js/main\.[0-9a-f]+\.chunk\.js")
VITE_MAIN_CHUNK_PATTERN = re.compile(r"/assets/index-[A-Za-z0-9_-]+\.js")
VITE_MAIN_CSS_PATTERN = re.compile(r"/assets/index-[A-Za-z0-9_-]+\.css")


def find_app_bundle(html: str) -> str | None:
    """
    Locate the primary JS bundle referenced from index.html (CRA or Vite).

    Args:
        html (str): Decoded index.html body.

    Returns:
        str | None: Bundle path beginning with /, or None when not found.
    """
    for pattern in (VITE_MAIN_CHUNK_PATTERN, CRA_MAIN_CHUNK_PATTERN):
        match = pattern.search(html)
        if match:
            return match.group(0)
    return None


def find_app_css(html: str) -> str | None:
    """
    Locate the Vite-emitted app stylesheet when present.

    Args:
        html (str): Decoded index.html body.

    Returns:
        str | None: CSS path beginning with /, or None for legacy CRA builds.
    """
    match = VITE_MAIN_CSS_PATTERN.search(html)
    return match.group(0) if match else None


def fetch(path: str, headers: dict[str, str] | None = None) -> tuple[int, bytes]:
    """
    GET a path from the live site.

    Args:
        path (str): Absolute path beginning with /.
        headers (dict[str, str] | None, default: None): Extra request headers.

    Returns:
        tuple[int, bytes]: Status code and response body. Status is 0 when the request
            never completed (DNS, TLS, connection, or timeout failure).
    """
    req = urllib.request.Request(BASE + path, headers={**UA, **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=45) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as err:
        return err.code, err.read()
    except OSError as err:
        return 0, str(err).encode()


def fetch_json(path: str) -> tuple[int, object | None]:
    """
    GET a path and decode it as JSON.

    Args:
        path (str): Absolute path beginning with /.

    Returns:
        tuple[int, object | None]: Status code and decoded payload, or None when the
            response was not a successfully decoded JSON body.
    """
    status, body = fetch(path)
    if status != 200:
        return status, None
    try:
        return status, json.loads(body)
    except (ValueError, UnicodeDecodeError):
        return status, None


def track_list(payload: object | None) -> list[object]:
    """
    Extract a track list from a letter payload served as either a dict or a bare list.

    Args:
        payload (object | None): Decoded JSON payload.

    Returns:
        list[object]: Track entries, empty when the payload had no usable shape.
    """
    if isinstance(payload, dict):
        tracks = payload.get("tracks", [])
        return tracks if isinstance(tracks, list) else []
    return payload if isinstance(payload, list) else []


def main() -> int:
    """
    Run production smoke checks and print PASS/FAIL lines.

    Returns:
        int: 0 when every check passed, 1 otherwise.
    """
    results: list[tuple[str, int, str, bool]] = []

    index_status, index_html = fetch("/index.html")
    index_text = index_html.decode("utf-8", "replace")
    main_chunk = find_app_bundle(index_text)
    main_css = find_app_css(index_text)
    results.append(
        ("index.html app bundle", index_status, f"bundle={main_chunk}", main_chunk is not None)
    )

    for path in ["/k", "/c", "/num", "/zz"]:
        status, body = fetch(path)
        has_root = b'id="root"' in body
        has_bundle = main_chunk is not None and main_chunk.encode() in body
        results.append(
            (
                f"deep {path}",
                status,
                f"root={has_root} bundle={has_bundle}",
                has_root and has_bundle and status in (200, 404),
            )
        )

    for path in [
        "/bootstrap.min.css",
        "/static/audio.css",
    ]:
        status, body = fetch(path)
        results.append(
            (f"css {path}", status, f"{len(body)} bytes", status == 200 and len(body) > 0)
        )

    if main_css:
        status, app_css = fetch(main_css)
        css_label = f"css {main_css}"
    else:
        status, app_css = fetch("/static/css/App.css")
        css_label = "css /static/css/App.css"
        for path in [
            "/static/css/songlist.css",
            "/static/css/audioplayer.css",
            "/static/css/App.css",
        ]:
            legacy_status, legacy_body = fetch(path)
            results.append(
                (
                    f"css {path}",
                    legacy_status,
                    f"{len(legacy_body)} bytes",
                    legacy_status == 200 and len(legacy_body) > 0,
                )
            )
    css_needles = [
        b".album-group",
        b".songlist--album-tracks",
        b"bottom-playback",
        b"has-bottom-playback",
    ]
    found_css = [needle.decode() for needle in css_needles if needle in app_css]
    results.append((f"App styles album/bar rules ({css_label})", status, f"found={found_css}", len(found_css) >= 3))

    status, letter_c = fetch_json("/json/Csongs.json")
    albums = letter_c.get("albums", []) if isinstance(letter_c, dict) else []
    tracks = letter_c.get("tracks", []) if isinstance(letter_c, dict) else []
    sample = albums[0] if albums else {}
    km17 = [album for album in albums if "Knowledge Magazine 17" in json.dumps(album)]
    km11 = [album for album in albums if "Knowledge Magazine 11" in json.dumps(album)]
    results.append(
        (
            "Csongs shape",
            status,
            f"albums={len(albums)} tracks={len(tracks)} keys={list(sample.keys())}",
            isinstance(letter_c, dict) and "albums" in letter_c and "tracks" in letter_c,
        )
    )
    results.append(
        (
            "KM17 album present",
            status,
            f"count={len(km17)} children={len(km17[0].get('tracks', [])) if km17 else 0}",
            len(km17) == 1 and len(km17[0].get("tracks", [])) == 11,
        )
    )
    results.append(
        (
            "KM11 single-track album",
            status,
            f"count={len(km11)} children={len(km11[0].get('tracks', [])) if km11 else 0}",
            len(km11) == 1 and len(km11[0].get("tracks", [])) == 1,
        )
    )

    status, index_payload = fetch_json("/json/index.json")
    index = index_payload if isinstance(index_payload, list) else []
    results.append(
        (
            "index.json",
            status,
            f"entries={len(index)}",
            len(index) > 4000,
        )
    )
    d_count = len([entry for entry in index if entry.get("letter") == "D"])
    k_count = len([entry for entry in index if entry.get("letter") == "K"])
    results.append(
        ("index has D+K", status, f"D={d_count} K={k_count}", d_count > 0 and k_count > 0)
    )

    space_path = next(
        (
            entry.get("path", "")
            for entry in index
            if " " in entry.get("path", "")
            and entry.get("path", "").lower().endswith((".mp3", ".m4a"))
        ),
        None,
    )
    if space_path:
        encoded = "/".join(urllib.parse.quote(segment) for segment in space_path.split("/"))
        media_status, _ = fetch("/" + encoded, headers={"Range": "bytes=0-1"})
        results.append(
            ("media Range space key", media_status, space_path[:80], media_status in (200, 206))
        )
    else:
        results.append(("media Range space key", 0, "no space path found", False))

    awol = next(
        (
            entry.get("path", "")
            for entry in index
            if "AWOL" in entry.get("path", "") and "'" in entry.get("path", "")
        ),
        None,
    )
    if awol:
        encoded = "/".join(urllib.parse.quote(segment) for segment in awol.split("/"))
        media_status, _ = fetch("/" + encoded, headers={"Range": "bytes=0-1"})
        results.append(("media Range AWOL", media_status, awol[:90], media_status in (200, 206)))

    status, main_js = fetch(main_chunk) if main_chunk else (0, b"")
    js_needles = [
        b"bottom-playback",
        b"album-group",
        b"positionSeconds",
        b"songlist--album-tracks",
    ]
    found_js = [needle.decode() for needle in js_needles if needle in main_js]
    results.append(("app.js features", status, f"found={found_js}", len(found_js) >= 3))

    status, num = fetch_json("/json/NUMsongs.json")
    num_tracks = track_list(num)
    results.append(("NUMsongs", status, f"tracks={len(num_tracks)}", len(num_tracks) > 0))

    status, letter_k = fetch_json("/json/Ksongs.json")
    junk = [path for path in track_list(letter_k) if isinstance(path, str) and path.endswith("/")]
    results.append(
        (
            "K no directory placeholders",
            status,
            f"junk={len(junk)}",
            status == 200 and len(junk) == 0,
        )
    )

    print(f"SMOKE RESULTS ({BASE})")
    for name, status, detail, ok in results:
        print(f"{'PASS' if ok else 'FAIL'} | {name} | HTTP {status} | {detail}")
    all_ok = all(ok for _, _, _, ok in results)
    print("ALL_PASS" if all_ok else "SOME_FAIL")

    print("\nKnowledge Magazine albums on /c:")
    for album in albums:
        if "Knowledge Magazine" in json.dumps(album):
            print(
                f"  {len(album.get('tracks', [])):2d} tracks | {album.get('id') or album.get('path')}"
            )

    return 0 if all_ok else 1


if __name__ == "__main__":
    sys.exit(main())
