"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth/client";
import { resolveHeaderCta } from "@/lib/copy/cta";

type Props = {
  isStaff?: boolean;
  needsOnboarding?: boolean;
  initialSignedIn?: boolean;
  communitySpacesEnabled?: boolean;
};

function navActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteHeader({
  isStaff = false,
  needsOnboarding = false,
  initialSignedIn = false,
  communitySpacesEnabled = false
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const headerRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [signOutPending, setSignOutPending] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const signOutErrorRef = useRef<HTMLSpanElement>(null);
  const { data: session, isPending } = authClient.useSession();

  const setMenu = useCallback((open: boolean) => {
    setMenuOpen(open);
  }, []);

  useEffect(() => {
    setMenu(false);
  }, [pathname, setMenu]);

  useEffect(() => {
    if (signOutPending || !signOutError) return;
    signOutErrorRef.current?.focus();
  }, [signOutPending, signOutError]);

  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && menuOpen) {
        setMenu(false);
        toggleRef.current?.focus();
        return;
      }
      if (event.key !== "Tab" || !menuOpen) return;
      const focusables = Array.from(
        header.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((element) => element.offsetParent !== null);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const handleClick = (event: MouseEvent) => {
      if (menuOpen && !header.contains(event.target as Node)) {
        setMenu(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("click", handleClick);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("click", handleClick);
    };
  }, [menuOpen, setMenu]);

  useEffect(() => {
    if (!menuOpen) {
      document.body.classList.remove("nav-menu-open");
      return;
    }
    document.body.classList.add("nav-menu-open");
    const firstLink = headerRef.current?.querySelector<HTMLElement>(".nav-links a");
    firstLink?.focus();
    return () => {
      document.body.classList.remove("nav-menu-open");
    };
  }, [menuOpen]);

  const closeMenu = () => setMenu(false);

  async function handleSignOut() {
    setSignOutPending(true);
    setSignOutError(null);
    try {
      const result = await authClient.signOut();
      if (result.error) {
        setSignOutError("We couldn’t sign you out. Please try again.");
        return;
      }
      closeMenu();
      router.push("/");
      router.refresh();
    } catch {
      setSignOutError("Sign out could not be completed. Please try again.");
    } finally {
      setSignOutPending(false);
    }
  }

  const signedIn = isPending ? initialSignedIn : Boolean(session?.user);
  const hideMarketingChrome = pathname.startsWith("/admin");
  const showOnboardingBanner =
    needsOnboarding && signedIn && !pathname.startsWith("/onboarding");
  const headerCta = resolveHeaderCta(pathname);

  if (hideMarketingChrome) {
    return null;
  }

  // Catalogue routes are deliberately absent from the signed-out chrome. The
  // middleware and pages enforce access server-side; this keeps the product
  // boundary clear before a visitor clicks anything. Find parking additionally
  // requires the community spaces feature to be enabled.
  const links = signedIn
    ? [
        { href: "/opportunities", label: "Explore" },
        ...(communitySpacesEnabled ? [{ href: "/spaces", label: "Find parking" }] : []),
        { href: "/how-it-works", label: "How it works" },
        { href: "/why-parking", label: "Why parking" },
        { href: "/guides", label: "Guides" },
        { href: "/faq", label: "FAQ" },
        { href: "/about", label: "About" }
      ]
    : [
        { href: "/how-it-works", label: "How it works" },
        { href: "/why-parking", label: "Why parking" },
        { href: "/about", label: "About" },
        { href: "/faq", label: "FAQ" }
      ];

  return (
    <header ref={headerRef} className={`site-header${menuOpen ? " menu-open" : ""}`}>
      {showOnboardingBanner ? (
        <div className="onboarding-banner">
          <div className="container onboarding-banner-inner">
            <span>Finish your investor profile to see full opportunity details.</span>
            <Link href="/onboarding" onClick={closeMenu}>
              Continue setup →
            </Link>
          </div>
        </div>
      ) : null}
      <div className="container nav">
        <Link className="brand" href="/" aria-label="Parkwise home" onClick={closeMenu}>
          <span className="brand-mark">P</span>
          <span className="brand-name">Parkwise</span>
        </Link>
        <nav id="primary-nav" className="nav-links" aria-label="Primary">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={navActive(pathname, link.href) ? "active" : undefined}
              aria-current={navActive(pathname, link.href) ? "page" : undefined}
              onClick={closeMenu}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="nav-actions">
          {signedIn ? (
            <>
              <Link
                className="btn btn-primary btn-sm nav-cta-persistent"
                href={isStaff ? "/admin" : "/portal"}
                onClick={closeMenu}
              >
                {isStaff ? "Admin" : "Dashboard"}
              </Link>
              <button
                type="button"
                className="nav-login"
                onClick={handleSignOut}
                disabled={signOutPending}
              >
                {signOutPending ? "Signing out…" : "Sign out"}
              </button>
              {signOutError ? (
                <span ref={signOutErrorRef} className="form-error" role="alert" tabIndex={-1}>
                  {signOutError}
                </span>
              ) : null}
            </>
          ) : (
            <>
              {headerCta.href !== "/sign-in" ? (
                <Link className="nav-login" href="/sign-in" onClick={closeMenu}>
                  Sign in
                </Link>
              ) : null}
              <Link
                className="btn btn-primary btn-sm nav-cta-persistent"
                href={headerCta.href}
                onClick={closeMenu}
              >
                {headerCta.label}
              </Link>
            </>
          )}
        </div>
        <button
          ref={toggleRef}
          type="button"
          className="nav-toggle"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          aria-controls="primary-nav"
          aria-haspopup="true"
          onClick={() => setMenu(!menuOpen)}
        >
          <span />
        </button>
      </div>
    </header>
  );
}
