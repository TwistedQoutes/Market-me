"use client";

import { useState } from "react";
import type { ProductInput } from "@/lib/types";
import { Button, ErrorNote, Field, inputClass } from "./ui";

const EMPTY: ProductInput = {
  name: "",
  oneLiner: "",
  description: "",
  website: "",
  pricing: "",
  targetCustomers: "",
  differentiators: "",
};

/** Product brief form, used both to create a product and to edit its brief. */
export function ProductForm({
  initial,
  submitLabel,
  onSubmit,
}: {
  initial?: ProductInput;
  submitLabel: string;
  onSubmit: (values: ProductInput) => Promise<void>;
}) {
  const [values, setValues] = useState<ProductInput>(initial ?? EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Wires an input's value and onChange to one field of the form state. */
  const bind = (key: keyof ProductInput) => ({
    value: values[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setValues((v) => ({ ...v, [key]: e.target.value })),
  });

  return (
    <form
      className="space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await onSubmit(values);
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Product name">
          <input required className={inputClass} placeholder="Acme Invoices" {...bind("name")} />
        </Field>
        <Field label="Website" hint="Optional">
          <input className={inputClass} placeholder="https://acme.com" {...bind("website")} />
        </Field>
      </div>
      <Field label="One-liner" hint="What it is, for whom, in one sentence.">
        <input
          required
          className={inputClass}
          placeholder="Invoicing for freelancers that chases late payments for you"
          {...bind("oneLiner")}
        />
      </Field>
      <Field label="Description" hint="What it does, the problem it solves, key features. More detail means better leads.">
        <textarea required rows={6} className={inputClass} {...bind("description")} />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Who you think it's for" hint="Optional. Claude will refine this.">
          <textarea rows={3} className={inputClass} {...bind("targetCustomers")} />
        </Field>
        <Field label="Why it beats the alternatives" hint="Optional. Competitors and differentiators.">
          <textarea rows={3} className={inputClass} {...bind("differentiators")} />
        </Field>
      </div>
      <Field label="Pricing" hint="Optional">
        <input className={inputClass} placeholder="$19/month, 14-day free trial" {...bind("pricing")} />
      </Field>
      <ErrorNote message={error} />
      <Button type="submit" variant="primary" busy={busy}>
        {submitLabel}
      </Button>
    </form>
  );
}
