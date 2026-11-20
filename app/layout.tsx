import type { Metadata } from "next";
import "@/styles/thesis.css";
import "./globals.css";
import "@/styles/demo-polish.css";
import { Providers } from "@/components/Providers";
import { Shell } from "@/components/Shell";

export const metadata: Metadata = {
  title: "Thesis",
  description: "Research a view. Inspect the payoff. Accept only a funded quote.",
  icons: {
    icon: "/thesis/brand/favicon.svg",
  },
};

export default function RootLayout({ children, modal }: { children: React.ReactNode; modal: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="th-app antialiased">
        <Providers>
          <Shell>{children}{modal}</Shell>
        </Providers>
      </body>
    </html>
  );
}
