import { describe, expect, test } from "bun:test";

import { installTestDom } from "./test-dom";

installTestDom();

const { buildCourseDocumentHtml } = await import("./build-document");
const { splitCourseDocument } = await import("./split-document");
const { lessonBlocksToDoc } = await import("./to-tiptap");
const { getLightweightExtensions } =
  await import("@sycom/components/tiptap/extensions/preset-lightweight");

const extensions = getLightweightExtensions();

const doc = (...content: unknown[]) => ({ type: "doc", content }) as never;
const paragraph = (text: string) => ({
  type: "paragraph",
  content: [{ type: "text", text }],
});
const heading = (level: number, text: string) => ({
  type: "heading",
  attrs: { level },
  content: [{ type: "text", text }],
});

describe("buildCourseDocumentHtml", () => {
  test("lays out course title, sections and lessons at the expected levels", () => {
    const { html } = buildCourseDocumentHtml(
      {
        title: "Intro to Networks",
        sections: [
          {
            title: "Networking",
            description: "Covers the basics.",
            lessons: [{ title: "TCP", content: doc(paragraph("Reliable delivery")) }],
          },
        ],
      },
      { extensions },
    );

    expect(html).toContain('<h1 class="doc-title">Intro to Networks</h1>');
    expect(html).toContain("<h1>Networking</h1>");
    expect(html).toContain("<p>Covers the basics.</p>");
    expect(html).toContain("<h2>TCP</h2>");
    expect(html).toContain("Reliable delivery");
  });

  test("demotes body headings clear of the levels that carry structure", () => {
    const { html } = buildCourseDocumentHtml(
      {
        title: "T",
        sections: [
          {
            title: "S",
            lessons: [{ title: "L", content: doc(heading(1, "Sub"), heading(2, "Deeper")) }],
          },
        ],
      },
      { extensions },
    );

    expect(html).toContain("<h3>Sub</h3>");
    expect(html).toContain("<h4>Deeper</h4>");
  });

  test("writes questions as the fence rather than losing them to renderHTML", () => {
    const { html } = buildCourseDocumentHtml(
      {
        title: "T",
        sections: [
          {
            title: "S",
            lessons: [
              {
                title: "L",
                content: doc({
                  type: "question",
                  attrs: {
                    questionId: "q1",
                    prompt: "What does TCP guarantee?",
                    type: "single",
                    options: [
                      { id: "a", text: "Ordered delivery", isCorrect: true },
                      { id: "b", text: "Encryption", isCorrect: false },
                    ],
                    explanation: "It sequences and retransmits.",
                  },
                }),
              },
            ],
          },
        ],
      },
      { extensions },
    );

    expect(html).toContain("<p>::: question</p>");
    expect(html).toContain("<p>- [x] Ordered delivery</p>");
    expect(html).toContain("<p>- [ ] Encryption</p>");
    expect(html).toContain("<p>&gt; It sequences and retransmits.</p>");
  });

  test("drops media the resolver cannot export and says so", () => {
    const { html, warnings } = buildCourseDocumentHtml(
      {
        title: "T",
        sections: [
          {
            title: "S",
            lessons: [
              {
                title: "L",
                content: doc(
                  { type: "image", attrs: { src: "lesson_artifacts/l1/pic" } },
                  paragraph("after"),
                ),
              },
            ],
          },
        ],
      },
      { extensions, resolveMediaSrc: () => null },
    );

    expect(html).not.toContain("lesson_artifacts/l1/pic");
    expect(html).toContain("after");
    expect(warnings[0]).toContain("lesson_artifacts/l1/pic");
  });
});

describe("round trip", () => {
  test("build then split returns the same tree", () => {
    const source = {
      title: "Intro to Networks",
      sections: [
        {
          title: "Networking",
          description: "Covers the basics.",
          lessons: [
            { title: "TCP", content: doc(heading(1, "Overview"), paragraph("Reliable delivery")) },
            {
              title: "Quiz",
              content: doc({
                type: "question",
                attrs: {
                  questionId: "q1",
                  prompt: "Pick the transport protocols",
                  type: "multi",
                  options: [
                    { id: "a", text: "TCP", isCorrect: true },
                    { id: "b", text: "UDP", isCorrect: true },
                    { id: "c", text: "HTTP", isCorrect: false },
                  ],
                  explanation: "HTTP is application layer.",
                },
              }),
            },
          ],
        },
        {
          title: "Security",
          description: null,
          lessons: [{ title: "TLS", content: doc(paragraph("Handshake")) }],
        },
      ],
    };

    const { html } = buildCourseDocumentHtml(source, { extensions });
    const parsed = splitCourseDocument(html);

    expect(parsed.title).toBe("Intro to Networks");
    expect(parsed.sections.map((s) => s.title)).toEqual(["Networking", "Security"]);
    expect(parsed.sections[0]?.description).toBe("Covers the basics.");
    expect(parsed.sections[0]?.lessons.map((l) => l.title)).toEqual(["TCP", "Quiz"]);
    expect(parsed.sections[1]?.lessons.map((l) => l.title)).toEqual(["TLS"]);

    // The heading demoted on the way out comes back at the level it started.
    const tcp = lessonBlocksToDoc(parsed.sections[0]?.lessons[0]?.blocks ?? [], extensions);
    expect(tcp.content?.[0]).toMatchObject({ type: "heading", attrs: { level: 1 } });

    // The question survives with its answers, which no HTML round trip would keep.
    const quizBlocks = parsed.sections[0]?.lessons[1]?.blocks ?? [];
    expect(quizBlocks).toHaveLength(1);
    const attrs = quizBlocks[0]?.kind === "question" ? quizBlocks[0].attrs : null;
    expect(attrs?.prompt).toBe("Pick the transport protocols");
    expect(attrs?.type).toBe("multi");
    expect(attrs?.options.map((o) => [o.text, o.isCorrect])).toEqual([
      ["TCP", true],
      ["UDP", true],
      ["HTTP", false],
    ]);
    expect(attrs?.explanation).toBe("HTTP is application layer.");
  });
});
