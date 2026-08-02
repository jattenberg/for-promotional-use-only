#!/usr/bin/env python3
"""Regenerate letter JSON payloads from existing flat public/json/*songs.json files."""

import glob
import importlib.util
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODULE_PATH = os.path.join(ROOT, "for-promotional-use-only", "catalog.py")

spec = importlib.util.spec_from_file_location("catalog", MODULE_PATH)
catalog = importlib.util.module_from_spec(spec)
spec.loader.exec_module(catalog)

JSON_DIR = os.path.join(ROOT, "public", "json")


def load_existing_keys():
    keys = []
    for path in sorted(glob.glob(os.path.join(JSON_DIR, "*songs.json"))):
        with open(path) as handle:
            data = json.load(handle)
        if isinstance(data, list):
            keys.extend(data)
        else:
            keys.extend(data.get("tracks", []))
    return keys


def main():
    keys = load_existing_keys()
    payloads = catalog.build_letter_payloads(keys)
    index = [
        {"path": path, "letter": letter}
        for letter, payload in payloads.items()
        for path in payload["tracks"]
    ]

    for letter, payload in payloads.items():
        out_path = os.path.join(JSON_DIR, "%ssongs.json" % letter)
        with open(out_path, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2)
            handle.write("\n")

    with open(os.path.join(JSON_DIR, "index.json"), "w", encoding="utf-8") as handle:
        json.dump(index, handle, indent=2)
        handle.write("\n")

    album_count = sum(len(payload["albums"]) for payload in payloads.values())
    print(
        "regenerated %d letter files, %d tracks, %d albums"
        % (len(payloads), len(index), album_count)
    )


if __name__ == "__main__":
    main()
