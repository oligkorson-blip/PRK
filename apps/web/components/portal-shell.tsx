"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { authClient } from "@/lib/auth/client";
import { UiIcon } from "@/components/ui-icon";

const NAV = [
  { href: "/portal", label: "Portfolio overview", icon: "home", exact: true },
  { href: "/portal/interests", label: "Your requests", icon: "request", exact: false },
  { href: "/portal/holdings", label: "Investments", icon: "asset", exact: false },
  { href: "/portal/contracts", label: "Agreements", icon: "document", exact: false },
  { href: "/portal/documents", label: "Documents", icon: "document", exact: false },
  { href: "/portal/kyc", label: "Identity check", icon: "shield", exact: false },
  { href: "/portal/settings", label: "Profile & security", icon: "settings", exact: false }
] as const;

export function PortalShell({
  name,
  email,
  children
}: {
  name?: string | null;
  email: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [signOutPending, setSignOutPending] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const signOutErrorRef = useRef<HTMLParagraphElement>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const drawerId = useId();

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (signOutPending || !signOutError) return;
    signOutErrorRef.current?.focus();
  }, [signOutPending, signOutError]);

  useEffect(() => {
    if (!drawerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const sidebar = sidebarRef.current;
    const getFocusables = () =>
      Array.from(
        sidebar?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ) ?? []
      );
    getFocusables()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDrawerOpen(false);
        return;
      }
      if (e.key !== "Tab" || !sidebar) return;
      const list = getFocusables();
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
      menuBtnRef.current?.focus();
    };
  }, [drawerOpen]);

  async function signOut() {
    setSignOutPending(true);
    setSignOutError(null);
    try {
      const result = await authClient.signOut();
      if (result.error) {
        setSignOutError("Sign out could not be completed. Please try again.");
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setSignOutError("Sign out could not be completed. Please try again.");
    } finally {
      setSignOutPending(false);
    }
  }

  const firstName = name?.trim().split(/\s+/)[0];

  return (
    <div className={`dash${drawerOpen ? " drawer-open" : ""}`}>
      <div className="dash-layout">
        <aside
          ref={sidebarRef}
          className="dash-side"
          id={drawerId}
          aria-modal={drawerOpen || undefined}
          role={drawerOpen ? "dialog" : undefined}
          aria-label="Investor portal navigation"
        >
          <Link className="brand" href="/" aria-label="Parkwise home">
            <span className="brand-mark">P</span>
            <span className="brand-name">Parkwise</span>
          </Link>
          <nav className="dash-nav" aria-label="Investor portal">
            {NAV.map((item) => {
              const active = item.exact
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={active ? "active" : undefined}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setDrawerOpen(false)}
                >
                  <UiIcon name={item.icon} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="dash-side-foot">
            <p className="field-hint">
              {email}
            </p>
            <Link href="/" className="stack-3">Back to site</Link>
            <button
              type="button"
              className="dash-signout"
              onClick={signOut}
              disabled={signOutPending}
            >
              {signOutPending ? "Signing out…" : "Sign out"}
            </button>
            {signOutError ? (
              <p ref={signOutErrorRef} className="form-error" role="alert" tabIndex={-1}>
                {signOutError}
              </p>
            ) : null}
          </div>
        </aside>
        {drawerOpen ? (
          <button
            type="button"
            className="dash-scrim"
            aria-label="Close menu"
            onClick={() => setDrawerOpen(false)}
          />
        ) : null}
        <div className="dash-main">
          <header className="dash-topbar">
            <button
              ref={menuBtnRef}
              type="button"
              className="dash-menu-btn"
              aria-label={drawerOpen ? "Close menu" : "Open menu"}
              title={drawerOpen ? "Close menu" : "Open menu"}
              aria-expanded={drawerOpen}
              aria-controls={drawerId}
              onClick={() => setDrawerOpen((o) => !o)}
            >
              <UiIcon name="menu" />
            </button>
            <div>
              <span className="dash-crumb">Investor portal</span>
              <p className="dash-welcome">{firstName ? `Welcome, ${firstName}` : "Welcome"}</p>
            </div>
          </header>
          <div className="dash-content" inert={drawerOpen ? true : undefined}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
