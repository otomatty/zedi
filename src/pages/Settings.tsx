import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Bot, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Container from "@/components/layout/Container";

interface SettingsItemProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  to: string;
}

const SettingsItem: React.FC<SettingsItemProps> = ({
  icon,
  title,
  description,
  to,
}) => {
  const navigate = useNavigate();

  return (
    <Card
      className="cursor-pointer transition-colors hover:bg-muted/50"
      onClick={() => navigate(to)}
    >
      <CardHeader className="flex flex-row items-center gap-4 pb-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </div>
        <div className="flex-1">
          <CardTitle className="text-base">{title}</CardTitle>
          <CardDescription className="text-sm">{description}</CardDescription>
        </div>
      </CardHeader>
    </Card>
  );
};

const Settings: React.FC = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <Container className="flex h-16 items-center gap-4">
          <Link to="/home">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-xl font-semibold">設定</h1>
        </Container>
      </header>

      {/* Content */}
      <main className="py-6">
        <Container>
          <div className="space-y-4 max-w-2xl mx-auto">
            <SettingsItem
              icon={<Bot className="h-5 w-5" />}
              title="AI 設定"
              description="LLM APIキーの設定、プロバイダーの選択"
              to="/settings/ai"
            />

            <SettingsItem
              icon={<ImageIcon className="h-5 w-5" />}
              title="画像ストレージ設定"
              description="画像アップロード先のストレージ設定"
              to="/settings/storage"
            />

            {/* 将来的な設定項目のプレースホルダー */}
            {/* 
            <SettingsItem
              icon={<User className="h-5 w-5" />}
              title="アカウント"
              description="プロフィール、同期設定"
              to="/settings/account"
            />
            */}
          </div>
        </Container>
      </main>
    </div>
  );
};

export default Settings;
