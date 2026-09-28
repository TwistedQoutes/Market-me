import { notFound } from "next/navigation";
import { getProduct, listAssets, listLeads } from "@/lib/store";
import { Workspace } from "./Workspace";

export const dynamic = "force-dynamic";

/** Loads a product with its leads and assets on the server, then renders the client workspace. */
export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = await getProduct(id);
  if (!product) notFound();
  const [leads, assets] = await Promise.all([listLeads(id), listAssets(id)]);
  return <Workspace initialProduct={product} initialLeads={leads} initialAssets={assets} />;
}
