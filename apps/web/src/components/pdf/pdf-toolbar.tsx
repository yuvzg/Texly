'use client';

import React, { useState } from 'react';
import {
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  Download,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface PdfToolbarProps {
  currentPage: number;
  numPages: number;
  scale: number;
  zoomMode: 'fit-width' | 'fit-page' | 'custom';
  isFullscreen: boolean;
  isUpdatedFlash: boolean;
  isOutOfDate: boolean;
  onPageChange: (page: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitWidth: () => void;
  onFitPage: () => void;
  onScaleChange: (scale: number) => void;
  onToggleFullscreen: () => void;
  onDownload: () => void;
  className?: string;
}

const ZOOM_PRESETS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0, 4.0];

export function PdfToolbar({
  currentPage,
  numPages,
  scale,
  zoomMode,
  isFullscreen,
  isUpdatedFlash,
  isOutOfDate,
  onPageChange,
  onZoomIn,
  onZoomOut,
  onFitWidth,
  onFitPage,
  onScaleChange,
  onToggleFullscreen,
  onDownload,
  className = '',
}: PdfToolbarProps) {
  const [pageInput, setPageInput] = useState<string>(String(currentPage));
  const [isEditingPage, setIsEditingPage] = useState(false);

  const percent = Math.round(scale * 100);

  const handlePageSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const p = parseInt(pageInput, 10);
    if (!isNaN(p) && p >= 1 && p <= numPages) {
      onPageChange(p);
    } else {
      setPageInput(String(currentPage));
    }
    setIsEditingPage(false);
  };

  return (
    <div
      className={`h-11 bg-white dark:bg-[#0A1310] border-b border-gray-200 dark:border-[#00D69A]/15 px-3 flex items-center justify-between text-xs text-gray-700 dark:text-gray-200 select-none shrink-0 ${className}`}
      data-testid="pdf-toolbar"
    >
      {/* Left: Page Navigation */}
      <div className="flex items-center gap-1 sm:gap-1.5">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onPageChange(Math.max(currentPage - 1, 1))}
          disabled={currentPage <= 1 || numPages <= 1}
          aria-label="Previous page"
          title="Previous page"
          data-testid="pdf-prev-page"
          className="h-7 w-7 p-0 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-[#00D69A] hover:bg-gray-100 dark:hover:bg-[#003D30]/40 disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <form onSubmit={handlePageSubmit} className="flex items-center gap-1 font-mono text-xs">
          {isEditingPage ? (
            <input
              type="text"
              value={pageInput}
              autoFocus
              onBlur={() => {
                setIsEditingPage(false);
                setPageInput(String(currentPage));
              }}
              onChange={(e) => setPageInput(e.target.value)}
              className="w-10 h-6 text-center bg-gray-50 dark:bg-[#050807] border border-[#00D69A]/50 rounded text-xs text-gray-900 dark:text-[#00D69A] outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                setPageInput(String(currentPage));
                setIsEditingPage(true);
              }}
              className="px-1.5 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-[#003D30]/40 font-semibold cursor-pointer text-gray-800 dark:text-[#00D69A]"
              title="Click to jump to page"
            >
              {currentPage}
            </button>
          )}
          <span className="text-gray-400 dark:text-gray-500">/</span>
          <span className="text-gray-500 dark:text-gray-400">{numPages || 1}</span>
        </form>

        <Button
          size="sm"
          variant="ghost"
          onClick={() => onPageChange(Math.min(currentPage + 1, numPages))}
          disabled={currentPage >= numPages || numPages <= 1}
          aria-label="Next page"
          title="Next page"
          data-testid="pdf-next-page"
          className="h-7 w-7 p-0 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-[#00D69A] hover:bg-gray-100 dark:hover:bg-[#003D30]/40 disabled:opacity-40"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>

        {/* Status Indicators */}
        {isUpdatedFlash && (
          <span
            className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#003D30] text-[#00D69A] border border-[#00D69A]/40 flex items-center gap-1 animate-pulse"
            title="Preview updated with latest compilation"
          >
            <Sparkles className="h-3 w-3" /> Updated
          </span>
        )}

        {isOutOfDate && (
          <span
            className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-500 border border-amber-500/30 flex items-center gap-1"
            title="Compilation failed. Retaining last good preview."
          >
            <AlertTriangle className="h-3 w-3" /> Out of date
          </span>
        )}
      </div>

      {/* Right: Zoom Controls, Fit, Fullscreen & Download */}
      <div className="flex items-center gap-1 sm:gap-1.5">
        {/* Zoom Out */}
        <Button
          size="sm"
          variant="ghost"
          onClick={onZoomOut}
          disabled={scale <= 0.5}
          aria-label="Zoom out"
          title="Zoom out (50% min)"
          data-testid="pdf-zoom-out"
          className="h-7 w-7 p-0 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-[#00D69A] hover:bg-gray-100 dark:hover:bg-[#003D30]/40 disabled:opacity-40"
        >
          <ZoomOut className="h-3.5 w-3.5" />
        </Button>

        {/* Zoom Preset Selector */}
        <select
          value={zoomMode === 'custom' ? String(scale) : zoomMode}
          onChange={(e) => {
            const val = e.target.value;
            if (val === 'fit-width') {
              onFitWidth();
            } else if (val === 'fit-page') {
              onFitPage();
            } else {
              onScaleChange(parseFloat(val));
            }
          }}
          aria-label="Zoom percentage"
          data-testid="pdf-zoom-select"
          className="h-7 px-1.5 text-[11px] font-mono bg-gray-50 dark:bg-[#050807] border border-gray-200 dark:border-[#00D69A]/20 rounded text-gray-700 dark:text-gray-300 outline-none hover:border-[#00D69A]/40 cursor-pointer"
        >
          <option value="fit-width">Fit Width</option>
          <option value="fit-page">Fit Page</option>
          {ZOOM_PRESETS.map((p) => (
            <option key={p} value={String(p)}>
              {Math.round(p * 100)}%
            </option>
          ))}
          {zoomMode === 'custom' && !ZOOM_PRESETS.includes(scale) && (
            <option value={String(scale)}>{percent}%</option>
          )}
        </select>

        {/* Zoom In */}
        <Button
          size="sm"
          variant="ghost"
          onClick={onZoomIn}
          disabled={scale >= 4.0}
          aria-label="Zoom in"
          title="Zoom in (400% max)"
          data-testid="pdf-zoom-in"
          className="h-7 w-7 p-0 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-[#00D69A] hover:bg-gray-100 dark:hover:bg-[#003D30]/40 disabled:opacity-40"
        >
          <ZoomIn className="h-3.5 w-3.5" />
        </Button>

        <div className="h-4 w-px bg-gray-200 dark:bg-[#00D69A]/20 mx-0.5" />

        {/* Fullscreen Toggle */}
        <Button
          size="sm"
          variant="ghost"
          onClick={onToggleFullscreen}
          aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          title={isFullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen preview'}
          data-testid="pdf-fullscreen-button"
          className="h-7 w-7 p-0 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-[#00D69A] hover:bg-gray-100 dark:hover:bg-[#003D30]/40"
        >
          {isFullscreen ? (
            <Minimize2 className="h-3.5 w-3.5" />
          ) : (
            <Maximize2 className="h-3.5 w-3.5" />
          )}
        </Button>

        {/* Download PDF */}
        <Button
          size="sm"
          variant="ghost"
          onClick={onDownload}
          aria-label="Download PDF"
          title="Download PDF"
          data-testid="pdf-download-button"
          className="h-7 w-7 p-0 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-[#00D69A] hover:bg-gray-100 dark:hover:bg-[#003D30]/40"
        >
          <Download className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
