import Link from "next/link";
import { listLeads, listProducts } from "@/lib/store";

export const dynamic = "force-dynamic";

const STEPS = [
  ["Describe your product", "Tell Market-me what you sell and who you think it's for."],
  ["Claude builds the plan", "Positioning, buyer personas, buying signals and high-intent search queries."],
  ["Claude finds buyers", "It searches Reddit, Hacker News, X, forums and more for real people asking for what you sell."],
  ["You reach out", "Personalised replies, DMs and a content pack, ready to review and send."],
];

export default async function Dashboard() {
  const products = await listProducts();
  const stats = await Promise.all(
    products.map(async (p) => {
      const leads = await listLeads(p.id);
      return {
        total: leads.length,
        hot: leads.filter((l) => l.intent === "high" && l.status === "new").length,
        contacted: leads.filter((l) => l.status !== "new" && l.status !== "dismissed").length,
      };
    }),
  );

  if (products.length === 0) {
    return (
      <div className="mx-auto max-w-3xl py-10 text-center">
        <h1 className="text-4xl font-semibold tracking-tight">Find the people who want to buy what you&apos;re building.</h1>
        <p className="mt-4 text-lg text-muted">
          Market-me is a marketing team built on Claude. It searches the web for people publicly asking for a product
          like yours, tells you why each one is a fit, and writes the outreach for you.
        </p>
        <Link
          href="/products/new"
          className="mt-8 inline-block rounded-lg bg-accent px-5 py-2.5 font-medium text-accent-fg hover:opacity-90"
        >
          Add your first product
        </Link>
        <ol className="mt-14 grid gap-4 text-left sm:grid-cols-2">
          {STEPS.map(([title, body], i) => (
            <li key={title} className="rounded-xl border border-border bg-surface p-5">
              <span className="text-sm font-medium text-accent">Step {i + 1}</span>
              <h2 className="mt-1 font-semibold">{title}</h2>
              <p className="mt-1 text-sm text-muted">{body}</p>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Your products</h1>
        <p className="text-sm text-muted">Open a product to find buyers, draft outreach and generate content.</p>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((p, i) => (
          <li key={p.id}>
            <Link
              href={`/products/${p.id}`}
              className="block h-full rounded-xl border border-border bg-surface p-5 transition hover:border-accent"
            >
              <h2 className="font-semibold">{p.name}</h2>
              <p className="mt-1 line-clamp-2 text-sm text-muted">{p.oneLiner}</p>
              <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                {[
                  ["Leads", stats[i].total],
                  ["Hot & new", stats[i].hot],
                  ["In progress", stats[i].contacted],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg bg-surface-2 px-2 py-2">
                    <dt className="text-xs text-muted">{label}</dt>
                    <dd className="text-lg font-semibold">{value}</dd>
                  </div>
                ))}
              </dl>
              {!p.strategy && <p className="mt-3 text-xs text-muted">No strategy yet</p>}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
