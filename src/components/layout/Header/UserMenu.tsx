import React from "react";
import { useNavigate, Link } from "react-router-dom";
import { Settings, LogOut, CreditCard, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SignedIn, SignedOut, useAuth, useUser } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useTranslation } from "react-i18next";

export const UserMenu: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useUser();
  const { signOut } = useAuth();
  const { displayName, avatarUrl } = useProfile();
  const { t } = useTranslation();

  return (
    <>
      <SignedOut>
        <Link to="/sign-in">
          <Button variant="outline" size="default">
            {t("nav.signIn")}
          </Button>
        </Link>
      </SignedOut>
      <SignedIn>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="relative h-9 w-9 rounded-full"
            >
              <Avatar className="h-9 w-9">
                <AvatarImage
                  src={avatarUrl || user?.imageUrl}
                  alt={displayName || user?.fullName || "User"}
                />
                <AvatarFallback>
                  {(displayName || user?.firstName)?.charAt(0) ?? "U"}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="flex items-center justify-start gap-2 p-2">
              <div className="flex flex-col space-y-1 leading-none">
                {(displayName || user?.fullName) && (
                  <p className="font-medium">{displayName || user?.fullName}</p>
                )}
                {user?.primaryEmailAddress && (
                  <p className="text-xs text-muted-foreground">
                    {user.primaryEmailAddress.emailAddress}
                  </p>
                )}
              </div>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate("/settings")}>
              <Settings className="mr-2 h-4 w-4" />
              {t("nav.settings")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/pricing")}>
              <CreditCard className="mr-2 h-4 w-4" />
              {t("nav.plan")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/donate")}>
              <Heart className="mr-2 h-4 w-4" />
              {t("nav.support")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => signOut()}
              className="text-destructive focus:text-destructive"
            >
              <LogOut className="mr-2 h-4 w-4" />
              {t("nav.signOut")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SignedIn>
    </>
  );
};
