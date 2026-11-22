import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Repo Coworker",
  description: "Talk to your GitHub repo. A voice agent that reads and writes it live.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
