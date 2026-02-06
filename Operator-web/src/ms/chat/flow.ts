import type { DraftFile } from "../../app/lib/store"
import { apiBaseCandidates, apiUrl, apiUrlWithBase, probeApiBase, rememberApiBase } from "../../lib/api"
import { readResponse, streamResponse } from "./response"
import type { Att, Ch, DsWin, Msg, Req, Run, TermEntry } from "./types"

type PdfMod = typeof import("pdfjs-dist/legacy/build/pdf")
type DocMod = typeof import("mammoth/mammoth.browser")
type TessRes = { data?: { text?: string } }
type TessWorker = { recognize: (img: Blob) => Promise<TessRes>; terminate: () => Promise<unknown> }
type TessMod = { createWorker: (langs?: string | string[]) => Promise<TessWorker> }

export type FlowInput = {
  pickAtt: () => DraftFile[]
  clearAtt: () => void
  send: (box: Element, ta: HTMLTextAreaElement) => HTMLButtonElement | null
  set: (ta: HTMLTextAreaElement) => void
  shine: (b: HTMLButtonElement, on: boolean) => void
}

export type FlowStore = {
  setCur: (id: string) => void
  touch: (id: string, name?: string) => void
  saveMsgs: (id: string, ms: Msg[]) => void
  loadTerms: (id: string) => Record<string, TermEntry[]>
  saveTerms: (id: string, terms: Record<string, TermEntry[]>) => void
}

export type FlowUi = {
  host: (ta?: HTMLTextAreaElement | null) => HTMLDivElement | null
  add: (
    ta: HTMLTextAreaElement | null,
    role: "user" | "assistant",
    txt: string,
    err?: boolean,
    pending?: boolean,
    atts?: Att[],
  ) => HTMLElement | null
  mark: (el: HTMLElement, txt: string) => void
}

export type FlowApi = {
  go: (ta: HTMLTextAreaElement) => void
  halt: (why?: string) => void
}

