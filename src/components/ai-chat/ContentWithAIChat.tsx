import React, { useEffect } from 'react';
import { useIsMobile } from '../../hooks/use-mobile';
import { useAIChatStore } from '../../stores/aiChatStore';
import { useAIChatContext } from '../../contexts/AIChatContext';
import { AIChatPanel } from './AIChatPanel';
import {
  Drawer,
  DrawerContent,
} from '../ui/drawer';

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

  if (!isOpen) return <>{children}</>;

  return (
    <div className="flex flex-1 min-h-0">
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
      <div className="sticky top-0 h-[calc(100vh-4.5rem)] border-l flex-shrink-0" style={{ width: '30%', minWidth: '280px', maxWidth: '45%' }}>
        <AIChatPanel />
      </div>
    </div>
  );
}
