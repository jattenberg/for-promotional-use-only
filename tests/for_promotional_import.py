"""Import catalog helpers despite hyphenated package directory name."""

import importlib.util
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODULE_PATH = os.path.join(ROOT, "for-promotional-use-only", "catalog.py")

spec = importlib.util.spec_from_file_location("catalog", MODULE_PATH)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

letter_for_key = mod.letter_for_key
build_lists = mod.build_lists
is_audio_key = mod.is_audio_key
