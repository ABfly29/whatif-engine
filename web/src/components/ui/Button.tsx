import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link } from "react-router-dom";

type Variant = "primary" | "ghost";

interface Common {
  variant?: Variant;
  small?: boolean;
  arrow?: boolean;
  children: ReactNode;
}

const cls = (v: Variant, small?: boolean) =>
  `btn btn--${v}${small ? " btn--sm" : ""}`;

export function Button({
  variant = "primary",
  small,
  arrow,
  children,
  ...rest
}: Common & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={cls(variant, small)} {...rest}>
      {children}
      {arrow && <span className="arrow" aria-hidden="true">→</span>}
    </button>
  );
}

export function ButtonLink({
  to,
  variant = "primary",
  small,
  arrow,
  children,
}: Common & { to: string }) {
  return (
    <Link to={to} className={cls(variant, small)}>
      {children}
      {arrow && <span className="arrow" aria-hidden="true">→</span>}
    </Link>
  );
}
