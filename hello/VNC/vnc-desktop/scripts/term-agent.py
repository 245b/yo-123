#!/usr/bin/env python3
import base64
import json
import os
import re
import shlex
import shutil
import subprocess
import threading
import time
import uuid
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from socketserver import ThreadingMixIn

TOKEN = os.environ.get("TERM_AGENT_TOKEN", "").strip()
RUN_USER = os.environ.get("RUN_USER", "operator").strip() or "operator"
RUN_HOME = os.environ.get("RUN_HOME", "/home/operator").strip() or "/home/operator"
PROJECTS_DIR = os.environ.get("PROJECTS_DIR", "/projects").strip() or "/projects"
OPERATOR_DIR = os.environ.get("OPERATOR_DIR", f"{PROJECTS_DIR}/operator").strip() or f"{PROJECTS_DIR}/operator"
PORT = int(os.environ.get("TERM_AGENT_PORT", "7682") or "7682")
WORKSPACE_ROOT = os.environ.get("WORKSPACE_ROOT", f"{PROJECTS_DIR}/operator").strip() or f"{PROJECTS_DIR}/operator"
TERM_SESSION_DIR = os.environ.get("TERM_SESSION_DIR", WORKSPACE_ROOT).strip() or WORKSPACE_ROOT
TRASH_DIR = os.environ.get("TRASH_DIR", "/trash").strip()
TERM_AGENT_PERMS = os.environ.get("TERM_AGENT_PERMS", "all").strip().lower() or "all"
PURGE_ON_START = os.environ.get("TERM_AGENT_PURGE_ON_START", "").strip().lower() in ("1", "true", "yes", "on")
PROJECTS_ROOT = Path(PROJECTS_DIR).resolve()
ROOT = Path(TERM_SESSION_DIR).resolve()
OPERATOR_ROOT = Path(OPERATOR_DIR).resolve()
ROOT_COMMON = os.path.commonpath([str(OPERATOR_ROOT), str(ROOT)])

if ROOT_COMMON != str(OPERATOR_ROOT):
  ROOT = OPERATOR_ROOT

if not TRASH_DIR:
  TRASH_DIR = "/trash"

TRASH_PATH = Path(TRASH_DIR)

SESSION_RE = re.compile(r"[^a-zA-Z0-9_.-]+")
TARGET_RE = re.compile(r"[^a-zA-Z0-9_.:%-]+")
HUNK_RE = re.compile(r"@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@")

LOCKS = {}
LOCKS_LOCK = threading.Lock()
PTY_PROCS = {}
PTY_LOCK = threading.Lock()


def parse_perms(raw):
  val = (raw or "").strip().lower()
  if not val:
    return {"all"}
  parts = re.split(r"[,\s]+", val)
  out = {p for p in parts if p}
  if not out:
    return {"all"}
  return out


PERMS = parse_perms(TERM_AGENT_PERMS)


def allow_perm(kind):
  if "all" in PERMS:
    return True
  return kind in PERMS


def now_iso():
  return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def op_meta():
  return {"id": uuid.uuid4().hex, "ts": now_iso()}


def ok_out(result=None, warnings=None):
  if warnings is None:
    warnings = []
  if result is None:
    result = {}
  return {"ok": True, "op": op_meta(), "result": result, "warnings": warnings}


def clean_session(raw):
  val = (raw or "").strip()
  if not val:
    val = "operator"
  val = SESSION_RE.sub("_", val)
  if not val:
    val = "operator"
  return val[:64]


def session_root(session):
  sid = clean_session(session)
  if ROOT.name.lower() == sid.lower():
    return ROOT
  return ROOT / sid


def ensure_session_root(session):
  root = session_root(session)
  root.mkdir(parents=True, exist_ok=True)
  try:
    shutil.chown(root, user=RUN_USER, group=RUN_USER)
  except Exception:
    pass
  try:
    os.chmod(root, 0o775)
  except Exception:
    pass
  return root


def resolve_session_dir(session, raw):
  base = ensure_session_root(session)
  val = (raw or "").strip()

  if not val:
    return base, ""

  path = Path(val)

  if not path.is_absolute():
    path = base / path

  try:
    root = path.resolve(strict=False)
  except Exception as err:
    return None, f"Invalid cwd: {err}"

  if not path_in_base(base, root):
    return None, "cwd escapes session root"

  if not root.exists():
    return None, "Not found"

  if not root.is_dir():
    return None, "Not a directory"

  return root, ""


def clean_target(raw):
  val = (raw or "").strip()
  if not val:
    return ""
  val = TARGET_RE.sub("", val)
  return val[:128]


def session_lock(session):
  with LOCKS_LOCK:
    lock = LOCKS.get(session)
    if lock is None:
      lock = threading.Lock()
      LOCKS[session] = lock
  return lock


def ensure_dirs():
  enforce_workspace_layout()
  prune_operator_root()
  ROOT.mkdir(parents=True, exist_ok=True)
  TRASH_PATH.mkdir(parents=True, exist_ok=True)
  (TRASH_PATH / "files").mkdir(parents=True, exist_ok=True)
  (TRASH_PATH / "info").mkdir(parents=True, exist_ok=True)


def path_in_base(base, path):
  try:
    root = str(base)
    target = str(path)
    common = os.path.commonpath([root, target])
  except Exception:
    return False
  return common == root


def path_in_root(path):
  return path_in_base(ROOT, path)


def workspace_anchor():
  if PROJECTS_ROOT == ROOT:
    return ROOT.name
  try:
    rel = ROOT.relative_to(PROJECTS_ROOT)
    if rel.parts:
      return rel.parts[0]
  except Exception:
    pass
  return ROOT.name


def enforce_workspace_layout():
  PROJECTS_ROOT.mkdir(parents=True, exist_ok=True)
  ROOT.mkdir(parents=True, exist_ok=True)

  if PROJECTS_ROOT == ROOT:
    return

  keep_name = workspace_anchor()

  for child in PROJECTS_ROOT.iterdir():
    if child.name == keep_name:
      continue

    if child.is_dir() and not child.is_symlink():
      shutil.rmtree(child, ignore_errors=True)
      continue

    try:
      child.unlink()
    except Exception:
      shutil.rmtree(child, ignore_errors=True)


def prune_operator_root():
  if not PURGE_ON_START:
    return

  ROOT.mkdir(parents=True, exist_ok=True)
  keep = set()

  if TRASH_PATH.parent == ROOT:
    keep.add(TRASH_PATH.name)

  for child in ROOT.iterdir():
    if child.name in keep:
      continue

    if child.is_dir() and not child.is_symlink():
      shutil.rmtree(child, ignore_errors=True)
      continue

    try:
      child.unlink()
    except Exception:
      shutil.rmtree(child, ignore_errors=True)


