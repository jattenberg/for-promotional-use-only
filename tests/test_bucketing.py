#!/usr/bin/env python3
"""Stdlib assertions for catalog bucketing (no pytest / no AWS)."""

import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from for_promotional_import import build_lists, is_audio_key, letter_for_key


def load_fixture_keys():
    path = os.path.join(os.path.dirname(__file__), "fixtures", "s3_keys.txt")
    with open(path) as f:
        return [line.strip() for line in f if line.strip()]


def main():
    keys = load_fixture_keys()

    assert (
        letter_for_key(
            "mixtape/AWOL '93/Fabio - AWOL 'Live In London' March 1993 1.mp3"
        )
        == "A"
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
    assert (
        "mixtape/AWOL '93/Fabio - AWOL 'Live In London' March 1993 1.mp3"
        in lists["A"]
    )
    assert all(
        letter in set(list("ABCDEFGHIJKLMNOPQRSTUVWXYZ") + ["NUM"])
        for letter in lists
    )

    print("ok: %d fixture keys → %d audio" % (len(keys), len(all_paths)))


if __name__ == "__main__":
    main()
