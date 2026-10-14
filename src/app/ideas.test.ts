import { describe, expect, it } from "vitest";

import { cleanIdea, IDEA_LINKS, ideaCounter, ideaFits, ideaLength, IDEAS } from "@/app/ideas";
import { errorCopy } from "@/backend/errors";

describe("an idea's length", () => {
  it("counts the cleaned text, the way the server stores it", () => {
    expect(cleanIdea("  A booth   for​ ZK  ")).toBe("A booth for ZK");
    expect(ideaLength("  A booth   for​ ZK  ")).toBe(14);
    expect(ideaCounter("  A booth   for​ ZK  ")).toBe("14 / 300");
  });

  it("fits between 10 and 300 characters", () => {
    expect(ideaFits("too short")).toBe(false);
    expect(ideaFits("     tiny​​      ")).toBe(false);
    expect(ideaFits("just right")).toBe(true);
    expect(ideaFits("x".repeat(300))).toBe(true);
    expect(ideaFits("x".repeat(301))).toBe(false);
  });

  it("counts an emoji as one character, like the server", () => {
    expect(ideaLength("🎪".repeat(10))).toBe(10);
  });
});

describe("feature request copy and links", () => {
  it("says exactly what the owner asked for once it's sent", () => {
    expect(IDEAS.sent).toBe(
      "Feature request sent to coii-agent. Once it's done, coii-agent will tag you and let you know.",
    );
  });

  it("maps the server's codes to their copy", () => {
    expect(errorCopy("too_many_requests").text).toBe(
      "You've sent 3 ideas today. Send more tomorrow!",
    );
    expect(errorCopy("invalid_request").text).toBe("Write 10–300 characters.");
  });

  it("points developers at the repo's feature-request form and its pull requests", () => {
    expect(IDEA_LINKS.issue).toBe(
      "https://github.com/zaryab2000/coii_connect-on-ideas/issues/new?template=feature_request.md",
    );
    expect(IDEA_LINKS.pulls).toBe("https://github.com/zaryab2000/coii_connect-on-ideas/pulls");
  });
});
