import os
import re
import string

LETTERS = string.ascii_uppercase
AUDIO_EXTENSIONS = (".mp3", ".m4a", ".mp4")
MIXTAPE_PREFIX = "mixtape/"
SITE_ORIGIN = "https://for-promotional-use-only.com"
SITEMAP_PATH = "public/sitemap.xml"

NUMBERED_TRACK_RE = re.compile(
    r"^(?:\d{1,2}-\d{2}\s|\d{2}\s|Track\d{2})",
    re.IGNORECASE,
)
COMMERCIAL_NUMBERED_RE = re.compile(
    r"^(?:\d{1,2}-\d{2}\s|\d{2}\s)",
    re.IGNORECASE,
)


def is_audio_key(key):
    lower = key.lower()
    return any(lower.endswith(ext) for ext in AUDIO_EXTENSIONS)


def letter_for_key(key):
    remainder = key.removeprefix(MIXTAPE_PREFIX)
    if not remainder:
        return "NUM"
    first = remainder[0].upper()
    return first if first in LETTERS else "NUM"


def parent_dir_for_key(key):
    """
    Return the mixtape-relative parent directory for a nested key.

    Flat keys (mixtape/file.mp3) return an empty string.
    """
    if not key.startswith(MIXTAPE_PREFIX):
        return ""
    remainder = key[len(MIXTAPE_PREFIX) :]
    if "/" not in remainder:
        return ""
    return remainder.rsplit("/", 1)[0]


def basename_for_key(key):
    return key.rsplit("/", 1)[-1]


def group_by_parent_dir(keys):
    """
    Group audio keys by their leaf directory under mixtape/.

    Returns:
        dict[str, list[str]]: parent_dir -> sorted track paths
    """
    groups = {}
    for key in keys:
        if not is_audio_key(key):
            continue
        parent = parent_dir_for_key(key)
        groups[parent] = groups.get(parent, []) + [key]
    return {parent: sorted(paths) for parent, paths in groups.items()}


def is_numbered_track(basename):
    return NUMBERED_TRACK_RE.match(basename) is not None


def is_commercial_numbered_track(basename):
    return COMMERCIAL_NUMBERED_RE.match(basename) is not None


def artist_like_prefix(basename):
    name = os.path.splitext(basename)[0]
    stripped = COMMERCIAL_NUMBERED_RE.sub("", name).strip()
    if stripped:
        name = stripped
    lowered = name.lower()
    for sep in (" - ", " @ ", " live"):
        idx = lowered.find(sep)
        if idx > 0:
            return name[:idx].strip()
    return name.strip()


def looks_like_event_anthology(basenames):
    prefixes = {artist_like_prefix(name) for name in basenames}
    prefixes.discard("")
    return len(prefixes) >= 3


def album_title_from_id(album_id):
    if "/" in album_id:
        return album_id.rsplit("/", 1)[-1]
    return album_id


def should_collapse_parent(parent_dir, track_paths):
    if not track_paths:
        return False

    basenames = [basename_for_key(path) for path in track_paths]
    in_cover_cds = "CoverCDs/" in parent_dir or parent_dir.startswith("CoverCDs")

    if in_cover_cds:
        return True

    if len(track_paths) < 2:
        return False

    commercial_matches = sum(1 for name in basenames if is_commercial_numbered_track(name))
    if commercial_matches / len(basenames) < 0.7:
        return False

    if looks_like_event_anthology(basenames):
        return False

    return True


def detect_albums(keys):
    """
    Detect high-confidence album groups among nested catalog keys.

    Returns:
        list[dict]: Each dict has id, title, and tracks (ordered paths).
    """
    groups = group_by_parent_dir(keys)
    albums = []

    for parent_dir, track_paths in groups.items():
        if not parent_dir:
            continue
        if not should_collapse_parent(parent_dir, track_paths):
            continue
        albums.append(
            {
                "id": parent_dir,
                "title": album_title_from_id(parent_dir),
                "tracks": track_paths,
            }
        )

    return sorted(albums, key=lambda album: album["title"].lower())


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


def build_letter_payloads(keys):
    """
    Build per-letter catalog payloads with flat tracks and detected albums.

    Returns:
        dict[str, dict]: letter -> {tracks, albums}
    """
    audio_keys = [key for key in keys if is_audio_key(key)]
    albums = detect_albums(audio_keys)
    lists = build_lists(audio_keys)

    albums_by_letter = {letter: [] for letter in lists}
    for album in albums:
        letter = letter_for_key(album["tracks"][0])
        albums_by_letter[letter].append(album)

    payloads = {}
    for letter, tracks in lists.items():
        letter_albums = sorted(
            albums_by_letter.get(letter, []),
            key=lambda album: album["title"].lower(),
        )
        payloads[letter] = {
            "tracks": tracks,
            "albums": letter_albums,
        }
    return payloads


def letter_to_route(letter):
    """
    Map a catalog letter key to its public URL path segment.

    Args:
        letter (str): A–Z or NUM.

    Returns:
        str: Lowercase letter or ``num``.
    """
    if letter == "NUM":
        return "num"
    return str(letter).lower()


def sitemap_locs(origin=SITE_ORIGIN):
    """
    Absolute URLs for the letter sitemap (home + A–Z + /num only).

    Args:
        origin (str, default: SITE_ORIGIN): Site origin with no trailing slash.

    Returns:
        list[str]: At most 28 absolute URLs; never includes track paths.
    """
    base = origin.rstrip("/")
    letter_paths = [f"/{letter_to_route(letter)}" for letter in LETTERS]
    return [f"{base}/", *[f"{base}{path}" for path in letter_paths], f"{base}/num"]


def build_sitemap_xml(origin=SITE_ORIGIN):
    """
    Render a urlset XML document for letter browse routes.

    Args:
        origin (str, default: SITE_ORIGIN): Site origin with no trailing slash.

    Returns:
        str: Sitemap XML including a trailing newline.
    """
    urls = "\n".join(
        f"  <url>\n    <loc>{loc}</loc>\n  </url>" for loc in sitemap_locs(origin)
    )
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"{urls}\n"
        "</urlset>\n"
    )


def write_sitemap(path=SITEMAP_PATH, origin=SITE_ORIGIN):
    """
    Write ``sitemap.xml`` beside the public catalog assets.

    Args:
        path (str, default: SITEMAP_PATH): Destination filesystem path.
        origin (str, default: SITE_ORIGIN): Absolute site origin for <loc> values.

    Returns:
        str: Path written.
    """
    parent = os.path.dirname(path)
    if parent:
        os.makedirs(parent, exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(build_sitemap_xml(origin))
    return path
