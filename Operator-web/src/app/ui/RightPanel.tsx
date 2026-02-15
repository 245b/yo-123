import { type CSSProperties, type PointerEvent, useEffect, useMemo, useRef, useState } from "react"
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker"
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker"
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker"
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker"
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker"
import type { CreatedArtifact, ExplorerNode } from "../lib/agentArtifacts"

export type RightPanelProps = {
  open: boolean
  w: number
  dur: number
  tree: ExplorerNode[]
  artifacts: CreatedArtifact[]
  selectedPath: string
  selectedContent: string
  onSelectPath: (path: string) => void
  onResize: (w: number) => void
  onSetOpen: (open: boolean) => void
}

const trim = (raw: unknown) => {
  const txt0 = typeof raw === "string" ? raw : ""
  return txt0.trim()
}

const leaf = (raw: string) => {
  const txt = trim(raw)

  if (!txt) {
    return ""
  }

  const list = txt.split("/")
  const out = list[list.length - 1] ?? ""
  return trim(out)
}

const folderOpen = (map: Record<string, boolean>, path: string) => {
  const key = trim(path)

  if (!key) {
    return true
  }

  return map[key] !== false
}

const isMobile = () => {
  const ok = typeof window !== "undefined"

  if (!ok) {
    return false
  }

  return window.innerWidth < 920
}

const panelWidth = (open: boolean, w: number) => {
  if (!open) {
    return 0
  }

  const ok = typeof window !== "undefined"
  const vw = ok ? window.innerWidth : 1280
  const cap = Math.max(320, Math.floor(vw * 0.94))
  return Math.min(w, cap)
}

type MonacoApi = typeof import("monaco-editor")

type MonacoWin = Window & {
  MonacoEnvironment?: { getWorker: (_moduleId: string, label: string) => Worker }
  __ms_monaco_env?: boolean
}

const setupMonacoEnv = () => {
  const win = window as MonacoWin

  if (win.__ms_monaco_env) {
    return
  }

  win.MonacoEnvironment = {
    getWorker: (_moduleId, label) => {
      if (label === "json") {
        return new jsonWorker()
      }

      if (label === "css" || label === "scss" || label === "less") {
        return new cssWorker()
      }

      if (label === "html" || label === "handlebars" || label === "razor") {
        return new htmlWorker()
      }

      if (label === "typescript" || label === "javascript") {
        return new tsWorker()
      }

      return new editorWorker()
    },
  }
  win.__ms_monaco_env = true
}

const applyMonacoTheme = (monaco: MonacoApi) => {
  monaco.editor.defineTheme("ms-operator-mixed", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "", foreground: "e6eaf2", background: "2a303a" },
      { token: "comment", foreground: "94a3b8" },
      { token: "keyword", foreground: "93c5fd" },
      { token: "string", foreground: "86efac" },
      { token: "number", foreground: "fdba74" },
      { token: "type", foreground: "c4b5fd" },
      { token: "function", foreground: "67e8f9" },
    ],
    colors: {
      "editor.background": "#2a303a",
      "editor.foreground": "#e6eaf2",
      "editorLineNumber.foreground": "#8b95a7",
      "editorLineNumber.activeForeground": "#d4dbe8",
      "editor.lineHighlightBackground": "#343c4a",
      "editor.selectionBackground": "#435063",
      "editor.inactiveSelectionBackground": "#3c4758",
      "editorCursor.foreground": "#93c5fd",
      "editorWhitespace.foreground": "#616b7c",
    },
  })
}

