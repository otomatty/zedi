import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText } from 'lucide-react';
import type { Page } from '@/types/page';
import { getContentPreview, extractFirstImage } from '@/lib/contentUtils';
import { cn } from '@/lib/utils';

interface PageCardProps {
  page: Page;
  index?: number;
}

const PageCard: React.FC<PageCardProps> = ({ page, index = 0 }) => {
  const navigate = useNavigate();
  const preview = getContentPreview(page.content, 80);
  const thumbnail = page.thumbnailUrl || extractFirstImage(page.content);

  const handleClick = () => {
    navigate(`/page/${page.id}`);
  };

  return (
    <button
      onClick={handleClick}
      className={cn(
        "page-card w-full text-left rounded-lg overflow-hidden",
        "bg-card border border-border/50 hover:border-border",
        "transition-all duration-200 group",
        "animate-fade-in opacity-0",
        index <= 5 && `stagger-${Math.min(index + 1, 5)}`
      )}
      style={{ animationFillMode: 'forwards', animationDelay: `${index * 50}ms` }}
    >
      {/* Thumbnail */}
      {thumbnail ? (
        <div className="aspect-video w-full overflow-hidden bg-muted">
          <img
            src={thumbnail}
            alt=""
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        </div>
      ) : (
        <div className="aspect-video w-full bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center">
          <FileText className="h-8 w-8 text-muted-foreground/40" />
        </div>
      )}
      
      {/* Content */}
      <div className="p-3">
        <h3 className="font-medium text-sm text-foreground line-clamp-1 mb-1">
          {page.title || '無題のページ'}
        </h3>
        {preview && (
          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
            {preview}
          </p>
        )}
      </div>
    </button>
  );
};

export default PageCard;
