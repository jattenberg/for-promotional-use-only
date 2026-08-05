"""
Unit tests for the product-event ingest Lambda handler.
"""

from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

import pytest

HANDLER_PATH = (
    Path(__file__).resolve().parents[1] / "infra" / "phase3" / "lambda" / "ingest" / "handler.py"
)


def load_handler():
    """Load ingest handler.py as a module without packaging it."""
    spec = importlib.util.spec_from_file_location("promo_events_ingest", HANDLER_PATH)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


ingest = load_handler()


class TestNormalizeEvent:
    """
    Tests for normalize_event validation.
    """

    def test_accepts_valid_event(self) -> None:
        """
        Keep a well-formed play_started event.
        """
        raw = {
            "ts": "2026-08-05T12:00:00.000Z",
            "event": "play_started",
            "session_id": "11111111-1111-4111-8111-111111111111",
            "path": "/k",
            "props": {"song_path": "mixtape/a.mp3"},
        }
        out = ingest.normalize_event(raw, "2026-08-05T12:00:01.000Z")
        assert out is not None
        assert out["event"] == "play_started"
        assert out["props"]["song_path"] == "mixtape/a.mp3"

    def test_rejects_unknown_event(self) -> None:
        """
        Drop event names outside the allow-list.
        """
        raw = {
            "event": "hack",
            "session_id": "11111111-1111-4111-8111-111111111111",
            "path": "/",
        }
        assert ingest.normalize_event(raw, "2026-08-05T12:00:01.000Z") is None


class TestParseBatch:
    """
    Tests for parse_batch body parsing.
    """

    def test_parses_wrapped_events(self) -> None:
        """
        Accept {"events": [...]} payloads from the SPA client.
        """
        body = json.dumps(
            {
                "events": [
                    {
                        "ts": "2026-08-05T12:00:00.000Z",
                        "event": "page_view",
                        "session_id": "11111111-1111-4111-8111-111111111111",
                        "path": "/k",
                        "props": {},
                    }
                ]
            }
        )
        events = ingest.parse_batch(body)
        assert len(events) == 1
        assert events[0]["event"] == "page_view"

    def test_rejects_oversized_batch(self) -> None:
        """
        Reject batches larger than MAX_EVENTS.
        """
        item = {
            "event": "page_view",
            "session_id": "11111111-1111-4111-8111-111111111111",
            "path": "/",
        }
        body = json.dumps([item] * (ingest.MAX_EVENTS + 1))
        with pytest.raises(ValueError, match="too many"):
            ingest.parse_batch(body)


class TestHandlerAuth:
    """
    Tests for handler HTTP auth and method checks.
    """

    def test_unauthorized_without_key(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """
        Return 401 when X-Promo-Key does not match.
        """
        monkeypatch.setenv("PROMO_EVENTS_KEY", "secret")
        monkeypatch.setenv("EVENTS_BUCKET", "bucket")
        response = ingest.handler(
            {
                "requestContext": {"http": {"method": "POST"}},
                "headers": {"x-promo-key": "wrong"},
                "body": "[]",
            },
            None,
        )
        assert response["statusCode"] == 401
