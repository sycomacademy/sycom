import { describe, expect, test } from "bun:test";

import { installTestDom } from "./test-dom";

installTestDom();

const { splitCourseDocument } = await import("./split-document");

describe("splitCourseDocument", () => {
  test("splits H1 into sections and H2 into lessons", () => {
    const result = splitCourseDocument(
      `<h1>Networking</h1>
       <h2>TCP basics</h2><p>Hello</p>
       <h2>UDP basics</h2><p>World</p>
       <h1>Security</h1>
       <h2>TLS</h2><p>Handshake</p>`,
    );

    expect(result.sections.map((s) => s.title)).toEqual(["Networking", "Security"]);
    expect(result.sections[0]?.lessons.map((l) => l.title)).toEqual(["TCP basics", "UDP basics"]);
    expect(result.sections[1]?.lessons.map((l) => l.title)).toEqual(["TLS"]);
  });

  test("reads the course title from the Title style, not from a section heading", () => {
    const result = splitCourseDocument(
      `<h1 class="doc-title">Intro to Networks</h1><h1>Networking</h1><h2>TCP</h2><p>x</p>`,
    );

    expect(result.title).toBe("Intro to Networks");
    expect(result.sections.map((s) => s.title)).toEqual(["Networking"]);
  });

  test("recovers the title from a re-imported export, where the class is gone", () => {
    // html-to-docx cannot emit Word's Title style, so our own export comes back as a
    // plain leading <h1> sitting directly above the first section.
    const result = splitCourseDocument(
      `<h1>Intro to Networks</h1><h1>Networking</h1><h2>TCP</h2><p>x</p>`,
    );

    expect(result.title).toBe("Intro to Networks");
    expect(result.sections.map((s) => s.title)).toEqual(["Networking"]);
  });

  test("a leading section heading with its own content is not mistaken for the title", () => {
    const result = splitCourseDocument(`<h1>Networking</h1><h2>TCP</h2><p>x</p>`);

    expect(result.title).toBeNull();
    expect(result.sections.map((s) => s.title)).toEqual(["Networking"]);
  });

  test("prose between a section heading and its first lesson becomes the description", () => {
    const result = splitCourseDocument(
      `<h1>Networking</h1><p>What the section covers.</p><h2>TCP</h2><p>Body</p>`,
    );

    expect(result.sections[0]?.description).toBe("What the section covers.");
    expect(result.sections[0]?.lessons).toHaveLength(1);
  });

  test("content before any heading lands in an Introduction section", () => {
    const result = splitCourseDocument(`<p>Preamble</p><h1>Networking</h1><h2>TCP</h2><p>x</p>`);

    expect(result.sections.map((s) => s.title)).toEqual(["Introduction", "Networking"]);
    expect(result.sections[0]?.lessons[0]?.blocks[0]).toMatchObject({ kind: "html" });
  });

  test("promotes body headings back into the editor's range", () => {
    const result = splitCourseDocument(
      `<h1>S</h1><h2>L</h2><h3>Sub</h3><p>a</p><h4>Deeper</h4><p>b</p>`,
    );

    const html = result.sections[0]?.lessons[0]?.blocks
      .map((block) => (block.kind === "html" ? block.html : ""))
      .join("");

    expect(html).toContain("<h1>Sub</h1>");
    expect(html).toContain("<h2>Deeper</h2>");
  });

  test("honours a remapped heading level", () => {
    const result = splitCourseDocument(`<h2>S</h2><h3>L</h3><p>body</p>`, {
      headingMap: { sectionLevel: 2, lessonLevel: 3 },
    });

    expect(result.sections.map((s) => s.title)).toEqual(["S"]);
    expect(result.sections[0]?.lessons.map((l) => l.title)).toEqual(["L"]);
  });

  test("warns when a document has no usable headings", () => {
    const result = splitCourseDocument(`<p>Just prose</p>`);

    expect(result.sections).toHaveLength(1);
    expect(result.warnings).toHaveLength(0);

    const empty = splitCourseDocument(``);
    expect(empty.sections).toHaveLength(0);
    expect(empty.warnings[0]).toContain("No headings found");
  });
});

describe("question fences", () => {
  const question = (html: string) => {
    const result = splitCourseDocument(`<h1>S</h1><h2>L</h2>${html}`);
    return result.sections[0]?.lessons[0]?.blocks ?? [];
  };

  test("parses a fence typed as plain paragraphs", () => {
    const blocks = question(
      `<p>::: question</p>
       <p>What does TCP guarantee?</p>
       <p>- [x] Ordered, reliable delivery</p>
       <p>- [ ] Encryption</p>
       <p>&gt; Because TCP sequences and retransmits.</p>
       <p>:::</p>`,
    );

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      kind: "question",
      attrs: { prompt: "What does TCP guarantee?", type: "single" },
    });

    const attrs = blocks[0]?.kind === "question" ? blocks[0].attrs : null;
    expect(attrs?.options.map((o) => [o.text, o.isCorrect])).toEqual([
      ["Ordered, reliable delivery", true],
      ["Encryption", false],
    ]);
    expect(attrs?.explanation).toBe("Because TCP sequences and retransmits.");
  });

  test("parses a fence Word autoformatted into a list and a blockquote", () => {
    const blocks = question(
      `<p>::: question</p>
       <p>Which are transport protocols?</p>
       <ul><li>[x] TCP</li><li>[x] UDP</li><li>[ ] HTTP</li></ul>
       <blockquote><p>HTTP is application layer.</p></blockquote>
       <p>:::</p>`,
    );

    expect(blocks).toHaveLength(1);
    const attrs = blocks[0]?.kind === "question" ? blocks[0].attrs : null;
    expect(attrs?.type).toBe("multi");
    expect(attrs?.options.map((o) => o.text)).toEqual(["TCP", "UDP", "HTTP"]);
    expect(attrs?.explanation).toBe("HTTP is application layer.");
  });

  test("parses a fence written with line breaks inside one paragraph", () => {
    const blocks = question(
      `<p>::: question<br />Pick one<br />- [x] Yes<br />- [ ] No<br />:::</p>`,
    );

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ kind: "question", attrs: { prompt: "Pick one" } });
  });

  test("keeps prose around a fence in document order", () => {
    const blocks = question(
      `<p>Before</p>
       <p>::: question</p><p>Q</p><p>- [x] A</p><p>- [ ] B</p><p>:::</p>
       <p>After</p>`,
    );

    expect(blocks.map((b) => b.kind)).toEqual(["html", "question", "html"]);
    expect(blocks[0]).toMatchObject({ html: "<p>Before</p>" });
    expect(blocks[2]).toMatchObject({ html: "<p>After</p>" });
  });

  test("a fence with too few options falls back to prose rather than vanishing", () => {
    const blocks = question(`<p>::: question</p><p>Q</p><p>- [x] Only one</p><p>:::</p>`);

    expect(blocks.every((block) => block.kind === "html")).toBe(true);
    const html = blocks.map((b) => (b.kind === "html" ? b.html : "")).join("");
    expect(html).toContain("Only one");
  });

  test("an unclosed fence does not swallow the rest of the document silently", () => {
    const result = splitCourseDocument(
      `<h1>S</h1><h2>L</h2><p>::: question</p><p>Q</p><p>- [x] A</p><p>- [ ] B</p>`,
    );

    const blocks = result.sections[0]?.lessons[0]?.blocks ?? [];
    expect(blocks.every((block) => block.kind === "html")).toBe(true);
    const html = blocks.map((b) => (b.kind === "html" ? b.html : "")).join("");
    expect(html).toContain("Q");
  });
});
