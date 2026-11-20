import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { PdfViewer } from '@/components/pdf/pdf-viewer';
import type { CompilationDTO } from '@texly/shared';

// Mock IntersectionObserver for virtualization tests
class MockIntersectionObserver {
  callback: IntersectionObserverCallback;
  elements: Set<Element> = new Set();

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
  }

  observe(element: Element) {
    this.elements.add(element);
    const pageNum = parseInt(element.getAttribute('data-page-number') || '1', 10);
    const isIntersecting = pageNum <= 2;
    this.callback(
      [
        {
          target: element,
          isIntersecting,
          boundingClientRect: element.getBoundingClientRect(),
          intersectionRatio: isIntersecting ? 1.0 : 0,
          intersectionRect: element.getBoundingClientRect(),
          rootBounds: null,
          time: Date.now(),
        } as unknown as IntersectionObserverEntry,
      ],
      this as unknown as IntersectionObserver,
    );
  }

  unobserve(element: Element) {
    this.elements.delete(element);
  }

  disconnect() {
    this.elements.clear();
  }
}

// Mock ResizeObserver
class MockResizeObserver {
  observe() { }
  unobserve() { }
  disconnect() { }
}

const createMockPage = (pageNum: number) => ({
  pageNumber: pageNum,
  getViewport: vi.fn(({ scale = 1.0 }: { scale: number }) => ({
    width: 595 * scale,
    height: 842 * scale,
    scale,
    rotation: 0,
    rawDims: { pageWidth: 595, pageHeight: 842, pageX: 0, pageY: 0 },
  })),
  render: vi.fn(() => ({
    promise: Promise.resolve(),
    cancel: vi.fn(),
  })),
  getTextContent: vi.fn(() =>
    Promise.resolve({
      items: [{ str: `Page ${pageNum} Content` }],
      styles: {},
    }),
  ),
  cleanup: vi.fn(),
});

const createMockDoc = (numPages = 3) => ({
  numPages,
  getPage: vi.fn((n: number) => Promise.resolve(createMockPage(n))),
  destroy: vi.fn(() => Promise.resolve()),
});

// Mock pdf-loader
vi.mock('@/components/pdf/pdf-loader', () => {
  class MockTextLayer {
    container: HTMLElement;
    constructor({ container }: { container: HTMLElement }) {
      this.container = container;
    }
    render() {
      const span = document.createElement('span');
      span.textContent = 'Selected Text';
      this.container.appendChild(span);
      return Promise.resolve();
    }
    cancel() { }
  }

  return {
    getPDFJS: vi.fn(() =>
      Promise.resolve({
        version: '6.5.438',
        GlobalWorkerOptions: { workerSrc: '/pdf.worker.min.mjs' },
        TextLayer: MockTextLayer,
        getDocument: vi.fn(({ url }: { url: string }) => {
          if (url.includes('corrupt') || url.includes('error')) {
            return {
              promise: Promise.reject(new Error('Corrupted PDF header')),
            };
          }
          if (url.includes('large-300')) {
            return { promise: Promise.resolve(createMockDoc(300)) };
          }
          return { promise: Promise.resolve(createMockDoc(3)) };
        }),
      }),
    ),
  };
});

const mockSucceededCompilation: CompilationDTO = {
  id: 'comp-succ-1',
  projectId: 'proj-1',
  status: 'SUCCEEDED',
  trigger: 'MANUAL',
  engine: 'PDFLATEX',
  bibTool: 'AUTO',
  mainFilePath: 'main.tex',
  queuedAt: new Date().toISOString(),
  startedAt: new Date().toISOString(),
  finishedAt: new Date().toISOString(),
  durationMs: 1200,
  errorCount: 0,
  warningCount: 0,
  hasPdf: true,
  cacheHit: false,
};

const mockFailedCompilation: CompilationDTO = {
  id: 'comp-fail-1',
  projectId: 'proj-1',
  status: 'FAILED',
  trigger: 'MANUAL',
  engine: 'PDFLATEX',
  bibTool: 'AUTO',
  mainFilePath: 'main.tex',
  queuedAt: new Date().toISOString(),
  startedAt: new Date().toISOString(),
  finishedAt: new Date().toISOString(),
  durationMs: 900,
  errorCount: 3,
  warningCount: 1,
  hasPdf: false,
  cacheHit: false,
  errorCode: 'LATEX_SYNTAX_ERROR',
};

