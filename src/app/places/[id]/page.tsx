import { SavedPlaceDetailPage } from "@/widgets/place-detail";

export default async function PlacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return <SavedPlaceDetailPage placeId={id} />;
}
