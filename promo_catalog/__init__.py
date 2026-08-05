"""Catalog bucketing and album detection for for-promotional-use-only.com."""

from promo_catalog.catalog import (
    build_letter_payloads,
    build_lists,
    detect_albums,
    is_audio_key,
    letter_for_key,
    should_collapse_parent,
)

__all__ = [
    "build_letter_payloads",
    "build_lists",
    "detect_albums",
    "is_audio_key",
    "letter_for_key",
    "should_collapse_parent",
]
