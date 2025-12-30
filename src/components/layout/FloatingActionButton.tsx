import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const FloatingActionButton: React.FC = () => {
  const navigate = useNavigate();

  return (
    <Button
      onClick={() => navigate('/page/new')}
      size="icon"
      className={cn(
        "fixed bottom-6 right-6 h-14 w-14 rounded-full",
        "shadow-elevated hover:shadow-glow",
        "transition-all duration-300",
        "z-40"
      )}
    >
      <Plus className="h-6 w-6" />
    </Button>
  );
};

export default FloatingActionButton;
