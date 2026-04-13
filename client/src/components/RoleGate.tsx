import { useAuth } from "@/hooks/use-auth";
import type { Role } from "@shared/models/auth";

interface RoleGateProps {
  roles: Role[];
  children: React.ReactNode;
}

export default function RoleGate({ roles, children }: RoleGateProps) {
  const { user } = useAuth();
  if (!user?.role || !roles.includes(user.role as Role)) {
    return null;
  }
  return <>{children}</>;
}
