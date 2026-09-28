import { describe, expect, it } from "vitest";
import { leadsToCsv } from "@/lib/csv";
import type { Lead } from "@/lib/types";

const lead: Lead = {
  id: "1",
  productId: "p",
  createdAt: "2026-09-01T00:00:00.000Z",
  sourceUrl: "https://reddit.com/r/x/comments/1",
  platform: "Reddit",
  title: 'Need a "simple" CRM, any ideas?',
  author: "u/founder",
  excerpt: "=HYPERLINK(\"evil\")",
  postedAt: "2 days ago",
  intent: "high",
  intentScore: 90,
  whyFit: "Small team,\nneeds CRM",
  suggestedAngle: "Answer first",
  status: "new",
  notes: "",
  outreach: null,
};

describe("leadsToCsv", () => {
  it("quotes special characters and neutralises formulas", () => {
    const [header, row] = leadsToCsv([lead]).split("\r\n");
    expect(header.split(",")[0]).toBe("intent_score");
    expect(row).toContain('"Need a ""simple"" CRM, any ideas?"');
    expect(row).toContain(`"'=HYPERLINK(""evil"")"`);
    expect(row).toContain('"Small team,\nneeds CRM"');
  });
});
