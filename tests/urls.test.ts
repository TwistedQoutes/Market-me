import { describe, expect, it } from "vitest";
import { collectRetrievedUrls, isKnownUrl, normalizeUrl } from "@/lib/urls";

describe("normalizeUrl", () => {
  it("ignores mirror hosts, trailing slashes, fragments and tracking params", () => {
    expect(normalizeUrl("https://old.reddit.com/r/SaaS/comments/abc/x/?utm_source=a#c")).toBe(
      "reddit.com/r/SaaS/comments/abc/x",
    );
    expect(normalizeUrl("https://www.reddit.com/r/SaaS/comments/abc/x")).toBe("reddit.com/r/SaaS/comments/abc/x");
  });

  it("keeps meaningful query params", () => {
    expect(normalizeUrl("https://news.ycombinator.com/item?id=123&utm_medium=x")).toBe(
      "news.ycombinator.com/item?id=123",
    );
    expect(normalizeUrl("https://forum.example.com/viewtopic.php?t=9")).not.toBe(
      normalizeUrl("https://forum.example.com/viewtopic.php?t=10"),
    );
  });
});

describe("isKnownUrl", () => {
  const known = ["https://www.reddit.com/r/SaaS/comments/abc123/looking_for_a_crm/", "https://news.ycombinator.com/item?id=42"];

  it("matches the same page in a different form", () => {
    expect(isKnownUrl("https://old.reddit.com/r/SaaS/comments/abc123/looking_for_a_crm", known)).toBe(true);
    expect(isKnownUrl("https://reddit.com/r/SaaS/comments/abc123", known)).toBe(true);
    expect(isKnownUrl("https://news.ycombinator.com/item?id=42", known)).toBe(true);
  });

  it("rejects pages that were never retrieved", () => {
    expect(isKnownUrl("https://reddit.com/r/SaaS/comments/zzz999/other", known)).toBe(false);
    expect(isKnownUrl("https://news.ycombinator.com/item?id=43", known)).toBe(false);
    expect(isKnownUrl("https://reddit.com/r", known)).toBe(false);
    expect(isKnownUrl("https://reddit.com", known)).toBe(false);
  });
});

describe("collectRetrievedUrls", () => {
  it("collects URLs from tool results and citations but not from Claude's own words", () => {
    const urls = collectRetrievedUrls([
      { type: "text", text: "See https://made-up.example.com/post", citations: [{ url: "https://cited.example.com/a" }] },
      { type: "server_tool_use", input: { url: "https://guessed.example.com/b" } },
      {
        type: "web_search_tool_result",
        content: [{ type: "web_search_result", url: "https://found.example.com/c", encrypted_content: "https://nope" }],
      },
      { type: "bash_code_execution_tool_result", content: { stdout: "1. https://filtered.example.com/d, 2." } },
      { type: "tool_use", input: { source_url: "https://self.example.com/e" } },
    ] as never);
    expect([...urls].sort()).toEqual([
      "https://cited.example.com/a",
      "https://filtered.example.com/d",
      "https://found.example.com/c",
    ]);
  });
});
