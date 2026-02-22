import React, { useEffect } from 'react';
import { useIsMobile } from '../../hooks/use-mobile';
import { useAIChatStore } from '../../stores/aiChatStore';
import { useAIChatContext } from '../../contexts/AIChatContext';
import { AIChatPanel } from './AIChatPanel';
import {
  Drawer,
  DrawerContent,
} from '../ui/drawer';
import { cn } from '../../lib/utils';

interface ContentWithAIChatProps {
  children: React.ReactNode;
}

export function ContentWithAIChat({ children }: ContentWithAIChatProps) {
  const isMobile = useIsMobile();
  const { isOpen, togglePanel } = useAIChatStore();
  const { setAIChatAvailable } = useAIChatContext();

  // このコンポーネントがマウントされている間、AIチャットが利用可能であることを通知
  useEffect(() => {
    setAIChatAvailable(true);
    return () => setAIChatAvailable(false);
  }, [setAIChatAvailable]);

  if (isMobile) {
    return (
      <>
        {children}
        <Drawer open={isOpen} onOpenChange={(open) => { if (!open) togglePanel(); }}>
          <DrawerContent className="h-[85vh]">
            <AIChatPanel />
          </DrawerContent>
        </Drawer>
      </>
    );
  }

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      <div className="flex-1 overflow-y-auto transition-all duration-300 ease-in-out">
        {children}
      </div>
      <div 
        className={cn(
          "sticky top-0 h-[calc(100vh-4.5rem)] flex-shrink-0 transition-all duration-300 ease-in-out overflow-hidden",
          isOpen ? "w-[30%] min-w-[280px] max-w-[45%] border-l opacity-100" : "w-0 min-w-0 border-l-0 opacity-0"
        )}
      >
        <div className="w-[30vw] min-w-[280px] max-w-[45vw] h-full">
          <AIChatPanel />
        </div>
      </div>
    </div>
  );
}
