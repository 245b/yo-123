import type { DraftFile } from "../../app/lib/store"
import type { Att, Msg } from "./types"

type PdfMod = typeof import("pdfjs-dist/legacy/build/pdf")
type DocMod = typeof import("mammoth/mammoth.browser")
type TessRes = { data?: { text?: string } }
type TessWorker = { recognize: (img: Blob) => Promise<TessRes>; terminate: () => Promise<unknown> }
type TessMod = { createWorker: (langs?: string | string[]) => Promise<TessWorker> }

export const createAttachmentHelpers = (doc: Document) => {
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

  return {
    ext,
    isImage,
    readAtts,
    readImgAtts,
    searchPrefix,
  }
}
