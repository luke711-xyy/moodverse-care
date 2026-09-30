"""Loopback-only HTTP adapter for the Moodverse local AI service."""

import hmac
import ipaddress
import json
import socket
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from .service import ServiceError


MAX_REQUEST_BYTES = 256 * 1024


class _IPv6ThreadingHTTPServer(ThreadingHTTPServer):
    address_family = socket.AF_INET6


def _json_bytes(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8")


def create_server(service, token, host="127.0.0.1", port=8080):
    if not isinstance(host, str):
        raise ValueError("bind host must be a loopback IP address")
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        raise ValueError("bind host must be a loopback IP address") from None
    if not address.is_loopback:
        raise ValueError("AI gateway may bind only to a loopback address")
    if not isinstance(token, str) or not token.strip():
        raise ValueError("MUSIC_AI_GATEWAY_TOKEN must be configured")
    if isinstance(port, bool) or not isinstance(port, int) or not 0 <= port <= 65535:
        raise ValueError("invalid port")

    server_type = _IPv6ThreadingHTTPServer if address.version == 6 else ThreadingHTTPServer

    class GatewayRequestHandler(BaseHTTPRequestHandler):
        server_version = "MoodverseAI/1"
        sys_version = ""

        def log_message(self, format_string, *args):
            # Requests contain user-authored Moments; do not write request metadata to stdout.
            return

        def handle_error(self, request, client_address):
            # The base server prints a traceback; local inputs may contain private Moments.
            return

        def _send(self, status, body):
            try:
                encoded = _json_bytes(body)
            except (TypeError, ValueError):
                status = 500
                encoded = b'{"error":"AI_SERVICE_ERROR"}'
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(encoded)))
            self.send_header("Connection", "close")
            self.end_headers()
            self.wfile.write(encoded)
            self.close_connection = True

        def _authorized(self):
            authorization = self.headers.get("Authorization", "")
            prefix = "Bearer "
            if not authorization.startswith(prefix):
                return False
            supplied = authorization[len(prefix):].encode("utf-8")
            expected = self.server.gateway_token.encode("utf-8")
            return hmac.compare_digest(supplied, expected)

        def _read_json(self):
            content_type = self.headers.get_content_type()
            if content_type != "application/json":
                self._send(415, {"error": "UNSUPPORTED_MEDIA_TYPE"})
                return None
            try:
                length = int(self.headers.get("Content-Length", ""))
            except (TypeError, ValueError):
                self._send(411, {"error": "CONTENT_LENGTH_REQUIRED"})
                return None
            if length < 0:
                self._send(400, {"error": "INVALID_CONTENT_LENGTH"})
                return None
            if length > MAX_REQUEST_BYTES:
                self._send(413, {"error": "REQUEST_TOO_LARGE"})
                return None
            raw = self.rfile.read(length)
            if len(raw) != length:
                self._send(400, {"error": "INCOMPLETE_BODY"})
                return None
            try:
                payload = json.loads(raw.decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError):
                self._send(400, {"error": "INVALID_JSON"})
                return None
            if not isinstance(payload, dict):
                self._send(400, {"error": "INVALID_JSON"})
                return None
            return payload

        def do_GET(self):
            if self.path != "/healthz":
                self._send(404, {"error": "NOT_FOUND"})
                return
            self._send(200, {"status": "ready"})

        def do_POST(self):
            routes = {
                "/v1/planet/compose": "compose",
                "/v1/song-portal/rank": "rank",
                "/v1/embed": "embed",
            }
            route_name = routes.get(self.path)
            if route_name is None:
                self._send(404, {"error": "NOT_FOUND"})
                return
            if not self._authorized():
                self._send(401, {"error": "UNAUTHORIZED"})
                return
            payload = self._read_json()
            if payload is None:
                return
            try:
                route = getattr(self.server.gateway_service, route_name)
                with self.server.inference_lock:
                    result = route(payload)
                self._send(200, result)
            except ServiceError as error:
                status = {
                    "AI_REQUEST_INVALID": 400,
                    "AI_RESULT_INVALID": 502,
                    "AI_BACKEND_UNAVAILABLE": 503,
                }.get(error.code, 500)
                self._send(status, {"error": error.code if status != 500 else "AI_SERVICE_ERROR"})
            except Exception:
                self._send(500, {"error": "AI_SERVICE_ERROR"})

    server = server_type((host, port), GatewayRequestHandler)
    server.gateway_service = service
    server.gateway_token = token.strip()
    server.inference_lock = threading.Lock()
    return server
