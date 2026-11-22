import Coworker from "@/components/Coworker";

type Param = string | string[] | undefined;
const one = (v: Param) => (typeof v === "string" ? v : "");

// ?repo=owner/name  ?board=<issue number>  ?embed=1 (compact layout for the Mac app's panel)
export default async function Home({ searchParams }: { searchParams: Promise<{ repo?: Param; board?: Param; embed?: Param }> }) {
  const q = await searchParams;
  const board = Number(one(q.board));
  return <Coworker initialRepo={one(q.repo)} board={Number.isInteger(board) && board > 0 ? board : undefined} embed={one(q.embed) === "1"} />;
}
