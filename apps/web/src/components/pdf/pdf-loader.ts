/**
 * PDF.js client-side loader and worker initializer.
 * Ensures pdfjs-dist is only imported in browser environments.
 */

export interface PDFJSStatic {
  getDocument: (src: string | Uint8Array | { url: string; [key: string]: unknown }) => {
    promise: Promise<PDFDocumentProxy>;
  };
  GlobalWorkerOptions: {
    workerSrc: string;
  };
  TextLayer: new (options: {
    textContentSource: unknown;
    container: HTMLElement;
    viewport: PageViewport;
  }) => {
    render: () => Promise<void>;
    cancel: () => void;
  };
  version: string;
}

export interface PDFDocumentProxy {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PDFPageProxy>;
  destroy: () => Promise<void>;
}

export interface PageViewport {
  width: number;
  height: number;
  scale: number;
  rotation: number;
  rawDims: {
    pageWidth: number;
    pageHeight: number;
    pageX: number;
    pageY: number;
  };
}

export interface PDFPageProxy {
  pageNumber: number;
  getViewport: (params: { scale: number; rotation?: number }) => PageViewport;
  render: (params: {
    canvasContext: CanvasRenderingContext2D;
    viewport: PageViewport;
    transform?: number[] | undefined;
  }) => {
    promise: Promise<void>;
    cancel: () => void;
  };
  getTextContent: () => Promise<unknown>;
  cleanup: () => void;
}

let cachedPDFJS: PDFJSStatic | null = null;
let initPromise: Promise<PDFJSStatic> | null = null;

export async function getPDFJS(): Promise<PDFJSStatic> {
  if (cachedPDFJS) return cachedPDFJS;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    if (typeof window === 'undefined') {
      throw new Error('PDF.js can only be loaded in the browser');
    }

    // Dynamic import to prevent SSR evaluation
    const pdfjs = (await import('pdfjs-dist')) as unknown as PDFJSStatic;

    // Configure worker source: prefer local worker from public directory, fallback to cdn
    if (!pdfjs.GlobalWorkerOptions.workerSrc) {
      pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    }

    cachedPDFJS = pdfjs;
    return pdfjs;
  })();

  return initPromise;
}
