"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type AppDialogProps = {
  open: boolean;
  titleId: string;
  children: React.ReactNode;
  onClose: () => void;
  className?: string;
  labelledBy?: string;
  describedBy?: string;
  closeOnBackdrop?: boolean;
  inline?: boolean;
  keepMounted?: boolean;
  backdropClassName?: string;
};

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function AppDialog({
  open,
  titleId,
  children,
  onClose,
  className = "",
  labelledBy,
  describedBy,
  closeOnBackdrop = true,
  inline = false,
  keepMounted = false,
  backdropClassName = "",
}: AppDialogProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const panelRef = useRef<HTMLElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const modalOpen = open && !inline;

  useEffect(() => {
    if (!modalOpen) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => {
      const first = panelRef.current?.querySelector<HTMLElement>("[autofocus], " + FOCUSABLE);
      (first || panelRef.current)?.focus();
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const focusedDialog = event.target instanceof Element ? event.target.closest('[role="dialog"][aria-modal="true"]') : null;
      if (focusedDialog && focusedDialog !== panelRef.current && panelRef.current?.contains(focusedDialog)) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter((item) => !item.hasAttribute("disabled") && item.getAttribute("aria-hidden") !== "true");
      if (!items.length) {
        event.preventDefault();
        panelRef.current.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      returnFocusRef.current?.focus();
    };
  }, [modalOpen]);

  if (!open && !inline && !keepMounted) return null;
  const content = (
    <div
      className={`dialog-backdrop ${backdropClassName}`.trim()}
      hidden={!open && !inline}
      data-inline={inline || undefined}
      role={inline ? undefined : "presentation"}
      onMouseDown={(event) => {
        if (modalOpen && closeOnBackdrop && event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={panelRef}
        tabIndex={-1}
        className={`dialog-panel ${className}`.trim()}
        role={modalOpen ? "dialog" : undefined}
        aria-modal={modalOpen || undefined}
        aria-labelledby={modalOpen ? labelledBy || titleId : undefined}
        aria-describedby={modalOpen ? describedBy : undefined}
      >
        {children}
      </section>
    </div>
  );
  return inline ? content : mounted ? createPortal(content, document.body) : null;
}
