'use client';

import React, { useEffect, useRef, useState, memo } from 'react';
import type { PDFDocumentProxy, PDFPageProxy, PDFJSStatic, PageViewport } from './pdf-loader';
import { Loader2 } from 'lucide-react';

export interface PdfPageProps {
  doc: PDFDocumentProxy;
  pdfjs: PDFJSStatic;
  pageNumber: number;
  scale: number;
  rotation?: number;
  onPageVisible?: (pageNumber: number) => void;
  onFirstRender?: () => void;
  defaultPageWidth?: number;
  defaultPageHeight?: number;
}

export const PdfPage = memo(function PdfPage({
  doc,
  pdfjs,
  pageNumber,
  scale,
  rotation = 0,
  onPageVisible,
  onFirstRender,
  defaultPageWidth = 595,
  defaultPageHeight = 842,
}: PdfPageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);

  const [isVisible, setIsVisible] = useState(false);
  const [isRendered, setIsRendered] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({
    width: Math.floor(defaultPageWidth * scale),
    height: Math.floor(defaultPageHeight * scale),
  });

  const pageProxyRef = useRef<PDFPageProxy | null>(null);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);
  const textLayerInstanceRef = useRef<{ cancel: () => void } | null>(null);

  // 1. Virtualization via IntersectionObserver
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;

        if (entry.isIntersecting) {
          setIsVisible(true);
          onPageVisible?.(pageNumber);
        } else {
          // If page scrolled far away (>1500px away from viewport), unrender to save memory
          const bounds = entry.boundingClientRect;
          const rootBounds = entry.rootBounds;
          if (rootBounds) {
            const distance = Math.min(
              Math.abs(bounds.bottom - rootBounds.top),
              Math.abs(bounds.top - rootBounds.bottom),
            );
            if (distance > 2000) {
              setIsVisible(false);
            }
          }
        }
      },
      {
        root: null,
        rootMargin: '600px 0px 600px 0px', // Pre-render 600px before scrolling into view
        threshold: [0, 0.25, 0.5, 0.75, 1],
      },
    );

    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [pageNumber, onPageVisible]);

  // 2. Fetch page proxy & compute actual viewport dimensions
  useEffect(() => {
    let active = true;
    doc
      .getPage(pageNumber)
      .then((page) => {
        if (!active) return;
        pageProxyRef.current = page;
        const viewport = page.getViewport({ scale, rotation });
        setDimensions({
          width: Math.floor(viewport.width),
          height: Math.floor(viewport.height),
        });
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [doc, pageNumber, scale, rotation]);

  // 3. Render page canvas and text layer when visible
  useEffect(() => {
    if (!isVisible) {
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }
      if (textLayerInstanceRef.current) {
        textLayerInstanceRef.current.cancel();
        textLayerInstanceRef.current = null;
      }
      setIsRendered(false);
      return;
    }

    let isCancelled = false;

    async function renderPage() {
      try {
        const page = pageProxyRef.current || (await doc.getPage(pageNumber));
        if (isCancelled || !canvasRef.current) return;
        pageProxyRef.current = page;

        setIsRendering(true);

        const viewport: PageViewport = page.getViewport({ scale, rotation });
        setDimensions({
          width: Math.floor(viewport.width),
          height: Math.floor(viewport.height),
        });

        // High-DPI canvas setup
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d', { alpha: false });
        if (!context) return;

        const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
        const outputScale = Math.min(Math.max(dpr, 1), 3); // Bound DPR between 1x and 3x

        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined;

        // Cancel previous render task if active
        if (renderTaskRef.current) {
          renderTaskRef.current.cancel();
          renderTaskRef.current = null;
        }

        const renderTask = page.render({
          canvasContext: context,
          viewport,
          transform,
        });
        renderTaskRef.current = renderTask;

        await renderTask.promise;
        if (isCancelled) return;

        // Render Text Layer for text selection
        if (textLayerRef.current) {
          if (textLayerInstanceRef.current) {
            textLayerInstanceRef.current.cancel();
            textLayerInstanceRef.current = null;
          }

          const textLayerDiv = textLayerRef.current;
          textLayerDiv.innerHTML = '';
          textLayerDiv.style.width = `${Math.floor(viewport.width)}px`;
          textLayerDiv.style.height = `${Math.floor(viewport.height)}px`;

          try {
            const textContent = await page.getTextContent();
            if (isCancelled) return;

            const textLayer = new pdfjs.TextLayer({
              textContentSource: textContent,
              container: textLayerDiv,
              viewport,
            });
            textLayerInstanceRef.current = textLayer;
            await textLayer.render();
          } catch {
            // Text layer failure should not break visual page rendering
          }
        }

        setIsRendered(true);
        setIsRendering(false);
        renderTaskRef.current = null;
        onFirstRender?.();
      } catch (err: unknown) {
        if (
          err &&
          typeof err === 'object' &&
          'name' in err &&
          (err as { name: string }).name === 'RenderingCancelledException'
        ) {
          // Expected cancellation
          return;
        }
        setIsRendering(false);
      }
    }

    void renderPage();

    return () => {
      isCancelled = true;
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }
      if (textLayerInstanceRef.current) {
        textLayerInstanceRef.current.cancel();
        textLayerInstanceRef.current = null;
      }
    };
  }, [doc, pdfjs, pageNumber, scale, rotation, isVisible, onFirstRender]);

  return (
    <div
      ref={containerRef}
      data-page-number={pageNumber}
      className="pdf-page-container relative mx-auto my-4 transition-all"
      style={{
        width: `${dimensions.width}px`,
        height: `${dimensions.height}px`,
      }}
    >
      {/* Canvas Layer */}
      <canvas
        ref={canvasRef}
        className="block bg-white rounded-sm"
        style={{
          width: `${dimensions.width}px`,
          height: `${dimensions.height}px`,
        }}
      />

      {/* Text Selection Layer */}
      <div
        ref={textLayerRef}
        className="textLayer"
        style={{
          width: `${dimensions.width}px`,
          height: `${dimensions.height}px`,
        }}
      />

      {/* Loading Placeholder */}
      {(!isRendered || isRendering) && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-gray-50/50 dark:bg-gray-900/10 pointer-events-none"
          aria-label={`Loading page ${pageNumber}`}
        >
          {isRendering && <Loader2 className="h-5 w-5 animate-spin text-[#00D69A]/70" />}
        </div>
      )}

      {/* Page Number Badge */}
      <div
        className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded text-[10px] font-mono bg-black/60 text-white/90 backdrop-blur-xs select-none pointer-events-none transition-opacity opacity-40 hover:opacity-100"
        aria-hidden="true"
      >
        {pageNumber}
      </div>
    </div>
  );
});
