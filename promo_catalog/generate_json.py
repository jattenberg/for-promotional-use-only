import logging
import os
import sys

import boto3
import orjson

from promo_catalog.catalog import (
    LETTERS,
    build_letter_payloads,
    build_lists,
    detect_albums,
    is_audio_key,
    letter_for_key,
)

BUCKET = "for-promotional-use-only.com"
FOLDER = "mixtape/"
OUT_DIR = "public/json/"


def get_all_s3_objects(s3, **base_kwargs):
    """
    boto3 sucks.
    from https://stackoverflow.com/questions/54314563/how-to-get-more-than-1000-objects-from-s3-by-using-list-objects-v2/54314628
    """
    continuation_token = None
    while True:
        list_kwargs = dict(MaxKeys=1000, **base_kwargs)
        if continuation_token:
            list_kwargs["ContinuationToken"] = continuation_token
        response = s3.list_objects_v2(**list_kwargs)
        yield from response.get("Contents", [])
        if not response.get("IsTruncated"):  # At the end of the list?
            break
        continuation_token = response.get("NextContinuationToken")


def song_iterator(bucket=BUCKET, folder=FOLDER):
    s3_client = boto3.client("s3")
    for file in get_all_s3_objects(s3_client, Bucket=bucket, Prefix=folder):
        if file["Key"] != folder:
            yield file


def pretty_print_json(path, filename, data):
    full_path = os.path.join(path, filename)
    logging.info("writing to %s" % full_path)
    with open(full_path, "wb") as f:
        f.write(orjson.dumps(data, option=orjson.OPT_INDENT_2))


def main():
    logging.basicConfig(format="%(asctime)s %(message)s", stream=sys.stdout, level="INFO")

    os.makedirs(OUT_DIR, exist_ok=True)

    keys = [song["Key"] for song in song_iterator()]
    payloads = build_letter_payloads(keys)

    index = [
        {"path": path, "letter": letter}
        for letter, payload in payloads.items()
        for path in payload["tracks"]
    ]

    for letter, payload in payloads.items():
        pretty_print_json(OUT_DIR, "%ssongs.json" % letter, payload)

    pretty_print_json(OUT_DIR, "index.json", index)
    logging.info(
        "wrote %d letter files and index.json (%d entries, %d albums)",
        len(payloads),
        len(index),
        sum(len(payload["albums"]) for payload in payloads.values()),
    )


# Re-export pure helpers for callers that imported them from this module.
__all__ = [
    "LETTERS",
    "build_letter_payloads",
    "build_lists",
    "detect_albums",
    "is_audio_key",
    "letter_for_key",
    "main",
    "song_iterator",
]


if __name__ == "__main__":
    main()
