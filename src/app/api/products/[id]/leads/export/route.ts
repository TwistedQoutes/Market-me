import { notFound } from "@/lib/http";
import { getProduct, listLeads } from "@/lib/store";
import { leadsToCsv } from "@/lib/csv";

type Ctx = { params: Promise<{ id: string }> };

/** CSV export so leads can be imported into any CRM or spreadsheet. */
export async function GET(_request: Request, { params }: Ctx) {
  const { id } = await params;
  const product = await getProduct(id);
  if (!product) return notFound("Product not found");
  const slug = product.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "product";
  return new Response(leadsToCsv(await listLeads(id)), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug}-leads.csv"`,
    },
  });
}
