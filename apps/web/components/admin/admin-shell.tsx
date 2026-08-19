"use client";

import { useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import type { StaffRole } from "@/lib/auth/roles";
import { AdminNav } from "@/components/admin/admin-nav";
import { isUuid } from "@/lib/format";
import { UiIcon } from "@/components/ui-icon";

type Props = {
  role: StaffRole;
  email: string;
  children: React.ReactNode;
};

function crumb(pathname: string): string {
  if (pathname === "/admin") return "Operations overview";
  const parts = pathname
    .replace(/^\/admin\/?/, "")
    .split("/")
    .filter(Boolean)
    // Record ids are UUIDs — a crumb like "/ Investors / 3fa8…" is noise.
    .filter((p) => !isUuid(p));
  if (parts.length === 0) return "Admin";
  return parts
    .map((p) => p.replace(/-/g, " "))
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" / ");
}

function initials(email: string): string {
  const local = email.split("@")[0] ?? "A";
  const bits = local.split(/[._-]/).filter(Boolean);
  if (bits.length >= 2) return (bits[0][0] + bits[1][0]).toUpperCase();
  return local.slice(0, 2).toUpperCase();
}

export function AdminShell({ role, email, children }: Props) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const drawerId = useId();

  useEffect(() => {
    restoreFocusRef.current = false;
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!drawerOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const sidebar = sidebarRef.current;
    const focusables = sidebar?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    focusables?.[0]?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        restoreFocusRef.current = true;
        setDrawerOpen(false);
        return;
      }
      if (e.key !== "Tab" || !sidebar || !focusables?.length) return;
      const list = Array.from(focusables);
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
      if (restoreFocusRef.current) {
        restoreFocusRef.current = false;
        menuBtnRef.current?.focus();
      }
    };
  }, [drawerOpen]);

  const roleLabel = role === "super_admin" ? "Super admin" : role === "ib" ? "IB" : "Agent";

  return (
    <div className={`admin-shell${drawerOpen ? " drawer-open" : ""}`}>
      <header className="admin-topbar">
        <button
          ref={menuBtnRef}
          type="button"
          className="admin-menu-btn"
          aria-label={drawerOpen ? "Close menu" : "Open menu"}
          aria-expanded={drawerOpen}
          aria-controls={drawerId}
          onClick={() => {
            restoreFocusRef.current = drawerOpen;
            setDrawerOpen((o) => !o);
          }}
        >
          <UiIcon name="menu" />
        </button>
        <div className="admin-brand">
          <span className="admin-mark">P</span>
          <span className="admin-brand-name">Parkwise</span>
        </div>
        <span className="admin-crumb">{crumb(pathname)}</span>
        <div className="admin-topbar-spacer" />
        <span className="admin-role-pill">{roleLabel}</span>
        <span className="admin-avatar" title={email}>
          {initials(email)}
        </span>
      </header>
      <div className="admin-body">
        {drawerOpen ? (
          <button
            type="button"
            className="admin-scrim"
            aria-label="Close menu"
            onClick={() => {
              restoreFocusRef.current = true;
              setDrawerOpen(false);
            }}
          />
        ) : null}
        <aside
          ref={sidebarRef}
          id={drawerId}
          className="admin-sidebar"
          aria-modal={drawerOpen || undefined}
          role={drawerOpen ? "dialog" : undefined}
          aria-label="Admin navigation"
        >
          <AdminNav role={role} onNavigate={() => {
            restoreFocusRef.current = false;
            setDrawerOpen(false);
          }} />
          <div className="admin-sidebar-account" aria-label={`Signed in as ${email}, ${roleLabel}`}>
            <strong>{roleLabel}</strong>
            <span>{email}</span>
          </div>
        </aside>
        <main className="admin-main" inert={drawerOpen ? true : undefined}>
          {children}
        </main>
      </div>
    </div>
  );
}
