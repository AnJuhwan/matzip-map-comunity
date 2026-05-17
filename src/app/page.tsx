import { MatzipCommunityApp } from "@/widgets/matzip-community";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function Home({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const resolvedSearchParams = await searchParams;
  const search = resolvedSearchParams.search;
  const initialSearchQuery = Array.isArray(search) ? (search[0] ?? "") : (search ?? "");

  return <MatzipCommunityApp initialSearchQuery={initialSearchQuery} />;
}
