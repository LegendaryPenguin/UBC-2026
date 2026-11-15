import Link from "next/link";

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-card border border-line bg-surface p-5 shadow-sm ${className}`}>{children}</section>;
}

export function Button({
  children,
  href,
  onClick,
  disabled,
  kind = "primary",
  type = "button",
}: {
  children: React.ReactNode;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  kind?: "primary" | "secondary" | "danger" | "ghost";
  type?: "button" | "submit";
}) {
  const cls = {
    primary: "bg-action text-white",
    secondary: "bg-ink text-white",
    danger: "bg-bad text-white",
    ghost: "bg-transparent text-ink border border-line",
  }[kind];
  const shared = `inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-medium disabled:opacity-50 ${cls}`;
  if (href && !disabled) return <Link className={shared} href={href}>{children}</Link>;
  return (
    <button type={type} className={shared} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

export function Banner({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-[#EEF1F4] px-4 py-3 text-sm">
      <p className="font-medium">{title}</p>
      <div className="mt-1 text-muted">{children}</div>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export function inputCls(extra = "") {
  return `min-h-11 w-full rounded-lg border border-line bg-white px-3 text-sm ${extra}`;
}

export function Empty({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <h2 className="font-serif text-xl">{title}</h2>
      <div className="mt-2 text-sm text-muted">{children}</div>
    </Card>
  );
}
