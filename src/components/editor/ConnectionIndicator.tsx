/**
 * ConnectionIndicator
 * リアルタイムコラボレーションの接続状態を表示するコンポーネント
 */

import { RefreshCw, Cloud, CloudOff, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip';
import type { ConnectionStatus } from '@/lib/collaboration/types';
import { cn } from '@/lib/utils';

interface ConnectionIndicatorProps {
  /** 接続状態 */
  status: ConnectionStatus;
  /** サーバーと同期済みか */
  isSynced: boolean;
  /** 再接続ハンドラ */
  onReconnect: () => void;
  /** クラス名 */
  className?: string;
}

/**
 * 接続状態に応じた設定を返す
 */
function getStatusConfig(status: ConnectionStatus, isSynced: boolean) {
  switch (status) {
    case 'connected':
      return {
        icon: isSynced ? Cloud : RefreshCw,
        color: 'text-green-500',
        bgColor: 'bg-green-500/10',
        label: isSynced ? '同期済み' : '同期中...',
        animate: !isSynced,
      };
    case 'connecting':
      return {
        icon: RefreshCw,
        color: 'text-yellow-500',
        bgColor: 'bg-yellow-500/10',
        label: '接続中...',
        animate: true,
      };
    case 'disconnected':
      return {
        icon: CloudOff,
        color: 'text-red-500',
        bgColor: 'bg-red-500/10',
        label: 'オフライン',
        animate: false,
      };
    default:
      return {
        icon: WifiOff,
        color: 'text-gray-500',
        bgColor: 'bg-gray-500/10',
        label: '不明',
        animate: false,
      };
  }
}

export function ConnectionIndicator({
  status,
  isSynced,
  onReconnect,
  className,
}: ConnectionIndicatorProps) {
  const config = getStatusConfig(status, isSynced);
  const Icon = config.icon;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'h-8 px-2 gap-1.5',
              config.bgColor,
              status === 'disconnected' && 'cursor-pointer hover:bg-red-500/20',
              className
            )}
            onClick={status === 'disconnected' ? onReconnect : undefined}
          >
            <Icon
              className={cn(
                'h-4 w-4',
                config.color,
                config.animate && 'animate-spin'
              )}
            />
            <span className={cn('text-xs', config.color)}>{config.label}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {status === 'disconnected' ? (
            <p>クリックして再接続</p>
          ) : status === 'connected' && isSynced ? (
            <p>すべての変更が保存されました</p>
          ) : (
            <p>変更を同期中...</p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
