#!/usr/bin/env python3
"""
Start Civic Threads locally and open it in Arc (macOS).

From the repo root:
  python3 dev_start.py

Prerequisites:
  - Node.js (see package.json engines / Vite warnings; >= 20.19 is ideal)
  - npm install (runs automatically if node_modules is missing)
  - Postgres running
  - DATABASE_URL in a .env file (copy .env.example to .env) or set in the shell

Default URL: http://127.0.0.1:5000. If 5000 is busy, the script tries 5001–5010.
Set PORT in the shell to force a port: PORT=5001 python3 dev_start.py

Thread canvas strict-tree API (not municipal shadow tree metadata):
  - GET  /api/threads/:threadId/thread-structure
  - POST /api/threads/:threadId/thread-structure/apply  (auth required)
  - Files: shared/schema.ts, server/thread-structure.ts, server/storage.ts, server/routes.ts

Google Drive connector (Shadow Tree Day 1 — OAuth, any signed-in user for pilot):
  - npm run check:drive-env
  - After GOOGLE_* env is set: open /api/integrations/google-drive/start while logged in
  - After linking: GET /api/integrations/google-drive/peek?parent=root&debug=1
  - File preview: GET /api/integrations/google-drive/files/<id>/preview?debug=1
  - Diagnostics: GET /api/integrations/google-drive/diagnostics (signed in)
  - UI: /knowledge-base-2 (any signed-in user; pilot)
  - Day 3: POST /api/integrations/google-drive/summaries/run (bottom-up map; KB2 “Run Full Map Summaries”)
  - Day 4: GET /api/integrations/google-drive/shadow-tree/tree (nested DB map); POST …/shadow-tree/query (tools + optional tree snapshot); GET …/shadow-tree/tools/list-folder & read-document
  - Code: server/connectors/google-drive/
"""

from __future__ import annotations

import os
import shutil
import signal
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent
DEFAULT_PORT = 5000
PORT_FALLBACK_MAX = 5010
STARTUP_TIMEOUT_SEC = 120


def _port_is_free(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            s.bind(("0.0.0.0", port))
            return True
        except OSError:
            return False


def _resolve_port() -> int:
    if "PORT" in os.environ:
        return int(os.environ["PORT"])
    if _port_is_free(DEFAULT_PORT):
        return DEFAULT_PORT
    for candidate in range(DEFAULT_PORT + 1, PORT_FALLBACK_MAX + 1):
        if _port_is_free(candidate):
            print(
                f"Port {DEFAULT_PORT} is in use (another dev server or macOS AirPlay?). "
                f"Using PORT={candidate} instead. "
                f"To free {DEFAULT_PORT} on macOS: "
                f"lsof -nP -iTCP:{DEFAULT_PORT} -sTCP:LISTEN",
                flush=True,
            )
            return candidate
    print(
        f"No free port from {DEFAULT_PORT}-{PORT_FALLBACK_MAX}. "
        f"Set PORT in .env or run: lsof -nP -iTCP:{DEFAULT_PORT} -sTCP:LISTEN",
        file=sys.stderr,
        flush=True,
    )
    raise SystemExit(1)


def main() -> int:
    os.chdir(REPO_ROOT)

    port = _resolve_port()
    url = f"http://127.0.0.1:{port}"

    if not (REPO_ROOT / "node_modules").is_dir():
        print("node_modules not found; running npm install...", flush=True)
        install = subprocess.run(["npm", "install"], cwd=REPO_ROOT)
        if install.returncode != 0:
            print("npm install failed.", file=sys.stderr)
            return install.returncode

    child_env = {**os.environ, "PORT": str(port)}
    dev = subprocess.Popen(
        ["npm", "run", "dev"],
        cwd=REPO_ROOT,
        env=child_env,
    )

    def shutdown(_signum=None, _frame=None) -> None:
        if dev.poll() is None:
            dev.terminate()
            try:
                dev.wait(timeout=10)
            except subprocess.TimeoutExpired:
                dev.kill()

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    print(f"Waiting for server at {url} ...", flush=True)
    deadline = time.monotonic() + STARTUP_TIMEOUT_SEC
    while time.monotonic() < deadline:
        if dev.poll() is not None:
            print("npm run dev exited early.", file=sys.stderr)
            return dev.returncode or 1
        if _is_http_ready(url):
            print(f"Server is up: {url}", flush=True)
            _open_arc(url)
            print("Dev server running. Ctrl+C to stop.", flush=True)
            return dev.wait()
        time.sleep(0.3)

    print(f"Timed out after {STARTUP_TIMEOUT_SEC}s waiting for {url}", file=sys.stderr)
    shutdown()
    return 1


def _is_http_ready(url: str) -> bool:
    try:
        urllib.request.urlopen(url, timeout=2)
        return True
    except (urllib.error.URLError, OSError):
        return False


def _open_arc(url: str) -> None:
    if sys.platform == "darwin":
        arc = "/Applications/Arc.app"
        if Path(arc).is_dir():
            subprocess.run(["open", "-a", "Arc", url], check=False)
            return
    import webbrowser

    webbrowser.open(url)


if __name__ == "__main__":
    if not shutil.which("npm"):
        print("npm not found. Install Node.js and ensure npm is on PATH.", file=sys.stderr)
        sys.exit(1)
    raise SystemExit(main())
