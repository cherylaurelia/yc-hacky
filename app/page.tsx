// Landing page (replaced by the full marketing page in the next commit). The app lives at /app.
import Link from "next/link";

export default function Home() {
  return (
    <main>
      <h1>Terminal 1</h1>
      <Link href="/app">Open the app</Link>
    </main>
  );
}
