import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

// UX gate only — real security is backend requireAdmin. We read the JWT role
// without verifying the signature, which is fine for deciding what to render.
function role(): string | null {
  const token = localStorage.getItem("token");
  if (!token) return null;
  try {
    return JSON.parse(atob(token.split(".")[1])).role ?? null;
  } catch {
    return null;
  }
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  return role() === "ADMIN" ? <>{children}</> : <Navigate to="/login" replace />;
}
