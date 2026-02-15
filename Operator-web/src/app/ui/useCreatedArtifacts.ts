import { useEffect, useMemo, useRef, useState } from "react"
import { fromBase } from "../../lib/route"
import {
  artifactsFromTermsText,
  buildExplorerTree,
  isShellToolName,
  mergeArtifacts,
  parseArtifactsFromTerm,
  parseArtifactsText,
  parseTermLike,
  toArtifactsText,
  type CreatedArtifact,
  type ExplorerNode,
} from "../lib/agentArtifacts"

export type UseCreatedArtifacts = {
  chatId: string
  artifacts: CreatedArtifact[]
  tree: ExplorerNode[]
  selectedPath: string
  selectedContent: string
  setSelectedPath: (path: string) => void
  hasNewArtifact: number
}

const trim = (raw: unknown) => {
  const txt0 = typeof raw === "string" ? raw : ""
  return txt0.trim()
}

const obj = (raw: unknown) => {
  const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null
  return row
}

const artifactKey = (chatId: string) => {
  const id = trim(chatId)
  return `ms_agent_created_v1_${id}`
}

const termsKey = (chatId: string) => {
  const id = trim(chatId)
  return `ms_chat_term_${id}`
}

const routeChatId = () => {
  const p = fromBase(window.location.pathname)
  const base = "/t/"

  if (!p.startsWith(base)) {
    return ""
  }

  const rest = p.slice(base.length)
  const idx = rest.indexOf("/")
  const raw = idx >= 0 ? rest.slice(0, idx) : rest
  return trim(raw)
}

const firstFilePath = (list: CreatedArtifact[]) => {
  for (var i = 0; i < list.length; i++) {
    const row = list[i]

    if (!row) {
      continue
    }

    if (row.kind !== "file") {
      continue
    }

    const path = trim(row.path)

    if (!path) {
      continue
    }

    return path
  }

  return ""
}

const hasFilePath = (list: CreatedArtifact[], path: string) => {
  const want = trim(path)

  if (!want) {
    return false
  }

  for (var i = 0; i < list.length; i++) {
    const row = list[i]

    if (!row) {
      continue
    }

    if (row.kind !== "file") {
      continue
    }

    if (trim(row.path) !== want) {
      continue
    }

    return true
  }

  return false
}

const nextSelectedPath = (prev: string, list: CreatedArtifact[]) => {
  const cur = trim(prev)

  if (cur && hasFilePath(list, cur)) {
    return cur
  }

  return firstFilePath(list)
}

const newestFilePath = (list: CreatedArtifact[]) => {
  var out = ""
  var at = -1

  for (var i = 0; i < list.length; i++) {
    const row = list[i]

    if (!row) {
      continue
    }

    if (row.kind !== "file") {
      continue
    }

    const path = trim(row.path)

    if (!path) {
      continue
    }

    const at0 = Number.parseInt(`${row.at}`, 10)
    const ts = Number.isFinite(at0) ? at0 : 0

    if (ts < at) {
      continue
    }

    at = ts
    out = path
  }

  return out
}

const autoFocusPath = (base: CreatedArtifact[], add: CreatedArtifact[]) => {
  const seen: Record<string, CreatedArtifact> = {}

  for (var i = 0; i < base.length; i++) {
    const row = base[i]
    const path = trim(row?.path)

    if (!path) {
      continue
    }

    seen[path] = row
  }

  const changed: CreatedArtifact[] = []

  for (var i = 0; i < add.length; i++) {
    const row = add[i]

    if (!row) {
      continue
    }

    if (row.kind !== "file") {
      continue
    }

    const path = trim(row.path)

    if (!path) {
      continue
    }

    const prev = seen[path]

    if (!prev) {
      changed.push(row)
      continue
    }

    if ((row.content ?? "") !== (prev.content ?? "")) {
      changed.push(row)
      continue
    }
  }

  return newestFilePath(changed)
}

const selectedContent = (list: CreatedArtifact[], path: string) => {
  const want = trim(path)

  if (!want) {
    return ""
  }

  for (var i = 0; i < list.length; i++) {
    const row = list[i]

    if (!row) {
      continue
    }

    if (row.kind !== "file") {
      continue
    }

    if (trim(row.path) !== want) {
      continue
    }

    return row.content ?? ""
  }

  return ""
}

const openSignalFromTerm = (tool: string, input: string, status: string) => {
  const st = trim(status)

  if (st !== "running" && st !== "done") {
    return false
  }

  const name = trim(tool)

  if (name === "session_ensure") {
    return true
  }

  if (!isShellToolName(name)) {
    return false
  }

  const cmd = trim(input).toLowerCase()

  if (!cmd) {
    return false
  }

  if (/\bcd\s+/.test(cmd)) {
    return true
  }

  if (/\bmkdir\b/.test(cmd)) {
    return true
  }

  if (/\btouch\b/.test(cmd)) {
    return true
  }

  return /(?:^|[^0-9])>>?\s*/.test(cmd)
}

