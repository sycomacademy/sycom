import {
  useIsFetching,
  useMutation,
  useSuspenseInfiniteQuery,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  CERTIFICATE_TEMPLATE_IDS,
  certificateTemplateDescriptions,
  certificateTemplateLabels,
  type CertificateTemplateId,
} from "@sycom/certificates/meta";
import type { CertificatePdfPayload } from "@sycom/certificates";
import { parseCourseCertificateSettings } from "@sycom/certificates/course-settings";
import { Search } from "lucide-react";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  courseCertificatesSearchSchema,
  type CourseCertificatesSearchInput,
} from "@/components/dashboard/course/course-certificates-schema";
import {
  courseMembersPageSize,
  getCourseMembersListInput,
  type CourseEnrollmentRow,
} from "@/components/dashboard/course/course-members-schema";
import { useDebouncedSearch } from "@/hooks/use-debounced-search";
import { useTRPC } from "@/lib/trpc/client";
import { Avatar, AvatarFallback, AvatarImage } from "@sycom/ui/components/avatar";
import { Badge } from "@sycom/ui/components/badge";
import { Button } from "@sycom/ui/components/button";
import { Card, CardDescription, CardHeader, CardPanel, CardTitle } from "@sycom/ui/components/card";
import { Field, FieldLabel } from "@sycom/ui/components/field";
import { Input } from "@sycom/ui/components/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@sycom/ui/components/input-group";
import { Radio, RadioGroup } from "@sycom/ui/components/radio-group";
import { Spinner } from "@sycom/ui/components/spinner";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@sycom/ui/components/tabs";
import { toastManager } from "@sycom/ui/components/toast";
import { buildImageUrl } from "@sycom/ui/image/cdn";
import { getInitials } from "@sycom/ui/lib/string";
import type { AppRouterInputs, AppRouterOutputs } from "server/trpc/routers/_app";

type EnrollmentListResult = AppRouterOutputs["enrollment"]["listByCourse"];

type PersistedCertificateDesign =
  AppRouterInputs["orgCourse"]["updateCertificateSettings"]["certificateSettings"];

const CERT_DEFAULT_HEADLINE = "Certificate of completion";
const CERT_DEFAULT_CERTIFY_PHRASE = "This is to certify that";
const CERT_DEFAULT_ISSUER = "Sycom Solutions";

const PERSIST_DEBOUNCE_MS = 550;

function buildPersistableCertificateSettings(
  templateId: CertificateTemplateId,
  awardHeadline: string,
  certifyPhrase: string,
  issuerLine: string,
  footnoteLine: string,
): PersistedCertificateDesign {
  const keywords: NonNullable<PersistedCertificateDesign["keywords"]> = {};
  if (awardHeadline.trim()) {
    keywords.awardHeadline = awardHeadline.trim();
  }
  if (certifyPhrase.trim()) {
    keywords.certifyPhrase = certifyPhrase.trim();
  }
  if (issuerLine.trim()) {
    keywords.issuerLine = issuerLine.trim();
  }
  if (footnoteLine.trim()) {
    keywords.footnoteLine = footnoteLine.trim();
  }
  return Object.keys(keywords).length > 0 ? { templateId, keywords } : { templateId };
}

const PREVIEW_DEBOUNCE_MS = 280;

const CertificatePreviewLazy = lazy(() =>
  import("@sycom/certificates/preview").then((m) => ({ default: m.CertificatePreview })),
);

