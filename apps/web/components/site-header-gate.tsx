"use client";

import { usePathname } from "next/navigation";
import { isAuthPath } from "@/lib/auth/auth-paths";

/** Hide marketing header on admin, portal, and focused auth flows. */
export function SiteHeaderGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname.startsWith("/admin") || pathname.startsWith("/portal") || isAuthPath(pathname)) {
    return null;
  }
  return <>{children}</>;
}