def split_parts(raw):
  text0 = (raw or "").strip()
  if not text0:
    return []
  text1 = text0.replace("\\", "/")
  text2 = re.sub(r"^[a-zA-Z]:/", "", text1)
  text3 = re.sub(r"^/+", "", text2)
  parts0 = text3.split("/")
  out = []
  for part in parts0:
    item = (part or "").strip()
    if not item:
      continue
    if item in (".", ".."):
      continue
    out.append(item)
  return out


def scoped_session_path(session, raw):
  base = ensure_session_root(session)
  sid = clean_session(session)
  parts = split_parts(raw)

  if not parts:
    return str(base)

  base_parts = [p.lower() for p in ROOT.parts if p and p != os.sep]
  lower = [p.lower() for p in parts]
  from_idx = 0

  if base_parts and len(lower) >= len(base_parts):
    same = True
    for i in range(len(base_parts)):
      if (lower[i] or "") != (base_parts[i] or ""):
        same = False
        break
    if same:
      from_idx = len(base_parts)

  p0 = lower[0] if len(lower) > 0 else ""
  p1 = lower[1] if len(lower) > 1 else ""

  if p0 == "projects" and p1 == "operator":
    from_idx = 2

  if not from_idx and p0 == "operator":
    from_idx = 1

  last = base_parts[-1] if base_parts else ""

  if not from_idx and last and p0 == last:
    from_idx = 1

  tail = parts[from_idx:]

  if tail and (tail[0] or "").lower() == sid.lower():
    tail = tail[1:]

  if not tail:
    return str(base)

  target = (base / Path(*tail)).resolve(strict=False)

  if not path_in_base(base, target):
    return str(base)

  return str(target)


def command_tokens(raw):
  text = (raw or "").strip()
  if not text:
    return []
  try:
    return shlex.split(text, posix=True)
  except Exception:
    return re.findall(r'(?:[^\s"\\\']+|"[^"]*"|\\\'[^\\\']*\\\')+', text)


def token_candidates(raw):
  text = (raw or "").strip()
  if not text:
    return []
  out = [text]
  eq = text.find("=")
  if eq > 0 and eq < len(text) - 1:
    out.append(text[eq + 1 :])
  return out


def clean_candidate(raw):
  text = (raw or "").strip()
  if not text:
    return ""
  return re.sub(r"^[`\"'(){}\[\];|&]+|[`\"'(){}\[\];|&]+$", "", text).strip()


def command_boundary_error(session, raw):
  text = (raw or "").strip()
  if not text:
    return ""
  traversed = re.search(r"(^|[\s;|&(){}])\.\.([/\\]|$|[\s;|&(){}])", text)
  if traversed:
    return "Session boundary violation: .."
  base = ensure_session_root(session)
  tokens = command_tokens(text)

  for token in tokens:
    for row in token_candidates(token):
      item0 = clean_candidate(row)
      item = item0.replace("\\", "/")

      if not item:
        continue

      if item.startswith("~"):
        return f"Session boundary violation: {token}"

      if item == ".." or item.startswith("../") or item.endswith("/..") or "/../" in item:
        return f"Session boundary violation: {token}"

      if not item.startswith("/"):
        continue

      target = Path(item).resolve(strict=False)

      if path_in_base(base, target):
        continue

      return f"Session boundary violation: {token}"

  return ""


def resolve_path(raw, allow_missing=False):
  val = (raw or "").strip()
  if not val:
    return None, "Missing path"
  p = Path(val)
  if not p.is_absolute():
    p = ROOT / p
  try:
    rp = p.resolve(strict=False)
  except Exception as err:
    return None, f"Invalid path: {err}"
  if not path_in_root(rp):
    return None, "Path escapes workspace root"
  if not allow_missing and not rp.exists():
    return None, "Not found"
  return rp, ""


def resolve_dir(raw):
  path, err = resolve_path(raw, False)
  if err:
    return None, err
  if not path.is_dir():
    return None, "Not a directory"
  return path, ""


