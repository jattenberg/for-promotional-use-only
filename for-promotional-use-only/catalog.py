import string

LETTERS = string.ascii_uppercase
AUDIO_EXTENSIONS = (".mp3", ".m4a", ".mp4")


def is_audio_key(key):
    lower = key.lower()
    return any(lower.endswith(ext) for ext in AUDIO_EXTENSIONS)


def letter_for_key(key):
    remainder = key[len("mixtape/") :] if key.startswith("mixtape/") else key
    if not remainder:
        return "NUM"
    first = remainder[0].upper()
    return first if first in LETTERS else "NUM"


def build_lists(keys):
    lists = {"NUM": []}
    for letter in LETTERS:
        lists[letter] = []

    for name in keys:
        if not is_audio_key(name):
            continue
        letter = letter_for_key(name)
        lists[letter] = lists[letter] + [name]

    return lists
