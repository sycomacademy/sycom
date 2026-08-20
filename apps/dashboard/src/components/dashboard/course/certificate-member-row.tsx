import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MailCheckIcon, SendIcon } from "lucide-react";
import { useState } from "react";

import type { CourseEnrollmentRow } from "@/components/dashboard/course/course-members-schema";
import { useTRPC } from "@/lib/trpc/client";
import { Avatar, AvatarFallback, AvatarImage } from "@sycom/ui/components/avatar";
import { Badge } from "@sycom/ui/components/badge";
import { Button } from "@sycom/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "@sycom/ui/components/dialog";
import { toastManager } from "@sycom/ui/components/toast";
import { buildImageUrl } from "@sycom/ui/image/cdn";
import { getInitials } from "@sycom/ui/lib/string";

const sentAtFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatSentAt(sentAt: Date | string) {
  const date = sentAt instanceof Date ? sentAt : new Date(sentAt);
  return Number.isNaN(date.getTime()) ? null : sentAtFormatter.format(date);
}

export function CertificateMemberRow({
  courseId,
  enrollment,
}: {
  courseId: string;
  enrollment: CourseEnrollmentRow;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const completionLabel = `${enrollment.completedLessonCount}/${enrollment.totalLessonCount} complete`;
  const hasFinishedCourse =
    enrollment.totalLessonCount > 0 &&
    enrollment.completedLessonCount >= enrollment.totalLessonCount;
  const sentAtLabel = enrollment.certificateSentAt
    ? formatSentAt(enrollment.certificateSentAt)
    : null;
  const alreadySent = Boolean(enrollment.certificateSentAt);

  const sendCertificate = useMutation(
    trpc.enrollment.sendCertificate.mutationOptions({
      onSuccess: async (result) => {
        setConfirmOpen(false);
        await queryClient.invalidateQueries({
          queryKey: trpc.enrollment.listByCourse.queryKey({ courseId }),
        });
        toastManager.add({
          title: result.resent ? "Certificate resent" : "Certificate sent",
          description: `Emailed to ${result.sentTo}.`,
          type: "success",
        });
      },
      onError: (error) => {
        toastManager.add({
          title: "Couldn't send certificate",
          description:
            error.message || "Couldn't reach server. Check your connection and try again.",
          type: "error",
        });
      },
    }),
  );

  const send = () => sendCertificate.mutate({ courseId, enrollmentId: enrollment.enrollmentId });

  return (
    <div className="flex items-center justify-between gap-3 border px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar className="size-10 rounded-md">
          {enrollment.image ? (
            <AvatarImage alt={enrollment.name} src={buildImageUrl(enrollment.image)} />
          ) : null}
          <AvatarFallback className="rounded-md text-xs text-muted-foreground">
            {getInitials(enrollment.name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{enrollment.name}</p>
          <p className="truncate text-xs text-muted-foreground">{enrollment.email}</p>
          <div className="mt-1 flex flex-wrap gap-2">
            <Badge variant="outline">{enrollment.status}</Badge>
            <Badge variant="secondary">{completionLabel}</Badge>
            {alreadySent ? (
              <Badge variant="success">
                <MailCheckIcon />
                Sent
              </Badge>
            ) : null}
          </div>
          {sentAtLabel ? (
            <p className="mt-1 text-xs text-muted-foreground">Last sent {sentAtLabel}</p>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {alreadySent ? (
          <Dialog onOpenChange={setConfirmOpen} open={confirmOpen}>
            <DialogTrigger
              render={
                <Button size="sm" type="button" variant="outline">
                  <SendIcon className="size-4" />
                  Resend
                </Button>
              }
            />
            <DialogPopup className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Send this certificate again?</DialogTitle>
                <DialogDescription>
                  {enrollment.name} was already sent a certificate for this course
                  {sentAtLabel ? ` on ${sentAtLabel}` : ""}. Sending again emails another copy of
                  the same certificate to {enrollment.email}.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose
                  render={
                    <Button disabled={sendCertificate.isPending} type="button" variant="outline">
                      Cancel
                    </Button>
                  }
                />
                <Button loading={sendCertificate.isPending} onClick={send} type="button">
                  Send again
                </Button>
              </DialogFooter>
            </DialogPopup>
          </Dialog>
        ) : (
          <Button
            disabled={!hasFinishedCourse}
            loading={sendCertificate.isPending}
            onClick={send}
            size="sm"
            title={
              hasFinishedCourse ? undefined : "Available once every lesson has been completed."
            }
            type="button"
            variant="outline"
          >
            <SendIcon className="size-4" />
            Send certificate
          </Button>
        )}
      </div>
    </div>
  );
}