def stat_info(path):
  rel = ""
  try:
    rel = str(path.relative_to(ROOT))
  except Exception:
    rel = ""
  if not path.exists():
    return {"path": str(path), "rel": rel, "exists": False}
  st = path.stat()
  kind = "other"
  if path.is_dir():
    kind = "dir"
  if path.is_file():
    kind = "file"
  return {
    "path": str(path),
    "rel": rel,
    "exists": True,
    "type": kind,
    "size": st.st_size,
    "mtime": datetime.fromtimestamp(st.st_mtime, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "mode": oct(st.st_mode & 0o777),
  }


def entry_info(path):
  info = stat_info(path)
  info["name"] = path.name
  return info


def read_bytes(path, max_bytes):
  with open(path, "rb") as handle:
    if max_bytes and max_bytes > 0:
      data = handle.read(max_bytes + 1)
      truncated = len(data) > max_bytes
      if truncated:
        data = data[:max_bytes]
      return data, truncated
    data = handle.read()
  return data, False


def write_bytes(path, data, atomic, create_parents):
  if create_parents:
    path.parent.mkdir(parents=True, exist_ok=True)
  before = stat_info(path)
  if atomic:
    tmp = path.parent / f".tmp.{uuid.uuid4().hex}"
    with open(tmp, "wb") as handle:
      handle.write(data)
      handle.flush()
      os.fsync(handle.fileno())
    mode = None
    if path.exists():
      mode = path.stat().st_mode & 0o777
    os.replace(tmp, path)
    if mode is not None:
      os.chmod(path, mode)
  if not atomic:
    with open(path, "wb") as handle:
      handle.write(data)
      handle.flush()
      os.fsync(handle.fileno())
  after = stat_info(path)
  return {"before": before, "after": after, "bytes": len(data)}


def fs_list(path, recursive, max_entries, max_depth):
  p, err = resolve_path(path, False)
  if err:
    return None, err
  if not p.is_dir():
    return None, "Not a directory"
  entries = []
  count = 0
  truncated = False
  if not recursive:
    for child in p.iterdir():
      if count >= max_entries:
        truncated = True
        break
      entries.append(entry_info(child))
      count += 1
  if recursive:
    base_depth = len(p.relative_to(ROOT).parts)
    for root, dirs, files in os.walk(p):
      depth = len(Path(root).relative_to(ROOT).parts) - base_depth
      if max_depth >= 0 and depth > max_depth:
        dirs[:] = []
        continue
      for name in dirs + files:
        if count >= max_entries:
          truncated = True
          break
        child = Path(root) / name
        entries.append(entry_info(child))
        count += 1
      if truncated:
        break
  warnings = []
  if truncated:
    warnings.append("Result truncated due to max_entries limit.")
  result = {
    "path": str(p),
    "rel": str(p.relative_to(ROOT)),
    "entries": entries,
    "count": len(entries),
    "truncated": truncated,
  }
  return ok_out(result, warnings), ""


def fs_stat(path):
  p, err = resolve_path(path, True)
  if err:
    return None, err
  result = stat_info(p)
  return ok_out(result, []), ""


def fs_read(path, max_bytes, start_line, end_line, binary):
  p, err = resolve_path(path, False)
  if err:
    return None, err
  if not p.is_file():
    return None, "Not a file"
  data, truncated = read_bytes(p, max_bytes)
  if binary:
    result = {
      "path": str(p),
      "size": len(data),
      "data_b64": base64.b64encode(data).decode("ascii"),
      "truncated": truncated,
    }
    return ok_out(result, []), ""
  text = data.decode("utf-8", errors="replace")
  if start_line or end_line:
    lines = text.splitlines(keepends=True)
    start = start_line if start_line and start_line > 0 else 1
    end = end_line if end_line and end_line > 0 else len(lines)
    if end < start:
      return None, "Invalid line range"
    slice_lines = lines[start - 1 : end]
    text = "".join(slice_lines)
    result = {
      "path": str(p),
      "content": text,
      "start_line": start,
      "end_line": end,
      "truncated": truncated,
      "size": len(data),
    }
    return ok_out(result, []), ""
  result = {"path": str(p), "content": text, "truncated": truncated, "size": len(data)}
  return ok_out(result, []), ""


def fs_write(path, content, atomic, create_parents):
  p, err = resolve_path(path, True)
  if err:
    return None, err
  if p.exists() and p.is_dir():
    return None, "Path is a directory"
  data = (content or "").encode("utf-8")
  result = write_bytes(p, data, atomic, create_parents)
  result["path"] = str(p)
  return ok_out(result, []), ""


def fs_mkdir(path, parents):
  p, err = resolve_path(path, True)
  if err:
    return None, err
  before = stat_info(p)
  p.mkdir(parents=parents, exist_ok=True)
  after = stat_info(p)
  result = {"path": str(p), "before": before, "after": after}
  return ok_out(result, []), ""


def fs_move(src, dst, overwrite):
  s, err = resolve_path(src, False)
  if err:
    return None, err
  d, err2 = resolve_path(dst, True)
  if err2:
    return None, err2
  if d.exists() and not overwrite:
    return None, "Destination exists"
  if d.exists() and overwrite:
    if d.is_dir():
      shutil.rmtree(d)
    if d.is_file():
      d.unlink()
  before_src = stat_info(s)
  shutil.move(str(s), str(d))
  result = {"src": str(s), "dst": str(d), "before": before_src, "after": stat_info(d)}
  return ok_out(result, []), ""


def fs_copy(src, dst, recursive, overwrite):
  s, err = resolve_path(src, False)
  if err:
    return None, err
  d, err2 = resolve_path(dst, True)
  if err2:
    return None, err2
  if d.exists() and not overwrite:
    return None, "Destination exists"
  if s.is_dir():
    if not recursive:
      return None, "Recursive flag required for directory copy"
    if d.exists() and overwrite:
      shutil.rmtree(d)
    shutil.copytree(s, d, dirs_exist_ok=overwrite)
    result = {"src": str(s), "dst": str(d), "after": stat_info(d)}
    return ok_out(result, []), ""
  if s.is_file():
    if d.exists() and overwrite:
      if d.is_dir():
        shutil.rmtree(d)
      if d.is_file():
        d.unlink()
    shutil.copy2(s, d)
    result = {"src": str(s), "dst": str(d), "after": stat_info(d)}
    return ok_out(result, []), ""
  return None, "Unsupported source type"


def trash_item(path):
  ensure_dirs()
  name = f"{int(time.time())}_{uuid.uuid4().hex}_{path.name}"
  dest = TRASH_PATH / "files" / name
  info = TRASH_PATH / "info" / f"{name}.json"
  shutil.move(str(path), str(dest))
  meta = {"original_path": str(path), "trashed_path": str(dest), "deleted_at": now_iso()}
  with open(info, "w", encoding="utf-8") as handle:
    json.dump(meta, handle, indent=2)
  return {"original_path": str(path), "trashed_path": str(dest), "info_path": str(info)}


def purge_path(path, recursive):
  if path.is_dir():
    if not recursive:
      return False, "Recursive flag required for directory delete"
    shutil.rmtree(path)
    return True, ""
  if path.is_file() or path.is_symlink():
    path.unlink()
    return True, ""
  return False, "Unsupported path"


def purge_trash():
  files = TRASH_PATH / "files"
  info = TRASH_PATH / "info"
  if files.exists():
    shutil.rmtree(files)
  if info.exists():
    shutil.rmtree(info)
  ensure_dirs()
  return {"trash_path": str(TRASH_PATH)}


def fs_delete(path, recursive, to_trash):
  p, err = resolve_path(path, False)
  if err:
    return None, err
  before = stat_info(p)
  if to_trash:
    result = trash_item(p)
    result["before"] = before
    return ok_out(result, []), ""
  ok, err2 = purge_path(p, recursive)
  if not ok:
    return None, err2
  result = {"path": str(p), "before": before}
  return ok_out(result, []), ""


def fs_purge(path, recursive):
  if not path:
    result = purge_trash()
    return ok_out(result, []), ""
  p, err = resolve_path(path, False)
  if err:
    return None, err
  ok, err2 = purge_path(p, recursive)
  if not ok:
    return None, err2
  result = {"path": str(p)}
  return ok_out(result, []), ""


def parse_diff(raw):
  lines = raw.splitlines(keepends=True)
  hunks = []
  cur = None
  for line in lines:
    if line.startswith("@@"):
      match = HUNK_RE.match(line)
      if not match:
        return None, "Invalid hunk header"
      old_start = int(match.group(1))
      cur = {"old_start": old_start, "lines": []}
      hunks.append(cur)
      continue
    if line.startswith("---") or line.startswith("+++"):
      continue
    if line.startswith("\\"):
      continue
    if cur is None:
      continue
    if not line:
      return None, "Invalid diff line"
    tag = line[0]
    if tag not in (" ", "-", "+"):
      return None, "Invalid diff line"
    cur["lines"].append((tag, line[1:]))
  if not hunks:
    return None, "No hunks found"
  return hunks, ""


def apply_hunks(lines, hunks):
  out = list(lines)
  offset = 0
  for hunk in hunks:
    start = hunk["old_start"] - 1 + offset
    if start < 0 or start > len(out):
      return None, "Hunk out of range"
    idx = start
    for tag, text in hunk["lines"]:
      if tag == " ":
        if idx >= len(out) or out[idx] != text:
          return None, "Hunk context mismatch"
        idx += 1
        continue
      if tag == "-":
        if idx >= len(out) or out[idx] != text:
          return None, "Hunk remove mismatch"
        del out[idx]
        offset -= 1
        continue
      if tag == "+":
        out.insert(idx, text)
        idx += 1
        offset += 1
        continue
  return out, ""


def fs_apply_patch(path, diff):
  p, err = resolve_path(path, False)
  if err:
    return None, err
  if not p.is_file():
    return None, "Not a file"
  raw = (diff or "").strip("\n")
  if not raw:
    return None, "Missing diff"
  with open(p, "rb") as handle:
    data = handle.read()
  text = data.decode("utf-8", errors="replace")
  lines = text.splitlines(keepends=True)
  hunks, err2 = parse_diff(raw)
  if err2:
    return None, err2
  out, err3 = apply_hunks(lines, hunks)
  if err3:
    return None, err3
  updated = "".join(out).encode("utf-8")
  result = write_bytes(p, updated, True, True)
  result["path"] = str(p)
  return ok_out(result, []), ""


def fs_replace_ranges(path, ranges):
  p, err = resolve_path(path, False)
  if err:
    return None, err
  if not p.is_file():
    return None, "Not a file"
  if not isinstance(ranges, list):
    return None, "Ranges must be a list"
  with open(p, "rb") as handle:
    data = handle.read()
  text = data.decode("utf-8", errors="replace")
  lines = text.splitlines(keepends=True)
  parsed = []
  for item in ranges:
    row = item if isinstance(item, dict) else {}
    start = int(row.get("start_line", 0) or 0)
    end = int(row.get("end_line", 0) or 0)
    content = row.get("content", "")
    if start < 1 or end < start:
      return None, "Invalid line range"
    if end > len(lines):
      return None, "Line range out of bounds"
    if not isinstance(content, str):
      return None, "Range content must be a string"
    parsed.append((start, end, content))
  parsed.sort(key=lambda row: row[0], reverse=True)
  for start, end, content in parsed:
    repl = content.splitlines(keepends=True)
    lines[start - 1 : end] = repl
  updated = "".join(lines).encode("utf-8")
  result = write_bytes(p, updated, True, True)
  result["path"] = str(p)
  return ok_out(result, []), ""


def base_env():
  env = os.environ.copy()
  env["HOME"] = RUN_HOME
  env["USER"] = RUN_USER
  env["LOGNAME"] = RUN_USER
  return env


def env_with_venv(root):
  env = base_env()
  venv = root / ".venv" / "bin"
  if venv.exists():
    env["VIRTUAL_ENV"] = str(root / ".venv")
    env["PATH"] = f"{venv}:{env.get('PATH', '')}"
  return env


def run_cmd(argv, cwd, timeout_s, env):
  if not isinstance(argv, list) or not argv:
    return {"ok": False, "error": "Missing command", "exitCode": 127, "stdout": "", "stderr": ""}
  cmd = ["runuser", "-u", RUN_USER, "--"] + argv
  try:
    res = subprocess.run(
      cmd,
      cwd=str(cwd),
      env=env,
      capture_output=True,
      text=True,
      timeout=timeout_s,
    )
  except subprocess.TimeoutExpired:
    return {"ok": False, "error": "Command timed out", "exitCode": 124, "stdout": "", "stderr": ""}
  except Exception as err:
    return {"ok": False, "error": str(err), "exitCode": 127, "stdout": "", "stderr": ""}
  return {"ok": True, "exitCode": res.returncode, "stdout": res.stdout or "", "stderr": res.stderr or ""}


def ensure_venv(root):
  venv = root / ".venv"
  if venv.exists():
    return True, str(venv), ""
  res = run_cmd(["python", "-m", "venv", ".venv"], root, 600, base_env())
  if not res.get("ok"):
    return False, str(venv), res.get("error") or "venv failed"
  if res.get("exitCode") != 0:
    return False, str(venv), "venv failed"
  return True, str(venv), ""


def node_manager(root):
  if (root / "bun.lockb").exists() or (root / "bun.lock").exists():
    return "bun"
  if (root / "pnpm-lock.yaml").exists():
    return "pnpm"
  if (root / "yarn.lock").exists():
    return "yarn"
  if (root / "package-lock.json").exists():
    return "npm"
  return "npm"


def detect_project(root):
  flags = []
  if (root / "package.json").exists():
    flags.append("node")
  if (root / "pyproject.toml").exists() or (root / "requirements.txt").exists():
    flags.append("python")
  if (root / "Cargo.toml").exists():
    flags.append("rust")
  if (root / "go.mod").exists():
    flags.append("go")
  if (root / "pom.xml").exists() or (root / "build.gradle").exists() or (root / "build.gradle.kts").exists():
    flags.append("java")
  order = ["node", "python", "rust", "go", "java"]
  picked = ""
  for kind in order:
    if kind in flags:
      picked = kind
      break
  warnings = []
  if len(flags) > 1:
    warnings.append(f"Multiple project types detected: {', '.join(flags)}.")
  manager = ""
  if picked == "node":
    manager = node_manager(root)
  if picked == "python":
    manager = "pip"
  if picked == "rust":
    manager = "cargo"
  if picked == "go":
    manager = "go"
  if picked == "java":
    if (root / "pom.xml").exists():
      manager = "maven"
    if not manager:
      manager = "gradle"
  return {"type": picked, "manager": manager, "root": str(root), "warnings": warnings}


def project_detect(root):
  r, err = resolve_dir(root)
  if err:
    return None, err
  info = detect_project(r)
  return ok_out(info, info.get("warnings") or []), ""


def project_setup(root):
  r, err = resolve_dir(root)
  if err:
    return None, err
  info = detect_project(r)
  kind = info.get("type")
  warnings = info.get("warnings") or []
  result = {"type": kind, "manager": info.get("manager"), "root": str(r)}
  if kind == "python":
    ok, venv_path, err2 = ensure_venv(r)
    if not ok:
      return None, err2
    result["venv"] = venv_path
  return ok_out(result, warnings), ""


def project_install(root, locked, network, hashes):
  r, err = resolve_dir(root)
  if err:
    return None, err
  if not network:
    return None, "Network disabled"
  info = detect_project(r)
  kind = info.get("type")
  if not kind:
    return None, "Unsupported project type"
  warnings = info.get("warnings") or []
  cmd = []
  env = base_env()
  if kind == "node":
    manager = info.get("manager") or "npm"
    if manager == "bun":
      if locked and not ((r / "bun.lockb").exists() or (r / "bun.lock").exists()):
        return None, "Missing bun.lockb or bun.lock"
      cmd = ["bun", "install", "--frozen-lockfile"] if locked else ["bun", "install"]
    if manager == "pnpm":
      if locked and not (r / "pnpm-lock.yaml").exists():
        return None, "Missing pnpm-lock.yaml"
      cmd = ["pnpm", "install", "--frozen-lockfile"] if locked else ["pnpm", "install"]
    if manager == "yarn":
      if locked and not (r / "yarn.lock").exists():
        return None, "Missing yarn.lock"
      cmd = ["yarn", "install", "--immutable"] if locked else ["yarn", "install"]
    if manager == "npm":
      if locked and not (r / "package-lock.json").exists():
        return None, "Missing package-lock.json"
      cmd = ["npm", "ci"] if locked else ["npm", "install"]
  if kind == "python":
    if locked and not (r / "requirements.txt").exists():
      return None, "Missing requirements.txt"
    ok, _, err2 = ensure_venv(r)
    if not ok:
      return None, err2
    env = env_with_venv(r)
    cmd = ["python", "-m", "pip", "install", "-r", "requirements.txt"]
    if hashes:
      cmd.append("--require-hashes")
  if kind == "rust":
    if locked:
      cmd = ["cargo", "fetch", "--locked"]
    if not locked:
      cmd = ["cargo", "fetch"]
  if kind == "go":
    cmd = ["go", "mod", "download"]
    if locked:
      cmd = ["go", "mod", "download", "-mod=readonly"]
  if kind == "java":
    if (r / "pom.xml").exists():
      cmd = ["mvn", "-q", "-DskipTests", "dependency:go-offline"]
    if not cmd and (r / "gradlew").exists():
      cmd = ["./gradlew", "--no-daemon", "dependencies"]
    if not cmd and (r / "build.gradle").exists():
      cmd = ["gradle", "dependencies"]
  if not cmd:
    return None, "Unsupported project type"
  res = run_cmd(cmd, r, 1200, env)
  result = {
    "type": kind,
    "manager": info.get("manager"),
    "root": str(r),
    "command": cmd,
    "exitCode": res.get("exitCode"),
    "stdout": res.get("stdout"),
    "stderr": res.get("stderr"),
  }
  if not res.get("ok"):
    return None, res.get("error") or "Install failed"
  return ok_out(result, warnings), ""


def project_run(root, command, timeout_s):
  r, err = resolve_dir(root)
  if err:
    return None, err
  if not isinstance(command, list) or not command:
    return None, "Command must be a list"
  env = env_with_venv(r)
  res = run_cmd(command, r, timeout_s, env)
  result = {
    "root": str(r),
    "command": command,
    "exitCode": res.get("exitCode"),
    "stdout": res.get("stdout"),
    "stderr": res.get("stderr"),
  }
  if not res.get("ok"):
    return None, res.get("error") or "Run failed"
  return ok_out(result, []), ""


def project_test(root, timeout_s):
  r, err = resolve_dir(root)
  if err:
    return None, err
  info = detect_project(r)
  kind = info.get("type")
  if not kind:
    return None, "Unsupported project type"
  cmd = []
  if kind == "node":
    manager = info.get("manager") or "npm"
    if manager == "bun":
      cmd = ["bun", "test"]
    if manager == "pnpm":
      cmd = ["pnpm", "test"]
    if manager == "yarn":
      cmd = ["yarn", "test"]
    if manager == "npm":
      cmd = ["npm", "test"]
  if kind == "python":
    cmd = ["python", "-m", "pytest"]
  if kind == "rust":
    cmd = ["cargo", "test"]
  if kind == "go":
    cmd = ["go", "test", "./..."]
  if kind == "java":
    if (r / "pom.xml").exists():
      cmd = ["mvn", "-q", "test"]
    if not cmd and (r / "gradlew").exists():
      cmd = ["./gradlew", "--no-daemon", "test"]
    if not cmd and (r / "build.gradle").exists():
      cmd = ["gradle", "test"]
  if not cmd:
    return None, "Unsupported project type"
  env = env_with_venv(r)
  res = run_cmd(cmd, r, timeout_s, env)
  result = {
    "type": kind,
    "root": str(r),
    "command": cmd,
    "exitCode": res.get("exitCode"),
    "stdout": res.get("stdout"),
    "stderr": res.get("stderr"),
  }
  if not res.get("ok"):
    return None, res.get("error") or "Test failed"
  return ok_out(result, info.get("warnings") or []), ""


def tmux_cmd(args, capture=False):
  env = os.environ.copy()
  env["HOME"] = RUN_HOME
  env["USER"] = RUN_USER
  env["LOGNAME"] = RUN_USER
  cmd = ["runuser", "-u", RUN_USER, "--", "tmux"] + list(args)
  if capture:
    return subprocess.run(cmd, capture_output=True, text=True, env=env)
  return subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=env)