const hasNewPaths = (prev: CreatedArtifact[], next: CreatedArtifact[]) => {
  const seen: Record<string, 1> = {}

  for (var i = 0; i < prev.length; i++) {
    const row = prev[i]
    const path = trim(row?.path)

    if (!path) {
      continue
    }

    seen[path] = 1
  }

  for (var i = 0; i < next.length; i++) {
    const row = next[i]
    const path = trim(row?.path)

    if (!path) {
      continue
    }

    if (seen[path]) {
      continue
    }

    return true
  }

  return false
}

const loadChatArtifacts = (chatId: string) => {
  const id = trim(chatId)

  if (!id) {
    return [] as CreatedArtifact[]
  }

  const savedRaw = window.localStorage.getItem(artifactKey(id)) ?? ""
  const saved = parseArtifactsText(savedRaw)
  const termsRaw = window.localStorage.getItem(termsKey(id)) ?? ""
  const rebuilt = artifactsFromTermsText(termsRaw)
  const out = mergeArtifacts(saved, rebuilt)
  window.localStorage.setItem(artifactKey(id), toArtifactsText(out))
  return out
}

export const useCreatedArtifacts = (): UseCreatedArtifacts => {
  const s1 = useState<string>(() => routeChatId())
  const chatId = s1[0]
  const setChatId = s1[1]

  const s2 = useState<CreatedArtifact[]>([])
  const artifacts = s2[0]
  const setArtifacts = s2[1]

  const s3 = useState<string>("")
  const selectedPath = s3[0]
  const setSelectedPath = s3[1]

  const s4 = useState<number>(0)
  const hasNewArtifact = s4[0]
  const setHasNewArtifact = s4[1]

  const cref = useRef<string>("")
  const aref = useRef<CreatedArtifact[]>([])
  const pref = useRef<Record<string, number>>({})

  useEffect(() => {
    cref.current = chatId
  }, [chatId])

  useEffect(() => {
    aref.current = artifacts
  }, [artifacts])

  useEffect(() => {
    const syncRoute = () => {
      const next = routeChatId()
      setChatId((cur) => {
        if (cur === next) {
          return cur
        }

        return next
      })
    }

    syncRoute()
    const sid = window.setInterval(syncRoute, 180)
    return () => window.clearInterval(sid)
  }, [])

  useEffect(() => {
    const list = loadChatArtifacts(chatId)
    setArtifacts(list)
    setSelectedPath((cur) => nextSelectedPath(cur, list))

    const cid = trim(chatId)
    const pending = cid ? pref.current[cid] ?? 0 : 0

    if (!pending) {
      return
    }

    if (pending === 1 && !list.length) {
      return
    }

    delete pref.current[cid]
    setHasNewArtifact((n) => n + 1)
  }, [chatId])

  useEffect(() => {
    const fn = (ev: MessageEvent) => {
      const row = obj(ev.data)
      const type = trim(row?.type)

      if (type !== "ms-agent-term-event") {
        return
      }

      const cid = trim(row?.chatId)

      if (!cid) {
        return
      }

      const term = parseTermLike(row?.term)

      if (!term) {
        return
      }

      const add = parseArtifactsFromTerm(term)
      const signal = openSignalFromTerm(term.tool, term.input, term.status)

      if (!add.length && !signal) {
        return
      }

      const routeId = routeChatId()
      const isActive = cid === cref.current || cid === routeId
      const hasAdd = add.length > 0
      const base = hasAdd ? (isActive ? aref.current : loadChatArtifacts(cid)) : ([] as CreatedArtifact[])
      const merged = hasAdd ? mergeArtifacts(base, add) : base
      const focus = hasAdd ? autoFocusPath(base, add) : ""
      const created = hasAdd ? hasNewPaths(base, merged) : false

      if (hasAdd) {
        window.localStorage.setItem(artifactKey(cid), toArtifactsText(merged))
      }

      if (!isActive) {
        if (created) {
          pref.current[cid] = Math.max(pref.current[cid] ?? 0, 1)
        }

        if (signal) {
          pref.current[cid] = 2
        }

        return
      }

      setChatId((cur) => {
        if (cur === cid) {
          return cur
        }

        return cid
      })

      if (hasAdd) {
        setArtifacts(merged)
        setSelectedPath((cur) => focus || nextSelectedPath(cur, merged))
      }

      if (!created && !signal) {
        return
      }

      setHasNewArtifact((n) => n + 1)
    }

    window.addEventListener("message", fn)
    return () => window.removeEventListener("message", fn)
  }, [])

  const tree = useMemo(() => buildExplorerTree(artifacts), [artifacts])
  const content = useMemo(() => selectedContent(artifacts, selectedPath), [artifacts, selectedPath])
  const setPath = (path: string) => {
    setSelectedPath(trim(path))
  }

  return {
    chatId,
    artifacts,
    tree,
    selectedPath,
    selectedContent: content,
    setSelectedPath: setPath,
    hasNewArtifact,
  }
}
