import type { ReactNode } from "react";
import { Link } from "react-router-dom";

/**
 * Link to a section of the landing page.
 *
 * The site uses hash routing (required for GitHub Pages), so a plain
 * `href="#how"` would be read as a route. Instead the target id travels in
 * router state and Layout scrolls to it after navigation.
 */
export function ScrollLink({
  id,
  className,
  children,
}: {
  id: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link to="/" state={{ scrollTo: id }} className={className}>
      {children}
    </Link>
  );
}
