"use client";

import { useRouter } from "next/navigation";
import { ProductForm } from "@/components/ProductForm";
import { Card } from "@/components/ui";
import { api } from "@/lib/api-client";
import type { Product } from "@/lib/types";

export default function NewProductPage() {
  const router = useRouter();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tell Claude what you&apos;re selling</h1>
        <p className="text-sm text-muted">
          This brief is the only thing Claude knows about your product, so be specific about the problem you solve.
        </p>
      </div>
      <Card>
        <ProductForm
          submitLabel="Create product"
          onSubmit={async (values) => {
            const { product } = await api<{ product: Product }>("/api/products", { json: values });
            router.push(`/products/${product.id}`);
          }}
        />
      </Card>
    </div>
  );
}
