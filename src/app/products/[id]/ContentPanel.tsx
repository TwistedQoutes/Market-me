"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { Badge, Button, Card, CopyButton, ErrorNote, Field, inputClass } from "@/components/ui";
import { api } from "@/lib/api-client";
import { CONTENT_KINDS, type ContentAsset, type ContentKind, type Product } from "@/lib/types";

export function ContentPanel({
  product,
  assets,
  setAssets,
}: {
  product: Product;
  assets: ContentAsset[];
  setAssets: Dispatch<SetStateAction<ContentAsset[]>>;
}) {
  const [kind, setKind] = useState<ContentKind>("launch_posts");
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const { assets: created } = await api<{ assets: ContentAsset[] }>(`/api/products/${product.id}/content`, {
        json: { kind, instructions },
      });
      setAssets((prev) => [...created, ...prev]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (asset: ContentAsset) => {
    setAssets((prev) => prev.filter((a) => a.id !== asset.id));
    try {
      await api(`/api/products/${product.id}/content/${asset.id}`, { method: "DELETE" });
    } catch (err) {
      setAssets((prev) => [asset, ...prev]);
      setError((err as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="space-y-4">
        <div>
          <h2 className="font-semibold">Generate marketing content</h2>
          <p className="text-sm text-muted">
            Ready-to-publish copy written from your brief{product.strategy ? " and strategy" : ""}. Nothing is posted for
            you, so review everything before it goes out.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <Field label="What to write">
            <select value={kind} onChange={(e) => setKind(e.target.value as ContentKind)} className={inputClass}>
              {Object.entries(CONTENT_KINDS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Extra instructions" hint="Optional: tone, offer, launch date, a subreddit to target…">
            <input value={instructions} onChange={(e) => setInstructions(e.target.value)} className={inputClass} />
          </Field>
        </div>
        <ErrorNote message={error} />
        <Button variant="primary" busy={busy} onClick={generate}>
          {busy ? "Writing…" : "Generate"}
        </Button>
      </Card>

      <ul className="space-y-4">
        {assets.map((asset) => (
          <li key={asset.id}>
            <Card>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold">{asset.title}</h3>
                <Badge tone="accent">{asset.channel}</Badge>
                <div className="ml-auto flex gap-2">
                  <CopyButton text={asset.body} />
                  <Button variant="ghost" className="px-2.5 py-1 text-xs" onClick={() => remove(asset)}>
                    Delete
                  </Button>
                </div>
              </div>
              <p className="mt-3 whitespace-pre-wrap rounded-lg bg-surface-2 p-3 text-sm">{asset.body}</p>
              {asset.notes && <p className="mt-2 text-xs text-muted">{asset.notes}</p>}
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
