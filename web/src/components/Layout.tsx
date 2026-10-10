import { useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { ScrollLink } from "./ScrollLink";
import { ButtonLink } from "./ui/Button";

const NAV = [
  { id: "how", label: "How it works" },
  { id: "compare", label: "What you can compare" },
  { id: "about", label: "About" },
];

export function Wordmark() {
  return (
    <>
      <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true" className="brand__mark">
        <rect width="26" height="26" rx="7" fill="#12302f" />
        {/* two diverging paths: the decision */}
        <path d="M5 17 C10 17 12 12 21 8" fill="none" stroke="#2dd4bf" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M5 17 C11 17 14 17 21 15.5" fill="none" stroke="#9db4d9" strokeWidth="1.8" strokeLinecap="round" strokeDasharray="1 3.2" />
      </svg>
      <span className="brand__name">WhatIf</span>
    </>
  );
}

/** Scroll to the section named in router state, or to the top on a new page. */
function useSectionScroll() {
  const { key, state } = useLocation();
  const target = (state as { scrollTo?: string } | null)?.scrollTo;
  useEffect(() => {
    if (!target) {
      window.scrollTo(0, 0);
      return;
    }
    // Wait a tick so the landing sections exist after a route change.
    const t = setTimeout(() => document.getElementById(target)?.scrollIntoView?.(), 0);
    return () => clearTimeout(t);
  }, [key, target]);
}

export default function Layout() {
  // The menu is open only for the route entry it was opened on, so any
  // navigation closes it without needing an effect.
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const location = useLocation();
  const open = openedAt === location.key;
  // The calculator is already open there, so its entry-point CTA is hidden.
  const showCta = location.pathname !== "/app";
  useSectionScroll();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenedAt(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <a
        href="#main"
        className="skip-link"
        onClick={(e) => {
          // Hash routing: focus the content instead of changing the route.
          e.preventDefault();
          document.getElementById("main")?.focus();
        }}
      >
        Skip to content
      </a>
      <header className="site-header">
        <div className="container site-header__inner">
          <Link to="/" className="brand" aria-label="WhatIf home">
            <Wordmark />
          </Link>

          <nav className="site-nav" aria-label="Main">
            {NAV.map((n) => (
              <ScrollLink key={n.id} id={n.id} className="site-nav__link">
                {n.label}
              </ScrollLink>
            ))}
          </nav>

          {showCta && (
            <div className="site-header__cta">
              <ButtonLink to="/app" small>Try the calculator</ButtonLink>
            </div>
          )}

          <button
            type="button"
            className="menu-btn"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpenedAt(open ? null : location.key)}
          >
            <span aria-hidden="true" className="menu-btn__bars" data-open={open} />
          </button>
        </div>

        <div id="mobile-menu" className="mobile-menu" hidden={!open}>
          <nav className="container" aria-label="Mobile">
            {NAV.map((n) => (
              <ScrollLink key={n.id} id={n.id} className="mobile-menu__link">
                {n.label}
              </ScrollLink>
            ))}
            {showCta && <ButtonLink to="/app">Try the calculator</ButtonLink>}
          </nav>
        </div>
      </header>

      <main id="main" tabIndex={-1}>
        <Outlet />
      </main>

      <footer className="site-footer">
        <div className="container site-footer__inner">
          <div>
            <Link to="/" className="brand" aria-label="WhatIf home">
              <Wordmark />
            </Link>
            <p className="site-footer__note">
              Projections from the numbers you provide. Not financial, tax or
              investment advice; results are not guarantees.
            </p>
          </div>
          <nav aria-label="Footer" className="site-footer__links">
            <div className="site-footer__group">
              <h2>Explore</h2>
              <ul>
                <li><ScrollLink id="how">How it works</ScrollLink></li>
                <li><ScrollLink id="compare">What you can compare</ScrollLink></li>
                <li><Link to="/app">Calculator</Link></li>
              </ul>
            </div>
            <div className="site-footer__group">
              <h2>Transparency</h2>
              <ul>
                <li><ScrollLink id="about">Assumptions and limitations</ScrollLink></li>
              </ul>
            </div>
          </nav>
        </div>
        <div className="container site-footer__legal">
          <span>© {new Date().getFullYear()} WhatIf</span>
          <span>Built for decisions in India · amounts in ₹</span>
        </div>
      </footer>
    </>
  );
}