def ensure_session(session):
  root = ensure_session_root(session)
  res = tmux_cmd(["has-session", "-t", session])
  if res.returncode == 0:
    return True, ""
  res = tmux_cmd(["new-session", "-d", "-s", session, "-c", str(root)])
  if res.returncode == 0:
    return True, ""
  return False, "Failed to create tmux session"


def send_keys(session, keys, enter, target):
  tgt = clean_target(target) or session
  if keys:
    tmux_cmd(["send-keys", "-t", tgt, keys])
  if enter:
    tmux_cmd(["send-keys", "-t", tgt, "Enter"])


def capture(session, tail_lines, target):
  tgt = clean_target(target) or session
  res = tmux_cmd(["capture-pane", "-p", "-t", tgt, "-S", f"-{tail_lines}"], capture=True)
  if res.returncode != 0:
    return "", "capture failed"
  return res.stdout or "", ""


def extract_between(txt, start, end):
  e = txt.rfind(end)
  if e < 0:
    return None, None
  s = txt.rfind(start, 0, e)
  if s < 0:
    return None, None
  nl = txt.find("\n", s)
  if nl < 0:
    nl = s + len(start)
  else:
    nl = nl + 1
  body = txt[nl:e]
  end_line_end = txt.find("\n", e)
  if end_line_end < 0:
    end_line_end = len(txt)
  end_line = txt[e:end_line_end]
  m = re.search(r"exit=([-0-9]+)", end_line)
  code = int(m.group(1)) if m else 0
  return body, code


