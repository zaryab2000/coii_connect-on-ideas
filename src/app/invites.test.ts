import { describe, expect, it } from "vitest";

import { checkRow, describeBad, inviteSql, parseCsv, planInvites } from "@scripts/invites";

const HEADER = "name,telegram,x,topics,intents,one_liners";

function csv(...rows: string[]): string {
  return [HEADER, ...rows].join("\n");
}

describe("invite CSV parsing", () => {
  it("reads quoted cells with commas, quotes and newlines", () => {
    expect(parseCsv('a,"b, c","say ""hi"""\r\n"two\nlines",,\n')).toEqual([
      ["a", "b, c", 'say "hi"'],
      ["two\nlines", "", ""],
    ]);
  });

  it("refuses a stray quote instead of guessing", () => {
    expect(() => parseCsv('a,"open')).toThrow(/quote/);
    expect(planInvites(`${HEADER}\nAsha,"open`).bad[0]?.reasons[0]).toMatch(/quote/);
  });

  it("needs the exact header", () => {
    const plan = planInvites("name,x,telegram,topics,intents,one_liners\nAsha,,asha,privacy,,");
    expect(plan.rows).toEqual([]);
    expect(plan.bad[0]).toMatchObject({ line: 1 });
  });
});

describe("invite rows", () => {
  it("cleans the PRD's example row the way the join form would", () => {
    expect(checkRow(["Asha Rao", "@asha_builds", "", "privacy;core", "building", "building private UPI rails"])).toEqual({
      name: "Asha Rao",
      telegram: "asha_builds",
      x: null,
      topics: ["privacy", "core"],
      intents: ["building"],
      one_liners: ["building private UPI rails"],
    });
  });

  it("accepts handle links and mixed-case ids", () => {
    const row = checkRow(["Kiran", "", "https://x.com/kiran_k", "Privacy", "Hiring;Building", "a|b"]);
    expect(row).toMatchObject({ x: "kiran_k", topics: ["privacy"], intents: ["hiring", "building"] });
  });

  it("says everything wrong with a row at once", () => {
    const problems = checkRow(["Devcon Support", "", "", "nope", "building;hiring;raising", "see @me"]);
    expect(Array.isArray(problems)).toBe(true);
    const text = (problems as string[]).join(" ");
    expect(text).toMatch(/Unknown topics: nope/);
    expect(text).toMatch(/up to 2 intents/);
    expect(text).toMatch(/Telegram username or an X handle/);
    expect(text).toMatch(/No @usernames/);
    expect(text).toMatch(/can't contain "devcon"/);
  });

  it("catches unknown intents, links in names and bad handles", () => {
    expect((checkRow(["A", "ab", "", "core", "dancing", ""]) as string[]).join(" ")).toMatch(
      /Unknown intents: dancing.*5–32/,
    );
    expect((checkRow(["see www.me", "", "me", "core", "", ""]) as string[]).join(" ")).toMatch(/links/);
  });
});

describe("invite plans", () => {
  it("keeps good rows, lists bad ones by row, and skips blank lines", () => {
    const plan = planInvites(
      csv(
        "Asha Rao,asha_builds,,privacy;core,building,building private UPI rails",
        "",
        "Bad Bean,,,privacy,,",
        "Kiran,,kiran_k,core,,",
      ),
    );
    expect(plan.rows.map((r) => r.name)).toEqual(["Asha Rao", "Kiran"]);
    expect(plan.bad).toEqual([{ line: 4, name: "Bad Bean", reasons: ["Add a Telegram username or an X handle."] }]);
    expect(describeBad(plan.bad)).toBe("  row 4 (Bad Bean): Add a Telegram username or an X handle.");
  });

  it("leaves out a later row that reuses a handle, ignoring case", () => {
    const plan = planInvites(csv("Asha,asha_builds,,core,,", "Asha 2,ASHA_builds,,core,,"));
    expect(plan.rows).toHaveLength(1);
    expect(plan.bad[0]?.reasons).toEqual(["Telegram @asha_builds is already on row 2."]);
  });
});

describe("invite SQL", () => {
  it("passes the rows as one JSON value, so quotes need no escaping", () => {
    const [row] = planInvites(csv(`"Asha O'Rao",asha_builds,,core,,"says ""gm"""`)).rows;
    const sql = inviteSql(row ? [row] : [], "docs-internal/invites/friends.csv");
    expect(sql).toContain("private.invite_beans($coii_invites$[");
    expect(sql).toContain(`"name": "Asha O'Rao"`);
    expect(sql).toContain(String.raw`"says \"gm\""`);
    expect(sql).toMatch(/Copy them now/);
    expect(sql).toMatch(/\(1 row\)/);
  });

  it("refuses a row that would close the quote early", () => {
    const row = { name: "$coii_invites$", telegram: "abcde", x: null, topics: [], intents: [], one_liners: [] };
    expect(() => inviteSql([row], "x.csv")).toThrow(/quote tag/);
  });
});
