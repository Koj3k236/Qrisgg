import { Loader2 } from "lucide-react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

const Spinner = () => (
  <div data-testid="auth-loading" className="flex min-h-screen items-center justify-center">
    <Loader2 className="h-6 w-6 animate-spin text-[#2563EB]" />
  </div>
);

export const RequireMerchant = ({ children }) => {
  const { user } = useAuth();
  const loc = useLocation();
  if (user === null) return <Spinner />;
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  if (!user.memberships?.length) return <Navigate to={user.platform_role ? "/admin" : "/login"} replace />;
  return children;
};

export const RequireAdmin = ({ children }) => {
  const { user } = useAuth();
  if (user === null) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.platform_role) return <Navigate to="/dashboard" replace />;
  if (!user.mfa_verified) return <Navigate to="/2fa" replace />;
  return children;
};

export const GuestOnly = ({ children }) => {
  const { user } = useAuth();
  if (user === null) return <Spinner />;
  if (user) return <Navigate to={user.platform_role ? (user.mfa_verified ? "/admin" : "/2fa") : "/dashboard"} replace />;
  return children;
};
