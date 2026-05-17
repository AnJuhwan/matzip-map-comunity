import { parseCandidateSearchParams } from "@/features/naver-place-import";
import { CandidatePlaceDetailPage } from "@/widgets/place-detail";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function NewPlacePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const resolvedSearchParams = await searchParams;
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(resolvedSearchParams)) {
    if (Array.isArray(value)) {
      if (value[0]) {
        params.set(key, value[0]);
      }
    } else if (value) {
      params.set(key, value);
    }
  }

  return <CandidatePlaceDetailPage candidate={parseCandidateSearchParams(params)} />;
}
