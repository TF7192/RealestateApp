"""
Tests for ai/whisper/app.py.

Never touches the real model — we flip ESTIA_WHISPER_SKIP_LOAD before
import and stub `state.transcribe_fn`. Runs in <1s.
"""

from __future__ import annotations

import io
import os
import sys
import pathlib
import unittest

# Make `ai/whisper/app.py` importable without installing anything.
REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT / "ai" / "whisper"))

# Must be set BEFORE importing app so the lifespan startup hook skips
# the real model download.
os.environ["ESTIA_WHISPER_SKIP_LOAD"] = "1"
# Keep the 30 MB cap — overriding would defeat the 413 test.

from fastapi.testclient import TestClient  # noqa: E402

import app as whisper_app  # noqa: E402


def _client() -> TestClient:
    # TestClient context-manages lifespan, which is what we want —
    # lifespan sees ESTIA_WHISPER_SKIP_LOAD=1 and skips loading.
    return TestClient(whisper_app.app)


class HealthTests(unittest.TestCase):
    def test_health_503_while_loading(self) -> None:
        whisper_app.state.ready = False
        with _client() as c:
            r = c.get("/health")
        self.assertEqual(r.status_code, 503)
        body = r.json()
        self.assertFalse(body["ok"])
        self.assertIn("model", body)

    def test_health_200_when_ready(self) -> None:
        whisper_app.state.ready = True
        whisper_app.state.model_id = "ivrit-ai/whisper-large-v3-turbo"
        with _client() as c:
            r = c.get("/health")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(
            r.json(),
            {"ok": True, "model": "ivrit-ai/whisper-large-v3-turbo"},
        )


class TranscribeTests(unittest.TestCase):
    def setUp(self) -> None:
        whisper_app.state.ready = True
        whisper_app.state.model_id = "ivrit-ai/whisper-large-v3-turbo-ct2"
        self._orig_fn = whisper_app.state.transcribe_fn

    def tearDown(self) -> None:
        whisper_app.state.transcribe_fn = self._orig_fn

    def test_transcribe_happy_path(self) -> None:
        calls: list[tuple[str, str, bool]] = []

        def stub(path: str, language: str, vad: bool) -> tuple[str, float]:
            calls.append((path, language, vad))
            # sanity: the route should have written our bytes to disk
            with open(path, "rb") as f:
                assert f.read() == b"fake-audio-bytes"
            return ("שלום עולם", 1.23)

        whisper_app.state.transcribe_fn = stub

        with _client() as c:
            r = c.post(
                "/transcribe",
                files={"audio": ("clip.webm", b"fake-audio-bytes", "audio/webm")},
            )
        self.assertEqual(r.status_code, 200)
        self.assertEqual(
            r.json(),
            {"text": "שלום עולם", "language": "he", "duration_sec": 1.23},
        )
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0][1], "he")
        self.assertTrue(calls[0][2])  # vad default True

    def test_transcribe_respects_query_params(self) -> None:
        seen: dict[str, object] = {}

        def stub(path: str, language: str, vad: bool) -> tuple[str, float]:
            seen["language"] = language
            seen["vad"] = vad
            return ("", 0.0)

        whisper_app.state.transcribe_fn = stub

        with _client() as c:
            r = c.post(
                "/transcribe?language=en&vad=false",
                files={"audio": ("clip.wav", b"x", "audio/wav")},
            )
        self.assertEqual(r.status_code, 200)
        self.assertEqual(seen["language"], "en")
        self.assertFalse(seen["vad"])

    def test_transcribe_413_when_payload_too_large(self) -> None:
        # Force the model ready so we hit the size check, not the 503.
        whisper_app.state.ready = True

        # 30 MB + 1 KB. Use a BufferedReader so httpx/TestClient streams
        # rather than buffering the whole blob in memory.
        size = whisper_app.MAX_BYTES + 1024
        big = io.BytesIO(b"\0" * size)

        # The transcribe_fn must NOT be called.
        def boom(*args, **kwargs):
            raise AssertionError("transcribe_fn should not run for oversize payload")

        whisper_app.state.transcribe_fn = boom

        with _client() as c:
            r = c.post(
                "/transcribe",
                files={"audio": ("big.webm", big, "audio/webm")},
            )
        self.assertEqual(r.status_code, 413)
        self.assertIn("exceeds", r.json()["detail"])

    def test_transcribe_503_when_not_ready(self) -> None:
        whisper_app.state.ready = False
        with _client() as c:
            r = c.post(
                "/transcribe",
                files={"audio": ("clip.webm", b"x", "audio/webm")},
            )
        self.assertEqual(r.status_code, 503)


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
