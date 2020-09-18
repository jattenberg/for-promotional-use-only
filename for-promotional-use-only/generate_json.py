import boto3
import os
import sys
import logging
import string
import orjson

BUCKET = "for-promotional-use-only.com"
FOLDER = "mixtape/"
s3_client = boto3.client('s3')
OUT_DIR = "build/json/"
LETTERS = string.ascii_uppercase

def get_all_s3_objects(s3, **base_kwargs):
    """
    boto3 sucks.
    from https://stackoverflow.com/questions/54314563/how-to-get-more-than-1000-objects-from-s3-by-using-list-objects-v2/54314628
    """
    continuation_token = None
    while True:
        list_kwargs = dict(MaxKeys=1000, **base_kwargs)
        if continuation_token:
            list_kwargs['ContinuationToken'] = continuation_token
        response = s3.list_objects_v2(**list_kwargs)
        yield from response.get('Contents', [])
        if not response.get('IsTruncated'):  # At the end of the list?
            break
        continuation_token = response.get('NextContinuationToken')

def song_iterator(bucket=BUCKET,
                  folder=FOLDER):

    for file in get_all_s3_objects(s3_client, Bucket=bucket, Prefix=folder):
        if file['Key'] != folder:
            yield file

def pretty_print_json(path, filename, data):
    full_path = os.path.join(path, filename)
    logging.info("writing to %s" % full_path)
    with open(full_path, 'wb') as f:
        f.write(orjson.dumps(
            data,
            option=orjson.OPT_INDENT_2
        ))

def main():
    logging.basicConfig(format='%(asctime)s %(message)s', stream=sys.stdout, level="INFO")

    lists = {'NUM': []}
    for letter in LETTERS:
        lists[letter] = []

    for song in song_iterator():
        name = song['Key']
        if not (name.endswith("mp4") or name.endswith("m4a")):
            pass

        first = name.replace("mixtape/", "")[0].upper()
        letter = first if first in LETTERS else "NUM"

        lists[letter] = lists[letter] + [name]

    for key, value in lists.items():
        pretty_print_json(OUT_DIR, "%ssongs.json" % key, value)



if __name__ == "__main__":
    main()
