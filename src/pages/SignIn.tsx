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
            <h1 className="text-2xl font-bold mb-2">サインイン</h1>
            <p className="text-muted-foreground">
              アカウントにサインインして続行
            </p>
          </div>
          <div className="flex justify-center">
            <ClerkSignIn
              appearance={{
                elements: {
                  rootBox: "w-full",
                  card: "shadow-none border border-border rounded-lg bg-card",
                  headerTitle: "hidden",
                  headerSubtitle: "hidden",
                  socialButtonsBlockButton:
                    "border-border hover:bg-accent",
                  formButtonPrimary:
                    "bg-primary hover:bg-primary/90 text-primary-foreground",
                  footerActionLink: "text-primary hover:text-primary/80",
                  formFieldInput:
                    "border-border focus:ring-primary focus:border-primary",
                  identityPreviewEditButton: "text-primary",
                  formResendCodeLink: "text-primary",
                },
                layout: {
                  socialButtonsPlacement: "top",
                  showOptionalFields: false,
                },
              }}
              routing="path"
              path="/sign-in"
              afterSignInUrl="/home"
            />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/50 py-4">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} Zedi. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default SignIn;
