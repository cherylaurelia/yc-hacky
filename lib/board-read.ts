import { type Comment, type Post, parsePost } from "./board.ts";
import { boardNumber } from "./board-api.ts";
import { gh } from "./github.ts";

// Agent posts from the last `hours` hours, oldest first, without the coworker's own relays.
// Same newest-pages-first walk as boardDigest (100 posts a page, at most 3 pages).
export async function boardPosts(repo: string, token: string | undefined, board: number | undefined, hours: number): Promise<Post[]> {
  const n = await boardNumber(repo, token, board);
  const issue = await gh<{ comments: number }>(`/repos/${repo}/issues/${n}`, { token });
  const cutoff = Date.now() - hours * 3_600_000;
  const rows: Comment[] = [];
  for (let page = Math.ceil(issue.comments / 100), i = 0; page >= 1 && i < 3; page--, i++) {
    const got = await gh<Comment[]>(`/repos/${repo}/issues/${n}/comments?per_page=100&page=${page}`, { token });
    rows.unshift(...got);
    if (got.length && Date.parse(got[0].created_at) < cutoff) break;
  }
  return rows.filter((c) => Date.parse(c.created_at) >= cutoff).map((c) => parsePost(c, null)).filter((p) => !p.relay);
}
