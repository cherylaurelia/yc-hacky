import type { Metadata } from "next";
import { EB_Garamond, Figtree, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// One type system for the whole product, site and app: EB Garamond for headings (with italic for the
// emphasized phrase), Figtree for everything people read and click, JetBrains Mono only for commands.
const garamond = EB_Garamond({ subsets: ["latin"], style: ["normal", "italic"], variable: "--font-serif" });
const figtree = Figtree({ subsets: ["latin"], variable: "--font-figtree" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains" });

export const metadata: Metadata = {
  title: "Terminal 1",
  description: "Talk to your GitHub repo. A voice agent that reads and writes it live.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${garamond.variable} ${figtree.variable} ${jetbrains.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