def exec_cmd(session, command, timeout_ms, max_chars, cwd, target):
  ok, err = ensure_session(session)
  if not ok:
    return False, err, {"exitCode": 127, "output": "", "truncated": False}
  if not command:
    return False, "Missing command", {"exitCode": 127, "output": "", "truncated": False}
  boundary = command_boundary_error(session, command)
  if boundary:
    return False, boundary, {"exitCode": 126, "output": boundary, "truncated": False}
  dir_path, err2 = resolve_session_dir(session, cwd)
  if err2:
    return False, err2, {"exitCode": 127, "output": "", "truncated": False}
  command = f"cd {shlex.quote(str(dir_path))} && {command}"
  command_b64 = base64.b64encode(command.encode("utf-8")).decode("ascii")

  marker = uuid.uuid4().hex
  start = f"DS_START{marker}_"
  end = f"DS_END{marker}_"
  send_keys(session, "stty -echo", True, target)
  line = (
    f"printf '{start}\\n'; "
    f"DS_CMD=$(printf %s {shlex.quote(command_b64)} | base64 -d); "
    f"bash -lc \"$DS_CMD\"; "
    f"code=$?; "
    f"printf '{end} exit=%s\\n' \"$code\"; "
    f"stty echo"
  )
  send_keys(session, line, True, target)

  tail = max(200, int(max_chars / 4)) if max_chars > 0 else 200
  deadline = time.monotonic() + (timeout_ms / 1000.0)
  while time.monotonic() < deadline:
    txt, cap_err = capture(session, tail, target)
    if cap_err:
      time.sleep(0.1)
      continue
    out, code = extract_between(txt, start, end)
    if out is None:
      time.sleep(0.1)
      continue
    output = out.rstrip("\n")
    truncated = False
    if max_chars > 0 and len(output) > max_chars:
      output = output[:max_chars]
      truncated = True
    return True, "", {"exitCode": code, "output": output, "truncated": truncated}

  tgt = clean_target(target) or session
  tmux_cmd(["send-keys", "-t", tgt, "C-c"])
  send_keys(session, "stty echo", True, target)
  return False, "Command timed out", {"exitCode": 124, "output": "", "truncated": False}


