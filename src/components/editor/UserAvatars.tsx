/**
 * UserAvatars
 * オンラインユーザーのアバターを表示するコンポーネント
 */

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip';
import type { UserPresence } from '@/lib/collaboration/types';
import { cn } from '@/lib/utils';

interface UserAvatarsProps {
  /** オンラインユーザー一覧 */
  users: UserPresence[];
  /** 最大表示数 */
  maxDisplay?: number;
  /** クラス名 */
  className?: string;
}

/**
 * ユーザー名からイニシャルを取得
 */
function getInitials(name: string): string {
  const parts = name.split(' ').filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export function UserAvatars({
  users,
  maxDisplay = 3,
  className,
}: UserAvatarsProps) {
  if (users.length === 0) {
    return null;
  }

  const displayUsers = users.slice(0, maxDisplay);
  const remainingCount = users.length - maxDisplay;

  return (
    <TooltipProvider>
      <div className={cn('flex items-center -space-x-2', className)}>
        {displayUsers.map((user) => (
          <Tooltip key={user.userId}>
            <TooltipTrigger asChild>
              <Avatar
                className="h-7 w-7 border-2 border-background cursor-default"
                style={{ backgroundColor: user.userColor }}
              >
                <AvatarFallback
                  className="text-xs font-medium text-white"
                  style={{ backgroundColor: user.userColor }}
                >
                  {getInitials(user.userName)}
                </AvatarFallback>
              </Avatar>
            </TooltipTrigger>
            <TooltipContent>
              <p>{user.userName}</p>
              <p className="text-xs text-muted-foreground">
                {user.status === 'active' ? '編集中' : user.status === 'idle' ? '待機中' : '離席中'}
              </p>
            </TooltipContent>
          </Tooltip>
        ))}
        
        {remainingCount > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Avatar className="h-7 w-7 border-2 border-background bg-muted cursor-default">
                <AvatarFallback className="text-xs font-medium">
                  +{remainingCount}
                </AvatarFallback>
              </Avatar>
            </TooltipTrigger>
            <TooltipContent>
              <p>他 {remainingCount} 人のユーザー</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
}
