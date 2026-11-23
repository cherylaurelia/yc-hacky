// A cookie-authenticated write must come from our own page, not another site or local port.
// No Origin is only safe when there is no cookie to ride on; otherwise trust the browser's Sec-Fetch-Site.
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return !req.headers.get("cookie") || req.headers.get("sec-fetch-site") === "same-origin";
  try {
    return new URL(origin).host === req.headers.get("host");
  } catch {
    return false;
  }
}
