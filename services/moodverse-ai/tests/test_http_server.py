import http.client
import json
import sys
import threading
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path


SERVICE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVICE_ROOT))

from moodverse_ai.http_server import create_server  # noqa: E402
from moodverse_ai.service import MusicAIService  # noqa: E402
from test_service import composition_payload, embed_payload, rank_payload, valid_visual  # noqa: E402


class RoutingRuntime:
    text_model_name = "qwen3.5-local"
    text_model_version = "4b-mlx"

    def generate_json(self, prompt):
        document = json.loads(prompt)
        data = document["untrusted_input"]
        if "candidates" in data:
            return json.dumps({
                "ranking": [
                    {"planetId": item["planetId"], "score": 0.7}
                    for item in data["candidates"]
                ]
            })
        return json.dumps(valid_visual())

    def embed(self, texts):
        return "qwen3-embedding-local", "0.6b-mlx", [[float(index + 1)] + [0.0] * 7 for index, _ in enumerate(texts)]


class BrokenService:
    def compose(self, payload):
        raise RuntimeError("private prompt and stack trace must not leave this process")


class ObservedRuntime(RoutingRuntime):
    def __init__(self):
        self.active = 0
        self.max_active = 0
        self.guard = threading.Lock()

    def generate_json(self, prompt):
        with self.guard:
            self.active += 1
            self.max_active = max(self.max_active, self.active)
        try:
            time.sleep(0.08)
            return json.dumps(valid_visual())
        finally:
            with self.guard:
                self.active -= 1


class LocalGatewayHTTPTests(unittest.TestCase):
    def setUp(self):
        self.server = create_server(MusicAIService(RoutingRuntime()), token="test-gateway-secret", host="127.0.0.1", port=0)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.host, self.port = self.server.server_address[:2]

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)

    def request(self, method, path, payload=None, token="test-gateway-secret", headers=None):
        request_headers = {"Accept": "application/json"}
        body = None
        if payload is not None:
            request_headers["Content-Type"] = "application/json"
            body = json.dumps(payload).encode("utf-8") if not isinstance(payload, bytes) else payload
        if token is not None:
            request_headers["Authorization"] = "Bearer " + token
        if headers:
            request_headers.update(headers)
        connection = http.client.HTTPConnection(self.host, self.port, timeout=2)
        connection.request(method, path, body=body, headers=request_headers)
        response = connection.getresponse()
        response_body = response.read()
        result = response.status, json.loads(response_body) if response_body else None
        connection.close()
        return result

    def test_health_check_reports_readiness_without_returning_the_gateway_secret(self):
        status, body = self.request("GET", "/healthz", token=None)

        self.assertEqual(status, 200)
        self.assertEqual(body, {"status": "ready"})
        self.assertNotIn("test-gateway-secret", json.dumps(body))

    def test_all_three_ai_routes_return_their_validated_contracts(self):
        compose_status, composed = self.request("POST", "/v1/planet/compose", composition_payload())
        rank_status, ranked = self.request("POST", "/v1/song-portal/rank", rank_payload())
        embed_status, embedded = self.request("POST", "/v1/embed", embed_payload())

        self.assertEqual(compose_status, 200)
        self.assertEqual(composed["output"]["schemaVersion"], 2)
        self.assertEqual(composed["output"]["terrainFeatures"], {
            "mountainRanges": 4, "basins": 2, "canyons": 1, "escarpments": 1,
        })
        self.assertEqual(rank_status, 200)
        self.assertEqual(ranked["ranking"], [
            {"planetId": "planet-a", "score": 0.7, "reasonCode": "shared_song_selection"},
            {"planetId": "planet-b", "score": 0.7, "reasonCode": "shared_public_moment"},
        ])
        self.assertEqual(embed_status, 200)
        self.assertEqual([item["id"] for item in embedded["embeddings"]], ["query", "planet:planet-a"])

    def test_post_routes_require_the_origin_bearer(self):
        missing_status, missing = self.request("POST", "/v1/embed", embed_payload(), token=None)
        wrong_status, wrong = self.request("POST", "/v1/embed", embed_payload(), token="wrong")
        non_ascii_status, non_ascii = self.request("POST", "/v1/embed", embed_payload(), token="wrongé")

        self.assertEqual((missing_status, missing), (401, {"error": "UNAUTHORIZED"}))
        self.assertEqual((wrong_status, wrong), (401, {"error": "UNAUTHORIZED"}))
        self.assertEqual((non_ascii_status, non_ascii), (401, {"error": "UNAUTHORIZED"}))

    def test_invalid_json_is_rejected_without_invoking_a_route(self):
        status, body = self.request(
            "POST", "/v1/embed", b"{not-json",
            headers={"Content-Length": "9", "Content-Type": "application/json"},
        )

        self.assertEqual((status, body), (400, {"error": "INVALID_JSON"}))

    def test_oversized_content_length_is_rejected_before_body_parsing(self):
        status, body = self.request(
            "POST", "/v1/embed", b"{}",
            headers={"Content-Length": str(256 * 1024 + 1), "Content-Type": "application/json"},
        )

        self.assertEqual((status, body), (413, {"error": "REQUEST_TOO_LARGE"}))

    def test_unknown_route_is_not_dispatched(self):
        status, body = self.request("POST", "/v1/private/debug", {})

        self.assertEqual((status, body), (404, {"error": "NOT_FOUND"}))

    def test_unexpected_service_errors_do_not_return_exception_details(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)
        self.server = create_server(BrokenService(), token="test-gateway-secret", host="127.0.0.1", port=0)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.host, self.port = self.server.server_address[:2]

        status, body = self.request("POST", "/v1/planet/compose", composition_payload())

        self.assertEqual((status, body), (500, {"error": "AI_SERVICE_ERROR"}))
        self.assertNotIn("private prompt", json.dumps(body))

    def test_model_calls_are_serialized_across_concurrent_http_requests(self):
        runtime = ObservedRuntime()
        self.server.gateway_service = MusicAIService(runtime)

        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(
                lambda _: self.request("POST", "/v1/planet/compose", composition_payload()),
                range(2),
            ))

        self.assertEqual([status for status, _ in results], [200, 200])
        self.assertEqual(runtime.max_active, 1)

    def test_gateway_refuses_non_loopback_binding_and_empty_tokens(self):
        with self.assertRaises(ValueError):
            create_server(MusicAIService(RoutingRuntime()), token="secret", host="0.0.0.0", port=0)
        with self.assertRaises(ValueError):
            create_server(MusicAIService(RoutingRuntime()), token="  ", host="127.0.0.1", port=0)


if __name__ == "__main__":
    unittest.main()
