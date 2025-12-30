import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { Home } from "lucide-react";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname
    );
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center animate-fade-in">
        <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-muted flex items-center justify-center">
          <span className="text-4xl font-bold text-muted-foreground">404</span>
        </div>
        <h1 className="text-2xl font-bold mb-2">ページが見つかりません</h1>
        <p className="text-muted-foreground mb-8">
          お探しのページは存在しないか、移動した可能性があります。
        </p>
        <Button asChild>
          <Link to="/" className="gap-2">
            <Home className="h-4 w-4" />
            ホームに戻る
          </Link>
        </Button>
      </div>
    </div>
  );
};

export default NotFound;
