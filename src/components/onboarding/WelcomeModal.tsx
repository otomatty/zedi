import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileText, Link as LinkIcon, Sparkles, Search, Zap } from "lucide-react";

interface FeatureItemProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

const FeatureItem: React.FC<FeatureItemProps> = ({
  icon,
  title,
  description,
}) => (
  <div className="flex flex-col items-center text-center p-4 rounded-lg bg-muted/50 hover:bg-muted/80 transition-colors">
    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
      {icon}
    </div>
    <h3 className="font-medium text-sm mb-1">{title}</h3>
    <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
  </div>
);

interface WelcomeModalProps {
  open: boolean;
  onClose: () => void;
  onStartTour?: () => void;
}

export const WelcomeModal: React.FC<WelcomeModalProps> = ({
  open,
  onClose,
  onStartTour,
}) => {
  const features = [
    {
      icon: <FileText className="h-5 w-5 text-primary" />,
      title: "書く",
      description: "1ページ1アイデアでシンプルに記録",
    },
    {
      icon: <LinkIcon className="h-5 w-5 text-primary" />,
      title: "繋ぐ",
      description: "[[リンク]] でアイデアをネットワーク化",
    },
    {
      icon: <Sparkles className="h-5 w-5 text-primary" />,
      title: "発見",
      description: "AIが関連するアイデアを自動で提案",
    },
  ];

  const tips = [
    {
      icon: <Zap className="h-4 w-4" />,
      text: "右下の + ボタンで新規ページ作成",
    },
    {
      icon: <Search className="h-4 w-4" />,
      text: "Ctrl+K で高速検索",
    },
    {
      icon: <LinkIcon className="h-4 w-4" />,
      text: "[[ と入力するとリンク候補が表示",
    },
  ];

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent
        className="sm:max-w-md"
        hideCloseButton
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader className="text-center pb-2">
          <div className="mx-auto w-16 h-16 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center mb-4">
            <span className="text-3xl">🎉</span>
          </div>
          <DialogTitle className="text-xl">Zediへようこそ！</DialogTitle>
          <DialogDescription className="text-base">
            思考を自由に繋げるナレッジツールです
          </DialogDescription>
        </DialogHeader>

        {/* Features */}
        <div className="grid grid-cols-3 gap-3 py-4">
          {features.map((feature) => (
            <FeatureItem
              key={feature.title}
              icon={feature.icon}
              title={feature.title}
              description={feature.description}
            />
          ))}
        </div>

        {/* Quick Tips */}
        <div className="bg-muted/30 rounded-lg p-4 space-y-2">
          <h4 className="text-sm font-medium mb-3">💡 クイックヒント</h4>
          {tips.map((tip, index) => (
            <div
              key={index}
              className="flex items-center gap-2 text-sm text-muted-foreground"
            >
              <span className="text-primary">{tip.icon}</span>
              <span>{tip.text}</span>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2 pt-4">
          <Button onClick={onClose} size="lg" className="w-full">
            始める
          </Button>
          {onStartTour && (
            <Button
              onClick={onStartTour}
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
            >
              クイックツアーを見る
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
