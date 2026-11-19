"use client";

import { useRouter } from "next/navigation";
import AuthPage from "../../auth/page";

export default function AuthDialogRoute() {
  const router = useRouter();
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) router.back(); }}>
      <section className="dialog-panel" role="dialog" aria-modal="true" aria-label="Save your thinking">
        <div className="flex justify-end"><button type="button" aria-label="Close sign in" className="min-h-10 px-3 text-2xl text-muted" onClick={() => router.back()}>×</button></div>
        <AuthPage />
      </section>
    </div>
  );
}