def editor_open(path, editor, line, col, target, session):
  p, err = resolve_path(path, False)
  if err:
    return None, err
  if not p.exists():
    return None, "Not found"
  ok, err2 = ensure_session(session)
  if not ok:
    return None, err2
  cmd = [editor or "nvim"]
  if line and line > 0 and col and col > 0:
    cmd.append(f"+call cursor({line},{col})")
  if line and line > 0 and not col:
    cmd.append(f"+{line}")
  cmd.append(str(p))
  tgt = clean_target(target)
  if tgt:
    res = tmux_cmd(["split-window", "-t", tgt, "-c", str(p.parent), "--"] + cmd)
    if res.returncode != 0:
      return None, "Failed to open editor pane"
    return ok_out({"path": str(p), "target_pane": tgt, "editor": cmd[0]}, []), ""
  res = tmux_cmd(["new-window", "-t", session, "-c", str(p.parent), "--"] + cmd)
  if res.returncode != 0:
    return None, "Failed to open editor window"
  return ok_out({"path": str(p), "editor": cmd[0]}, []), ""


def pty_open(session, cwd, cols, rows):
  ok, err = ensure_session(session)
  if not ok:
    return None, err
  dir_path, err2 = resolve_session_dir(session, cwd)
  if err2:
    return None, err2
  res = tmux_cmd(["new-window", "-P", "-F", "#{pane_id}", "-t", session, "-c", str(dir_path)], capture=True)
  if res.returncode != 0:
    return None, "Failed to open PTY"
  pane0 = (res.stdout or "").strip()
  pane = pane0.splitlines()[-1].strip() if pane0 else ""
  if not pane:
    return None, "Failed to allocate PTY pane"
  width = int(cols or 0)
  height = int(rows or 0)
  if width > 0 or height > 0:
    cmd = ["resize-pane", "-t", pane]
    if width > 0:
      cmd.extend(["-x", str(width)])
    if height > 0:
      cmd.extend(["-y", str(height)])
    tmux_cmd(cmd)
  process_id = uuid.uuid4().hex
  with PTY_LOCK:
    PTY_PROCS[process_id] = {
      "session": session,
      "target_pane": pane,
      "created_at": now_iso(),
      "updated_at": now_iso(),
    }
  return {
    "ok": True,
    "process_id": process_id,
    "target_pane": pane,
    "sessionId": session,
    "cwd": str(dir_path),
  }, ""


def pty_resize(process_id, cols, rows):
  pid = clean_target(process_id)
  if not pid:
    return None, "Missing process_id"
  with PTY_LOCK:
    row = PTY_PROCS.get(pid)
  if not row:
    return None, "Unknown process_id"
  pane = row.get("target_pane", "")
  if not pane:
    return None, "PTY has no target pane"
  width = int(cols or 0)
  height = int(rows or 0)
  if width <= 0 and height <= 0:
    return None, "Missing cols/rows"
  cmd = ["resize-pane", "-t", pane]
  if width > 0:
    cmd.extend(["-x", str(width)])
  if height > 0:
    cmd.extend(["-y", str(height)])
  res = tmux_cmd(cmd)
  if res.returncode != 0:
    return None, "Failed to resize PTY"
  with PTY_LOCK:
    live = PTY_PROCS.get(pid)
    if live:
      live["updated_at"] = now_iso()
  return {"ok": True, "process_id": pid, "target_pane": pane, "cols": width, "rows": height}, ""


def pty_terminate(process_id):
  pid = clean_target(process_id)
  if not pid:
    return None, "Missing process_id"
  with PTY_LOCK:
    row = PTY_PROCS.get(pid)
  if not row:
    return None, "Unknown process_id"
  pane = row.get("target_pane", "")
  if pane:
    tmux_cmd(["kill-pane", "-t", pane])
  with PTY_LOCK:
    PTY_PROCS.pop(pid, None)
  return {"ok": True, "process_id": pid, "terminated": True}, ""


