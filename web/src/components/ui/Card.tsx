import type { HTMLAttributes } from "react";

export function Card({
  flat,
  className = "",
  ...rest
}: HTMLAttributes<HTMLDivElement> & { flat?: boolean }) {
  return <div className={`card${flat ? " card--flat" : ""} ${className}`} {...rest} />;
}
