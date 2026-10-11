import { useEffect, useId, useRef, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";

interface Props {
  state: "working" | "error";
  message?: string;
  onRetry: () => void;
  onClose: () => void;
}

/**
 * Full-screen black-and-white overlay shown while the report is generated.
 * The bar is indeterminate on purpose: the real duration is unknown, so no
 * percentage is shown and nothing is delayed to make it look longer.
 */
export function ReportOverlay({ state, message, onRetry, onClose }: Props) {
  const titleId = useId();
  const textId = useId();
  const root = useRef<HTMLDivElement>(null);
  const retry = useRef<HTMLButtonElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const failed = state === "error";

  // Take focus and stop the page behind from scrolling while the overlay is open.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    root.current?.focus();
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // On failure, put the focus on the primary action.
  useEffect(() => {
    if (failed) retry.current?.focus();
  }, [failed]);

  // Escape closes the overlay only once there is something to dismiss.
  useEffect(() => {
    if (!failed) return;
    const onKey = (event: globalThis.KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [failed, onClose]);

  // Keep Tab inside the dialog.
  const trapTab = (event: KeyboardEvent) => {
    if (event.key !== "Tab") return;
    if (!failed) return event.preventDefault();
    const first = retry.current;
    const last = close.current;
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div
      ref={root}
      className="report-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={textId}
      tabIndex={-1}
      onKeyDown={trapTab}
    >
      <div className="report-overlay__brand">WhatIf Engine</div>

      <div className="report-overlay__body">
        {failed ? (
          <>
            <h2 id={titleId}>We couldn’t create your report</h2>
            <p id={textId} role="alert" className="report-overlay__text">
              {message}
            </p>
            <div className="report-overlay__actions">
              <button ref={retry} type="button" className="report-btn report-btn--solid" onClick={onRetry}>
                Try again
              </button>
              <button ref={close} type="button" className="report-btn" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 id={titleId}>Preparing your financial report</h2>
            <p id={textId} className="report-overlay__text">
              Your scenarios are being formatted into a downloadable report.
            </p>
            <div
              className="report-bar"
              role="progressbar"
              aria-label="Preparing your report"
              aria-valuetext="Working"
            >
              <span />
            </div>
            <p className="report-overlay__tagline">
              Make informed decisions. Understand the trade-offs.
            </p>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