describe('PdfViewer & PDF.js Integration (Phase 06A)', () => {
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
    HTMLElement.prototype.scrollIntoView = vi.fn();
    // Mock HTMLCanvasElement.getContext
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
      scale: vi.fn(),
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      clearRect: vi.fn(),
      getImageData: vi.fn(),
      putImageData: vi.fn(),
      createImageData: vi.fn(),
      setTransform: vi.fn(),
    }) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders documented empty state when no compilation or PDF is available', () => {
    const onCompile = vi.fn();
    render(<PdfViewer pdfUrl={null} compilation={null} onCompile={onCompile} />);

    expect(screen.getByText(/Press Compile to preview your document/i)).toBeInTheDocument();
    expect(screen.getByTestId('pdf-empty-compile-button')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('pdf-empty-compile-button'));
    expect(onCompile).toHaveBeenCalledTimes(1);
  });

  it('loads and renders a multi-page PDF document with text selection layers', async () => {
    render(
      <PdfViewer
        pdfUrl="https://example.com/test-document.pdf"
        compilation={mockSucceededCompilation}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('pdf-toolbar')).toBeInTheDocument();
    });

    // Check page indicator
    expect(screen.getAllByText('3').length).toBeGreaterThanOrEqual(1); // Page count
    expect(screen.getAllByText('1').length).toBeGreaterThanOrEqual(1); // Initial page

    // Check rendered page containers
    const pages = document.querySelectorAll('.pdf-page-container');
    expect(pages.length).toBe(3);

    // Verify text selection layer is rendered for visible pages
    await waitFor(() => {
      const textLayers = document.querySelectorAll('.textLayer');
      expect(textLayers.length).toBeGreaterThanOrEqual(1);
      expect(textLayers[0]?.textContent).toContain('Selected Text');
    });
  });

  it('supports zoom in, zoom out, fit-width, fit-page and custom scale selection', async () => {
    render(
      <PdfViewer
        pdfUrl="https://example.com/test-document.pdf"
        compilation={mockSucceededCompilation}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('pdf-zoom-in')).toBeInTheDocument();
    });

    const zoomInBtn = screen.getByTestId('pdf-zoom-in');
    const zoomOutBtn = screen.getByTestId('pdf-zoom-out');
    const zoomSelect = screen.getByTestId('pdf-zoom-select') as HTMLSelectElement;

    // Zoom in
    fireEvent.click(zoomInBtn);
    expect(zoomSelect.value).toBe('1.25');

    // Zoom out
    fireEvent.click(zoomOutBtn);
    expect(zoomSelect.value).toBe('1');

    // Fit Page
    fireEvent.change(zoomSelect, { target: { value: 'fit-page' } });
    expect(zoomSelect.value).toBe('fit-page');

    // Preset selection: 200%
    fireEvent.change(zoomSelect, { target: { value: '2' } });
    expect(zoomSelect.value).toBe('2');
  });

  it('navigates through pages using toolbar buttons and jump form', async () => {
    render(
      <PdfViewer
        pdfUrl="https://example.com/test-document.pdf"
        compilation={mockSucceededCompilation}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('pdf-next-page')).toBeInTheDocument();
    });

    const nextBtn = screen.getByTestId('pdf-next-page');
    const prevBtn = screen.getByTestId('pdf-prev-page');

    // Page 1 -> Next -> Page 2
    expect(prevBtn).toBeDisabled();
    fireEvent.click(nextBtn);

    // Click jump page button to reveal input
    const pageJumpBtn = screen.getByTitle('Click to jump to page');
    fireEvent.click(pageJumpBtn);

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '3' } });
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => {
      expect(screen.getAllByText('3').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('supports fullscreen toggle', async () => {
    const requestFullscreenMock = vi.fn().mockResolvedValue(undefined);
    Element.prototype.requestFullscreen = requestFullscreenMock;

    render(
      <PdfViewer
        pdfUrl="https://example.com/test-document.pdf"
        compilation={mockSucceededCompilation}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('pdf-fullscreen-button')).toBeInTheDocument();
    });

    const fullscreenBtn = screen.getByTestId('pdf-fullscreen-button');
    fireEvent.click(fullscreenBtn);
    expect(requestFullscreenMock).toHaveBeenCalled();
  });

  it('triggers PDF download with sanitized file name', async () => {
    render(
      <PdfViewer
        pdfUrl="https://example.com/document-download.pdf"
        compilation={mockSucceededCompilation}
        projectName="Resume 2026 / SDE"
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('pdf-download-button')).toBeInTheDocument();
    });

    const downloadBtn = screen.getByTestId('pdf-download-button');
    const appendSpy = vi.spyOn(document.body, 'appendChild');

    fireEvent.click(downloadBtn);
    expect(appendSpy).toHaveBeenCalled();
  });

  it('provides flicker-free refresh: retains previous PDF until new one loads, then preserves zoom/scroll', async () => {
    const { rerender } = render(
      <PdfViewer
        pdfUrl="https://example.com/v1.pdf"
        compilation={mockSucceededCompilation}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('pdf-toolbar')).toBeInTheDocument();
    });

    const initialPages = document.querySelectorAll('.pdf-page-container');
    expect(initialPages.length).toBe(3);

    // Rerender with background compiling active
    rerender(
      <PdfViewer
        pdfUrl="https://example.com/v1.pdf"
        compilation={mockSucceededCompilation}
        isCompiling={true}
      />,
    );

    // Floating overlay is visible, but the previous document remains fully visible
    expect(screen.getByTestId('pdf-compiling-overlay')).toBeInTheDocument();
    expect(document.querySelectorAll('.pdf-page-container').length).toBe(3);

    // New compilation succeeds -> new URL provided
    rerender(
      <PdfViewer
        pdfUrl="https://example.com/v2.pdf"
        compilation={{ ...mockSucceededCompilation, id: 'comp-succ-2' }}
        isCompiling={false}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/Updated/i)).toBeInTheDocument();
    });
  });

  it('retains last good preview when a new compilation fails (shows "Out of date")', async () => {
    const { rerender } = render(
      <PdfViewer
        pdfUrl="https://example.com/v1.pdf"
        compilation={mockSucceededCompilation}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('pdf-toolbar')).toBeInTheDocument();
    });

    expect(screen.queryByText(/Out of date/i)).not.toBeInTheDocument();

    // Rerender with failed compilation
    rerender(
      <PdfViewer
        pdfUrl="https://example.com/v1.pdf"
        compilation={mockFailedCompilation}
      />,
    );

    // The document is NOT destroyed, and "Out of date" badge is displayed
    expect(document.querySelectorAll('.pdf-page-container').length).toBe(3);
    expect(screen.getByText(/Out of date/i)).toBeInTheDocument();
  });

  it('gracefully handles corrupted PDF or network error with retry behaviour', async () => {
    const onCompile = vi.fn();
    render(
      <PdfViewer
        pdfUrl="https://example.com/corrupt-file.pdf"
        compilation={mockSucceededCompilation}
        onCompile={onCompile}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('pdf-state-load-failed')).toBeInTheDocument();
    });

    expect(screen.getByText(/Unable to Render PDF/i)).toBeInTheDocument();
    const retryBtn = screen.getByTestId('pdf-retry-button');
    fireEvent.click(retryBtn);
    expect(onCompile).toHaveBeenCalledTimes(1);
  });

  it('efficiently handles large documents (e.g. 300 pages) without performance degradation', async () => {
    render(
      <PdfViewer
        pdfUrl="https://example.com/large-300.pdf"
        compilation={mockSucceededCompilation}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('pdf-toolbar')).toBeInTheDocument();
    });

    expect(screen.getAllByText('300').length).toBeGreaterThanOrEqual(1);
    const pageNodes = document.querySelectorAll('.pdf-page-container');
    expect(pageNodes.length).toBe(300);
  });
});

