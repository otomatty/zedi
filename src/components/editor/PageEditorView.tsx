import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Trash2, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import TiptapEditor from './TiptapEditor';
import { usePageStore } from '@/stores/pageStore';
import { formatTimeAgo } from '@/lib/dateUtils';
import { generateAutoTitle } from '@/lib/contentUtils';
import { useToast } from '@/hooks/use-toast';

const PageEditor: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const { getPage, updatePage, deletePage, createPage } = usePageStore();
  
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isNew, setIsNew] = useState(false);
  const [pageId, setPageId] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<number | null>(null);

  // Load or create page
  useEffect(() => {
    if (id === 'new') {
      const newPage = createPage();
      setPageId(newPage.id);
      setTitle('');
      setContent('');
      setIsNew(true);
      setLastSaved(newPage.updatedAt);
    } else if (id) {
      const page = getPage(id);
      if (page) {
        setPageId(id);
        setTitle(page.title);
        setContent(page.content);
        setIsNew(false);
        setLastSaved(page.updatedAt);
      } else {
        navigate('/');
        toast({
          title: 'ページが見つかりません',
          variant: 'destructive',
        });
      }
    }
  }, [id, getPage, createPage, navigate, toast]);

  // Auto-save on changes
  const handleContentChange = useCallback((newContent: string) => {
    setContent(newContent);
    if (pageId) {
      // Auto-generate title if empty
      const autoTitle = !title ? generateAutoTitle(newContent) : title;
      updatePage(pageId, { 
        content: newContent,
        title: autoTitle,
      });
      setLastSaved(Date.now());
      if (!title && autoTitle !== '無題のページ') {
        setTitle(autoTitle);
      }
    }
  }, [pageId, title, updatePage]);

  const handleTitleChange = useCallback((newTitle: string) => {
    setTitle(newTitle);
    if (pageId) {
      updatePage(pageId, { title: newTitle });
      setLastSaved(Date.now());
    }
  }, [pageId, updatePage]);

  const handleDelete = useCallback(() => {
    if (pageId) {
      deletePage(pageId);
      toast({
        title: 'ページを削除しました',
      });
      navigate('/');
    }
  }, [pageId, deletePage, navigate, toast]);

  const handleBack = useCallback(() => {
    navigate('/');
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleBack}
            className="shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          
          <div className="flex-1 min-w-0">
            <Input
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="ページタイトル"
              className="border-0 bg-transparent text-lg font-medium focus-visible:ring-0 px-0 h-auto py-1"
            />
          </div>

          <div className="flex items-center gap-2">
            {lastSaved && (
              <span className="text-xs text-muted-foreground hidden sm:inline">
                {formatTimeAgo(lastSaved)}に保存
              </span>
            )}
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreHorizontal className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={handleDelete}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  削除
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Editor */}
      <main className="flex-1 container py-6">
        <div className="max-w-2xl mx-auto">
          <TiptapEditor
            content={content}
            onChange={handleContentChange}
            autoFocus={isNew}
            className="min-h-[calc(100vh-200px)]"
          />
        </div>
      </main>
    </div>
  );
};

export default PageEditor;
