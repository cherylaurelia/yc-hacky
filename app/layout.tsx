import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Repo Coworker",
  description: "Talk to your GitHub repo. A voice agent that reads and writes it live.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">
        {children}
        <footer className="py-4 text-center text-xs text-zinc-500">Built at YC x ElevenLabs Hackathon</footer>
      </body>
    </html>
  );
}
