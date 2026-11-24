import { readFile } from "node:fs/promises";
import { join } from "node:path";

// GET /api/version -> public/releases.json (written by scripts/release.sh): { latest, url, sha256, minimumSystemVersion, notes }.
// { latest: null } until a release is published. The Mac app asks on launch and every 24 h; the website reads it for the download link.
const CACHE = "public, max-age=60, s-maxage=300";

export async function GET() {
  try {
    const releases: unknown = JSON.parse(await readFile(join(process.cwd(), "public", "releases.json"), "utf8"));
    if (releases && typeof releases === "object" && !Array.isArray(releases)) return Response.json(releases, { headers: { "Cache-Control": CACHE } });
    console.error("version: public/releases.json is not an object");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") console.error(`version: could not read public/releases.json: ${e}`);
  }
  return Response.json({ latest: null }, { headers: { "Cache-Control": CACHE } });
}
