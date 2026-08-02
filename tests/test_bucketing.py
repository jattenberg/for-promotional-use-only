#!/usr/bin/env python3
"""Stdlib assertions for catalog bucketing and album detection (no pytest / no AWS)."""

import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from for_promotional_import import (
    build_letter_payloads,
    build_lists,
    detect_albums,
    is_audio_key,
    letter_for_key,
    should_collapse_parent,
)


def load_fixture_keys():
    path = os.path.join(os.path.dirname(__file__), "fixtures", "s3_keys.txt")
    with open(path) as f:
        return [line.strip() for line in f if line.strip()]


def main():
    keys = load_fixture_keys()

    assert (
        letter_for_key("mixtape/AWOL '93/Fabio - AWOL 'Live In London' March 1993 1.mp3") == "A"
    ), "nested path buckets on subdirectory"
    assert letter_for_key("mixtape/2 bad mice.mp3") == "NUM"
    assert letter_for_key("mixtape/Some Track.MP3") == "S"
    assert letter_for_key("mixtape/a track with spaces.mp3") == "A"

    assert is_audio_key("mixtape/Some Track.MP3")
    assert not is_audio_key("mixtape/not-audio.jpg")
    assert not is_audio_key("mixtape/AWOL '93/")

    lists = build_lists(keys)
    all_paths = [p for paths in lists.values() for p in paths]
    assert "mixtape/not-audio.jpg" not in all_paths
    assert "mixtape/AWOL '93/" not in all_paths
    assert "mixtape/http:/" not in all_paths
    assert "mixtape/Some Track.MP3" in all_paths
    assert "mixtape/2 bad mice.mp3" in lists["NUM"]
    assert "mixtape/AWOL '93/Fabio - AWOL 'Live In London' March 1993 1.mp3" in lists["A"]
    assert all(letter in set(list("ABCDEFGHIJKLMNOPQRSTUVWXYZ") + ["NUM"]) for letter in lists)

    cover_album_id = "CoverCDs/Knowledge Magazine 33 Phuturistic Bluez"
    cover_tracks = [
        "mixtape/CoverCDs/Knowledge Magazine 33 Phuturistic Bluez/01 Regret.mp3",
        "mixtape/CoverCDs/Knowledge Magazine 33 Phuturistic Bluez/02 Next Track.mp3",
        "mixtape/CoverCDs/Knowledge Magazine 33 Phuturistic Bluez/03 Final Track.mp3",
    ]
    assert should_collapse_parent(cover_album_id, cover_tracks)
    assert should_collapse_parent(
        "CoverCDs/Knowledge Magazine 11 Substance",
        ["mixtape/CoverCDs/Knowledge Magazine 11 Substance/01 Substance Mix.mp3"],
    )

    hysteria_tracks = [
        "mixtape/Hysteria 8/Andy C - Side B.mp3",
        "mixtape/Hysteria 8/Brockie - Side A.mp3",
        "mixtape/Hysteria 8/Ellis Dee - Side A.mp3",
    ]
    assert not should_collapse_parent("Hysteria 8", hysteria_tracks)

    brockie_tracks = [
        "mixtape/Amazon - Urban Jungle 95/brockie/Track01.mp3",
        "mixtape/Amazon - Urban Jungle 95/brockie/Track02.mp3",
        "mixtape/Amazon - Urban Jungle 95/brockie/Track03.mp3",
    ]
    assert not should_collapse_parent("Amazon - Urban Jungle 95/brockie", brockie_tracks)

    albums = detect_albums(keys)
    album_ids = {album["id"] for album in albums}
    assert cover_album_id in album_ids
    assert "Hysteria 8" not in album_ids
    assert "Amazon - Urban Jungle 95/brockie" not in album_ids

    cover_album = next(album for album in albums if album["id"] == cover_album_id)
    assert cover_album["tracks"] == cover_tracks
    assert cover_album["title"] == "Knowledge Magazine 33 Phuturistic Bluez"

    payloads = build_letter_payloads(keys)
    c_payload = payloads["C"]
    assert "tracks" in c_payload
    assert "albums" in c_payload
    assert len(c_payload["albums"]) == 1
    assert c_payload["albums"][0]["id"] == cover_album_id
    assert set(c_payload["tracks"]) >= set(cover_tracks)

    print("ok: %d fixture keys → %d audio, %d albums" % (len(keys), len(all_paths), len(albums)))


if __name__ == "__main__":
    main()