const langFromPath = (raw: string) => {
  const path = trim(raw).toLowerCase()

  if (!path) {
    return "plaintext"
  }

  if (path.endsWith(".ts") || path.endsWith(".tsx")) {
    return "typescript"
  }

  if (path.endsWith(".js") || path.endsWith(".jsx") || path.endsWith(".mjs") || path.endsWith(".cjs")) {
    return "javascript"
  }

  if (path.endsWith(".json")) {
    return "json"
  }

  if (path.endsWith(".html") || path.endsWith(".htm")) {
    return "html"
  }

  if (path.endsWith(".css") || path.endsWith(".scss") || path.endsWith(".sass") || path.endsWith(".less")) {
    return "css"
  }

  if (path.endsWith(".md") || path.endsWith(".mdx")) {
    return "markdown"
  }

  if (path.endsWith(".py")) {
    return "python"
  }

  if (path.endsWith(".sh") || path.endsWith(".bash") || path.endsWith(".zsh")) {
    return "shell"
  }

  if (path.endsWith(".yml") || path.endsWith(".yaml")) {
    return "yaml"
  }

  if (path.endsWith(".xml")) {
    return "xml"
  }

  if (path.endsWith(".sql")) {
    return "sql"
  }

  if (path.endsWith(".go")) {
    return "go"
  }

  if (path.endsWith(".rs")) {
    return "rust"
  }

  if (path.endsWith(".java")) {
    return "java"
  }

  if (path.endsWith(".c") || path.endsWith(".h")) {
    return "c"
  }

  if (path.endsWith(".cpp") || path.endsWith(".cc") || path.endsWith(".cxx") || path.endsWith(".hpp")) {
    return "cpp"
  }

  return "plaintext"
}

