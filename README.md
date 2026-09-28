# Market-me

A marketing application built on Claude that gets your idea in front of the right people. It finds people on the public web who are asking for a product like yours, explains why each one is a fit, and writes the outreach and marketing content for you.

## How it works

1. **Describe your product.** Give it a name, a one-liner, a description, and optionally pricing, target customers and differentiators.
2. **Claude builds a go-to-market strategy.** This covers positioning, buyer personas, where those buyers spend time online, buying-signal phrases, high-intent search queries, channels and objection handling.
3. **Claude finds buyers.** An agent searches the web with Claude's server-side `web_search` and `web_fetch` tools. It looks for real people asking for what you sell: Reddit threads, Ask HN posts, Indie Hackers, X, forums and GitHub issues. It reads promising threads and saves each qualified person with an intent score, a verbatim quote, why they fit and the best angle to approach them. Progress streams live to the UI.
4. **Claude writes the outreach.** Each lead gets a reply, DM or email written for that person and their platform, with a follow-up message and sending tips. In **Autopilot** mode, outreach is drafted automatically for every lead scoring 70 or higher.
5. **Claude writes your marketing.** It generates launch posts (Reddit, Show HN, Product Hunt, Indie Hackers), social posts, a cold email sequence, landing page copy and SEO blog outlines.
6. **You send and track.** Copy the message, open the thread, and move each lead through `new → contacted → replied → won/lost`. Leads export to CSV for any CRM.

### Guardrails against invented leads

Every lead must point at a page Claude actually retrieved. The app records each URL returned by web search, web fetch and citations during a run. The `save_lead` tool rejects any URL that isn't in that set, so the model cannot save a made-up person or link. It is told to go fetch the page instead. Leads are also de-duplicated across runs.

### Responsible outreach, by design

- **Nothing is posted or sent automatically.** Every message is a draft for a human to review and send. Automated posting breaks the terms of service of Reddit, X, LinkedIn and others, gets accounts banned, and is spam.
- Only public posts are used. Claude is told not to look up private contact details or de-anonymise anyone.
- Drafts disclose that you built the product, follow each community's self-promotion norms, and only make claims your brief supports.

## Quick start

Requires Node.js 20.9 or later and an [Anthropic API key](https://platform.claude.com).

```bash
npm install
cp .env.example .env.local   # then set ANTHROPIC_API_KEY
npm run dev                  # http://localhost:3000
```

### Configuration

| Variable | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | required | Your Claude API key |
| `MARKETME_MODEL` | `claude-opus-5` | Model used for every step |
| `MARKETME_DATA_DIR` | `./.data` | Where the JSON datastore lives |
| `MARKETME_PASSWORD` | unset | If set, the whole app requires HTTP Basic auth (user `admin`). **Set this before deploying anywhere public.** Otherwise anyone can spend your API credits. |

## Claude integration

All Claude code lives in `src/lib/claude/`:

| File | What it does |
|---|---|
| `client.ts` | Shared client and request defaults: `claude-opus-5`, adaptive thinking, and [server-side refusal fallbacks](https://platform.claude.com/docs/en/build-with-claude/refusals-and-fallback) (`fallbacks: "default"`). If a request is declined by a safety classifier, it is retried on Anthropic's recommended fallback model instead of failing. |
| `prospector.ts` | The buyer-finding agent. It runs a streaming tool-use loop combining the server tools `web_search_20260209` and `web_fetch_20260209` with a client-side `save_lead` tool. It handles `pause_turn`, validates tool input, verifies URLs, and prompt-caches the growing conversation. Runs are capped at 20 model turns and the lead target you set (max 25). |
| `structured.ts` | Streaming [structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) validated against Zod schemas. |
| `strategy.ts`, `outreach.ts`, `content.ts` | The strategy, outreach and content generators. |
| `prompts.ts` | All system prompts and prompt builders. |

**Cost note:** a prospecting run makes many web searches and reads several pages, so it is the most expensive action in the app. Start with a small lead target and watch usage in the Claude Console.

**Run length:** the prospecting route sets `maxDuration = 300` seconds for serverless hosts. Leads are saved as they are found, so a run cut off at the limit keeps what it found. On a long-running server (`npm start`) there is no limit, and on hosts that allow longer functions you can raise it in `src/app/api/products/[id]/prospect/route.ts`.

## Project layout

```
src/
  app/                    Next.js App Router pages + API routes
    api/products/...      REST API (see below)
    products/[id]/        Product workspace: Buyers, Strategy, Content, Brief tabs
  components/             Shared UI
  lib/
    claude/               Everything that talks to Claude
    store.ts              JSON-file datastore (swap for Postgres later)
    types.ts              Zod schemas and types shared by client and server
    urls.ts               URL normalisation and retrieved-URL verification
  proxy.ts                Optional password gate
tests/                    Vitest unit tests (Claude is mocked; no API calls)
```

### API

| Method & path | Description |
|---|---|
| `GET/POST /api/products` | List or create products |
| `GET/PATCH/DELETE /api/products/:id` | Product with its leads and content |
| `POST /api/products/:id/strategy` | Generate the go-to-market strategy |
| `POST /api/products/:id/prospect` | Run the buyer-finding agent. Body `{ targetLeads?: 1-25, autoDraft?: boolean }`. Responds with a server-sent event stream (`search`, `fetch`, `lead`, `outreach`, `note`, `done`, `error`, …). Closing the connection stops the run. |
| `PATCH/DELETE /api/products/:id/leads/:leadId` | Update a lead's status or notes, or delete it |
| `POST /api/products/:id/leads/:leadId/outreach` | Draft or redraft outreach for a lead |
| `GET /api/products/:id/leads/export` | Download leads as CSV |
| `POST /api/products/:id/content` | Generate a content pack. Body `{ kind, instructions? }` |
| `DELETE /api/products/:id/content/:assetId` | Delete a content asset |

## Development

```bash
npm run typecheck
npm test
npm run build
```

GitHub Actions (`.github/workflows/ci.yml`) runs the same three steps on every pull request and on pushes to `main`.

## Roadmap to a multi-tenant SaaS

This version is a single-workspace app you can run for yourself or your team. The code is structured so these next steps don't require rewrites:

- **Accounts and teams:** add auth (e.g. Auth.js or Clerk) and scope `store.ts` queries by workspace.
- **Database:** reimplement `store.ts` on Postgres (e.g. Drizzle or Prisma). Everything else goes through that module.
- **Billing:** add Stripe subscriptions with a monthly prospecting-run allowance per plan.
- **Always-on prospecting:** a scheduled job that re-runs searches daily and alerts you to new high-intent leads by email or Slack.
- **Sending integrations:** send approved email outreach from the user's own Gmail or Outlook, and sync leads to HubSpot or Pipedrive.
