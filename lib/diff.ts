// A unified diff as rows to draw: kind for the colour, old and new line numbers for the gutters.
export type DiffRow = { kind: "meta" | "hunk" | "add" | "del" | "ctx"; old?: number; new?: number; text: string };

const HUNK = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

export function diffRows(diff: string): DiffRow[] {
  const rows: DiffRow[] = [];
  // Before the first "@@", "--- a/x" and "+++ b/x" are headers. A diff with no hunk header at all
  // is just +/- lines, drawn without numbers.
  let inHunk = !/^@@ /m.test(diff);
  let o: number | undefined;
  let n: number | undefined;
  const bump = (x: number | undefined) => (x === undefined ? undefined : x + 1);
  for (const line of diff.replace(/\r/g, "").replace(/\n+$/, "").split("\n")) {
    const h = HUNK.exec(line);
    if (h) {
      [o, n, inHunk] = [Number(h[1]), Number(h[2]), true];
      rows.push({ kind: "hunk", text: line });
    } else if (line.startsWith("diff --git")) {
      inHunk = false;
      rows.push({ kind: "meta", text: line });
    } else if (!inHunk || line.startsWith("\\")) {
      rows.push({ kind: "meta", text: line });
    } else if (line[0] === "+") {
      rows.push({ kind: "add", new: n, text: line.slice(1) });
      n = bump(n);
    } else if (line[0] === "-") {
      rows.push({ kind: "del", old: o, text: line.slice(1) });
      o = bump(o);
    } else {
      rows.push({ kind: "ctx", old: o, new: n, text: line.slice(1) });
      [o, n] = [bump(o), bump(n)];
    }
  }
  return rows;
}
