"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ProductForm } from "@/components/ProductForm";
import { Button, Card } from "@/components/ui";
import { api } from "@/lib/api-client";
import type { ContentAsset, Lead, Product } from "@/lib/types";
import { ContentPanel } from "./ContentPanel";
import { LeadsPanel } from "./LeadsPanel";
import { StrategyPanel } from "./StrategyPanel";

const TABS = [
  ["leads", "Buyers"],
  ["strategy", "Strategy"],
  ["content", "Content"],
  ["brief", "Brief"],
] as const;
type Tab = (typeof TABS)[number][0];

export type ProductData = { product: Product; leads: Lead[]; assets: ContentAsset[] };

export function Workspace({
  initialProduct,
  initialLeads,
  initialAssets,
}: {
  initialProduct: Product;
  initialLeads: Lead[];
  initialAssets: ContentAsset[];
}) {
  const router = useRouter();
  const [product, setProduct] = useState(initialProduct);
  const [leads, setLeads] = useState(initialLeads);
  const [assets, setAssets] = useState(initialAssets);
  const [tab, setTab] = useState<Tab>("leads");

  const refresh = async () => {
    const data = await api<ProductData>(`/api/products/${product.id}`);
    setProduct(data.product);
    setLeads(data.leads);
    setAssets(data.assets);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{product.name}</h1>
          <p className="text-muted">{product.oneLiner}</p>
        </div>
        <Button
          variant="danger"
          onClick={async () => {
            if (!confirm(`Delete ${product.name} and all its leads and content?`)) return;
            await api(`/api/products/${product.id}`, { method: "DELETE" });
            router.push("/");
            router.refresh();
          }}
        >
          Delete product
        </Button>
      </div>

      <nav className="flex gap-1 border-b border-border" aria-label="Sections">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            aria-current={tab === key ? "page" : undefined}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition ${
              tab === key ? "border-accent text-text" : "border-transparent text-muted hover:text-text"
            }`}
          >
            {label}
            {key === "leads" && leads.length > 0 && <span className="ml-1.5 text-xs text-muted">{leads.length}</span>}
          </button>
        ))}
      </nav>

      {tab === "leads" && <LeadsPanel product={product} leads={leads} setLeads={setLeads} onRunFinished={refresh} />}
      {tab === "strategy" && <StrategyPanel product={product} onProduct={setProduct} />}
      {tab === "content" && <ContentPanel product={product} assets={assets} setAssets={setAssets} />}
      {tab === "brief" && (
        <Card>
          <ProductForm
            initial={product}
            submitLabel="Save brief"
            onSubmit={async (values) => {
              const { product: updated } = await api<{ product: Product }>(`/api/products/${product.id}`, {
                method: "PATCH",
                json: values,
              });
              setProduct(updated);
              setTab("leads");
            }}
          />
          <p className="mt-4 text-xs text-muted">
            After a big change to the brief, regenerate the strategy so Claude searches with the new positioning.
          </p>
        </Card>
      )}
    </div>
  );
}
