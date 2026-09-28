"use client";

import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Badge, Button, Card, CopyButton, ErrorNote, inputBase, Spinner } from "@/components/ui";
import { api, streamEvents } from "@/lib/api-client";
import { LEAD_STATUSES, type Lead, type LeadStatus, type Product, type ProspectEvent } from "@/lib/types";

type LogItem = { id: number; kind: string; text: string; href?: string };

const INTENT_TONE = { high: "green", medium: "amber", low: "gray" } as const;
const STATUS_LABEL: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  replied: "Replied",
  won: "Won",
  lost: "Lost",
  dismissed: "Dismissed",
};

/** Sort comparator: highest intent score first. */
const byScore = (a: Lead, b: Lead) => b.intentScore - a.intentScore;

/** Only link to http(s) URLs; lead URLs originate from the open web. */
function safeHref(url: string): string | undefined {
  return /^https?:\/\//i.test(url) ? url : undefined;
}

/** Buyers tab: run the prospecting agent, watch its activity, and work through the leads. */
export function LeadsPanel({
  product,
  leads,
  setLeads,
  onRunFinished,
}: {
  product: Product;
  leads: Lead[];
  setLeads: Dispatch<SetStateAction<Lead[]>>;
  onRunFinished: () => Promise<void>;
}) {
  const [target, setTarget] = useState(10);
  const [autoDraft, setAutoDraft] = useState(true);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<LogItem[]>([]);
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"active" | LeadStatus>("active");
  const abortRef = useRef<AbortController | null>(null);
  const logId = useRef(0);

  /** Appends an activity-log line, keeping the most recent 200. */
  const addLog = (kind: string, text: string, href?: string) =>
    setLog((prev) => [...prev, { id: logId.current++, kind, text, href }].slice(-200));

  /** Applies one streamed prospecting event to the lead list and activity log. */
  const onEvent = (event: ProspectEvent) => {
    switch (event.type) {
      case "status":
        return addLog("Status", event.message);
      case "search":
        return addLog("Search", event.query);
      case "fetch":
        return addLog("Read", event.url, event.url);
      case "note":
        return addLog("Claude", event.text);
      case "lead":
        setLeads((prev) => [event.lead, ...prev].sort(byScore));
        return addLog("Lead", `${event.lead.title} (${event.lead.intentScore})`, event.lead.sourceUrl);
      case "rejected":
        return addLog("Skipped", `${event.url}: ${event.reason}`);
      case "outreach":
        setLeads((prev) => prev.map((l) => (l.id === event.leadId ? { ...l, outreach: event.outreach } : l)));
        return addLog("Draft", "Outreach drafted");
      case "done":
        setSummary(event.summary);
        return addLog("Done", `${event.leadsFound} new lead(s) from ${event.searches} searches`);
      case "error":
        setError(event.message);
        return addLog("Error", event.message);
    }
  };

  /** Starts a prospecting run and streams its events until it finishes, is stopped or fails. */
  const run = async () => {
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setError(null);
    setSummary(null);
    setLog([]);
    try {
      await streamEvents(`/api/products/${product.id}/prospect`, { targetLeads: target, autoDraft }, onEvent, controller.signal);
    } catch (err) {
      if (!controller.signal.aborted) setError((err as Error).message);
    } finally {
      setRunning(false);
      abortRef.current = null;
      await onRunFinished().catch(() => undefined);
    }
  };

  const visible = leads.filter((l) => (filter === "active" ? l.status !== "dismissed" : l.status === filter));
  /** Swaps an updated lead into the list in place. */
  const replace = (lead: Lead) => setLeads((prev) => prev.map((l) => (l.id === lead.id ? lead : l)));

  return (
    <div className="space-y-6">
      <Card className="space-y-4">
        <div>
          <h2 className="font-semibold">Find buyers</h2>
          <p className="text-sm text-muted">
            Claude searches the public web for people asking for something like {product.name}, checks each thread,
            and saves the ones who look ready to buy. It only saves posts it actually found.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 whitespace-nowrap text-sm">
            Find up to
            <input
              type="number"
              min={1}
              max={25}
              value={target}
              onChange={(e) => setTarget(Math.min(25, Math.max(1, Number(e.target.value) || 1)))}
              className={`${inputBase} w-20`}
              disabled={running}
            />
            leads
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={autoDraft} onChange={(e) => setAutoDraft(e.target.checked)} disabled={running} />
            Autopilot: also draft outreach for hot leads
          </label>
          <div className="ml-auto flex gap-2">
            {running && (
              <Button variant="secondary" onClick={() => abortRef.current?.abort()}>
                Stop
              </Button>
            )}
            <Button variant="primary" busy={running} onClick={run}>
              {running ? "Searching…" : leads.length ? "Find more buyers" : "Find buyers"}
            </Button>
          </div>
        </div>
        {!product.strategy && !autoDraft && (
          <p className="text-xs text-muted">
            Tip: generate a strategy first (Strategy tab) so Claude knows the best places to look. Autopilot does this
            for you.
          </p>
        )}
        <ErrorNote message={error} />
        {summary && !running && (
          <p className="rounded-lg bg-accent-soft px-3 py-2 text-sm">
            <span className="font-medium">Claude&apos;s take: </span>
            {summary}
          </p>
        )}
        {log.length > 0 && (
          <details open={running} className="rounded-lg border border-border bg-bg">
            <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm font-medium">
              {running && <Spinner />} Activity ({log.length})
            </summary>
            <ol className="max-h-72 space-y-1 overflow-y-auto px-3 pb-3 text-xs">
              {log.map((item) => (
                <li key={item.id} className="flex gap-2">
                  <span className="w-14 shrink-0 font-medium text-muted">{item.kind}</span>
                  {item.href && safeHref(item.href) ? (
                    <a href={safeHref(item.href)} target="_blank" rel="noopener noreferrer" className="break-all hover:underline">
                      {item.text}
                    </a>
                  ) : (
                    <span className="whitespace-pre-wrap break-words">{item.text}</span>
                  )}
                </li>
              ))}
            </ol>
          </details>
        )}
      </Card>

      {leads.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as typeof filter)}
            className={inputBase}
            aria-label="Filter leads"
          >
            <option value="active">All active</option>
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <span className="text-sm text-muted">{visible.length} shown</span>
          <a href={`/api/products/${product.id}/leads/export`} className="ml-auto text-sm text-accent hover:underline">
            Export CSV
          </a>
        </div>
      )}

      <ul className="space-y-4">
        {visible.map((lead) => (
          <li key={lead.id}>
            <LeadCard productId={product.id} lead={lead} onChange={replace} />
          </li>
        ))}
      </ul>
      {leads.length > 0 && visible.length === 0 && <p className="text-sm text-muted">No leads with this status.</p>}
    </div>
  );
}

