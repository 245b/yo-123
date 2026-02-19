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
  view: "code" | "preview"
  previewVncSrc: string
  tree: ExplorerNode[]
  artifacts: CreatedArtifact[]
  selectedPath: string
  selectedContent: string
  onSelectPath: (path: string) => void
  onSetView: (view: "code" | "preview") => void
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

type IconKind = "gear" | "ts" | "hash" | "doc" | "braces"

type FlatExplorerNode = {
  path: string
  name: string
  kind: "file" | "folder"
  depth: number
  open: boolean
}

const flattenExplorer = (nodes: ExplorerNode[], map: Record<string, boolean>, depth = 0) => {
  const out: FlatExplorerNode[] = []

  for (var i = 0; i < nodes.length; i++) {
    const node = nodes[i]

    if (!node) {
      continue
    }

    const path = trim(node.path)

    if (!path) {
      continue
    }

    const name0 = trim(node.name)
    const name = name0 || leaf(path) || "untitled"

    if (!name) {
      continue
    }

    const open = node.kind === "folder" ? folderOpen(map, path) : false

    out.push({
      path,
      name,
      kind: node.kind,
      depth,
      open,
    })

    if (node.kind !== "folder") {
      continue
    }

    if (!open) {
      continue
    }

    const kids = Array.isArray(node.children) ? node.children : []

    if (!kids.length) {
      continue
    }

    const list = flattenExplorer(kids, map, depth + 1)

    for (var j = 0; j < list.length; j++) {
      const row = list[j]

      if (!row) {
        continue
      }

      out.push(row)
    }
  }

  return out
}

const fileIconKind = (raw: string): IconKind => {
  const path = trim(raw).toLowerCase()

  if (!path) {
    return "doc"
  }

  if (path.endsWith(".tsx") || path.endsWith(".jsx")) {
    return "gear"
  }

  if (path.endsWith(".ts") || path.endsWith(".mts") || path.endsWith(".cts")) {
    return "ts"
  }

  if (path.endsWith(".css") || path.endsWith(".scss") || path.endsWith(".sass") || path.endsWith(".less")) {
    return "hash"
  }

  if (path.endsWith(".json") || path.endsWith(".prettierrc") || path.endsWith(".eslintrc") || path.endsWith(".babelrc")) {
    return "braces"
  }

  return "doc"
}

