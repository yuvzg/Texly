'use client';

import * as React from 'react';
import { GripVertical } from 'lucide-react';
import * as ResizablePrimitive from 'react-resizable-panels';
import { cn } from '@/lib/utils';

export const ResizablePanelGroup = ({
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.PanelGroup>) => (
  <ResizablePrimitive.PanelGroup
    className={cn('flex h-full w-full data-[panel-group-direction=vertical]:flex-col', className)}
    {...props}
  />
);

export const ResizablePanel = ResizablePrimitive.Panel;

export const ResizableHandle = ({
  withHandle,
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.PanelResizeHandle> & {
  withHandle?: boolean;
}) => (
  <ResizablePrimitive.PanelResizeHandle
    className={cn(
      'relative flex w-1.5 items-center justify-center bg-gray-200 dark:bg-[#00D69A]/15 transition-colors hover:bg-[#00D69A]/50 dark:hover:bg-[#00D69A]/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#00D69A] data-[panel-group-direction=vertical]:h-1.5 data-[panel-group-direction=vertical]:w-full cursor-col-resize data-[panel-group-direction=vertical]:cursor-row-resize',
      className,
    )}
    {...props}
  >
    {withHandle && (
      <div className="z-10 flex h-4 w-3 items-center justify-center rounded-sm border border-gray-300 dark:border-[#00D69A]/20 bg-white dark:bg-[#0A1310] shadow-sm">
        <GripVertical className="h-2.5 w-2.5 text-gray-400 dark:text-[#00D69A]/70" />
      </div>
    )}
  </ResizablePrimitive.PanelResizeHandle>
);
