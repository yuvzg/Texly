'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getPDFJS, type PDFJSStatic, type PDFDocumentProxy } from './pdf-loader';
import { PdfToolbar } from './pdf-toolbar';
import { PdfPage } from './pdf-page';
import { PdfEmptyState } from './pdf-empty-state';
import type { CompilationDTO } from '@texly/shared';
import { Loader2 } from 'lucide-react';

export interface PdfViewerProps {
  pdfUrl: string | null;
  compilation?: CompilationDTO | null;
  isCompiling?: boolean;
  onCompile?: () => void;
  onViewLog?: () => void;
  projectName?: string;
  className?: string;
}

export function PdfViewer({
  pdfUrl,
  compilation,
  isCompiling = false,
  onCompile,
  onViewLog,
  projectName = 'document',
  className = '',
}: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const [pdfjs, setPdfjs] = useState<PDFJSStatic | null>(null);
  const [activeDoc, setActiveDoc] = useState<PDFDocumentProxy | null>(null);
  const [activeUrl, setActiveUrl] = useState<string | null>(null);

  const [isLoadingDoc, setIsLoadingDoc] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);

  // Viewer geometry & navigation
  const [scale, setScale] = useState<number>(1.0);
  const [zoomMode, setZoomMode] = useState<'fit-width' | 'fit-page' | 'custom'>('fit-width');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [numPages, setNumPages] = useState<number>(0);
  const [basePageDims, setBasePageDims] = useState<{ width: number; height: number }>({
    width: 595,
    height: 842,
  });

  // Flicker-free status indicators
  const [isUpdatedFlash, setIsUpdatedFlash] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Stored state for scroll preservation
  const previousScrollRatioRef = useRef<number | null>(null);
  const previousPageRef = useRef<number>(1);

  // 1. Initialize PDF.js engine on client mount
  useEffect(() => {
    let mounted = true;
    getPDFJS()
      .then((lib) => {
        if (mounted) setPdfjs(lib);
      })
      .catch((err) => {
        if (mounted)
          setDocError(err instanceof Error ? err.message : 'Failed to initialize PDF viewer');
      });
    return () => {
      mounted = false;
    };
  }, []);

  // 2. Compute Fit Width / Fit Page scales
  const calculateFitScale = useCallback(
    (mode: 'fit-width' | 'fit-page'): number => {
      const container = scrollContainerRef.current;
      if (!container || !basePageDims.width || !basePageDims.height) return 1.0;
      if (!container.clientWidth || container.clientWidth <= 0) return 1.0;

      const paddingX = 48;
      const paddingY = 48;
      const availableWidth = Math.max(container.clientWidth - paddingX, 200);
      const availableHeight = Math.max(container.clientHeight - paddingY, 200);

      if (mode === 'fit-width') {
        const fitScale = availableWidth / basePageDims.width;
        return Math.min(Math.max(parseFloat(fitScale.toFixed(2)), 0.5), 4.0);
      } else {
        const fitScale = Math.min(
          availableWidth / basePageDims.width,
          availableHeight / basePageDims.height,
        );
        return Math.min(Math.max(parseFloat(fitScale.toFixed(2)), 0.5), 4.0);
      }
    },
    [basePageDims],
  );

  // Recalculate zoom when zoomMode or dimensions change
  useEffect(() => {
    if (zoomMode === 'fit-width' || zoomMode === 'fit-page') {
      const newScale = calculateFitScale(zoomMode);
      setScale(newScale);
    }
  }, [zoomMode, calculateFitScale]);

  // Window/container resize observer for responsive fit
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    let timeoutId: NodeJS.Timeout;
    const observer = new ResizeObserver(() => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        if (zoomMode === 'fit-width' || zoomMode === 'fit-page') {
          const newScale = calculateFitScale(zoomMode);
          setScale(newScale);
        }
      }, 100);
    });

    observer.observe(el);
    return () => {
      clearTimeout(timeoutId);
      observer.disconnect();
    };
  }, [zoomMode, calculateFitScale]);

  // 3. Flicker-Free PDF Document Loading & Refresh
  useEffect(() => {
    if (!pdfjs || !pdfUrl) {
      if (!pdfUrl && !compilation) {
        setActiveDoc(null);
        setActiveUrl(null);
        setNumPages(0);
      }
      return;
    }

    // If this URL is already loaded and active, skip
    if (pdfUrl === activeUrl) return;

    let cancelled = false;

    async function loadPdfDocument() {
      // If we don't have an active doc yet, show initial loading state
      if (!activeDoc) {
        setIsLoadingDoc(true);
      }
      setDocError(null);

      try {
        const loadingTask = pdfjs!.getDocument({
          url: pdfUrl!,
          cMapPacked: true,
          withCredentials: false,
        });

        const newDoc = await loadingTask.promise;
        if (cancelled) {
          void newDoc.destroy();
          return;
        }

        // Fetch page 1 to extract base dimensions and verify renderability
        const firstPage = await newDoc.getPage(1);
        if (cancelled) {
          void newDoc.destroy();
          return;
        }

        const initialViewport = firstPage.getViewport({ scale: 1.0 });
        const dims = {
          width: Math.floor(initialViewport.width),
          height: Math.floor(initialViewport.height),
        };
        setBasePageDims(dims);

        // Capture previous scroll geometry before swap
        const scrollEl = scrollContainerRef.current;
        if (scrollEl && activeDoc) {
          const maxScroll = scrollEl.scrollHeight - scrollEl.clientHeight;
          previousScrollRatioRef.current = maxScroll > 0 ? scrollEl.scrollTop / maxScroll : 0;
          previousPageRef.current = currentPage;
        }

        // SWAP: Replace previous document with new document
        setActiveDoc(newDoc);
        setActiveUrl(pdfUrl);
        setNumPages(newDoc.numPages);
        setIsLoadingDoc(false);

        // Flash "Updated" badge if refreshing an existing document
        if (activeDoc) {
          setIsUpdatedFlash(true);
          const flashTimer = setTimeout(() => {
            setIsUpdatedFlash(false);
          }, 2500);

          // Restore scroll position
          requestAnimationFrame(() => {
            if (scrollContainerRef.current && previousScrollRatioRef.current !== null) {
              const el = scrollContainerRef.current;
              const newMaxScroll = el.scrollHeight - el.clientHeight;
              el.scrollTop = previousScrollRatioRef.current * newMaxScroll;
            }
          });
        }
      } catch (err: unknown) {
        if (cancelled) return;
        setIsLoadingDoc(false);
        const message = err instanceof Error ? err.message : 'Failed to load PDF document';
        // Only set error if no active document is being retained
        if (!activeDoc) {
          setDocError(message);
        }
      }
    }

    void loadPdfDocument();

    return () => {
      cancelled = true;
    };
  }, [pdfjs, pdfUrl, activeDoc, activeUrl, currentPage, compilation]);

  // 4. Ctrl + Wheel Zoom Handler
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.15 : -0.15;
        setScale((prev) => {
          const next = Math.min(Math.max(parseFloat((prev + delta).toFixed(2)), 0.5), 4.0);
          return next;
        });
        setZoomMode('custom');
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', handleWheel);
    };
  }, []);

  // 5. Scroll tracking for current page indicator
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container || numPages <= 1) return;

    const containerTop = container.scrollTop;
    const pageElements = container.querySelectorAll<HTMLElement>('[data-page-number]');

    let closestPage = 1;
    let minDistance = Infinity;

    pageElements.forEach((el) => {
      const pageNum = parseInt(el.getAttribute('data-page-number') || '1', 10);
      const distance = Math.abs(el.offsetTop - containerTop - 20);
      if (distance < minDistance) {
        minDistance = distance;
        closestPage = pageNum;
      }
    });

    if (closestPage !== currentPage) {
      setCurrentPage(closestPage);
    }
  }, [numPages, currentPage]);

  // 6. Navigation: Jump to page
  const handlePageChange = useCallback(
    (page: number) => {
      if (page < 1 || page > numPages) return;
      setCurrentPage(page);
      const container = scrollContainerRef.current;
      if (!container) return;

      const pageEl = container.querySelector<HTMLElement>(`[data-page-number="${page}"]`);
      if (pageEl) {
        pageEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    },
    [numPages],
  );

  // 7. Fullscreen Toggle
  const handleToggleFullscreen = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    if (!document.fullscreenElement) {
      container.requestFullscreen?.().catch(() => {
        // Fallback to CSS fullscreen if Fullscreen API fails/unsupported
        setIsFullscreen(true);
      });
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.().catch(() => {});
      setIsFullscreen(false);
    }
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  // 8. Download Handler
  const handleDownload = useCallback(() => {
    if (!pdfUrl) return;
    const link = document.createElement('a');
    link.href = pdfUrl;
    link.download = `${projectName.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [pdfUrl, projectName]);

  // Out of date status: latest compile failed, but previous activeDoc is retained
  const isOutOfDate = compilation?.status === 'FAILED' && !!activeDoc;

  // Determine current display view
  const hasDocument = !!activeDoc && !isLoadingDoc;

  return (
    <div
      ref={containerRef}
      className={`relative flex flex-col h-full bg-gray-100 dark:bg-[#050807] overflow-hidden ${
        isFullscreen ? 'fixed inset-0 z-50 bg-[#050807]' : ''
      } ${className}`}
      data-testid="pdf-viewer-root"
    >
      {/* Top Controls Toolbar */}
      {hasDocument && (
        <PdfToolbar
          currentPage={currentPage}
          numPages={numPages}
          scale={scale}
          zoomMode={zoomMode}
          isFullscreen={isFullscreen}
          isUpdatedFlash={isUpdatedFlash}
          isOutOfDate={isOutOfDate}
          onPageChange={handlePageChange}
          onZoomIn={() => {
            setScale((s) => Math.min(parseFloat((s + 0.25).toFixed(2)), 4.0));
            setZoomMode('custom');
          }}
          onZoomOut={() => {
            setScale((s) => Math.max(parseFloat((s - 0.25).toFixed(2)), 0.5));
            setZoomMode('custom');
          }}
          onFitWidth={() => {
            setZoomMode('fit-width');
            setScale(calculateFitScale('fit-width'));
          }}
          onFitPage={() => {
            setZoomMode('fit-page');
            setScale(calculateFitScale('fit-page'));
          }}
          onScaleChange={(newScale) => {
            setScale(newScale);
            setZoomMode('custom');
          }}
          onToggleFullscreen={handleToggleFullscreen}
          onDownload={handleDownload}
        />
      )}

      {/* Main Viewport Content */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 relative overflow-auto p-4 flex flex-col items-center select-text"
        tabIndex={0}
        aria-label="PDF Document Pages"
        data-testid="pdf-scroll-container"
      >
        {/* State A: Initial Document Loading */}
        {isLoadingDoc && !activeDoc && (
          <div
            className="flex flex-col items-center justify-center p-8 text-center my-auto"
            data-testid="pdf-loading-initial"
          >
            <Loader2 className="h-8 w-8 animate-spin text-[#00D69A] mb-3" />
            <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
              Loading PDF document...
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Preparing canvas and text selection layers
            </p>
          </div>
        )}

        {/* State B: Document Rendered (Continuous Scrolling & Virtualized Pages) */}
        {hasDocument && pdfjs && activeDoc && (
          <div className="flex flex-col items-center w-full min-h-full py-2">
            {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
              <PdfPage
                key={`${activeDoc.numPages}-${pageNum}`}
                doc={activeDoc}
                pdfjs={pdfjs}
                pageNumber={pageNum}
                scale={scale}
                defaultPageWidth={basePageDims.width}
                defaultPageHeight={basePageDims.height}
                onPageVisible={(p) => {
                  if (Math.abs(p - currentPage) > 1) {
                    setCurrentPage(p);
                  }
                }}
              />
            ))}
          </div>
        )}

        {/* State C: Compilation In Progress Banner (Floating over existing PDF) */}
        {isCompiling && activeDoc && (
          <div
            className="absolute top-4 left-1/2 -translate-x-1/2 z-30 px-3.5 py-1.5 rounded-full bg-black/80 dark:bg-[#0A1310]/90 border border-[#00D69A]/40 text-[#00D69A] text-xs font-semibold shadow-lg backdrop-blur-md flex items-center gap-2 select-none animate-pulse"
            data-testid="pdf-compiling-overlay"
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin text-[#00D69A]" />
            Compiling new preview in background...
          </div>
        )}

        {/* State D: No Document Loaded Yet */}
        {!hasDocument && !isLoadingDoc && (
          <div className="my-auto">
            {isCompiling ? (
              <PdfEmptyState type="compiling" />
            ) : compilation?.status === 'FAILED' ? (
              <PdfEmptyState
                type="compile-failed"
                errorCount={compilation.errorCount}
                errorMessage={compilation.errorCode}
                onCompile={onCompile}
                onViewLog={onViewLog}
              />
            ) : docError ? (
              <PdfEmptyState
                type="load-failed"
                errorMessage={docError}
                onRetry={() => {
                  setDocError(null);
                  if (onCompile) onCompile();
                }}
              />
            ) : (
              <PdfEmptyState type="empty" onCompile={onCompile} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
