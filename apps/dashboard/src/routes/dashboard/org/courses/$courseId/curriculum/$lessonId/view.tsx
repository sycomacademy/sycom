import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { Editor, JSONContent } from "@tiptap/core";
import { useEffect, useState } from "react";
import { Button } from "@sycom/ui/components/button";
import { Card, CardPanel, CardHeader, CardTitle } from "@sycom/ui/components/card";
import {
  QuestionTrackingProvider,
  RichTextEditor,
  useQuestionGate,
} from "@sycom/ui/components/tiptap/rich-text-editor";

import { useTRPC, useTRPCClient } from "@/lib/trpc/client";
import { useLessonSignedMediaResolver } from "@/hooks/use-lesson-signed-media";

export const Route = createFileRoute("/dashboard/org/courses/$courseId/curriculum/$lessonId/view")({
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(
      context.trpc.lesson.get.queryOptions({ lessonId: params.lessonId }),
    );
  },
  component: LessonViewPage,
});

function ContinueBar({
  courseId,
  editor,
  lessonId,
}: {
  courseId: string;
  editor: Editor | null;
  lessonId: string;
}) {
  const trpc = useTRPC();
  const { data: lessons } = useSuspenseQuery(trpc.lesson.listByCourse.queryOptions({ courseId }));
  const { allCorrect, questionCount } = useQuestionGate(editor);

  const idx = lessons.findIndex((l) => l.id === lessonId);
  const previous = idx > 0 ? lessons[idx - 1] : undefined;
  const next = idx >= 0 ? lessons[idx + 1] : undefined;
  const gated = questionCount > 0 && !allCorrect;

  return (
    <div className="flex items-center justify-end gap-3 border-t px-4 py-3">
      {previous ? (
        <Button
          render={
            <Link
              params={{ courseId, lessonId: previous.id }}
              to="/dashboard/org/courses/$courseId/curriculum/$lessonId/view"
            />
          }
          variant="outline"
        >
          Previous lesson
        </Button>
      ) : null}
      {next ? (
        <Button
          disabled={gated}
          render={
            <Link
              params={{ courseId, lessonId: next.id }}
              to="/dashboard/org/courses/$courseId/curriculum/$lessonId/view"
            />
          }
        >
          Next lesson
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">This is the last lesson in the curriculum.</p>
      )}
    </div>
  );
}

function LessonViewPage() {
  const { courseId, lessonId } = Route.useParams();
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const { data: lesson } = useSuspenseQuery(trpc.lesson.get.queryOptions({ lessonId }));
  const [editor, setEditor] = useState<Editor | null>(null);
  const resolveMediaUrl = useLessonSignedMediaResolver(
    (lesson.content ?? null) as JSONContent | null,
  );

  useEffect(() => {
    setEditor(null);
  }, [lessonId]);

  return (
    <div className="space-y-4">
      <Button
        render={<Link params={{ courseId }} to="/dashboard/org/courses/$courseId/curriculum/" />}
      >
        Back to curriculum
      </Button>
      <Card>
        <CardHeader>
          <CardTitle>{lesson.title}</CardTitle>
        </CardHeader>
        <CardPanel className="space-y-4 p-0">
          <QuestionTrackingProvider>
            <RichTextEditor
              key={lessonId}
              className="border-0"
              content={(lesson.content ?? null) as JSONContent | null}
              editable={false}
              mode="full"
              resolveMediaUrl={resolveMediaUrl}
              onCheckAnswer={async (args: { questionId: string; selected: string[] }) => {
                const result = await trpcClient.lesson.checkAnswer.mutate({
                  lessonId,
                  questionId: args.questionId,
                  selected: args.selected,
                });
                return { isCorrect: result.isCorrect };
              }}
              onEditorReady={setEditor}
              showAdvancedChrome={false}
            />
            <ContinueBar courseId={courseId} editor={editor} lessonId={lessonId} />
          </QuestionTrackingProvider>
        </CardPanel>
      </Card>
    </div>
  );
}
