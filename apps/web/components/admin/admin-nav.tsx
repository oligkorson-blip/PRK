"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { StaffRole } from "@/lib/auth/roles";
import { UiIcon } from "@/components/ui-icon";

type Props = {
  role: StaffRole;
  onNavigate?: () => void;
};

function active(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminNav({ role, onNavigate }: Props) {
  const pathname = usePathname();
  const isSuper = role === "super_admin";

  const work = [
    { href: "/admin", label: "Overview", icon: "home" },
    { href: "/admin/leads", label: "Leads", icon: "leads" },
    { href: "/admin/investors", label: "Investors", icon: "people" },
    { href: "/admin/interests", label: "Requests", icon: "request" },
    { href: "/admin/distributions", label: "Payments", icon: "payments" },
    { href: "/admin/aml-checklist", label: "Checks", icon: "shield" },
    { href: "/admin/documents", label: "Documents", icon: "document" }
  ] as const;

  const platform = [
    { href: "/admin/contracts", label: "Agreements", icon: "document" },
    { href: "/admin/staff", label: "Team", icon: "team" },
    { href: "/admin/assets", label: "Opportunities", icon: "asset" },
    { href: "/admin/platform", label: "Platform settings", icon: "settings" },
    { href: "/admin/spaces", label: "Community spaces", icon: "asset" }
  ] as const;

  return (
    <nav className="admin-nav" aria-label="Admin">
      <div className="admin-nav-label">Work</div>
      {work.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={active(pathname, item.href) ? "active" : undefined}
          aria-current={active(pathname, item.href) ? "page" : undefined}
          onClick={onNavigate}
          title={item.label}
        >
          <span className="admin-nav-icon">
            <UiIcon name={item.icon} size={16} />
          </span>
          <span className="admin-nav-text">{item.label}</span>
        </Link>
      ))}
      {isSuper ? (
        <>
          <div className="admin-nav-label">Platform</div>
          {platform.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={active(pathname, item.href) ? "active" : undefined}
              aria-current={active(pathname, item.href) ? "page" : undefined}
              onClick={onNavigate}
              title={item.label}
            >
              <span className="admin-nav-icon">
                <UiIcon name={item.icon} size={16} />
              </span>
              <span className="admin-nav-text">{item.label}</span>
            </Link>
          ))}
        </>
      ) : null}
      <div className="admin-nav-label">You</div>
      <Link href="/" onClick={onNavigate} title="Public site">
        <span className="admin-nav-icon">
          <UiIcon name="home" size={16} />
        </span>
        <span className="admin-nav-text">Public site</span>
      </Link>
    </nav>
  );
}