const RightPanel = (p: RightPanelProps) => {
  const s1 = useState<Record<string, boolean>>({})
  const fold = s1[0]
  const setFold = s1[1]
  const s2 = useState<boolean>(false)
  const dragging = s2[0]
  const setDragging = s2[1]
  const drag = useRef<{ id: number; x: number; w: number } | null>(null)
  const eref = useRef<HTMLDivElement | null>(null)
  const monacoRef = useRef<MonacoApi | null>(null)
  const modelRef = useRef<import("monaco-editor").editor.ITextModel | null>(null)
  const editorRef = useRef<import("monaco-editor").editor.IStandaloneCodeEditor | null>(null)

  useEffect(() => {
    const path = trim(p.selectedPath)

    if (!path) {
      return
    }

    const list = path.split("/")

    if (list.length < 2) {
      return
    }

    const next: Record<string, boolean> = {}
    var soFar = ""

    for (var i = 0; i < list.length - 1; i++) {
      const name = trim(list[i])

      if (!name) {
        continue
      }

      soFar = soFar ? `${soFar}/${name}` : name
      next[soFar] = true
    }

    const keys = Object.keys(next)

    if (!keys.length) {
      return
    }

    setFold((cur) => {
      const out = { ...cur }

      for (var i = 0; i < keys.length; i++) {
        const key = keys[i] ?? ""

        if (!key) {
          continue
        }

        out[key] = true
      }

      return out
    })
  }, [p.selectedPath])

  const byPath = useMemo(() => {
    const out: Record<string, CreatedArtifact> = {}

    for (var i = 0; i < p.artifacts.length; i++) {
      const row = p.artifacts[i]
      const path = trim(row?.path)

      if (!path) {
        continue
      }

      out[path] = row
    }

    return out
  }, [p.artifacts])

  const code = useMemo(() => {
    const key = trim(p.selectedPath)

    if (!key) {
      return ""
    }

    return byPath[key]?.content ?? p.selectedContent
  }, [byPath, p.selectedContent, p.selectedPath])

  const pathParts = useMemo(() => {
    const list = trim(p.selectedPath).split("/").filter((part) => part.length > 0)
    return list
  }, [p.selectedPath])

  const toggle = (path: string) => {
    const key = trim(path)

    if (!key) {
      return
    }

    setFold((cur) => {
      const out = { ...cur }
      out[key] = !folderOpen(cur, key)
      return out
    })
  }

  const copyCode = () => {
    const txt = code
    const nav = typeof navigator !== "undefined" ? navigator : null

    if (!txt || !nav?.clipboard?.writeText) {
      return
    }

    void nav.clipboard.writeText(txt)
  }

  const onDragStart = (ev: PointerEvent<HTMLDivElement>) => {
    if (!p.open) {
      return
    }

    if (ev.button > 0) {
      return
    }

    ev.preventDefault()
    ev.currentTarget.setPointerCapture(ev.pointerId)
    drag.current = { id: ev.pointerId, x: ev.clientX, w: p.w }
    setDragging(true)
  }

  const onDragMove = (ev: PointerEvent<HTMLDivElement>) => {
    const row = drag.current

    if (!row) {
      return
    }

    if (row.id !== ev.pointerId) {
      return
    }

    const next = row.w + (row.x - ev.clientX)
    p.onResize(next)
  }

  const onDragEnd = (ev: PointerEvent<HTMLDivElement>) => {
    const row = drag.current

    if (!row) {
      return
    }

    if (row.id !== ev.pointerId) {
      return
    }

    drag.current = null
    setDragging(false)

    if (!ev.currentTarget.hasPointerCapture(ev.pointerId)) {
      return
    }

    ev.currentTarget.releasePointerCapture(ev.pointerId)
  }

  const row = (node: ExplorerNode, depth: number): JSX.Element => {
    const path = trim(node.path)
    const name0 = trim(node.name)
    const name = name0 || leaf(path) || "untitled"
    const pad = 8 + depth * 14

    if (node.kind === "folder") {
      const open = folderOpen(fold, path)
      const kids = Array.isArray(node.children) ? node.children : []

      return (
        <div key={`d:${path}`} className="w-full">
          <button
            type="button"
            data-ms-node={path}
            data-ms-kind="folder"
            className="group flex w-full items-center gap-[4px] rounded px-1.5 py-1 text-left text-[13px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--fill-tsp-white-main)]"
            style={{ paddingInlineStart: `${pad}px` }}
            onClick={() => toggle(path)}
          >
            <div className="flex h-4 w-4 flex-shrink-0 items-center justify-center">
              <span className="text-[11px]">{open ? "v" : ">"}</span>
            </div>
            <span className="min-w-0 flex-1 truncate">{name}</span>
          </button>
          {open
            ? kids.map((child) => {
                return row(child, depth + 1)
              })
            : null}
        </div>
      )
    }

    const selected = trim(p.selectedPath) === path
    const item = byPath[path]
    const src = item?.source === "fs" ? "fs" : "shell"

    return (
      <button
        key={`f:${path}`}
        type="button"
        data-ms-node={path}
        data-ms-kind="file"
        className={[
          "group flex w-full items-center gap-[4px] rounded px-1.5 py-1 text-left text-[13px] transition-colors",
          selected
            ? "bg-[var(--fill-tsp-gray-main)] text-[var(--text-primary)]"
            : "text-[var(--text-secondary)] hover:bg-[var(--fill-tsp-white-main)]",
        ].join(" ")}
        style={{ paddingInlineStart: `${pad}px` }}
        onClick={() => p.onSelectPath(path)}
      >
        <div className="flex h-4 w-4 flex-shrink-0 items-center justify-center">
          <span className="text-[11px]">[]</span>
        </div>
        <span className="min-w-0 flex-1 truncate">{name}</span>
        <span className="text-[10px] text-[var(--text-disable)]">{src}</span>
      </button>
    )
  }

  const pw = panelWidth(p.open, p.w)
  const mobile = isMobile()
  const empty = !p.tree.length
  const none = !trim(p.selectedPath)
  const panelVars = {
    "--text-primary": "var(--text-primary, rgb(244 244 245))",
    "--text-secondary": "var(--text-secondary, rgba(244,244,245,0.85))",
    "--text-tertiary": "var(--text-tertiary, rgba(244,244,245,0.7))",
    "--text-disable": "var(--text-disable, rgba(244,244,245,0.45))",
    "--icon-primary": "var(--icon-primary, rgb(244 244 245))",
    "--icon-secondary": "var(--icon-tertiary, rgba(244,244,245,0.7))",
    "--icon-tertiary": "var(--icon-tertiary, rgba(244,244,245,0.7))",
    "--icon-blue": "#60a5fa",
    "--border-main": "color-mix(in srgb, var(--border-main, rgba(255,255,255,0.12)) 70%, #cbd5e1 30%)",
    "--border-light": "color-mix(in srgb, var(--border-main, rgba(255,255,255,0.12)) 62%, #e2e8f0 38%)",
    "--border-primary": "color-mix(in srgb, var(--border-main, rgba(255,255,255,0.12)) 76%, #cbd5e1 24%)",
    "--border-btn-main": "color-mix(in srgb, var(--border-btn-main, rgba(255,255,255,0.12)) 74%, #dbe3ef 26%)",
    "--fill-white": "color-mix(in srgb, var(--background-operator-white, rgb(39 39 42)) 56%, rgb(9 9 11) 44%)",
    "--fill-tsp-gray-main": "color-mix(in srgb, var(--fill-tsp-gray-main, rgba(255,255,255,0.12)) 72%, #dbe3ef 28%)",
    "--fill-tsp-white-main": "color-mix(in srgb, var(--fill-tsp-white-main, rgba(255,255,255,0.08)) 68%, #dbe3ef 32%)",
    "--fill-tsp-white-light": "color-mix(in srgb, var(--fill-tsp-white-light, rgba(255,255,255,0.06)) 64%, #dbe3ef 36%)",
    "--fill-tsp-white-dark": "color-mix(in srgb, var(--fill-tsp-white-dark, rgba(255,255,255,0.12)) 74%, #dbe3ef 26%)",
    "--background-white-main": "color-mix(in srgb, color-mix(in srgb, var(--background-operator-white, rgb(39 39 42)) 70%, var(--background-operator-gray, rgb(24 24 27)) 30%) 76%, rgb(9 9 11) 24%)",
    "--background-gray-main": "color-mix(in srgb, color-mix(in srgb, var(--background-operator-gray, rgb(24 24 27)) 72%, var(--background-operator-white, rgb(39 39 42)) 28%) 78%, rgb(9 9 11) 22%)",
    "--background-card-gray": "color-mix(in srgb, color-mix(in srgb, var(--background-operator-gray, rgb(24 24 27)) 68%, var(--background-operator-white, rgb(39 39 42)) 32%) 78%, rgb(9 9 11) 22%)",
    "--background-menu-white": "color-mix(in srgb, color-mix(in srgb, var(--background-operator-white, rgb(39 39 42)) 64%, var(--background-operator-gray, rgb(24 24 27)) 36%) 80%, rgb(9 9 11) 20%)",
  } as Record<string, string>
  const panelStyle = { minWidth: mobile ? "100%" : "520px", width: "100%", ...panelVars } as CSSProperties

  useEffect(() => {
    if (!p.open) {
      return
    }

    var dead = false

    const run = async () => {
      const host = eref.current

      if (!host) {
        return
      }

      setupMonacoEnv()
      const monaco = (await import("monaco-editor")) as MonacoApi

      if (dead) {
        return
      }

      monacoRef.current = monaco

      if (modelRef.current && editorRef.current) {
        return
      }

      applyMonacoTheme(monaco)
      const model = monaco.editor.createModel("", "plaintext")
      const editor = monaco.editor.create(host, {
        model,
        readOnly: true,
        domReadOnly: true,
        minimap: { enabled: false },
        automaticLayout: true,
        fontSize: 13,
        lineNumbers: "on",
        renderWhitespace: "selection",
        scrollBeyondLastLine: false,
        wordWrap: "off",
        contextmenu: false,
        theme: "ms-operator-mixed",
      })
      modelRef.current = model
      editorRef.current = editor
    }

    void run()

    return () => {
      dead = true
    }
  }, [p.open])

  useEffect(() => {
    const monaco = monacoRef.current
    const model = modelRef.current
    const editor = editorRef.current

    if (!monaco || !model || !editor) {
      return
    }

    const text = none ? "" : code
    const nextLang = none ? "plaintext" : langFromPath(p.selectedPath)

    if (model.getLanguageId() !== nextLang) {
      monaco.editor.setModelLanguage(model, nextLang)
    }

    if (model.getValue() !== text) {
      model.setValue(text)
    }

    editor.setScrollTop(0)
    editor.setScrollLeft(0)
  }, [code, none, p.selectedPath])

  useEffect(() => {
    const editor = editorRef.current

    if (!editor) {
      return
    }

    const tid = window.setTimeout(() => editor.layout(), 0)
    return () => window.clearTimeout(tid)
  }, [p.w, p.open, dragging])

  useEffect(() => {
    return () => {
      const editor = editorRef.current
      editorRef.current = null
      editor?.dispose()
      const model = modelRef.current
      modelRef.current = null
      model?.dispose()
    }
  }, [])

  return (
    <div
      data-ms-right-panel={p.open ? "1" : "0"}
      className="absolute inset-y-0 right-0 z-50 overflow-hidden"
      style={{
        width: `${pw}px`,
        pointerEvents: p.open ? "auto" : "none",
        transitionProperty: "width",
        transitionDuration: dragging ? "0ms" : `${p.dur}ms`,
        transitionTimingFunction: "ease-in-out",
      }}
    >
      <div
        className="relative flex h-full min-w-0 px-[10px] pb-[12px] pt-[8px]"
        style={panelStyle}
      >
        <div
          data-ms-right-resize="1"
          className="group absolute left-[-4px] top-0 bottom-0 z-[2] w-[8px] py-[12px]"
          style={{ cursor: "ew-resize" }}
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
        >
          <div className="h-full w-[4px] rounded-full bg-transparent transition-colors group-hover:bg-[var(--icon-blue)]" />
        </div>
        <div className="flex h-full w-full flex-col rounded-[14px] border border-[var(--border-main)] bg-[var(--background-card-gray)] shadow-[0_12px_28px_-18px_rgba(17,24,39,0.55)]">
          <div className="flex items-center justify-between border-b border-[var(--border-light)] px-3 py-2.5">
            <div className="flex items-center gap-[6px]">
              <div className="flex h-[32px] items-center gap-[6px] rounded-[8px] border border-[var(--border-btn-main)] bg-[var(--fill-white)] px-[10px] text-[14px] font-medium text-[var(--text-primary)]">
                <span>{"</>"}</span>
                <span className="tracking-[-0.08px]">Code</span>
              </div>
            </div>
            <div className="flex items-center gap-[4px]">
              <button
                type="button"
                className="flex size-[32px] items-center justify-center rounded-md text-[var(--icon-secondary)] transition-colors hover:bg-[var(--fill-tsp-gray-main)]"
                onClick={() => p.onSetOpen(false)}
              >
                x
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1 p-2">
            <div className="flex h-full min-w-0 overflow-hidden rounded-[12px] border border-[var(--border-main)] bg-[var(--background-white-main)]">
              <div className="h-full w-[220px] flex-shrink-0 border-r border-[var(--border-main)] bg-[var(--background-menu-white)]">
                <div className="flex h-[40px] items-center justify-between border-b border-[var(--border-light)] px-3">
                  <span className="text-[13px] font-medium tracking-[-0.08px] text-[var(--text-primary)]">operator/</span>
                  <span className="text-[11px] text-[var(--text-tertiary)]">{p.artifacts.length}</span>
                </div>
                <div className="ms_sb h-[calc(100%-40px)] overflow-auto p-2">
                  {empty ? (
                    <div className="rounded-[10px] border border-[var(--border-light)] bg-[var(--background-card-gray)] p-3">
                      <div className="text-[12px] font-medium text-[var(--text-secondary)]">No artifacts yet.</div>
                      <div className="pt-1 text-[11px] leading-4 text-[var(--text-tertiary)]">Files and folders created by the agent will appear here in real time.</div>
                    </div>
                  ) : (
                    p.tree.map((node) => row(node, 0))
                  )}
                </div>
              </div>
              <div className="flex min-w-0 flex-1 flex-col bg-[var(--background-white-main)]">
                <div className="flex h-[40px] w-full items-center justify-between border-b border-[var(--border-light)] bg-[var(--background-card-gray)] px-3">
                  <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden text-[13px]">
                    {none ? (
                      <span className="truncate text-[var(--text-disable)]">operator/</span>
                    ) : (
                      pathParts.map((part, idx) => (
                        <div key={`${part}:${idx}`} className="flex min-w-0 items-center gap-1">
                          <span className={idx === pathParts.length - 1 ? "truncate text-[var(--text-primary)]" : "truncate text-[var(--text-disable)]"}>{part}</span>
                          {idx === pathParts.length - 1 ? null : <span className="text-[var(--text-disable)]">/</span>}
                        </div>
                      ))
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className="flex items-center justify-center rounded-lg border border-[var(--border-btn-main)] bg-[var(--fill-white)] px-2 py-1 text-[12px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--fill-tsp-gray-main)]"
                      onClick={copyCode}
                    >
                      copy
                    </button>
                  </div>
                </div>
                <div data-ms-editor="1" className="ms_right_editor relative min-h-0 flex-1 overflow-hidden bg-[var(--background-white-main)]">
                  <div ref={eref} className="h-full w-full" />
                  <div className="sr-only">{none ? "" : code}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default RightPanel

