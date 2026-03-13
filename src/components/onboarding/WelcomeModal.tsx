import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@zedi/ui";
import { Button } from "@zedi/ui";
import { FileText, Link as LinkIcon, Sparkles, Search, Zap } from "lucide-react";

interface FeatureItemProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

const FeatureItem: React.FC<FeatureItemProps> = ({ icon, title, description }) => (
  <div className="flex flex-col items-center rounded-lg bg-muted/50 p-4 text-center transition-colors hover:bg-muted/80">
    <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
      {icon}
    </div>
    <h3 className="mb-1 text-sm font-medium">{title}</h3>
    <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
  </div>
);

interface WelcomeModalProps {
  open: boolean;
  onClose: () => void;
  onStartTour?: () => void;
}

export const WelcomeModal: React.FC<WelcomeModalProps> = ({ open, onClose, onStartTour }) => {
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
        <DialogHeader className="pb-2 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/5">
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
        <div className="space-y-2 rounded-lg bg-muted/30 p-4">
          <h4 className="mb-3 text-sm font-medium">💡 クイックヒント</h4>
          {tips.map((tip, index) => (
            <div key={index} className="flex items-center gap-2 text-sm text-muted-foreground">
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