export const setupFlow = (
  doc: Document,
  win: Window,
  sr: ShadowRoot | null,
  input: FlowInput,
  store: FlowStore,
  ui: FlowUi,
): FlowApi => {
  const clearAtt = input.clearAtt
  const send = input.send
  const set = input.set
  const shine = input.shine
  const setCur = store.setCur
  const touch = store.touch
  const saveMsgs = store.saveMsgs
  const loadTerms = store.loadTerms
  const saveTerms = store.saveTerms
  const host = ui.host
  const add = ui.add
  const mark = ui.mark
  const ck = "ms_chats"
  const pk = "ms_chat_"
  const tk = "ms_chat_title_"
  const nk = "ms_chat_title_name_"
  const wipe = "8==D 245B"
  const tok = 2000
  const cpt = 4
  const cap = tok * cpt
  const textExt = [
    "txt",
    "md",
    "markdown",
    "csv",
    "tsv",
    "json",
    "js",
    "jsx",
    "ts",
    "tsx",
    "py",
    "rb",
    "go",
    "java",
    "c",
    "cpp",
    "h",
    "hpp",
    "cs",
    "php",
    "html",
    "css",
    "scss",
    "less",
    "xml",
    "yml",
    "yaml",
    "toml",
    "ini",
    "log",
    "sql",
    "sh",
    "bat",
    "ps1",
  ]
  const imgExt = ["png", "jpg", "jpeg", "webp", "gif", "bmp", "tif", "tiff"]
  const docExt = ["docx"]
  const pdfExt = ["pdf"]
  const pdfOcrPages = 3
  const maxPdfOcrBytes = 15 * 1024 * 1024
  const pdfOcrScale = 1.5

  var pdf: PdfMod | null = null
  var pdfWorker = ""
  var docx: DocMod | null = null
  const isLegacyStallText = (raw: string) => {
    const t0 = typeof raw === "string" ? raw : ""
    const t = t0.trim().toLowerCase()

    if (!t) {
      return false
    }

    if (t.includes("no response events received")) {
      return true
    }

    if (t.includes("connection may be blocked")) {
      return true
    }

    if (t.includes("server stalled")) {
      return true
    }

    return false
  }

  const startThinkingTimer = (ph: HTMLElement | null) => {
    if (!ph) {
      return () => {}
    }

    const p = ph as HTMLElement & { __msThinkStop?: (() => void) | null }
    const prev = p.__msThinkStop

    if (typeof prev === "function") {
      prev()
    }

    const started = Date.now()
    const thinkDelayMs = 3000
    const thinkSpeed = 0.5
    var stop: (() => void) | null = null
    const tick = () => {
      if (!ph.isConnected) {
        if (stop) {
          stop()
        }
        return
      }

      const pending = ph.getAttribute("data-pending") === "1"
      const stalled = ph.getAttribute("data-ms-stall") === "1"

      if (!pending || stalled) {
        if (stop) {
          stop()
        }
        return
      }

      const cur0 = ph.textContent ?? ""
      const cur = cur0.trim()

      if (!cur.startsWith("Thinking")) {
        if (stop) {
          stop()
        }
        return
      }

      const elapsed = Date.now() - started

      if (elapsed < thinkDelayMs) {
        ph.textContent = "Thinking..."
        return
      }

      const sec = Math.floor(((elapsed - thinkDelayMs) / 1000) * thinkSpeed)

      if (sec < 1) {
        ph.textContent = "Thinking..."
        return
      }

      const tag = sec >= 60 ? `${Math.floor(sec / 60)}m` : `${sec}s`
      ph.textContent = `Thinking... (${tag})`
    }

    const id = win.setInterval(tick, 1000)
    stop = () => {
      win.clearInterval(id)

      if (p.__msThinkStop === stop) {
        p.__msThinkStop = null
      }
    }
    p.__msThinkStop = stop
    return stop
  }

  const termWrap = (el: HTMLElement) => {
    const row0 = el.closest?.('[data-ms-row="1"]') ?? null
    const row = row0 && (row0 as Node).nodeType === 1 ? (row0 as HTMLElement) : null

    if (!row) {
      return null
    }

    const w0 = row.querySelector('[data-ms-wrap="1"]') ?? null
    const wrap = w0 && (w0 as Node).nodeType === 1 ? (w0 as HTMLElement) : null
    return wrap
  }

  const termBox = (wrap: HTMLElement, entry: TermEntry) => {
    const id0 = typeof entry?.id === "string" ? entry.id : ""
    const id = id0.trim() || "tool"
    const sel = `[data-ms-term-id="${id}"]`
    const ex0 = wrap.querySelector(sel) ?? null
    const ex = ex0 && (ex0 as Node).nodeType === 1 ? (ex0 as HTMLElement) : null

    if (ex) {
      return ex
    }

    const box = doc.createElement("div")
    box.className = "ms-term"
    box.setAttribute("data-ms-term-id", id)

    const head = doc.createElement("div")
    head.className = "ms-term-head"

    const tag = doc.createElement("div")
    tag.className = "ms-term-tag"
    const tool0 = typeof entry?.tool === "string" ? entry.tool : ""
    tag.textContent = tool0.trim() || "terminal"

    const status = doc.createElement("div")
    status.className = "ms-term-muted"
    status.setAttribute("data-ms-term-status", "1")
    status.textContent = "done"

    head.appendChild(tag)
    head.appendChild(status)

    const body = doc.createElement("div")
    body.className = "ms-term-body"

    const inLabel = doc.createElement("div")
    inLabel.className = "ms-term-label"
    inLabel.textContent = "input"

    const inPre = doc.createElement("div")
    inPre.className = "ms-term-pre"
    inPre.setAttribute("data-ms-term-in", "1")

    const outLabel = doc.createElement("div")
    outLabel.className = "ms-term-label"
    outLabel.textContent = "output"

    const outPre = doc.createElement("div")
    outPre.className = "ms-term-pre ms-term-muted"
    outPre.setAttribute("data-ms-term-out", "1")
    outPre.textContent = "done"

    body.appendChild(inLabel)
    body.appendChild(inPre)
    body.appendChild(outLabel)
    body.appendChild(outPre)
    box.appendChild(head)
    box.appendChild(body)

    const tools0 = wrap.querySelector('[data-ms-tools="1"]') ?? null
    const tools = tools0 && (tools0 as Node).nodeType === 1 ? (tools0 as HTMLElement) : null

    if (tools) {
      wrap.insertBefore(box, tools)
      return box
    }

    wrap.appendChild(box)
    return box
  }

  const setTermText = (box: HTMLElement, sel: string, text: string) => {
    const el0 = box.querySelector(sel) ?? null
    const el = el0 && (el0 as Node).nodeType === 1 ? (el0 as HTMLElement) : null

    if (!el) {
      return
    }

    el.textContent = text
  }

  const setTermStatus = (box: HTMLElement, text: string) => {
    setTermText(box, '[data-ms-term-status="1"]', text)
  }

  const renderTerms = (el: HTMLElement, list: TermEntry[]) => {
    const wrap = termWrap(el)

    if (!wrap) {
      return
    }

    for (var i = 0; i < list.length; i++) {
      const it = list[i]

      if (!it) {
        continue
      }

      const box = termBox(wrap, it)
      const input0 = typeof it.input === "string" ? it.input : ""
      const output0 = typeof it.output === "string" ? it.output : ""
      const status0 = typeof it.status === "string" ? it.status : ""
      const status = status0 === "failed" || status0 === "running" ? status0 : "done"
      setTermText(box, '[data-ms-term-in="1"]', input0)
      setTermText(box, '[data-ms-term-out="1"]', output0 || "done")
      setTermStatus(box, status)
    }
  }

  const clearAll = (ta?: HTMLTextAreaElement | null) => {
    const ls = win.localStorage
    const keys: string[] = []

    for (var i = 0; i < ls.length; i++) {
      const k0 = ls.key(i)
      const k = typeof k0 === "string" ? k0 : ""

      if (k) {
        keys.push(k)
      }
    }

    for (var i = 0; i < keys.length; i++) {
      const k = keys[i] ?? ""

      if (!k) {
        continue
      }

      if (k === ck || k.startsWith(pk)) {
        ls.removeItem(k)
      }
    }

    ls.removeItem("__ms_chat_draft")
    clearAtt()

    const ww = win as DsWin
    ww.__ms_ds_busy = false
    ww.__ms_ds_abort = null
    ww.__ms_ds_run = null
    ww.__ms_ds_msgs = []
    ww.__ms_ds_id = ""

    const reset = ww.__ms_ds_reset

    if (typeof reset === "function") {
      reset()
    }

    if (typeof reset !== "function") {
      setCur("")
    }

    if (!ta) {
      return
    }

    ta.value = ""
    const g = win as unknown as typeof globalThis
    const E = g.Event
    ta.dispatchEvent(new E("input", { bubbles: true }))
    ta.dispatchEvent(new E("change", { bubbles: true }))
    set(ta)
  }

  const ext = (nm: string) => {
    const n0 = nm.trim().toLowerCase()

    if (!n0) {
      return ""
    }

    const i = n0.lastIndexOf(".")

    if (i < 0 || i >= n0.length - 1) {
      return ""
    }

    return n0.slice(i + 1)
  }

  const isPdf = (tp: string, ex: string) => {
    if (tp === "application/pdf") {
      return true
    }

    if (pdfExt.includes(ex)) {
      return true
    }

    return false
  }

  const isDocx = (tp: string, ex: string) => {
    if (tp === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
      return true
    }

    if (docExt.includes(ex)) {
      return true
    }

    return false
  }

  const isImage = (tp: string, ex: string) => {
    if (tp.startsWith("image/")) {
      return true
    }

    if (imgExt.includes(ex)) {
      return true
    }

    return false
  }

  const isText = (tp: string, ex: string) => {
    if (tp.startsWith("text/")) {
      return true
    }

    if (tp === "application/json") {
      return true
    }

    if (tp === "application/xml") {
      return true
    }

    if (tp === "application/x-yaml") {
      return true
    }

    if (tp === "application/sql") {
      return true
    }

    if (tp === "application/x-sh") {
      return true
    }

    if (textExt.includes(ex)) {
      return true
    }

    return false
  }

  const norm = (s: string) => {
    const t0 = typeof s === "string" ? s : ""
    const t1 = t0.replace(/\r/g, "")
    const t2 = t1.replace(/[ \t]+\n/g, "\n")
    const t3 = t2.replace(/\n{3,}/g, "\n\n")
    return t3.trim()
  }

  const searchPrefix = (raw: string) => {
    const t = raw.trim()

    if (!t) {
      return raw
    }

    const low = t.toLowerCase()

    if (
      low.startsWith("search:") ||
      low.startsWith("search ") ||
      low.startsWith("search about") ||
      low.startsWith("searchabout")
    ) {
      return raw
    }

    return `search: ${t}`
  }

  const split = (s: string, max0: number) => {
    const out: string[] = []
    const t = norm(s)

    if (!t) {
      return out
    }

    const ps = t.split(/\n{2,}/)
    var cur = ""

    for (var i = 0; i < ps.length; i++) {
      const p0 = ps[i] ?? ""
      const p1 = p0.trim()

      if (!p1) {
        continue
      }

      if (p1.length > max0) {
        if (cur) {
          out.push(cur)
          cur = ""
        }

        var j = 0

        while (j < p1.length) {
          var end = Math.min(p1.length, j + max0)
          var cut = p1.lastIndexOf(" ", end)
          const mid = j + Math.floor(max0 * 0.5)

          if (cut <= mid) {
            cut = end
          }

          const seg0 = p1.slice(j, cut)
          const seg = seg0.trim()

          if (seg) {
            out.push(seg)
          }

          j = cut
        }

        continue
      }

      if (!cur) {
        cur = p1
        continue
      }

      if (cur.length + p1.length + 2 <= max0) {
        cur = `${cur}\n\n${p1}`
        continue
      }

      out.push(cur)
      cur = p1
    }

    if (cur) {
      out.push(cur)
    }

    return out
  }

  const readText = async (b: Blob) => {
    const t0 = await b.text().catch(() => "")
    const t1 = typeof t0 === "string" ? t0 : ""

    if (t1) {
      return t1
    }

    const buf = await b.arrayBuffer().catch(() => null)

    if (!buf) {
      return ""
    }

    return new TextDecoder().decode(buf)
  }

  const readUrl = (b: Blob) => {
    return new Promise<string>((resolve) => {
      const r = new FileReader()
      const done = () => {
        const v = typeof r.result === "string" ? r.result : ""
        resolve(v)
      }

      r.onload = done
      r.onerror = () => resolve("")
      r.onabort = () => resolve("")
      r.readAsDataURL(b)
    })
  }

  const readPdf = async (b: Blob) => {
    const buf = await b.arrayBuffer().catch(() => null)

    if (!buf) {
      return ""
    }

    if (!pdf) {
      const m0 = (await import("pdfjs-dist/legacy/build/pdf").catch(() => null)) as PdfMod | null

      if (!m0) {
        return null
      }

      pdf = m0
    }

    if (!pdfWorker) {
      const w0 = await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url").catch(() => null)
      const w1 = (w0 as { default?: unknown } | null)?.default
      const w2 = typeof w1 === "string" ? w1 : ""

      if (w2) {
        pdfWorker = w2
      }
    }

    if (pdfWorker) {
      pdf.GlobalWorkerOptions.workerSrc = pdfWorker
    }

    const task = pdf.getDocument({ data: new Uint8Array(buf) })
    const doc = await task.promise.catch(() => null)

    if (!doc) {
      return ""
    }

    var out = ""
    const total = typeof doc.numPages === "number" ? doc.numPages : 0

    for (var p = 1; p <= total; p++) {
      const page = await doc.getPage(p).catch(() => null)

      if (!page) {
        continue
      }

      const tc = await page.getTextContent().catch(() => null)

      if (!tc) {
        continue
      }

      const items0 = tc.items ?? []
      const items = Array.isArray(items0) ? items0 : []
      var txt = ""

      for (var i = 0; i < items.length; i++) {
        const it = (items[i] ?? null) as { str?: unknown } | null
        const s0 = typeof it?.str === "string" ? it.str : ""

        if (!s0) {
          continue
        }

        if (txt) {
          txt += " "
        }

        txt += s0
      }

      const seg = txt.trim()

      if (!seg) {
        continue
      }

      if (out) {
        out += "\n\n"
      }

      out += `[[Page ${p}]]\n${seg}`
    }

    return out
  }

  const readPdfOcr = async (b: Blob, maxPages: number, wk: TessWorker, sig: AbortSignal) => {
    const buf = await b.arrayBuffer().catch(() => null)

    if (!buf) {
      return ""
    }

    if (!pdf) {
      const m0 = (await import("pdfjs-dist/legacy/build/pdf").catch(() => null)) as PdfMod | null

      if (!m0) {
        return ""
      }

      pdf = m0
    }

    if (!pdfWorker) {
      const w0 = await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url").catch(() => null)
      const w1 = (w0 as { default?: unknown } | null)?.default
      const w2 = typeof w1 === "string" ? w1 : ""

      if (w2) {
        pdfWorker = w2
      }
    }

    if (pdfWorker) {
      pdf.GlobalWorkerOptions.workerSrc = pdfWorker
    }

    if (maxPages <= 0) {
      return ""
    }

    const task = pdf.getDocument({ data: new Uint8Array(buf) })
    const pdfDoc = await task.promise.catch(() => null)

    if (!pdfDoc) {
      return ""
    }

    const total = typeof pdfDoc.numPages === "number" ? pdfDoc.numPages : 0
    const limit = Math.min(total, Math.max(1, Math.floor(maxPages)))
    var out = ""

    for (var p = 1; p <= limit; p++) {
      if (sig.aborted) {
        break
      }

      const page = await pdfDoc.getPage(p).catch(() => null)

      if (!page) {
        continue
      }

      const viewport = page.getViewport({ scale: pdfOcrScale })
      const w = Math.max(1, Math.floor(viewport.width))
      const h = Math.max(1, Math.floor(viewport.height))
      const canvas = doc.createElement("canvas")
      const ctx = canvas.getContext("2d")

      if (!ctx) {
        canvas.width = 0
        canvas.height = 0
        continue
      }

      canvas.width = w
      canvas.height = h

      const rt = page.render({ canvasContext: ctx, viewport }) as { promise?: Promise<unknown> } | null
      const rp = rt?.promise

      if (rp) {
        await rp.catch(() => null)
      }

      const blob = await new Promise<Blob | null>((resolve) => {
        if (typeof canvas.toBlob !== "function") {
          resolve(null)
          return
        }

        canvas.toBlob((b0) => resolve(b0 || null), "image/png")
      })

      canvas.width = 0
      canvas.height = 0

      if (!blob) {
        continue
      }

      const res = await wk.recognize(blob).catch(() => null)
      const t0 = typeof res?.data?.text === "string" ? res.data.text : ""
      const seg = norm(t0)

      if (!seg) {
        continue
      }

      if (out) {
        out += "\n\n"
      }

      out += `[[Page ${p} OCR]]\n${seg}`
    }

    return out
  }

  const readDocx = async (b: Blob) => {
    const buf = await b.arrayBuffer().catch(() => null)

    if (!buf) {
      return ""
    }

    if (!docx) {
      const m0 = (await import("mammoth/mammoth.browser").catch(() => null)) as DocMod | null
      const m1 = (m0 as { default?: unknown } | null)?.default
      const m2 =
        m0 && typeof (m0 as { extractRawText?: unknown }).extractRawText === "function" ? m0 : null
      const m3 =
        m1 && typeof (m1 as { extractRawText?: unknown }).extractRawText === "function" ? (m1 as DocMod) : null
      const m4 = m2 || m3

      if (!m4) {
        return null
      }

      docx = m4
    }

    const res = await docx.extractRawText({ arrayBuffer: buf }).catch(() => null)
    const t0 = typeof res?.value === "string" ? res.value : ""
    return t0
  }

  const readImgAtts = async (fs: DraftFile[]) => {
    const out: Att[] = []

    if (!fs.length) {
      return out
    }

    for (var i = 0; i < fs.length; i++) {
      const it = fs[i]

      if (!it) {
        continue
      }

      const nm0 = (it.name ?? "").trim()
      const tp0 = (it.type ?? "").toLowerCase()
      const ex = ext(nm0)

      if (!isImage(tp0, ex)) {
        continue
      }

      const url = await readUrl(it.file)
      const u = url.trim()

      if (!u) {
        continue
      }

      const n0 = nm0.replace(/[\t\r\n]+/g, " ").trim()
      const name = n0 || "image"
      out.push({ name, url: u })
    }

    return out
  }

  const readAtts = async (fs: DraftFile[], sig: AbortSignal) => {
    const out: Msg[] = []
    const notes: string[] = []
    var hasImg = false

    if (!fs.length) {
      return out
    }

    var wk: TessWorker | null = null

    const useWk = async () => {
      if (wk) {
        return wk
      }

      const mod0 = (await import("tesseract.js").catch(() => null)) as TessMod | null
      const mod1 = mod0 && typeof mod0.createWorker === "function" ? mod0 : null
      const mod2 = (mod0 as { default?: unknown } | null)?.default
      const mod3 =
        mod2 && typeof (mod2 as { createWorker?: unknown }).createWorker === "function" ? (mod2 as TessMod) : null
      const mod = mod1 || mod3

      if (!mod) {
        return null
      }

      const w0 = await mod.createWorker("eng").catch(() => null)

      if (!w0) {
        return null
      }

      wk = w0
      return wk
    }

    for (var i = 0; i < fs.length; i++) {
      if (sig.aborted) {
        break
      }

      const it = fs[i]

      if (!it) {
        continue
      }

      const nm0 = it.name ?? ""
      const nm1 = nm0.trim()
      const nm = nm1 || "unnamed"
      const tp0 = it.type ?? ""
      const tp = tp0.toLowerCase()
      const ex = ext(nm1)
      const file = it.file
      const size0 = typeof file?.size === "number" ? file.size : 0

      if (!file || size0 <= 0) {
        const k0 = tp || ex || "unknown"
        notes.push(`${nm} (${k0}): file data unavailable; please reattach`)
        continue
      }

      var kind = ""

      if (isPdf(tp, ex)) {
        kind = "pdf"
      }

      if (!kind && isDocx(tp, ex)) {
        kind = "docx"
      }

      if (!kind && isImage(tp, ex)) {
        kind = "image"
      }

      if (!kind && isText(tp, ex)) {
        kind = "text"
      }

      if (!kind) {
        const k0 = tp || ex || "unknown"
        notes.push(`${nm} (${k0}): unsupported file type`)
        continue
      }

      var txt = ""
      var ocrFail = false
      var note = ""

      if (kind === "pdf") {
        const out = await readPdf(file)

        if (out === null) {
          const k0 = tp || ex || kind
          notes.push(`${nm} (${k0}): PDF extraction unavailable`)
          continue
        }

        txt = out
        const base = norm(txt)

        if (!base) {
          const k0 = tp || ex || kind

          if (size0 > maxPdfOcrBytes) {
            const mb = Math.max(1, Math.ceil(size0 / (1024 * 1024)))
            note = `${nm} (${k0}): no extractable text; OCR skipped (file too large, ${mb} MB)`
          }

          if (!note) {
            const w0 = await useWk()

            if (!w0) {
              note = `${nm} (${k0}): PDF OCR unavailable`
            }

            if (!note && w0) {
              const ocr = await readPdfOcr(file, pdfOcrPages, w0, sig)
              txt = ocr

              if (!norm(txt)) {
                note = `${nm} (${k0}): OCR attempted (first ${pdfOcrPages} pages) but no text found`
              }
            }
          }
        }
      }

      if (kind === "docx") {
        const out = await readDocx(file)

        if (out === null) {
          const k0 = tp || ex || kind
          notes.push(`${nm} (${k0}): DOCX extraction unavailable`)
          continue
        }

        txt = out
      }

      if (kind === "image") {
        hasImg = true
        const w0 = await useWk()

        if (!w0) {
          const k0 = tp || ex || "image"
          notes.push(`${nm} (${k0}): OCR unavailable`)
          continue
        }

        const res = await w0.recognize(file).catch(() => null)
        const t0 = typeof res?.data?.text === "string" ? res.data.text : ""

        if (!res) {
          ocrFail = true
        }

        txt = t0
      }

      if (kind === "text") {
        txt = await readText(file)
      }

      const clean = norm(txt)

      if (!clean) {
        const k0 = tp || ex || kind
        if (note) {
          notes.push(note)
          continue
        }
        if (ocrFail) {
          notes.push(`${nm} (${k0}): OCR failed`)
          continue
        }

        notes.push(`${nm} (${k0}): no extractable text`)
        continue
      }

      const chunks = split(clean, cap)

      if (!chunks.length) {
        const k0 = tp || ex || kind
        notes.push(`${nm} (${k0}): no extractable text`)
        continue
      }

      const k0 = tp || ex || kind

      for (var j = 0; j < chunks.length; j++) {
        const chunk = chunks[j] ?? ""
        const head = `[File: ${nm}] [Type: ${k0}] [Chunk ${j + 1}/${chunks.length}]`
        const content = `${head}\n${chunk}`
        out.push({ role: "user", content })
      }
    }

    const w0 = wk as TessWorker | null

    if (w0) {
      await w0.terminate().catch(() => null)
    }

    if (hasImg) {
      const note =
        "Image attachments were OCR-processed. Acknowledge receipt of the screenshot/photo, then analyze the extracted text. Do not say you cannot analyze images."
      out.unshift({ role: "user", content: note })
    }

    if (notes.length) {
      const body = notes.map((s) => `- ${s}`).join("\n")
      const msg = `Attachment extraction notes:\n${body}`
      out.unshift({ role: "user", content: msg })
    }

    if (out.length) {
      const lead =
        "Attached files were extracted to text. Use the chunks and notes below as source material for your response."
      out.unshift({ role: "user", content: lead })
    }

    return out
  }

  const un = (s: string) => {
    var out = ""

    for (var i = 0; i < s.length; i++) {
      const c = s[i] ?? ""

      if (c !== "\\") {
        out += c
        continue
      }

      const n = s[i + 1] ?? ""

      if (!n) {
        out += c
        continue
      }

      if (n === "n") {
        out += "\n"
        i++
        continue
      }

      if (n === "r") {
        out += "\r"
        i++
        continue
      }

      if (n === "t") {
        out += "\t"
        i++
        continue
      }

      if (n === "\\") {
        out += "\\"
        i++
        continue
      }

      out += c
    }

    return out
  }

  const meta = (id: string) => {
    const raw0 = win.localStorage.getItem(`${tk}${id}`) ?? ""
    const raw = raw0.trim()

    if (!raw) {
      return { g: 0, l: false, p: false }
    }

    const parts = raw.split("|")
    const g0 = Number.parseInt((parts[0] ?? "").trim(), 10)
    const g = Number.isFinite(g0) ? g0 : 0
    const l = (parts[1] ?? "").trim() === "1"
    const p = (parts[2] ?? "").trim() === "1"
    return { g, l, p }
  }

  const saveMeta = (id: string, g: number, l: boolean, p: boolean) => {
    const g0 = Number.isFinite(g) ? Math.max(0, Math.floor(g)) : 0
    const v = `${g0}|${l ? 1 : 0}|${p ? 1 : 0}`
    win.localStorage.setItem(`${tk}${id}`, v)
  }

  const auto = (id: string) => (win.localStorage.getItem(`${nk}${id}`) ?? "").trim()

  const name = (id: string) => {
    const raw0 = win.localStorage.getItem(ck) ?? ""
    const raw = raw0.trim()

    if (!raw) {
      return ""
    }

    const ls = raw
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)

    for (var i = 0; i < ls.length; i++) {
      const s = ls[i] ?? ""
      const p = s.split("\t")
      const cid = (p[0] ?? "").trim()

      if (cid !== id) {
        continue
      }

      const nm = un((p[1] ?? "").trim())
      return nm
    }

    return ""
  }

  const def = (v: string) => {
    const t = v.trim()

    if (!t) {
      return true
    }

    return /^New chat( \(\d+\))?$/i.test(t)
  }

  const pick = (ms: Msg[]) => {
    var u = ""
    var a = ""

    for (var i = 0; i < ms.length; i++) {
      const m = ms[i]
      const r = m?.role ?? ""

      if (r === "user" && !u) {
        const c0 = typeof m?.content === "string" ? m.content : ""
        u = c0.trim()
      }

      if (r === "assistant" && !a) {
        const c0 = typeof m?.content === "string" ? m.content : ""
        a = c0.trim()
      }

      if (u && a) {
        break
      }
    }

    return { u, a }
  }

  const title = (id: string, ms: Msg[], step: "user" | "assistant") => {
    return
    const cid = id.trim()

    if (!cid) {
      return
    }

    const m0 = meta(cid)

    if (m0.l || m0.p) {
      return
    }

    if (step === "user" && m0.g > 0) {
      return
    }

    if (step === "assistant" && m0.g > 1) {
      return
    }

    const cur = name(cid).trim()
    const a0 = auto(cid)
    const d0 = def(cur)
    const raw0 = win.localStorage.getItem(`${pk}${cid}`) ?? ""
    const raw = raw0.trim()

    if (!cur || !raw) {
      return
    }

    if (!d0) {
      if (a0 && cur !== a0) {
        saveMeta(cid, m0.g, true, false)
        return
      }

      if (!a0) {
        saveMeta(cid, m0.g, true, false)
        return
      }
    }

    const pick0 = pick(ms)
    const u0 = pick0.u
    const a1 = pick0.a

    if (!u0) {
      return
    }

    const list: { role: "user" | "assistant"; content: string }[] = []
    const u1 = u0.slice(0, 1200).trim()

    if (!u1) {
      return
    }

    list.push({ role: "user", content: u1 })

    if (step === "assistant") {
      const a2 = a1.slice(0, 1200).trim()

      if (a2) {
        list.push({ role: "assistant", content: a2 })
      }
    }

    if (!list.length) {
      return
    }

    saveMeta(cid, m0.g, m0.l, true)

    win
      .fetch(apiUrl("/api/title"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chatId: cid, messages: list }),
      })
      .then((r) =>
        r
          .json()
          .then((j) => ({ ok: r.ok, j }))
          .catch(() => ({ ok: false, j: null })),
      )
      .then((x) => {
        const m1 = meta(cid)

        if (!x.ok) {
          saveMeta(cid, m1.g, m1.l, false)
          return
        }

        const o = (x.j && typeof x.j === "object" ? x.j : null) as { title?: unknown } | null
        const t0 = typeof o?.title === "string" ? o.title : ""
        const t = t0.trim()

        if (!t) {
          saveMeta(cid, m1.g, m1.l, false)
          return
        }

        const cur0 = name(cid).trim()
        const a2 = auto(cid)
        const d1 = def(cur0)
        const raw0 = win.localStorage.getItem(`${pk}${cid}`) ?? ""
        const raw = raw0.trim()

        if (!cur0 || !raw) {
          saveMeta(cid, m1.g, true, false)
          return
        }

        if (!d1) {
          if (a2 && cur0 !== a2) {
            saveMeta(cid, m1.g, true, false)
            return
          }

          if (!a2) {
            saveMeta(cid, m1.g, true, false)
            return
          }
        }

        touch(cid, t)
        win.localStorage.setItem(`${nk}${cid}`, t)
        const g1 = m1.g + 1
        const lock = step === "assistant" || g1 >= 2
        saveMeta(cid, g1, lock, false)
      })
      .catch(() => {
        const m1 = meta(cid)
        saveMeta(cid, m1.g, m1.l, false)
      })
  }

  const go = (ta: HTMLTextAreaElement) => {
    const ww = win as DsWin

    if (ww.__ms_ds_busy) {
      return
    }

    ww.__ms_ds_ta = ta

    const v0 = ta.value ?? ""
    const v = v0.trim()
    const fs = input.pickAtt()
    const ha = fs.length > 0

    if (v === wipe) {
      clearAll(ta)
      return
    }

    if (!v && !ha) {
      return
    }

    const cur0 = ww.__ms_ds_id ?? ""
    const cur = cur0.trim()

    if (!cur) {
      const id0 = win.crypto?.randomUUID?.() ?? ""
      const id = id0 || `${Date.now()}`
      ww.__ms_ds_id = id
      touch(id)
      setCur(id)
    }

    const cid0 = ww.__ms_ds_id ?? ""
    const cid = cid0.trim()

    if (!cid) {
      return
    }

    setCur(cid)
    touch(cid)

    const hs = ww.__ms_ds_msgs ?? []
    ww.__ms_ds_msgs = hs

    const box =
      ta.closest("form") ??
      ta.closest('[data-ms-chatbox="1"]') ??
      ta.closest("div.rounded-\\[22px\\]") ??
      ta.closest("div.rounded-\\[24px\\]") ??
      ta.closest("div") ??
      null

    if (!box) {
      return
    }

    const ns = fs
      .map((it) => (it?.name ?? "").trim())
      .filter((it) => it.length > 0)
      .slice(0, 6)
      .join(", ")
    const hu = v.length > 0
    var msg = v.trim()

    if (!msg && ha) {
      msg = ns ? `Attached files: ${ns}` : "Attached files"
    }

    var rq = msg

    if (!hu && ha) {
      rq = ns ? `Please analyze the attached files (${ns}).` : "Please analyze the attached files."
    }

    const searchOn = (box.getAttribute("data-ms-search") ?? "").trim() === "1"

    if (searchOn && hu) {
      rq = searchPrefix(rq)
    }

    const b = send(box, ta)

    ww.__ms_ds_busy = true

    if (b) {
      shine(b, false)
    }
    var ats: Att[] = []

    if (ha) {
      const out: Att[] = []

      for (var i = 0; i < fs.length; i++) {
        const it = fs[i]

        if (!it) {
          continue
        }

        const nm0 = (it.name ?? "").trim()
        const tp0 = (it.type ?? "").toLowerCase()
        const ex = ext(nm0)

        if (!isImage(tp0, ex)) {
          continue
        }

        const u0 = typeof URL.createObjectURL === "function" ? URL.createObjectURL(it.file) : ""
        const u = typeof u0 === "string" ? u0 : ""

        if (!u) {
          continue
        }

        out.push({ name: nm0 || "image", url: u })
      }

      ats = out
    }

    const m: Msg = { role: "user", content: msg }
    hs.push(m)
    add(ta, "user", msg, false, false, ats)
    saveMsgs(cid, hs)
    title(cid, hs, "user")

    if (ha) {
      const list = fs.slice()
      const sync = async () => {
        const img = await readImgAtts(list)

        if (!img.length) {
          return
        }

        m.atts = img
        saveMsgs(cid, hs)
      }

      sync()
    }

    const p0 = ta.getAttribute("placeholder") ?? ""
    const p = p0.trim().toLowerCase()

    if (p.includes("assign a task") && p.includes("ask")) {
      ta.setAttribute("placeholder", "Send message to Operator")
      ta.rows = 1
    }

    ta.value = ""
    if (ha) {
      clearAtt()
    }
    const g = win as unknown as typeof globalThis
    const E = g.Event
    ta.dispatchEvent(new E("input", { bubbles: true }))
    ta.dispatchEvent(new E("change", { bubbles: true }))
    set(ta)
    ta.focus()

    const ph = add(ta, "assistant", "Thinking...", false, true)
    const run: Run = { ph, txt: "", ta, box }
    ww.__ms_ds_run = run
    const ac = new AbortController()
    ww.__ms_ds_abort = ac
    const msgs = hs.slice(Math.max(0, hs.length - 24))
    var ax: Msg[] | null = null
    const sendReq = async (atts: DraftFile[], rq: string, retry?: boolean, nostream?: boolean) => {
      const rq0 = rq.trim()
      var base = msgs.slice()
      const last = base[base.length - 1] ?? null
      if (nostream) {
        startThinkingTimer(ph)
      }

      if (last && last.role === "user" && rq0 && last.content !== rq0) {
        base[base.length - 1] = { role: "user", content: rq0 }
      }

      var extra: Msg[] = []

      if (atts.length) {
        if (!ax) {
          if (ph) {
            ph.textContent = "Analyzing attachments..."
          }

          ax = await readAtts(atts, ac.signal)
        }

        extra = ax || []
      }

      if (ac.signal.aborted) {
        return
      }

      const stopped = ww.__ms_ds_run?.stop === true

      if (stopped) {
        return
      }

      if (extra.length) {
        const idx = Math.max(0, base.length - 1)
        const head = base.slice(0, idx)
        const tail = base.slice(idx)
        base = head.concat(extra, tail)
      }

      const m0 = doc.documentElement.getAttribute("data-ms-mode") ?? ""
      const m1 = m0.trim()
      const mode = m1 || "chat"
      const clean = base.map((m) => ({ role: m.role, content: m.content }))
      const req: Req = { messages: clean, chatId: cid, mode }
      const again = retry === true
      var acc = "text/event-stream"

      if (nostream) {
        acc = "application/json"
      }
      const payload = {
        method: "POST",
        headers: { "content-type": "application/json", accept: acc },
        signal: ac.signal,
        body: JSON.stringify(req),
      }
      const tryFetch = async (bases: string[]) => {
        var last: Response | null = null

        for (var i = 0; i < bases.length; i++) {
          const b = bases[i] ?? ""
          const url = apiUrlWithBase("/api/chat", b)
          const res = await win.fetch(url, payload).catch(() => null)

          if (!res) {
            continue
          }

          last = res

          if (res.status === 404) {
            continue
          }

          if (b) {
            rememberApiBase(b)
          }

          return res
        }

        return last
      }
      const list0 = apiBaseCandidates()
      const list = list0.length ? list0.concat("") : [""]
      const r = await tryFetch(list)

      if (!r) {
        if (!again) {
          await probeApiBase()
          return sendReq(atts, rq, true, nostream)
        }

        const stop = ww.__ms_ds_run?.stop === true
        const aborted = ac.signal.aborted

        if (aborted) {
          ww.__ms_ds_busy = false
          ww.__ms_ds_abort = null
          ww.__ms_ds_run = null
          set(ta)
          return
        }

        if (stop) {
          ww.__ms_ds_busy = false
          ww.__ms_ds_abort = null
          ww.__ms_ds_run = null
          set(ta)
          return
        }

        ww.__ms_ds_busy = false
        ww.__ms_ds_abort = null
        ww.__ms_ds_run = null
        set(ta)
        const e = "Network error. API server unreachable."

        if (ph) {
          ph.textContent = e
          ph.setAttribute("data-err", "1")
          ph.removeAttribute("data-pending")
          return
        }

        add(ta, "assistant", e, true)
        return
      }

      if (r.status === 404 && !again) {
        await probeApiBase()
        return sendReq(atts, rq, true, nostream)
      }

      const nf = r.status === 404
      const ct0 = r.headers.get("content-type") ?? ""
      const ct = ct0.toLowerCase()
      const x = ct.includes("text/event-stream") ? await streamResponse(r, run, mark, ph) : await readResponse(r)
      const isStream = x.stream === true

      if (isStream) {
        const ok = x.ok
        const t0 = typeof x.text === "string" ? x.text : ""
        const t = t0.trim()
        const stalled = x.stalled === true
        const stop = ww.__ms_ds_run?.stop === true
        const aborted = ac.signal.aborted

        if (!ok && stalled && !t && !stop && !aborted && !nostream) {
          if (ph) {
            ph.removeAttribute("data-ms-stall")
            ph.removeAttribute("data-err")
            ph.textContent = "Thinking..."
            ph.setAttribute("data-pending", "1")
          }

          return sendReq(atts, rq, true, true)
        }
      }

      const stop = ww.__ms_ds_run?.stop === true
      ww.__ms_ds_busy = false
      ww.__ms_ds_abort = null
      ww.__ms_ds_run = null
      set(ta)

      if (stop) {
        return
      }

      if (x.stream) {
        const ok = x.ok
        const t0 = typeof x.text === "string" ? x.text : ""
        var t = t0.trim()
        const stalled = x.stalled === true
        const terms = Array.isArray(x.terms) ? x.terms : []

        if (!ok) {
          const eRaw = typeof x.error === "string" ? x.error : ""
          const legacy = isLegacyStallText(eRaw)

          if (legacy && !nostream && !ac.signal.aborted) {
            if (ph) {
              ph.removeAttribute("data-ms-stall")
              ph.removeAttribute("data-err")
              ph.textContent = "Thinking..."
              ph.setAttribute("data-pending", "1")
            }

            return sendReq(atts, rq, true, true)
          }

          const e0 = legacy ? "" : eRaw
          const e = nf ? "API server not found (404). Start the API server or set VITE_API_BASE." : e0 || "Request failed"

          if (ph) {
            ph.textContent = e
            ph.setAttribute("data-err", "1")
            ph.removeAttribute("data-pending")
            return
          }

          add(ta, "assistant", e, true)
          return
        }

        if (!t) {
          if (stalled && !nostream && !ac.signal.aborted) {
            if (ph) {
              ph.removeAttribute("data-ms-stall")
              ph.removeAttribute("data-err")
              ph.textContent = "Thinking..."
              ph.setAttribute("data-pending", "1")
            }

            return sendReq(atts, rq, true, true)
          }

          const e = nf ? "API server not found (404). Start the API server or set VITE_API_BASE." : "Request failed"

          if (ph) {
            ph.textContent = e
            ph.setAttribute("data-err", "1")
            ph.removeAttribute("data-pending")
            return
          }

          add(ta, "assistant", e, true)
          return
        }

        if (isLegacyStallText(t)) {
          if (!nostream && !ac.signal.aborted) {
            if (ph) {
              ph.removeAttribute("data-ms-stall")
              ph.removeAttribute("data-err")
              ph.textContent = "Thinking..."
              ph.setAttribute("data-pending", "1")
            }

            return sendReq(atts, rq, true, true)
          }

          t = "Request failed"
        }

        hs.push({ role: "assistant", content: t })
        touch(cid)
        saveMsgs(cid, hs)
        if (terms.length) {
          const map = loadTerms(cid)
          map[`${hs.length - 1}`] = terms
          saveTerms(cid, map)
        }
        title(cid, hs, "assistant")

        if (ph) {
          mark(ph, t)
          ph.removeAttribute("data-pending")
          return
        }

        add(ta, "assistant", t)
        return
      }

      const o = (x.j && typeof x.j === "object" ? x.j : null) as {
        text?: unknown
        error?: unknown
        terms?: unknown
      } | null

      if (!x.ok) {
        const eRaw = typeof o?.error === "string" ? o.error : ""
        const e0 = isLegacyStallText(eRaw) ? "" : eRaw
        const t0 = typeof x.t === "string" ? x.t : ""
        const t1 = t0.replace(/\s+/g, " ").trim()
        const t = t1.slice(0, 240)
        const hint =
          t.includes("ECONNREFUSED") || t.includes("proxy")
            ? "API server unreachable. Run: npm run dev:server (or restart with npm run dev)"
            : ""
        const e = nf
          ? "API server not found (404). Start the API server or set VITE_API_BASE."
          : e0 || hint || t || `Request failed (${x.st})`

        if (ph) {
          ph.textContent = e
          ph.setAttribute("data-err", "1")
          ph.removeAttribute("data-pending")
          return
        }

        add(ta, "assistant", e, true)
        return
      }

      const t0 = typeof o?.text === "string" ? o.text : ""
      var t = t0.trim()

      if (isLegacyStallText(t)) {
        t = ""
      }

      if (!t) {
        const eRaw = typeof o?.error === "string" ? o.error : ""
        const e0 = isLegacyStallText(eRaw) ? "" : eRaw
        const e = e0 || "Request failed"

        if (ph) {
          ph.textContent = e
          ph.setAttribute("data-err", "1")
          ph.removeAttribute("data-pending")
          return
        }

        add(ta, "assistant", e, true)
        return
      }

      hs.push({ role: "assistant", content: t })
      touch(cid)
      saveMsgs(cid, hs)
      const terms = Array.isArray(o?.terms) ? o?.terms ?? [] : []
      if (terms.length) {
        const map = loadTerms(cid)
        map[`${hs.length - 1}`] = terms
        saveTerms(cid, map)
      }
      title(cid, hs, "assistant")

      if (ph) {
        mark(ph, t)
        ph.removeAttribute("data-pending")
        if (terms.length) {
          renderTerms(ph, terms)
        }
        return
      }

      const el = add(ta, "assistant", t)
      if (el && terms.length) {
        renderTerms(el, terms)
      }
    }

    sendReq(fs, rq).catch(() => {
      ww.__ms_ds_busy = false
      ww.__ms_ds_abort = null
      ww.__ms_ds_run = null
      set(ta)

      if (ph) {
        ph.textContent = "Request failed"
        ph.setAttribute("data-err", "1")
        ph.removeAttribute("data-pending")
        return
      }

      add(ta, "assistant", "Request failed", true)
    })
  }

  const halt = (why?: string) => {
    const ww = win as DsWin
    const busy = ww.__ms_ds_busy === true
    const ac = ww.__ms_ds_abort ?? null
    const run = ww.__ms_ds_run ?? null
    const stopped = run?.stop === true
    const rd = run?.rd ?? null

    if (stopped) {
      return
    }

    if (!busy && !ac && !run) {
      return
    }

    if (run) {
      run.stop = true
    }

    ww.__ms_ds_busy = false
    ww.__ms_ds_abort = null

    if (ac) {
      ac.abort()
    }

    if (rd) {
      rd.cancel().catch(() => {})
    }

    const ph = run?.ph ?? null
    const t0 = run?.txt ?? ""
    const t = t0.trim()

    if (ph) {
      if (t) {
        mark(ph, t)
      }

      if (!t) {
        ph.textContent = why || "Stopped"
      }

      ph.removeAttribute("data-pending")
    }

    if (t) {
      const hs = ww.__ms_ds_msgs ?? []
      ww.__ms_ds_msgs = hs
      const cid0 = ww.__ms_ds_id ?? ""
      const cid = cid0.trim()

      if (cid) {
        hs.push({ role: "assistant", content: t })
        touch(cid)
        saveMsgs(cid, hs)
      }
    }

    const ta0 = run?.ta ?? ww.__ms_ds_ta ?? null
    const ta = ta0?.tagName === "TEXTAREA" ? (ta0 as HTMLTextAreaElement) : null

    if (!ta) {
      return
    }

    set(ta)
  }

  return { go, halt }
}
