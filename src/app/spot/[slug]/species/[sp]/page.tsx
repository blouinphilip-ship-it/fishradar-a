import { ComingSoon } from "@/components/coming-soon";

type Props = { params: Promise<{ slug: string; sp: string }> };

export default async function Page({ params }: Props) {
  const p = await params;
  return (
    <ComingSoon title={`Species at spot`} phase={5}>
      <p>Requested: <code>{JSON.stringify(p)}</code></p>
    </ComingSoon>
  );
}
