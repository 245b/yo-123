#!/usr/bin/env bash
set -euo pipefail

CDP_PROXY_HOST="${BROWSER_CDP_PROXY_HOST:-0.0.0.0}"
CDP_PROXY_PORT="${BROWSER_CDP_PROXY_PORT:-9223}"
CDP_TARGET_HOST="${BROWSER_CDP_TARGET_HOST:-127.0.0.1}"
CDP_TARGET_PORT="${BROWSER_DEBUG_PORT:-9222}"

export PYTHONUNBUFFERED=1

python - <<'PY'
import os
import socket
import threading

listen_host = os.environ.get("BROWSER_CDP_PROXY_HOST", "0.0.0.0")
listen_port = int(os.environ.get("BROWSER_CDP_PROXY_PORT", "9223"))
target_host = os.environ.get("BROWSER_CDP_TARGET_HOST", "127.0.0.1")
target_port = int(os.environ.get("BROWSER_DEBUG_PORT", "9222"))


def pipe(source, dest):
    try:
        while True:
            data = source.recv(65536)
            if not data:
                break
            dest.sendall(data)
    except OSError:
        pass
    finally:
        try:
            dest.shutdown(socket.SHUT_WR)
        except OSError:
            pass


def handle(client):
    try:
        upstream = socket.create_connection((target_host, target_port))
    except OSError:
        client.close()
        return
    threading.Thread(target=pipe, args=(client, upstream), daemon=True).start()
    pipe(upstream, client)
    client.close()
    upstream.close()


server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
server.bind((listen_host, listen_port))
server.listen(128)
print(
    f"CDP proxy listening on {listen_host}:{listen_port} -> {target_host}:{target_port}",
    flush=True,
)

while True:
    client_socket, _ = server.accept()
    threading.Thread(target=handle, args=(client_socket,), daemon=True).start()
PY