/** One lead: who they are, what they said, and the outreach drafted for them. */
function LeadCard({ productId, lead, onChange }: { productId: string; lead: Lead; onChange: (lead: Lead) => void }) {
  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const base = `/api/products/${productId}/leads/${lead.id}`;
  const href = safeHref(lead.sourceUrl);

  /** Changes the lead's status right away, reverting it if the save fails. */
  const setStatus = async (status: LeadStatus) => {
    onChange({ ...lead, status });
    try {
      const { lead: saved } = await api<{ lead: Lead }>(base, { method: "PATCH", json: { status } });
      onChange(saved);
    } catch (err) {
      onChange(lead);
      setError((err as Error).message);
    }
  };

  /** Asks Claude to draft (or rewrite) outreach for this lead. */
  const draft = async () => {
    setDrafting(true);
    setError(null);
    try {
      const { lead: saved } = await api<{ lead: Lead }>(`${base}/outreach`, { method: "POST" });
      onChange(saved);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDrafting(false);
    }
  };

  return (
    <Card className={lead.status === "dismissed" ? "opacity-60" : ""}>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge tone={INTENT_TONE[lead.intent]}>
          {lead.intent} intent · {lead.intentScore}
        </Badge>
        <Badge>{lead.platform}</Badge>
        {lead.postedAt && <span className="text-muted">{lead.postedAt}</span>}
        <select
          value={lead.status}
          onChange={(e) => setStatus(e.target.value as LeadStatus)}
          className="ml-auto rounded-md border border-border bg-bg px-2 py-1 text-xs"
          aria-label="Lead status"
        >
          {LEAD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </div>

      <h3 className="mt-3 font-semibold">
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className="hover:underline">
            {lead.title}
          </a>
        ) : (
          lead.title
        )}
      </h3>
      {lead.author && <p className="text-sm text-muted">by {lead.author}</p>}
      <blockquote className="mt-3 border-l-2 border-accent pl-3 text-sm italic">“{lead.excerpt}”</blockquote>
      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs font-medium text-muted">Why they fit</dt>
          <dd>{lead.whyFit}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted">Best angle</dt>
          <dd>{lead.suggestedAngle}</dd>
        </div>
      </dl>

      <div className="mt-4 border-t border-border pt-4">
        {lead.outreach ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="accent">{lead.outreach.channel}</Badge>
              <div className="ml-auto flex flex-wrap gap-2">
                <CopyButton text={lead.outreach.message} label="Copy message" />
                {href && (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center rounded-lg border border-border px-2.5 py-1 text-xs font-medium hover:bg-surface-2"
                  >
                    Open thread
                  </a>
                )}
                {lead.status === "new" && (
                  <Button className="px-2.5 py-1 text-xs" onClick={() => setStatus("contacted")}>
                    Mark contacted
                  </Button>
                )}
                <Button variant="ghost" className="px-2.5 py-1 text-xs" busy={drafting} onClick={draft}>
                  Rewrite
                </Button>
              </div>
            </div>
            {lead.outreach.subject && (
              <p className="text-sm">
                <span className="text-muted">Subject: </span>
                {lead.outreach.subject}
              </p>
            )}
            <p className="whitespace-pre-wrap rounded-lg bg-surface-2 p-3 text-sm">{lead.outreach.message}</p>
            <details className="text-sm">
              <summary className="cursor-pointer text-muted">Follow-up and sending tips</summary>
              <div className="mt-2 space-y-2">
                <div className="flex items-start gap-2">
                  <p className="flex-1 whitespace-pre-wrap rounded-lg bg-surface-2 p-3">{lead.outreach.followUp}</p>
                  <CopyButton text={lead.outreach.followUp} />
                </div>
                <ul className="list-disc space-y-1 pl-5 text-muted">
                  {lead.outreach.tips.map((tip) => (
                    <li key={tip}>{tip}</li>
                  ))}
                </ul>
              </div>
            </details>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Button variant="primary" busy={drafting} onClick={draft}>
              Draft outreach
            </Button>
            {lead.status !== "dismissed" && (
              <Button variant="ghost" onClick={() => setStatus("dismissed")}>
                Not a fit
              </Button>
            )}
          </div>
        )}
        <div className="mt-2">
          <ErrorNote message={error} />
        </div>
      </div>
    </Card>
  );
}
