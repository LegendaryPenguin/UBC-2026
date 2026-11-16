import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Shell } from "@/components/Shell";

export const metadata: Metadata = {
  title: "Thesis",
  description: "Research a view. Inspect the payoff. Accept only a funded quote.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans">
        <Providers>
          <Shell>{children}</Shell>
        </Providers>
      </body>
    </html>
  );
}