function toDateInputValue(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDateInputValue(s: string): Date {
  const [y, mo, d] = s.split("-").map(Number);
  if (!y || !mo || !d) {
    return new Date();
  }
  return new Date(y, mo - 1, d, 12, 0, 0, 0);
}

function getEnrollmentInfiniteQueryOptions(
  trpc: Pick<ReturnType<typeof useTRPC>, "enrollment">,
  courseId: string,
  search: Pick<CourseCertificatesSearchInput, "search">,
) {
  return {
    initialPageParam: 0,
    queryKey: [...trpc.enrollment.listByCourse.queryKey({ courseId }), search.search ?? ""],
    queryFn: async (context: unknown): Promise<EnrollmentListResult> => {
      const pageParam = (context as { pageParam: number }).pageParam;
      const queryOptions = trpc.enrollment.listByCourse.queryOptions(
        getCourseMembersListInput({ search: search.search }, pageParam, courseId),
      );
      const queryFn = queryOptions.queryFn;
      if (!queryFn) {
        throw new Error("Missing query function for enrollment.listByCourse.");
      }

      type QueryContext = Parameters<NonNullable<typeof queryFn>>[0];
      return await queryFn({
        ...(context as Omit<QueryContext, "queryKey">),
        queryKey: queryOptions.queryKey,
      } as QueryContext);
    },
    getNextPageParam: (lastPage: EnrollmentListResult, allPages: EnrollmentListResult[]) => {
      const loaded = allPages.reduce((sum, page) => sum + page.rows.length, 0);
      if (loaded >= lastPage.totalCount || lastPage.rows.length < courseMembersPageSize) {
        return undefined;
      }
      return loaded;
    },
  };
}

export const Route = createFileRoute("/dashboard/org/courses/$courseId/certificates")({
  validateSearch: courseCertificatesSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps, params }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(
        context.trpc.orgCourse.get.queryOptions({ courseId: params.courseId }),
      ),
      context.queryClient.ensureInfiniteQueryData({
        initialPageParam: 0,
        queryKey: [
          ...context.trpc.enrollment.listByCourse.queryKey({ courseId: params.courseId }),
          deps.search ?? "",
        ],
        queryFn: async (contextArg): Promise<EnrollmentListResult> => {
          const pageParam = contextArg.pageParam as number;
          const queryOptions = context.trpc.enrollment.listByCourse.queryOptions(
            getCourseMembersListInput({ search: deps.search }, pageParam, params.courseId),
          );
          const queryFn = queryOptions.queryFn;
          if (!queryFn) {
            throw new Error("Missing query function for enrollment.listByCourse.");
          }

          return await queryFn({ ...contextArg, queryKey: queryOptions.queryKey });
        },
        getNextPageParam: (lastPage: EnrollmentListResult, allPages: EnrollmentListResult[]) => {
          const loaded = allPages.reduce((sum, page) => sum + page.rows.length, 0);
          if (loaded >= lastPage.totalCount || lastPage.rows.length < courseMembersPageSize) {
            return undefined;
          }
          return loaded;
        },
      }),
    ]);
  },
  component: CourseCertificatesPage,
});

function CertificateMemberRow({ enrollment }: { enrollment: CourseEnrollmentRow }) {
  const completionLabel = `${enrollment.completedLessonCount}/${enrollment.totalLessonCount} complete`;

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
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Button onClick={() => alert("Not implemented")} size="sm" type="button" variant="outline">
          Send certificate
        </Button>
      </div>
    </div>
  );
}

