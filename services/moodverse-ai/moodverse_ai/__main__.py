"""Command-line entry point for the loopback-only Moodverse AI gateway."""

import os

from .http_server import create_server
from .mlx_runtime import MLXRuntime
from .service import MusicAIService


def build_server(environ=None, runtime=None):
    values = os.environ if environ is None else environ
    token = values.get("MUSIC_AI_GATEWAY_TOKEN", "").strip()
    if not token:
        raise ValueError("MUSIC_AI_GATEWAY_TOKEN must be configured")
    host = values.get("MUSIC_AI_HOST", "127.0.0.1").strip() or "127.0.0.1"
    try:
        port = int(values.get("MUSIC_AI_PORT", "8080"))
    except (TypeError, ValueError):
        raise ValueError("MUSIC_AI_PORT must be an integer") from None
    service = MusicAIService(runtime if runtime is not None else MLXRuntime(environ=values))
    return create_server(service, token=token, host=host, port=port)


def main():
    server = build_server()
    try:
        print("Moodverse AI gateway listening on {}:{}".format(*server.server_address[:2]))
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
