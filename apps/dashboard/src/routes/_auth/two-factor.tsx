import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@sycom/ui/components/button";
import { buttonVariants } from "@sycom/ui/components/button-variants";
import { Checkbox } from "@sycom/ui/components/checkbox";
import { Field, FieldDescription, FieldError, FieldLabel } from "@sycom/ui/components/field";
import { Form, FormControl, FormField, FormItem } from "@sycom/ui/components/form";
import { Input } from "@sycom/ui/components/input";
import { OTPField, OTPFieldInput } from "@sycom/ui/components/otp-field";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@sycom/ui/components/tabs";
import { toastManager } from "@sycom/ui/components/toast";
import { cn } from "@sycom/ui/lib/utils";
import { createFileRoute, useRouter, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod/mini";

import { Link } from "@/components/layout/foresight-link";
import Loader from "@/components/layout/loader";
import { authClient } from "@/lib/auth/auth-client";
import { resolveAuthenticatedEntryHref } from "@/lib/auth/auth-redirect";
import { SESSION_QUERY_KEY } from "@/lib/auth/session";
import { useTRPC } from "@/lib/trpc/client";
import { useQueryClient } from "@tanstack/react-query";
const totpSchema = z.object({
  code: z.string().check(z.minLength(6, "Enter the 6-digit code from your authenticator app")),
  trustDevice: z.optional(z.boolean()),
});
type TotpInput = z.infer<typeof totpSchema>;

const backupCodeSchema = z.object({
  code: z.string().check(z.minLength(6, "Enter one of your backup codes")),
  trustDevice: z.optional(z.boolean()),
});
type BackupCodeInput = z.infer<typeof backupCodeSchema>;

export const Route = createFileRoute("/_auth/two-factor")({
  head: () => ({
    meta: [
      { title: "Two-factor authentication | Sycom LMS" },
      {
        name: "description",
        content: "Verify your second factor to finish signing in to Sycom.",
      },
    ],
  }),
  component: TwoFactorPage,
});

function TwoFactorPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const trpc = useTRPC();
  const { redirect: redirectParam } = useSearch({ from: "/_auth" });
  const [activeMethod, setActiveMethod] = useState("totp");
  const [isRedirecting, setIsRedirecting] = useState(false);

  const totpForm = useForm<TotpInput>({
    resolver: zodResolver(totpSchema),
    defaultValues: { code: "", trustDevice: true },
  });

  const backupCodeForm = useForm<BackupCodeInput>({
    resolver: zodResolver(backupCodeSchema),
    defaultValues: { code: "", trustDevice: true },
  });

  const finishSignIn = async () => {
    setIsRedirecting(true);
    await queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
    const target = await resolveAuthenticatedEntryHref(queryClient, trpc, router, redirectParam);
    await router.navigate({ href: target, replace: true });
  };

  const handleTotpSubmit = async (data: TotpInput) => {
    try {
      const { error } = await authClient.twoFactor.verifyTotp({
        code: data.code.replaceAll(" ", ""),
        trustDevice: data.trustDevice,
      });

      if (error) {
        toastManager.add({ title: error.message, type: "error" });
        return;
      }

      toastManager.add({ title: "Verification complete", type: "success" });
      await finishSignIn();
    } catch (error) {
      setIsRedirecting(false);
      toastManager.add({
        title:
          error instanceof Error
            ? error.message
            : "Couldn't reach server. Check your connection and try again.",
        type: "error",
      });
    }
  };

  const handleTotpCodeChange = (value: string) => {
    totpForm.setValue("code", value, { shouldDirty: true, shouldValidate: true });

    if (value.length === 6 && !totpForm.formState.isSubmitting) {
      void totpForm.handleSubmit(handleTotpSubmit)();
    }
  };

  const handleBackupCodeSubmit = async (data: BackupCodeInput) => {
    try {
      const { error } = await authClient.twoFactor.verifyBackupCode({
        code: data.code.trim().toUpperCase(),
        trustDevice: data.trustDevice,
      });

      if (error) {
        toastManager.add({ title: error.message, type: "error" });
        return;
      }

      toastManager.add({ title: "Verification complete", type: "success" });
      await finishSignIn();
    } catch (error) {
      setIsRedirecting(false);
      toastManager.add({
        title:
          error instanceof Error
            ? error.message
            : "Couldn't reach server. Check your connection and try again.",
        type: "error",
      });
    }
  };

  if (isRedirecting) {
    return <Loader text="Signing you in" />;
  }

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex h-full w-full items-center justify-center">
        <div className="w-full space-y-4">
          <div className="space-y-2 text-center">
            <h1 className="text-lg font-medium tracking-tight">Two-factor authentication</h1>
            <p className="text-sm text-muted-foreground">
              Enter a code to finish signing in to your account.
            </p>
          </div>

          <Tabs className="w-full" onValueChange={setActiveMethod} value={activeMethod}>
            <TabsList className="grid w-full grid-cols-2" variant="default">
              <TabsTab value="totp">Authenticator app</TabsTab>
              <TabsTab value="backup">Backup code</TabsTab>
            </TabsList>

            <TabsPanel className="pt-2" value="totp">
              <Form {...totpForm} className="flex w-full flex-col gap-4">
                <form className="contents" onSubmit={totpForm.handleSubmit(handleTotpSubmit)}>
                  <FormField
                    control={totpForm.control}
                    name="code"
                    render={({ field, fieldState }) => (
                      <FormItem>
                        <Field>
                          <FieldLabel className="text-xs text-muted-foreground">
                            Authentication code
                          </FieldLabel>
                          <FormControl>
                            <div className="flex w-full justify-center">
                              <OTPField
                                // oxlint-disable-next-line jsx_a11y/no-autofocus
                                autoFocus
                                aria-invalid={fieldState.invalid}
                                autoComplete="one-time-code"
                                className="w-fit justify-center"
                                inputMode="numeric"
                                length={6}
                                onValueChange={handleTotpCodeChange}
                                size="lg"
                                value={field.value}
                              >
                                {Array.from({ length: 6 }, (_, index) => (
                                  <OTPFieldInput key={index} />
                                ))}
                              </OTPField>
                            </div>
                          </FormControl>
                          <FieldDescription className="text-center">
                            Use the 6-digit code from your authenticator app.
                          </FieldDescription>
                          <FieldError reserveSpace className="text-center">
                            {fieldState.error?.message}
                          </FieldError>
                        </Field>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={totpForm.control}
                    name="trustDevice"
                    render={({ field }) => (
                      <FormItem>
                        <Field orientation="horizontal">
                          <Checkbox
                            checked={field.value}
                            id="trustTotpDevice"
                            onCheckedChange={(checked) => field.onChange(checked === true)}
                          />
                          <FieldLabel
                            className="text-xs font-normal text-muted-foreground"
                            htmlFor="trustTotpDevice"
                          >
                            Trust this device for 30 days
                          </FieldLabel>
                        </Field>
                      </FormItem>
                    )}
                  />

                  <Button
                    className="mt-1 w-full"
                    loading={totpForm.formState.isSubmitting}
                    size="lg"
                    type="submit"
                  >
                    Continue
                  </Button>
                </form>
              </Form>
            </TabsPanel>

            <TabsPanel className="pt-2" value="backup">
              <Form {...backupCodeForm} className="flex w-full flex-col gap-4">
                <form
                  className="contents"
                  onSubmit={backupCodeForm.handleSubmit(handleBackupCodeSubmit)}
                >
                  <FormField
                    control={backupCodeForm.control}
                    name="code"
                    render={({ field, fieldState }) => (
                      <FormItem>
                        <Field>
                          <FieldLabel className="text-xs text-muted-foreground">
                            Backup code
                          </FieldLabel>
                          <FormControl>
                            <Input
                              autoCapitalize="characters"
                              placeholder="ABCDE-12345"
                              {...field}
                            />
                          </FormControl>
                          <FieldDescription>
                            Use one of the backup codes you saved when you enabled two-factor.
                          </FieldDescription>
                          <FieldError reserveSpace>{fieldState.error?.message}</FieldError>
                        </Field>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={backupCodeForm.control}
                    name="trustDevice"
                    render={({ field }) => (
                      <FormItem>
                        <Field orientation="horizontal">
                          <Checkbox
                            checked={field.value}
                            id="trustBackupDevice"
                            onCheckedChange={(checked) => field.onChange(checked === true)}
                          />
                          <FieldLabel
                            className="text-xs font-normal text-muted-foreground"
                            htmlFor="trustBackupDevice"
                          >
                            Trust this device for 30 days
                          </FieldLabel>
                        </Field>
                      </FormItem>
                    )}
                  />

                  <Button
                    className="mt-1 w-full"
                    loading={backupCodeForm.formState.isSubmitting}
                    size="lg"
                    type="submit"
                  >
                    Continue
                  </Button>
                </form>
              </Form>
            </TabsPanel>
          </Tabs>
        </div>
      </div>

      <div className="mt-auto pt-6 text-center">
        <p className="text-xs text-muted-foreground">
          Need to start over?{" "}
          <Link className={cn(buttonVariants({ variant: "link" }), "px-0")} to="/sign-in">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
