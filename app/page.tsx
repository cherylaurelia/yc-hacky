import Coworker from "@/components/Coworker";

export default async function Home({ searchParams }: { searchParams: Promise<{ repo?: string | string[] }> }) {
  const { repo } = await searchParams;
  return <Coworker initialRepo={typeof repo === "string" ? repo : ""} />;
}
