import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AISettingsForm } from "@/components/settings/AISettingsForm";
import Container from "@/components/layout/Container";
import { SignedIn, SignedOut, SignInButton } from "@clerk/clerk-react";
import { Card, CardContent } from "@/components/ui/card";

const AISettings: React.FC = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <Container className="flex h-16 items-center gap-4">
          <Link to="/settings">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-xl font-semibold">AI 設定</h1>
        </Container>
      </header>

      {/* Content */}
      <main className="py-6">
        <Container>
          <SignedIn>
            <div className="max-w-2xl mx-auto">
              <AISettingsForm />
            </div>
          </SignedIn>

          <SignedOut>
            <Card className="max-w-md mx-auto">
              <CardContent className="flex flex-col items-center gap-4 py-10">
                <p className="text-muted-foreground">
                  AI設定を変更するにはサインインしてください
                </p>
                <SignInButton mode="modal">
                  <Button>サインイン</Button>
                </SignInButton>
              </CardContent>
            </Card>
          </SignedOut>
        </Container>
      </main>
    </div>
  );
};

export default AISettings;