function CourseCertificatesPage() {
  const { courseId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const trpc = useTRPC();

  const { data: course } = useSuspenseQuery(trpc.orgCourse.get.queryOptions({ courseId }));

  const [selectedTemplate, setSelectedTemplate] = useState<CertificateTemplateId>(
    CERTIFICATE_TEMPLATE_IDS[0],
  );
  const [awardHeadline, setAwardHeadline] = useState(CERT_DEFAULT_HEADLINE);
  const [certifyPhrase, setCertifyPhrase] = useState(CERT_DEFAULT_CERTIFY_PHRASE);
  const [issuerLine, setIssuerLine] = useState(
    () => course.organizationName ?? CERT_DEFAULT_ISSUER,
  );
  const [footnoteLine, setFootnoteLine] = useState("");
  const [previewRecipientName, setPreviewRecipientName] = useState("Sample Learner");
  const [previewCourseTitle, setPreviewCourseTitle] = useState(() => course.title);
  const [previewCertificateNumber, setPreviewCertificateNumber] = useState("CERT-PREVIEW");
  const [previewIssuedDate, setPreviewIssuedDate] = useState(() => toDateInputValue(new Date()));
  const [previewMounted, setPreviewMounted] = useState(false);

  const [displayPreview, setDisplayPreview] = useState<{
    templateId: CertificateTemplateId;
    payload: CertificatePdfPayload;
  } | null>(null);
  const [appliedPreviewSignature, setAppliedPreviewSignature] = useState<string | null>(null);

  const persistedDesignBaselineRef = useRef<string>("");
  const scrollHostRef = useRef<HTMLElement | null>(null);
  const detachScrollRef = useRef<(() => void) | null>(null);

  const saveCertificateDesign = useMutation(
    trpc.orgCourse.updateCertificateSettings.mutationOptions(),
  );

  const { searchInput, setSearchInput } = useDebouncedSearch({
    committedValue: search.search,
    delayMs: 300,
    onDebouncedCommit: (next) =>
      navigate({
        replace: true,
        search: (prev: CourseCertificatesSearchInput) => ({
          ...prev,
          search: next,
        }),
      }),
  });

  const enrollmentsQuery = useSuspenseInfiniteQuery(
    getEnrollmentInfiniteQueryOptions(trpc, courseId, search),
  );

  const isFetchingEnrollments =
    useIsFetching({ queryKey: trpc.enrollment.listByCourse.queryKey({ courseId }) }) > 0;

  const enrollments = useMemo(
    () => enrollmentsQuery.data.pages.flatMap((page) => page.rows),
    [enrollmentsQuery.data],
  );

  useEffect(() => {
    setPreviewMounted(true);
  }, []);

  useLayoutEffect(() => {
    const defaultIssuer = course.organizationName ?? CERT_DEFAULT_ISSUER;
    const parsed = parseCourseCertificateSettings(course.certificateSettings);
    const templateId = parsed?.templateId ?? CERTIFICATE_TEMPLATE_IDS[0];
    setSelectedTemplate(templateId);
    setAwardHeadline(parsed?.keywords?.awardHeadline ?? CERT_DEFAULT_HEADLINE);
    setCertifyPhrase(parsed?.keywords?.certifyPhrase ?? CERT_DEFAULT_CERTIFY_PHRASE);
    setIssuerLine(parsed?.keywords?.issuerLine ?? defaultIssuer);
    setFootnoteLine(parsed?.keywords?.footnoteLine ?? "");
    setPreviewCourseTitle(course.title);
    persistedDesignBaselineRef.current = JSON.stringify(
      buildPersistableCertificateSettings(
        templateId,
        parsed?.keywords?.awardHeadline ?? CERT_DEFAULT_HEADLINE,
        parsed?.keywords?.certifyPhrase ?? CERT_DEFAULT_CERTIFY_PHRASE,
        parsed?.keywords?.issuerLine ?? defaultIssuer,
        parsed?.keywords?.footnoteLine ?? "",
      ),
    );
  }, [course.certificateSettings, course.organizationName, course.title, courseId]);

  useEffect(() => {
    const persistable = buildPersistableCertificateSettings(
      selectedTemplate,
      awardHeadline,
      certifyPhrase,
      issuerLine,
      footnoteLine,
    );
    const sig = JSON.stringify(persistable);
    if (sig === persistedDesignBaselineRef.current) {
      return;
    }

    const id = window.setTimeout(() => {
      saveCertificateDesign.mutate(
        { courseId, certificateSettings: persistable },
        {
          onSuccess: () => {
            persistedDesignBaselineRef.current = sig;
          },
          onError: (error) => {
            toastManager.add({
              title:
                typeof error.message === "string"
                  ? error.message
                  : "Couldn't save certificate settings",
              type: "error",
            });
          },
        },
      );
    }, PERSIST_DEBOUNCE_MS);

    return () => window.clearTimeout(id);
  }, [
    awardHeadline,
    certifyPhrase,
    courseId,
    footnoteLine,
    issuerLine,
    saveCertificateDesign,
    selectedTemplate,
  ]);

  const previewSignature = useMemo(() => {
    return JSON.stringify({
      templateId: selectedTemplate,
      awardHeadline,
      certifyPhrase,
      issuerLine,
      footnoteLine,
      recipientName: previewRecipientName,
      courseTitle: previewCourseTitle,
      certificateNumber: previewCertificateNumber,
      issuedDate: previewIssuedDate,
    });
  }, [
    selectedTemplate,
    awardHeadline,
    certifyPhrase,
    issuerLine,
    footnoteLine,
    previewRecipientName,
    previewCourseTitle,
    previewCertificateNumber,
    previewIssuedDate,
  ]);

  const getLivePreviewSnapshot = useCallback(() => {
    const payload: CertificatePdfPayload = {
      recipientName: previewRecipientName.trim() || "Sample Learner",
      courseTitle: previewCourseTitle.trim() || "Sample course title",
      certificateNumber: previewCertificateNumber.trim() || "CERT-PREVIEW",
      issuedAt: parseDateInputValue(previewIssuedDate),
      awardHeadline: awardHeadline.trim() ? awardHeadline : undefined,
      certifyPhrase: certifyPhrase.trim() ? certifyPhrase : undefined,
      issuerLine: issuerLine.trim() ? issuerLine : undefined,
      footnoteLine: footnoteLine.trim() ? footnoteLine : undefined,
    };
    return { templateId: selectedTemplate, payload };
  }, [
    selectedTemplate,
    awardHeadline,
    certifyPhrase,
    footnoteLine,
    issuerLine,
    previewRecipientName,
    previewCourseTitle,
    previewCertificateNumber,
    previewIssuedDate,
  ]);

  useEffect(() => {
    if (!previewMounted) return;

    if (appliedPreviewSignature === previewSignature) {
      return;
    }

    const delayMs = appliedPreviewSignature === null ? 0 : PREVIEW_DEBOUNCE_MS;
    const id = window.setTimeout(() => {
      setDisplayPreview(getLivePreviewSnapshot());
      setAppliedPreviewSignature(previewSignature);
    }, delayMs);

    return () => window.clearTimeout(id);
  }, [previewMounted, previewSignature, appliedPreviewSignature, getLivePreviewSnapshot]);

  const canShowPdf =
    previewMounted &&
    displayPreview !== null &&
    appliedPreviewSignature !== null &&
    previewSignature === appliedPreviewSignature;

  const handleScrollLoadMore = useCallback(() => {
    const scrollHost = scrollHostRef.current;
    if (!scrollHost) return;

    const remaining = scrollHost.scrollHeight - scrollHost.scrollTop - scrollHost.clientHeight;
    if (
      remaining < 240 &&
      enrollmentsQuery.hasNextPage &&
      !enrollmentsQuery.isFetchingNextPage &&
      enrollmentsQuery.status === "success"
    ) {
      void enrollmentsQuery.fetchNextPage();
    }
  }, [enrollmentsQuery]);

  const attachScrollHost = useCallback(
    (node: HTMLDivElement | null) => {
      detachScrollRef.current?.();
      detachScrollRef.current = null;
      scrollHostRef.current = null;

      if (!node) return;

      const scrollHost = node.closest<HTMLElement>("[role='main']");
      if (!scrollHost) return;

      scrollHostRef.current = scrollHost;
      const onScroll = () => handleScrollLoadMore();
      scrollHost.addEventListener("scroll", onScroll, { passive: true });
      detachScrollRef.current = () => scrollHost.removeEventListener("scroll", onScroll);
    },
    [handleScrollLoadMore],
  );

  const setPanel = (panel: CourseCertificatesSearchInput["panel"]) => {
    void navigate({
      replace: true,
      search: (prev: CourseCertificatesSearchInput) => ({ ...prev, panel }),
    });
  };

  return (
    <div ref={attachScrollHost}>
      <Tabs
        className="max-h-20 gap-8 sm:flex-row"
        orientation="vertical"
        value={search.panel}
        onValueChange={(value) =>
          value === "design" || value === "members" ? setPanel(value) : undefined
        }
      >
        <TabsList className="w-full shrink-0 sm:w-44">
          <TabsTab value="design">Design</TabsTab>
          <TabsTab value="members">Members</TabsTab>
        </TabsList>

        <TabsPanel value="design" className="min-h-80 min-w-0 flex-1 outline-none">
          <Card>
            <CardHeader>
              <CardTitle>Certificate design</CardTitle>
              <CardDescription>
                Pick a PDF template and adjust wording shown on certificates.
              </CardDescription>
            </CardHeader>
            <CardPanel className="space-y-8">
              <section className="space-y-3">
                <h3 className="text-sm font-medium">Templates</h3>
                <RadioGroup
                  name="certificate-template"
                  onValueChange={(v) => void setSelectedTemplate(v as CertificateTemplateId)}
                  value={selectedTemplate}
                >
                  <div className="flex flex-col gap-3">
                    {CERTIFICATE_TEMPLATE_IDS.map((id) => (
                      <div
                        key={id}
                        className="flex gap-3 rounded-lg border bg-card px-4 py-3 hover:bg-accent/40"
                      >
                        <Radio
                          className="mt-0.5 shrink-0"
                          id={`certificate-template-${courseId}-${id}`}
                          value={id}
                        />
                        <label
                          className="min-w-0 flex-1 cursor-pointer"
                          htmlFor={`certificate-template-${courseId}-${id}`}
                        >
                          <span className="font-medium">{certificateTemplateLabels[id]}</span>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {certificateTemplateDescriptions[id]}
                          </p>
                        </label>
                      </div>
                    ))}
                  </div>
                </RadioGroup>
              </section>

              <section className="space-y-4">
                <h3 className="text-sm font-medium">Keywords</h3>
                <div className="grid gap-6 sm:grid-cols-2">
                  <Field className="gap-2">
                    <FieldLabel className="text-xs" htmlFor={`cert-headline-${courseId}`}>
                      Award headline
                    </FieldLabel>
                    <Input
                      id={`cert-headline-${courseId}`}
                      autoComplete="off"
                      onChange={(e) => setAwardHeadline(e.target.value)}
                      placeholder="Certificate of completion"
                      value={awardHeadline}
                    />
                  </Field>
                  <Field className="gap-2">
                    <FieldLabel className="text-xs" htmlFor={`cert-intro-${courseId}`}>
                      Certification line
                    </FieldLabel>
                    <Input
                      id={`cert-intro-${courseId}`}
                      autoComplete="off"
                      onChange={(e) => setCertifyPhrase(e.target.value)}
                      placeholder="This is to certify that"
                      value={certifyPhrase}
                    />
                  </Field>
                  <Field className="gap-2">
                    <FieldLabel className="text-xs" htmlFor={`cert-issuer-${courseId}`}>
                      Issued by{" "}
                      <span className="font-normal text-muted-foreground">(optional)</span>
                    </FieldLabel>
                    <Input
                      id={`cert-issuer-${courseId}`}
                      autoComplete="organization"
                      onChange={(e) => setIssuerLine(e.target.value)}
                      placeholder="Organization or signatory"
                      value={issuerLine}
                    />
                  </Field>
                  <Field className="gap-2">
                    <FieldLabel className="text-xs" htmlFor={`cert-foot-${courseId}`}>
                      Footer note{" "}
                      <span className="font-normal text-muted-foreground">(optional)</span>
                    </FieldLabel>
                    <Input
                      id={`cert-foot-${courseId}`}
                      autoComplete="off"
                      onChange={(e) => setFootnoteLine(e.target.value)}
                      placeholder="Additional information"
                      value={footnoteLine}
                    />
                  </Field>
                </div>
              </section>

              <section className="space-y-4">
                <h3 className="text-sm font-medium">Sample learner &amp; course (preview)</h3>
                <div className="grid gap-6 sm:grid-cols-2">
                  <Field className="gap-2">
                    <FieldLabel className="text-xs" htmlFor={`cert-preview-learn-${courseId}`}>
                      Learner name
                    </FieldLabel>
                    <Input
                      id={`cert-preview-learn-${courseId}`}
                      autoComplete="off"
                      onChange={(e) => setPreviewRecipientName(e.target.value)}
                      placeholder="Sample Learner"
                      value={previewRecipientName}
                    />
                  </Field>
                  <Field className="gap-2">
                    <FieldLabel className="text-xs" htmlFor={`cert-preview-course-${courseId}`}>
                      Course title
                    </FieldLabel>
                    <Input
                      id={`cert-preview-course-${courseId}`}
                      autoComplete="off"
                      onChange={(e) => setPreviewCourseTitle(e.target.value)}
                      placeholder="Sample course title"
                      value={previewCourseTitle}
                    />
                  </Field>
                  <Field className="gap-2">
                    <FieldLabel className="text-xs" htmlFor={`cert-preview-num-${courseId}`}>
                      Certificate number
                    </FieldLabel>
                    <Input
                      id={`cert-preview-num-${courseId}`}
                      autoComplete="off"
                      onChange={(e) => setPreviewCertificateNumber(e.target.value)}
                      placeholder="CERT-PREVIEW"
                      value={previewCertificateNumber}
                    />
                  </Field>
                  <Field className="gap-2">
                    <FieldLabel className="text-xs" htmlFor={`cert-preview-date-${courseId}`}>
                      Issued on
                    </FieldLabel>
                    <Input
                      id={`cert-preview-date-${courseId}`}
                      autoComplete="off"
                      onChange={(e) => setPreviewIssuedDate(e.target.value)}
                      type="date"
                      value={previewIssuedDate}
                    />
                  </Field>
                </div>
                <p className="text-xs text-muted-foreground">
                  These placeholders only shape the preview. Real certificates use enrollment and
                  issuance data.
                </p>
              </section>

              <section
                aria-labelledby="preview-heading"
                className="rounded-lg border bg-muted/20 p-4"
              >
                <h3
                  className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
                  id="preview-heading"
                >
                  Preview
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Updates pause briefly—showing progress—while the PDF refreshes.
                </p>
                <div className="relative mt-4 aspect-842/595 w-full overflow-hidden rounded-lg border bg-card">
                  <div className="absolute inset-0">
                    {canShowPdf ? (
                      <Suspense
                        fallback={
                          <div className="flex h-full items-center justify-center bg-muted/40">
                            <Spinner className="size-6" />
                          </div>
                        }
                      >
                        <CertificatePreviewLazy
                          key={appliedPreviewSignature}
                          payload={displayPreview.payload}
                          templateId={displayPreview.templateId}
                        />
                      </Suspense>
                    ) : (
                      <div
                        aria-busy
                        className="flex h-full flex-col items-center justify-center gap-2 bg-muted/40"
                      >
                        <Spinner className="size-6" />
                        <span className="sr-only">Updating certificate preview</span>
                      </div>
                    )}
                  </div>
                </div>
              </section>
            </CardPanel>
          </Card>
        </TabsPanel>

        <TabsPanel value="members" className="min-h-80 min-w-0 flex-1 outline-none">
          <div className="flex flex-col gap-4">
            <div className="min-w-0 space-y-1">
              <h2 className="text-base font-semibold">Members</h2>
              <p className="text-sm text-muted-foreground">
                Learners enrolled and have finished the course—send certificates when ready.
              </p>
            </div>

            <label className="sr-only" htmlFor="certificates-members-search">
              Search enrolled learners
            </label>
            <InputGroup className="w-full max-w-md">
              <InputGroupAddon align="inline-start">
                {isFetchingEnrollments ? (
                  <Spinner className="size-4" />
                ) : (
                  <Search className="size-4 opacity-60" />
                )}
              </InputGroupAddon>
              <InputGroupInput
                id="certificates-members-search"
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search enrolled learners..."
                type="search"
                value={searchInput}
              />
            </InputGroup>

            <div className="space-y-3">
              {enrollments.length === 0 ? (
                <div className="rounded-lg border bg-card px-6 py-10 text-center text-sm text-muted-foreground">
                  No enrolled learners match your search.
                </div>
              ) : (
                enrollments.map((row) => (
                  <CertificateMemberRow enrollment={row} key={row.enrollmentId} />
                ))
              )}

              <div className="flex h-12 items-center justify-center">
                {enrollmentsQuery.isFetchingNextPage ? <Spinner className="size-4" /> : null}
              </div>
            </div>
          </div>
        </TabsPanel>
      </Tabs>
    </div>
  );
}
