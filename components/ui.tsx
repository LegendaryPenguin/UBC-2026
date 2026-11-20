import Link from "next/link";
import { Icon, type IconName } from "@/components/thesis";

export function Card({
  children,
  className = "",
  variant,
}: {
  children: React.ReactNode;
  className?: string;
  variant?: "soft" | "hero" | "selected";
}) {
  return (
    <section className={`th-card ${variant ? `th-card--${variant}` : ""} ${className}`}>
      {children}
    </section>
  );
}

export function Button({
  children,
  href,
  onClick,
  disabled,
  kind = "primary",
  type = "button",
  className = "",
  icon,
  loading = false,
}: {
  children: React.ReactNode;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  kind?: "primary" | "secondary" | "danger" | "ghost";
  type?: "button" | "submit";
  className?: string;
  icon?: IconName;
  loading?: boolean;
}) {
  const variant = kind === "primary" ? "primary"
    : kind === "danger" ? "danger"
      : kind === "ghost" ? "ghost"
        : "secondary";
  const shared = `th-button th-button--${variant} ${className}`;
  const content = (
    <>
      {loading ? <Icon name="loading" className="th-spin" /> : icon ? <Icon name={icon} /> : null}
      {children}
    </>
  );
  if (href && !disabled) return <Link className={shared} href={href}>{content}</Link>;
  return (
    <button type={type} className={shared} onClick={onClick} disabled={disabled || loading} aria-busy={loading || undefined}>
      {content}
    </button>
  );
}

export function Banner({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="th-alert">
      <p className="font-medium">{title}</p>
      <div className="mt-1 th-muted">{children}</div>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="th-field">
      <span>{label}</span>
      {children}
      {hint ? <small className="th-muted">{hint}</small> : null}
    </label>
  );
}

export function inputCls(extra = "") {
  return `th-input ${extra}`;
}

export function Empty({ title, children, icon = "research" }: { title: string; children: React.ReactNode; icon?: IconName }) {
  return (
    <Card className="th-empty">
      <Icon name={icon} size={36} />
      <h3 className="font-serif text-xl">{title}</h3>
      <div className="mt-2 text-sm th-muted">{children}</div>
    </Card>
  );
}

export function Badge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: "primary" | "success" | "warning" | "danger";
}) {
  return <span className={`th-badge ${tone ? `th-badge--${tone}` : ""}`}>{children}</span>;
}
