import type { ReactNode } from "react";

interface Props {
  title: string;
  hint?: string;
  defaultOpen?: boolean;
  onToggle?: (open: boolean) => void;
  children: ReactNode;
}

/** Native <details>: keyboard accessible with no extra JS. */
export function Disclosure({ title, hint, defaultOpen, onToggle, children }: Props) {
  return (
    <details
      className="disclosure"
      open={defaultOpen}
      onToggle={(e) => onToggle?.((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary>
        <span>
          {title}
          {hint && <span className="disclosure__hint"> — {hint}</span>}
        </span>
      </summary>
      <div className="disclosure__body">{children}</div>
    </details>
  );
}
