import React from "react";
import { Link } from "react-router-dom";
import { SignIn as ClerkSignIn } from "@clerk/clerk-react";

const SignIn: React.FC = () => {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border/50">
        <div className="container mx-auto flex h-16 items-center px-4">
          <Link
            to="/"
            className="text-xl font-bold tracking-tight bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent"
          >
            Zedi
          </Link>
        </div>
      </header>

      {/* Sign In Form */}
      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-bold mb-2 text-foreground">サインイン</h1>
            <p className="text-foreground/70">
              アカウントにサインインして続行
            </p>
          </div>
          <div className="flex justify-center">
            <ClerkSignIn
              appearance={{
                elements: {
                  rootBox: "w-full",
                  cardBox: "w-full",
                  card: "shadow-none border border-border rounded-lg bg-card",
                  headerTitle: "hidden",
                  headerSubtitle: "hidden",
                  // ソーシャルログインボタンのスタイリング改善
                  socialButtonsBlockButton:
                    "border border-border bg-card hover:bg-accent/50 text-foreground font-medium transition-colors duration-200 rounded-md px-4 py-2.5 shadow-sm hover:shadow-md",
                  socialButtonsBlockButtonText: "text-foreground font-medium",
                  socialButtonsBlockButtonArrow: "text-foreground",
                  // フォームフィールドのスタイリング改善
                  formFieldLabel: "text-foreground/90 font-medium text-sm mb-1.5",
                  formFieldInput:
                    "border-border bg-background text-foreground focus:ring-primary focus:border-primary rounded-md",
                  formFieldInputShowPasswordButton: "text-muted-foreground hover:text-foreground",
                  formFieldInputUsername: "hidden",
                  // セパレーターのスタイリング改善
                  dividerLine: "bg-border",
                  dividerText: "text-muted-foreground text-sm font-medium",
                  // プライマリボタンのスタイリング
                  formButtonPrimary:
                    "bg-primary hover:bg-primary/90 text-primary-foreground font-medium rounded-md shadow-sm hover:shadow-md transition-all duration-200",
                  // リンクのスタイリング
                  footerActionLink: "text-primary hover:text-primary/80 font-medium",
                  identityPreviewEditButton: "text-primary hover:text-primary/80",
                  formResendCodeLink: "text-primary hover:text-primary/80",
                  // その他の要素
                  formFieldErrorText: "text-destructive text-sm",
                  formFieldSuccessText: "text-primary text-sm",
                  footer: "hidden",
                  footerPages: "hidden",
                },
                layout: {
                  socialButtonsPlacement: "top",
                  showOptionalFields: false,
                },
              }}
              routing="path"
              path="/sign-in"
              signUpUrl="/sign-up"
            />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/50 py-4">
        <div className="container mx-auto px-4 text-center text-sm text-foreground/60">
          <p>© {new Date().getFullYear()} Zedi. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default SignIn;
