#!/usr/bin/env python3
import json
import os
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
AGENT = ROOT / "term-agent.py"
AGENT_TS = ROOT / "term-agent-server.ts"
PORT = 17682
URL = f"http://127.0.0.1:{PORT}/v1/health"


def fetch_health():
  req = urllib.request.Request(URL, method="GET")
  with urllib.request.urlopen(req, timeout=1.5) as res:
    raw = res.read().decode("utf-8")
  return json.loads(raw)


def wait_health(timeout_s):
  end = time.time() + timeout_s

  while time.time() < end:
    try:
      out = fetch_health()
      return out
    except Exception:
      time.sleep(0.25)

  return None


def post_json(path, token, body):
  url = f"http://127.0.0.1:{PORT}{path}"
  raw = json.dumps(body).encode("utf-8")
  req = urllib.request.Request(
    url,
    data=raw,
    method="POST",
    headers={
      "content-type": "application/json",
      "x-term-agent-token": token,
    },
  )
  with urllib.request.urlopen(req, timeout=3.0) as res:
    text = res.read().decode("utf-8")
  return json.loads(text)


def main():
  tmp = Path(tempfile.mkdtemp(prefix="term-agent-smoke-"))
  projects = tmp / "projects"
  operator = projects / "operator"
  home = tmp / "home"
  sessions = operator
  token = "smoke-token"

  env = os.environ.copy()
  env["TERM_AGENT_TOKEN"] = token
  env["TERM_AGENT_PORT"] = str(PORT)
  env["TERM_AGENT_PERMS"] = "all"
  env["PROJECTS_DIR"] = str(projects)
  env["OPERATOR_DIR"] = str(operator)
  env["WORKSPACE_ROOT"] = str(operator)
  env["TERM_SESSION_DIR"] = str(sessions)
  env["RUN_USER"] = env.get("USERNAME", "operator")
  env["RUN_HOME"] = str(home)
  env["TRASH_DIR"] = str(tmp / "trash")
  env["TERM_AGENT_PURGE_ON_START"] = "0"
  impl = (env.get("TERM_AGENT_IMPL") or "python").strip().lower()
  cmd = [sys.executable, str(AGENT)]

  if impl == "ts":
    cmd = ["bun", str(AGENT_TS)]

  proc = subprocess.Popen(
    cmd,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    env=env,
    text=True,
  )

  out = wait_health(12)

  if out is None:
    proc.terminate()
    proc.wait(timeout=5)
    raise SystemExit("term-agent smoke failed: health endpoint unavailable")

  keys = ["ok", "ts", "session_root", "token_configured", "tmux_available"]

  for key in keys:
    if key not in out:
      proc.terminate()
      proc.wait(timeout=5)
      raise SystemExit(f"term-agent smoke failed: missing health field {key}")

  if out.get("ok") is not True:
    proc.terminate()
    proc.wait(timeout=5)
    raise SystemExit("term-agent smoke failed: health returned ok=false")

  if impl == "ts":
    sid = "smoke"
    w = post_json(
      "/v1/fs/write",
      token,
      {
        "sessionId": sid,
        "path": "smoke.txt",
        "content": "hello",
        "atomic": True,
        "create_parents": True,
      },
    )

    if w.get("ok") is not True:
      proc.terminate()
      proc.wait(timeout=5)
      raise SystemExit("term-agent smoke failed: fs/write ok=false")

    r = post_json(
      "/v1/fs/read",
      token,
      {"sessionId": sid, "path": "smoke.txt"},
    )

    if r.get("ok") is not True:
      proc.terminate()
      proc.wait(timeout=5)
      raise SystemExit("term-agent smoke failed: fs/read ok=false")

    res = r.get("result") or {}
    text = res.get("content") or ""

    if text != "hello":
      proc.terminate()
      proc.wait(timeout=5)
      raise SystemExit("term-agent smoke failed: fs/read content mismatch")

  proc.terminate()
  proc.wait(timeout=5)
  print("term-agent smoke passed")


if __name__ == "__main__":
  main()
