declare module "mammoth/mammoth.browser" {
  import mammoth = require("mammoth")
  export = mammoth
}

declare module "pdfjs-dist/legacy/build/pdf" {
  export type TextItem = { str?: string }
  export type TextContent = { items: TextItem[] }
  export type PdfViewport = { width: number; height: number }
  export type PdfRenderTask = { promise?: Promise<unknown> }
  export type PDFPageProxy = {
    getTextContent: () => Promise<TextContent>
    getViewport: (opts?: { scale?: number }) => PdfViewport
    render: (opts: { canvasContext: CanvasRenderingContext2D; viewport: PdfViewport }) => PdfRenderTask
  }
  export type PDFDocumentProxy = { numPages: number; getPage: (n: number) => Promise<PDFPageProxy> }
  export const GlobalWorkerOptions: { workerSrc: string }
  export function getDocument(src: { data: Uint8Array }): { promise: Promise<PDFDocumentProxy> }
}
