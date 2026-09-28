"use client";

import { useState, type ReactNode } from "react";
import { Badge, Button, Card, ErrorNote } from "@/components/ui";
import { api } from "@/lib/api-client";
import type { Product } from "@/lib/types";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <h3 className="mb-3 font-semibold">{title}</h3>
      {children}
    </Card>
  );
}

export function StrategyPanel({ product, onProduct }: { product: Product; onProduct: (p: Product) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const s = product.strategy;

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const { product: updated } = await api<{ product: Product }>(`/api/products/${product.id}/strategy`, {
        method: "POST",
      });
      onProduct(updated);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Go-to-market strategy</h2>
          <p className="text-sm text-muted">
            {product.strategyGeneratedAt
              ? `Generated ${new Date(product.strategyGeneratedAt).toLocaleString()}. Claude uses this to decide where and how to search.`
              : "Claude turns your brief into personas, buying signals and search queries."}
          </p>
        </div>
        <Button variant={s ? "secondary" : "primary"} busy={busy} onClick={generate}>
          {busy ? "Thinking…" : s ? "Regenerate" : "Generate strategy"}
        </Button>
      </Card>
      <ErrorNote message={error} />

      {s && (
        <>
          <Section title="Positioning">
            <p>{s.positioning}</p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
              {s.valueProps.map((v) => (
                <li key={v}>{v}</li>
              ))}
            </ul>
          </Section>

          <Section title="Buyer personas">
            <div className="grid gap-4 md:grid-cols-2">
              {s.personas.map((p) => (
                <div key={p.name} className="rounded-lg bg-surface-2 p-4 text-sm">
                  <p className="font-medium">{p.name}</p>
                  <p className="mt-1 text-muted">{p.description}</p>
                  <p className="mt-3 text-xs font-medium text-muted">Pains</p>
                  <ul className="list-disc pl-5">
                    {p.pains.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                  <p className="mt-3 text-xs font-medium text-muted">Where they hang out</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {p.whereTheyHangOut.map((x) => (
                      <Badge key={x}>{x}</Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Buying signals Claude looks for">
            <div className="flex flex-wrap gap-2">
              {s.buyingSignals.map((x) => (
                <Badge key={x} tone="accent">
                  {x}
                </Badge>
              ))}
            </div>
          </Section>

          <Section title="High-intent search queries">
            <ul className="divide-y divide-border text-sm">
              {s.searchQueries.map((q) => (
                <li key={q.query} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2">
                  <a
                    href={`https://www.google.com/search?q=${encodeURIComponent(q.query)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-xs text-accent hover:underline"
                  >
                    {q.query}
                  </a>
                  <Badge>{q.platform}</Badge>
                  <span className="w-full text-muted">{q.rationale}</span>
                </li>
              ))}
            </ul>
          </Section>

          <div className="grid gap-4 md:grid-cols-2">
            <Section title="Channels">
              <ol className="space-y-3 text-sm">
                {s.channels.map((c, i) => (
                  <li key={c.name}>
                    <p className="font-medium">
                      {i + 1}. {c.name}
                    </p>
                    <p className="text-muted">{c.why}</p>
                    <p className="mt-1">{c.tactic}</p>
                  </li>
                ))}
              </ol>
            </Section>
            <Section title="Objections">
              <dl className="space-y-3 text-sm">
                {s.objections.map((o) => (
                  <div key={o.objection}>
                    <dt className="font-medium">“{o.objection}”</dt>
                    <dd className="text-muted">{o.response}</dd>
                  </div>
                ))}
              </dl>
            </Section>
          </div>
        </>
      )}
    </div>
  );
}
