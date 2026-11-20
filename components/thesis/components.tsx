"use client";

import * as React from "react";
import { Icon } from "./Icon";
import type { IconName } from "./icon-names";

export function Button({
  variant = "secondary",
  icon,
  loading = false,
  children,
  className = "",
  disabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  icon?: IconName;
  loading?: boolean;
}) {
  return (
    <button
      type="button"
      {...props}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`th-button th-button--${variant} ${className}`}
    >
      {loading ? <Icon name="loading" className="th-spin" /> : icon ? <Icon name={icon} /> : null}
      {children}
    </button>
  );
}

export function IconButton({
  label,
  icon,
  ...props
}: Omit<React.ComponentProps<typeof Button>, "children" | "icon"> & { label: string; icon: IconName }) {
  return (
    <Button
      {...props}
      icon={icon}
      aria-label={label}
      title={label}
      className={`th-button--icon ${props.className || ""}`}
    />
  );
}

export function Card({
  variant,
  children,
  className = "",
  ...props
}: React.HTMLAttributes<HTMLElement> & { variant?: "soft" | "hero" | "selected" }) {
  return (
    <section {...props} className={`th-card ${variant ? `th-card--${variant}` : ""} ${className}`}>
      {children}
    </section>
  );
}

export function Badge({
  tone,
  children,
}: {
  tone?: "primary" | "success" | "warning" | "danger";
  children: React.ReactNode;
}) {
  return <span className={`th-badge ${tone ? `th-badge--${tone}` : ""}`}>{children}</span>;
}

export function Field({
  label,
  error,
  hint,
  id,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string }) {
  const fallback = React.useId();
  const inputId = id || fallback;
  return (
    <label className="th-field" htmlFor={inputId}>
      <span>{label}</span>
      <input
        {...props}
        id={inputId}
        className={`th-input ${props.className || ""}`}
        aria-invalid={error ? true : props["aria-invalid"]}
        aria-describedby={
          [props["aria-describedby"], error || hint ? `${inputId}-help` : null].filter(Boolean).join(" ") || undefined
        }
      />
      {(error || hint) && (
        <small id={`${inputId}-help`} className={error ? "th-field-error" : "th-muted"}>
          {error || hint}
        </small>
      )}
    </label>
  );
}

/** Native dialog supplies modal focus containment and Escape. Caller owns business state. */
export function Overlay({
  open,
  onClose,
  title,
  kind = "modal",
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  kind?: "modal" | "drawer" | "assistant";
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const ref = React.useRef<HTMLDialogElement>(null);
  const titleId = React.useId();
  const closeRef = React.useRef(onClose);
  closeRef.current = onClose;
  React.useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (open && !node.open) {
      const trigger = document.activeElement as HTMLElement | null;
      node.showModal();
      return () => {
        if (node.open) node.close();
        if (trigger?.isConnected) trigger.focus();
      };
    }
    if (!open && node.open) node.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={`th-dialog ${kind !== "modal" ? "th-dialog--drawer" : ""} ${kind === "assistant" ? "th-dialog--assistant" : ""}`}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        closeRef.current();
      }}
    >
      <div className="th-dialog__head">
        <h2 id={titleId}>{title}</h2>
        <IconButton icon="close" label="Close" variant="ghost" onClick={onClose} />
      </div>
      <div className="th-dialog__body">{children}</div>
      {footer ? <div className="th-dialog__foot">{footer}</div> : null}
    </dialog>
  );
}

export function StageNav({
  current,
  items,
}: {
  current: string;
  items: { id: string; label: string; href: string }[];
}) {
  return (
    <nav className="th-tabs" aria-label="Thesis stages">
      {items.map((item) => (
        <a key={item.id} href={item.href} aria-current={current === item.id ? "page" : undefined}>
          {item.label}
        </a>
      ))}
    </nav>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: IconName;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="th-empty">
      <Icon name={icon} size={36} />
      <h3>{title}</h3>
      <p className="th-muted">{description}</p>
      {action}
    </div>
  );
}

export function Toggle({
  label,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & { label: string }) {
  return (
    <label className="th-toggle">
      <input {...props} type="checkbox" role="switch" />
      <span>{label}</span>
    </label>
  );
}

export function Composer({
  value,
  onChange,
  onSend,
  onVoice,
  busy = false,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onVoice?: () => void;
  busy?: boolean;
}) {
  return (
    <form
      className="th-composer"
      onSubmit={(event) => {
        event.preventDefault();
        if (value.trim() && !busy) onSend();
      }}
    >
      <textarea
        aria-label="Ask Thesis"
        placeholder="Ask a question or describe your view…"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <div className="th-row th-between">
        {onVoice ? (
          <IconButton icon="mic" label="Start voice input" variant="ghost" onClick={onVoice} />
        ) : (
          <span className="th-muted">Research assistant</span>
        )}
        <Button type="submit" variant="primary" icon="send" disabled={!value.trim()} loading={busy}>
          Send
        </Button>
      </div>
    </form>
  );
}

export type { IconName };
