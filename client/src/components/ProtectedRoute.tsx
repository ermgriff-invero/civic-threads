import { useEffect, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Redirect, useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Role } from "@shared/models/auth";

interface ProtectedRouteProps {
  children: React.ReactNode;
  roles?: Role[];
}

export default function ProtectedRoute({ children, roles }: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const hasRedirected = useRef(false);

  const needsRoleRedirect = roles && user && !roles.includes(user.role as Role);

  useEffect(() => {
    if (needsRoleRedirect && !hasRedirected.current) {
      hasRedirected.current = true;
      toast({
        title: "Access denied",
        description: "You don't have permission to access that page.",
        variant: "destructive",
      });
      setLocation("/dashboard");
    }
  }, [needsRoleRedirect, toast, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/" />;
  }

  if (needsRoleRedirect) {
    return null;
  }

  return <>{children}</>;
}