class Handler(BaseHTTPRequestHandler):
  def log_message(self, fmt, *args):
    return

  def send_json(self, status, obj):
    raw = json.dumps(obj).encode("utf-8")
    self.send_response(status)
    self.send_header("content-type", "application/json")
    self.send_header("content-length", str(len(raw)))
    self.end_headers()
    self.wfile.write(raw)

  def read_json(self):
    length = int(self.headers.get("content-length", "0") or "0")
    if length <= 0:
      return {}
    raw = self.rfile.read(length)
    try:
      return json.loads(raw.decode("utf-8"))
    except Exception:
      return None

  def do_GET(self):
    if self.path == "/v1/health" or self.path == "/v1/ready":
      out = {
        "ok": True,
        "ts": now_iso(),
        "session_root": str(ROOT),
        "workspace_root": str(ROOT),
        "token_configured": bool(TOKEN),
        "tmux_available": bool(shutil.which("tmux")),
        "perms": sorted(list(PERMS)),
      }
      self.send_json(200, out)
      return

    self.send_json(404, {"error": "Not found"})

  def authorize(self):
    if not TOKEN:
      self.send_json(500, {"error": "TERM_AGENT_TOKEN not set"})
      return False
    token = (self.headers.get("x-term-agent-token", "") or "").strip()
    if token != TOKEN:
      self.send_json(401, {"error": "Unauthorized"})
      return False
    return True

  def perm_check(self, kind):
    if allow_perm(kind):
      return True
    self.send_json(403, {"ok": False, "error": "Permission denied"})
    return False

  def do_POST(self):
    if not self.authorize():
      return
    data = self.read_json()
    if data is None:
      self.send_json(400, {"error": "Invalid JSON body"})
      return

    if self.path == "/v1/session/ensure":
      session = clean_session(data.get("sessionId", ""))
      ok, err = ensure_session(session)
      if not ok:
        self.send_json(500, {"error": err})
        return
      self.send_json(200, {"ok": True, "sessionId": session})
      return

    if self.path == "/v1/terminal/open":
      if not self.perm_check("exec"):
        return
      session = clean_session(data.get("sessionId", ""))
      cwd = (data.get("cwd", "") or "").strip()
      cols = int(data.get("cols", 0) or 0)
      rows = int(data.get("rows", 0) or 0)
      lock = session_lock(session)
      with lock:
        out, err = pty_open(session, cwd, cols, rows)
      if err:
        self.send_json(400, {"ok": False, "error": err})
        return
      self.send_json(200, out)
      return

    if self.path == "/v1/terminal/resize":
      if not self.perm_check("exec"):
        return
      process_id = data.get("process_id", "") or ""
      cols = int(data.get("cols", 0) or 0)
      rows = int(data.get("rows", 0) or 0)
      out, err = pty_resize(process_id, cols, rows)
      if err:
        self.send_json(400, {"ok": False, "error": err})
        return
      self.send_json(200, out)
      return

    if self.path == "/v1/terminal/terminate":
      if not self.perm_check("exec"):
        return
      process_id = data.get("process_id", "") or ""
      out, err = pty_terminate(process_id)
      if err:
        self.send_json(400, {"ok": False, "error": err})
        return
      self.send_json(200, out)
      return

    if self.path == "/v1/terminal/send":
      if not self.perm_check("exec"):
        return
      session = clean_session(data.get("sessionId", ""))
      ok, err = ensure_session(session)
      if not ok:
        self.send_json(500, {"error": err})
        return
      keys = (data.get("keys", "") or "").strip()
      enter = bool(data.get("enter", False))
      target = data.get("target_pane", "") or ""
      boundary = command_boundary_error(session, keys)
      if boundary:
        self.send_json(400, {"ok": False, "error": boundary})
        return
      lock = session_lock(session)
      with lock:
        send_keys(session, keys, enter, target)
      self.send_json(200, {"ok": True})
      return

    if self.path == "/v1/terminal/capture":
      if not self.perm_check("exec"):
        return
      session = clean_session(data.get("sessionId", ""))
      ok, err = ensure_session(session)
      if not ok:
        self.send_json(500, {"error": err})
        return
      tail_lines = int(data.get("tailLines", 200) or 200)
      if tail_lines < 1:
        tail_lines = 1
      target = data.get("target_pane", "") or ""
      lock = session_lock(session)
      with lock:
        txt, cap_err = capture(session, tail_lines, target)
      if cap_err:
        self.send_json(500, {"error": cap_err})
        return
      self.send_json(200, {"text": txt})
      return

    if self.path == "/v1/terminal/exec":
      if not self.perm_check("exec"):
        return
      session = clean_session(data.get("sessionId", ""))
      ok, err = ensure_session(session)
      if not ok:
        self.send_json(500, {"error": err})
        return
      command = (data.get("command", "") or "").strip()
      timeout_ms = int(data.get("timeoutMs", 20000) or 20000)
      max_chars = int(data.get("maxChars", 4000) or 4000)
      cwd = (data.get("cwd", "") or "").strip()
      target = data.get("target_pane", "") or ""
      lock = session_lock(session)
      with lock:
        ok, err, out = exec_cmd(session, command, timeout_ms, max_chars, cwd, target)
      if not ok:
        self.send_json(504, {"error": err, **out})
        return
      self.send_json(200, out)
      return

    if self.path == "/v1/fs/list":
      if not self.perm_check("read"):
        return
      session = clean_session(data.get("sessionId", ""))
      path = scoped_session_path(session, data.get("path", ""))
      recursive = bool(data.get("recursive", False))
      max_entries = int(data.get("max_entries", 2000) or 2000)
      max_depth = int(data.get("max_depth", 20) or 20)
      out, err = fs_list(path, recursive, max_entries, max_depth)
      if err:
        self.send_json(400, {"ok": False, "error": err})
        return
      self.send_json(200, out)
      return

    if self.path == "/v1/fs/stat":
      if not self.perm_check("read"):
        return
      session = clean_session(data.get("sessionId", ""))
      path = scoped_session_path(session, data.get("path", ""))
      out, err = fs_stat(path)
      if err:
        self.send_json(400, {"ok": False, "error": err})
        return
      self.send_json(200, out)
      return

    if self.path == "/v1/fs/read":
      if not self.perm_check("read"):
        return
      session = clean_session(data.get("sessionId", ""))
      path = scoped_session_path(session, data.get("path", ""))
      max_bytes = int(data.get("max_bytes", 0) or 0)
      start_line = int(data.get("start_line", 0) or 0)
      end_line = int(data.get("end_line", 0) or 0)
      binary = bool(data.get("binary", False))
      out, err = fs_read(path, max_bytes, start_line, end_line, binary)
      if err:
        self.send_json(400, {"ok": False, "error": err})
        return
      self.send_json(200, out)
      return

    if self.path == "/v1/fs/write":
      if not self.perm_check("write"):
        return
      session = clean_session(data.get("sessionId", ""))
      path = scoped_session_path(session, data.get("path", ""))
      content = data.get("content", "")
      atomic = bool(data.get("atomic", True))
      create_parents = bool(data.get("create_parents", True))
      out, err = fs_write(path, content, atomic, create_parents)
      if err:
        self.send_json(400, {"ok": False, "error": err})
        return
      self.send_json(200, out)
      return

    if self.path == "/v1/fs/move":
      if not self.perm_check("write"):
        return
      session = clean_session(data.get("sessionId", ""))
      src = scoped_session_path(session, data.get("src", ""))
      dst = scoped_session_path(session, data.get("dst", ""))
      overwrite = bool(data.get("overwrite", False))
      out, err = fs_move(src, dst, overwrite)
      if err:
        self.send_json(400, {"ok": False, "error": err})
        return
      self.send_json(200, out)
      return

    if self.path == "/v1/fs/copy":
      if not self.perm_check("write"):
        return
      session = clean_session(data.get("sessionId", ""))
      src = scoped_session_path(session, data.get("src", ""))
      dst = scoped_session_path(session, data.get("dst", ""))
      recursive = bool(data.get("recursive", True))
      overwrite = bool(data.get("overwrite", False))
      out, err = fs_copy(src, dst, recursive, overwrite)
      if err:
        self.send_json(400, {"ok": False, "error": err})
        return
      self.send_json(200, out)
      return

    if self.path == "/v1/fs/delete":
      if not self.perm_check("write"):
        return
      session = clean_session(data.get("sessionId", ""))
      path = scoped_session_path(session, data.get("path", ""))
      recursive = bool(data.get("recursive", False))
      to_trash = bool(data.get("to_trash", True))
      out, err = fs_delete(path, recursive, to_trash)
      if err:
        self.send_json(400, {"ok": False, "error": err})
        return
      self.send_json(200, out)
      return

    if self.path == "/v1/fs/mkdir":
      if not self.perm_check("write"):
        return
      session = clean_session(data.get("sessionId", ""))
      path = scoped_session_path(session, data.get("path", ""))
      parents = bool(data.get("parents", True))
      out, err = fs_mkdir(path, parents)
      if err:
        self.send_json(400, {"ok": False, "error": err})
        return
      self.send_json(200, out)
      return

    if self.path == "/v1/fs/purge":
      if not self.perm_check("write"):
        return
      session = clean_session(data.get("sessionId", ""))
      path0 = (data.get("path", "") or "").strip()
      path = scoped_session_path(session, path0) if path0 else ""
      recursive = bool(data.get("recursive", True))
      out, err = fs_purge(path, recursive)
      if err:
        self.send_json(400, {"ok": False, "error": err})
        return
      self.send_json(200, out)
      return

    if self.path == "/v1/fs/apply_patch":
      if not self.perm_check("write"):
        return
      session = clean_session(data.get("sessionId", ""))
      path = scoped_session_path(session, data.get("path", ""))
      diff = data.get("unified_diff", "")
      out, err = fs_apply_patch(path, diff)
      if err:
        self.send_json(400, {"ok": False, "error": err})
        return
      self.send_json(200, out)
      return

    if self.path == "/v1/fs/replace_ranges":
      if not self.perm_check("write"):
        return
      session = clean_session(data.get("sessionId", ""))
      path = scoped_session_path(session, data.get("path", ""))
      ranges = data.get("ranges", [])
      out, err = fs_replace_ranges(path, ranges)
      if err:
        self.send_json(400, {"ok": False, "error": err})
        return
      self.send_json(200, out)
      return

    if self.path == "/v1/editor/open":
      if not self.perm_check("exec"):
        return
      session = clean_session(data.get("sessionId", ""))
      path = scoped_session_path(session, data.get("path", ""))
      editor = data.get("editor", "nvim")
      line = int(data.get("line", 0) or 0)
      col = int(data.get("col", 0) or 0)
      target = data.get("target_pane", "") or ""
      lock = session_lock(session)
      with lock:
        out, err = editor_open(path, editor, line, col, target, session)
      if err:
        self.send_json(400, {"ok": False, "error": err})
        return
      self.send_json(200, out)
      return

    if self.path == "/v1/project/detect":
      if not self.perm_check("read"):
        return
      session = clean_session(data.get("sessionId", ""))
      root = scoped_session_path(session, data.get("root", ""))
      out, err = project_detect(root)
      if err:
        self.send_json(400, {"ok": False, "error": err})
        return
      self.send_json(200, out)
      return

    if self.path == "/v1/project/setup":
      if not self.perm_check("exec"):
        return
      session = clean_session(data.get("sessionId", ""))
      root = scoped_session_path(session, data.get("root", ""))
      out, err = project_setup(root)
      if err:
        self.send_json(400, {"ok": False, "error": err})
        return
      self.send_json(200, out)
      return

    if self.path == "/v1/project/install":
      if not self.perm_check("exec"):
        return
      session = clean_session(data.get("sessionId", ""))
      root = scoped_session_path(session, data.get("root", ""))
      locked = bool(data.get("locked", True))
      network = bool(data.get("network", True))
      hashes = bool(data.get("hashes", False))
      out, err = project_install(root, locked, network, hashes)
      if err:
        self.send_json(400, {"ok": False, "error": err})
        return
      self.send_json(200, out)
      return

    if self.path == "/v1/project/run":
      if not self.perm_check("exec"):
        return
      session = clean_session(data.get("sessionId", ""))
      root = scoped_session_path(session, data.get("root", ""))
      command = data.get("command", [])
      timeout_s = int(data.get("timeout_s", 1200) or 1200)
      out, err = project_run(root, command, timeout_s)
      if err:
        self.send_json(400, {"ok": False, "error": err})
        return
      self.send_json(200, out)
      return

    if self.path == "/v1/project/test":
      if not self.perm_check("exec"):
        return
      session = clean_session(data.get("sessionId", ""))
      root = scoped_session_path(session, data.get("root", ""))
      timeout_s = int(data.get("timeout_s", 1200) or 1200)
      out, err = project_test(root, timeout_s)
      if err:
        self.send_json(400, {"ok": False, "error": err})
        return
      self.send_json(200, out)
      return

    self.send_json(404, {"error": "Not found"})


class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
  daemon_threads = True


def main():
  ensure_dirs()
  server = ThreadedHTTPServer(("0.0.0.0", PORT), Handler)
  server.serve_forever()


if __name__ == "__main__":
  main()

