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

export const UserMenu: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useUser();
  const { signOut } = useAuth();

  return (
    <>
      <SignedOut>
        <Link to="/sign-in">
          <Button variant="outline" size="sm">
            サインイン
          </Button>
        </Link>
      </SignedOut>
      <SignedIn>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="relative h-8 w-8 rounded-full"
            >
              <Avatar className="h-8 w-8">
                <AvatarImage
                  src={user?.imageUrl}
                  alt={user?.fullName ?? "User"}
                />
                <AvatarFallback>
                  {user?.firstName?.charAt(0) ?? "U"}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="flex items-center justify-start gap-2 p-2">
              <div className="flex flex-col space-y-1 leading-none">
                {user?.fullName && (
                  <p className="font-medium">{user.fullName}</p>
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
              設定
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/pricing")}>
              <CreditCard className="mr-2 h-4 w-4" />
              プラン
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/donate")}>
              <Heart className="mr-2 h-4 w-4" />
              サポート
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => signOut()}
              className="text-destructive focus:text-destructive"
            >
              <LogOut className="mr-2 h-4 w-4" />
              サインアウト
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SignedIn>
    </>
  );
};
