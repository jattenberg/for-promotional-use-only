#!/usr/bin/env python3
"""Stdlib assertions for letter sitemap locs (no pytest / no AWS)."""

import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from promo_catalog.catalog import (  # noqa: E402
    SITE_ORIGIN,
    build_sitemap_xml,
    letter_to_route,
    sitemap_locs,
)


def main():
    locs = sitemap_locs()
    assert locs[0] == f"{SITE_ORIGIN}/"
    assert f"{SITE_ORIGIN}/a" in locs
    assert f"{SITE_ORIGIN}/z" in locs
    assert f"{SITE_ORIGIN}/k" in locs
    assert f"{SITE_ORIGIN}/num" in locs
    assert len(locs) == 28, f"expected home + 26 letters + num, got {len(locs)}"
    assert all(loc.startswith(SITE_ORIGIN) for loc in locs)
    assert not any("/mixtape/" in loc for loc in locs)
    assert letter_to_route("NUM") == "num"
    assert letter_to_route("K") == "k"

    xml = build_sitemap_xml()
    assert xml.startswith('<?xml version="1.0"')
    assert "<loc>https://for-promotional-use-only.com/k</loc>" in xml
    assert "<loc>https://for-promotional-use-only.com/num</loc>" in xml
    assert xml.count("<url>") == 28
    assert "mixtape/" not in xml

    print("sitemap assertions passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