const fileIcon = (kind: IconKind) => {
  if (kind === "gear") {
    return (
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden="true">
        <path d="M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6Z" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <path
          d="M19 12l2-1-1-2-2 .4-1.3-1.3.4-2-2-1-1 2-1.8 0-1-2-2 1 .4 2-1.3 1.3-2-.4-1 2 2 1 0 1.8-2 1 1 2 2-.4 1.3 1.3-.4 2 2 1 1-2 1.8 0 1 2 2-1-.4-2 1.3-1.3 2 .4 1-2-2-1Z"
          stroke="currentColor"
          strokeWidth="1.8"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  }

  if (kind === "ts") {
    return <span className="text-[11px] font-bold leading-none tracking-[0.4px]">TS</span>
  }

  if (kind === "hash") {
    return <span className="text-[13px] leading-none">#</span>
  }

  if (kind === "braces") {
    return <span className="text-[11px] leading-none">{"{ }"}</span>
  }

  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden="true">
      <path d="M7 4h7l3 3v13H7z" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 4v4h4" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const RightPanel = (p: RightPanelProps) => {
  const s1 = useState<Record<string, boolean>>({})
  const fold = s1[0]
  const setFold = s1[1]
  const s2 = useState<boolean>(false)
  const dragging = s2[0]
  const setDragging = s2[1]
  const view = p.view
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

  const flatTree = useMemo(() => {
    return flattenExplorer(p.tree, fold)
  }, [p.tree, fold])

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

  const codeView = view === "code"
  const previewView = view === "preview"
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
    if (!p.open || !codeView) {
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
  }, [p.open, codeView])

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
  }, [p.w, p.open, dragging, codeView])

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
              <button
                type="button"
                data-ms-right-tab="code"
                aria-pressed={codeView}
                className={[
                  "flex h-[32px] items-center justify-center overflow-hidden rounded-[8px] border border-[var(--border-btn-main)] font-medium transition-[width,background-color,color,padding,gap] duration-100 ease-out",
                  codeView
                    ? "bg-[var(--fill-white)] text-[var(--text-primary)] gap-[6px] px-[8px]"
                    : "bg-[var(--fill-tsp-white-light)] text-[var(--text-secondary)] gap-[5px] px-[7px]",
                ].join(" ")}
                style={{ width: codeView ? "94px" : "90px" }}
                onClick={() => p.onSetView("code")}
              >
                <span aria-hidden="true" className="shrink-0">
                  {"</>"}
                </span>
                <span aria-hidden="false" className="whitespace-nowrap text-[14px] tracking-[-0.091px] transition-opacity duration-100 ease-out opacity-100">
                  Code
                </span>
              </button>
              <button
                type="button"
                data-ms-right-tab="preview"
                aria-pressed={previewView}
                className={[
                  "flex items-center justify-center text-[var(--text-primary)] rounded-[8px] clickable font-medium border border-[var(--border-btn-main)] overflow-hidden h-[32px] transition-[width,background-color,color,padding,gap] duration-100 ease-out",
                  previewView
                    ? "bg-[var(--fill-white)] gap-[6px] px-[8px]"
                    : "bg-[var(--fill-tsp-white-light)] text-[var(--text-secondary)] gap-[5px] px-[7px]",
                ].join(" ")}
                style={{ width: previewView ? "113px" : "108px" }}
                onClick={() => p.onSetView("preview")}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={previewView ? "var(--icon-primary)" : "var(--icon-secondary)"}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="lucide lucide-monitor-play shrink-0"
                  aria-hidden="true"
                >
                  <path d="M15.033 9.44a.647.647 0 0 1 0 1.12l-4.065 2.352a.645.645 0 0 1-.968-.56V7.648a.645.645 0 0 1 .967-.56z" />
                  <path d="M12 17v4" />
                  <path d="M8 21h8" />
                  <rect x="2" y="3" width="20" height="14" rx="2" />
                </svg>
                <span aria-hidden="false" className="text-[14px] tracking-[-0.091px] whitespace-nowrap font-medium transition-opacity duration-100 ease-out opacity-100">
                  Preview
                </span>
              </button>
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
            {codeView ? (
              <div data-ms-right-code-view="1" className="flex h-full min-w-0 overflow-hidden rounded-[12px] border border-[var(--border-main)] bg-[var(--background-white-main)]">
                <div className="h-full w-[225px] flex-shrink-0 border-r border-[var(--border-main)] bg-[var(--background-menu-white)]">
                  <div className="flex h-[42px] items-center justify-between border-b border-[var(--border-light)] px-3">
                    <span className="text-[13px] font-semibold tracking-[0.1px] text-[var(--text-primary)]">operator/</span>
                    <span className="text-[11px] text-[var(--text-tertiary)]">{p.artifacts.length}</span>
                  </div>
                  <div className="ms_sb h-[calc(100%-42px)] overflow-auto px-2 py-2">
                    {empty ? (
                      <div className="rounded-[10px] border border-[var(--border-light)] bg-[var(--fill-tsp-white-light)] p-3">
                        <div className="text-[12px] font-medium text-[var(--text-secondary)]">No artifacts yet.</div>
                        <div className="pt-1 text-[11px] leading-4 text-[var(--text-tertiary)]">Files and folders created by the agent will appear here in real time.</div>
                      </div>
                    ) : (
                      <ul className="m-0 list-none p-0">
                        {flatTree.map((node) => {
                          const selected = node.kind === "file" && trim(p.selectedPath) === node.path
                          const pad = 10 + node.depth * 16
                          const icon = node.kind === "file" ? fileIconKind(node.path) : null

                          return (
                            <li key={`${node.kind}:${node.path}`} className="w-full">
                              <button
                                type="button"
                                data-ms-node={node.path}
                                data-ms-kind={node.kind}
                                className={[
                                  "group flex h-[34px] w-full items-center gap-[8px] rounded-[6px] px-[10px] text-left text-[13px] font-medium transition-colors",
                                  node.kind === "file" && selected
                                    ? "bg-[var(--fill-tsp-gray-main)] text-[var(--text-primary)]"
                                    : "text-[var(--text-secondary)] hover:bg-[var(--fill-tsp-white-main)]",
                                ].join(" ")}
                                style={{ paddingInlineStart: `${pad}px` }}
                                onClick={() => {
                                  if (node.kind === "folder") {
                                    toggle(node.path)
                                    return
                                  }

                                  p.onSelectPath(node.path)
                                }}
                                title={node.name}
                              >
                                {node.kind === "folder" ? (
                                  <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center text-[var(--icon-secondary)]" aria-hidden="true">
                                    {node.open ? (
                                      <svg viewBox="0 0 24 24" className="h-4 w-4">
                                        <path d="M7 10l5 5 5-5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                                      </svg>
                                    ) : (
                                      <svg viewBox="0 0 24 24" className="h-4 w-4">
                                        <path d="M10 7l5 5-5 5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                                      </svg>
                                    )}
                                  </span>
                                ) : (
                                  <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center text-[var(--icon-secondary)] opacity-0" aria-hidden="true">
                                    <svg viewBox="0 0 24 24" className="h-4 w-4">
                                      <path d="M10 7l5 5-5 5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                  </span>
                                )}

                                {node.kind === "file" ? (
                                  <span className="flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center text-[var(--text-tertiary)]" aria-hidden="true">
                                    {fileIcon(icon || "doc")}
                                  </span>
                                ) : null}
                                <span className="min-w-0 flex-1 truncate">{node.name}</span>
                              </button>
                            </li>
                          )
                        })}
                      </ul>
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
            ) : null}
            {previewView ? (
              <div data-ms-right-preview-view="1" className="flex h-full min-w-0 overflow-hidden rounded-[12px] border border-[var(--border-main)] bg-[var(--background-white-main)] p-3">
                <div className="flex h-full w-full items-center justify-center rounded-[10px] bg-[var(--background-white-main)]">
                  <div data-ms-preview-pane="1" className="h-[96%] w-[96%] overflow-hidden rounded-[10px] border border-[var(--border-light)] bg-[var(--background-menu-white)]">
                    <iframe
                      data-ms-preview-vnc="1"
                      title="preview-vnc"
                      src={p.previewVncSrc}
                      className="h-full w-full border-0 bg-black"
                    />
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

export default RightPanel

