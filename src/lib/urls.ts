/**
 * URL helpers used to (1) de-duplicate leads and (2) make sure every lead
 * Claude saves points at a page it actually retrieved from the web, rather
 * than a URL it made up.
 */

const TRACKING_PARAM = /^(utm_\w+|ref|ref_src|ref_url|fbclid|gclid|mc_cid|mc_eid|share_id|si)$/i;
// Mirror hosts that serve the same content as the canonical one.
const HOST_PREFIX = /^(www|old|new|m|mobile|np)\./;

export function normalizeUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return raw.trim().toLowerCase();
  }
  const host = url.hostname.toLowerCase().replace(HOST_PREFIX, "");
  const pathname = url.pathname.replace(/\/+$/, "") || "";
  const params = [...url.searchParams.entries()]
    .filter(([key]) => !TRACKING_PARAM.test(key))
    .sort(([a], [b]) => a.localeCompare(b));
  const query = params.length ? `?${new URLSearchParams(params).toString()}` : "";
  return `${host}${pathname}${query}`;
}

/**
 * True if `candidate` is the same page as one of `known`, allowing for the
 * common case where one URL is a path-prefix of the other (e.g. a Reddit
 * permalink with or without its trailing title slug).
 */
export function isKnownUrl(candidate: string, known: Iterable<string>): boolean {
  const c = normalizeUrl(candidate);
  for (const k of known) {
    const n = normalizeUrl(k);
    if (n === c) return true;
    const [shorter, longer] = n.length < c.length ? [n, c] : [c, n];
    // Require some depth so "reddit.com" can't match every Reddit URL.
    const depth = shorter.split("?")[0].split("/").length - 1;
    if (depth >= 2 && longer.startsWith(shorter) && /^[/?]/.test(longer.slice(shorter.length))) return true;
  }
  return false;
}

const URL_PATTERN = /https?:\/\/[^\s"'<>()[\]{}\\^`|]+/g;
// Opaque blobs that can be large and never contain useful URLs.
const SKIP_KEYS = new Set(["encrypted_content", "encrypted_index", "signature", "data", "encrypted_stdout"]);

/** Collect every URL found anywhere inside a (JSON-like) value. */
export function collectUrls(value: unknown, into: Set<string> = new Set()): Set<string> {
  if (typeof value === "string") {
    for (const match of value.matchAll(URL_PATTERN)) into.add(match[0].replace(/[.,;:!?]+$/, ""));
  } else if (Array.isArray(value)) {
    for (const item of value) collectUrls(item, into);
  } else if (value && typeof value === "object") {
    for (const [key, v] of Object.entries(value)) if (!SKIP_KEYS.has(key)) collectUrls(v, into);
  }
  return into;
}

type BlockLike = { type: string };

/**
 * URLs that came back from the web during a turn: web search / web fetch
 * results, code-execution output, and citations. Claude's own prose and tool
 * inputs are excluded: those are what we're verifying, not evidence.
 */
export function collectRetrievedUrls(blocks: readonly BlockLike[], into: Set<string> = new Set()): Set<string> {
  for (const block of blocks) {
    switch (block.type) {
      case "text":
        collectUrls((block as { citations?: unknown }).citations, into);
        break;
      case "tool_use":
      case "server_tool_use":
      case "thinking":
      case "redacted_thinking":
        break;
      default:
        collectUrls(block, into);
    }
  }
  return into;
}
