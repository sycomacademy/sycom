import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@sycom/ui/components/button";
import { Badge } from "@sycom/ui/components/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@sycom/ui/components/accordion";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardPanel,
  CardTitle,
} from "@sycom/ui/components/card";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "@sycom/ui/components/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@sycom/ui/components/field";
import { Form, FormControl, FormField, FormItem } from "@sycom/ui/components/form";
import { Input } from "@sycom/ui/components/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@sycom/ui/components/input-group";
import { GoogleLogo } from "@sycom/ui/components/logos/google";
import { LinkedinLogo } from "@sycom/ui/components/logos/linkedin";
import { QRCode } from "@sycom/ui/components/qr-code";
import { toastManager } from "@sycom/ui/components/toast";
import { formatDeviceLabel, isMobileAgent } from "@sycom/ui/lib/device";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  CheckIcon,
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  LaptopIcon,
  PlusIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
  Trash2Icon,
} from "lucide-react";
import { useReducer, useState } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod/mini";

import { useUser } from "@/hooks/use-user";
import { authClient } from "@/lib/auth/auth-client";
import { useTRPC } from "@/lib/trpc/client";

export const Route = createFileRoute("/dashboard/settings/security")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(context.trpc.profile.listAccounts.queryOptions()),
      context.queryClient.ensureQueryData(context.trpc.profile.listPasskeys.queryOptions()),
      context.queryClient.ensureQueryData(context.trpc.profile.listSessions.queryOptions()),
    ]);
  },
  component: SecuritySettings,
});

export function SecuritySettings() {
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <SecuritySessionsActive />
      <SecurityChangePassword />
      <SecurityPasskeys />
      <SecurityLinkedAccounts />
      <SecurityTwoFactorAuthentication />
    </div>
  );
}

function SecuritySessionsActive() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const {
    data: { session },
  } = useUser();
  const listSessionsQueryOptions = trpc.profile.listSessions.queryOptions();
  const { data: sessions } = useSuspenseQuery(listSessionsQueryOptions);
  const typedSessions = sessions as ActiveSession[];
  const revokeSession = useMutation({
    ...trpc.profile.revokeSession.mutationOptions({
      onMutate: async ({ token }) => {
        await queryClient.cancelQueries({ queryKey: listSessionsQueryOptions.queryKey });

        const previousSessions = queryClient.getQueryData(listSessionsQueryOptions.queryKey);

        queryClient.setQueryData<ActiveSession[]>(listSessionsQueryOptions.queryKey, (current) =>
          (current ?? []).filter((activeSession) => activeSession.token !== token),
        );

        return { previousSessions };
      },
      onSuccess: () => {
        toastManager.add({ title: "Session revoked", type: "success" });
      },
      onError: (error, _variables, context) => {
        if (context?.previousSessions) {
          queryClient.setQueryData(listSessionsQueryOptions.queryKey, context.previousSessions);
        }

        toastManager.add({ title: error.message, type: "error" });
      },
      onSettled: () => {
        void queryClient.invalidateQueries(listSessionsQueryOptions);
      },
    }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Sessions</CardTitle>
        <CardDescription className="text-sm">
          Manage devices where you're signed in.
        </CardDescription>
      </CardHeader>
      <CardPanel className="flex flex-col gap-2">
        {typedSessions.length === 0 ? (
          <p className="border px-3 py-2.5 text-sm text-muted-foreground">
            No active sessions found.
          </p>
        ) : (
          typedSessions.map((activeSession) => {
            const DeviceIcon = isMobileAgent(activeSession.userAgent) ? SmartphoneIcon : LaptopIcon;
            const isCurrentSession = session?.token === activeSession.token;
            const isPending =
              revokeSession.isPending && revokeSession.variables?.token === activeSession.token;

            return (
              <div
                className="flex flex-wrap items-center justify-between gap-2 border px-3 py-2.5"
                key={activeSession.token}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <DeviceIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                  <p className="truncate text-sm">{formatDeviceLabel(activeSession.userAgent)}</p>
                  {isCurrentSession ? (
                    <Badge className="shrink-0" variant="success">
                      This device
                    </Badge>
                  ) : null}
                </div>
                <Button
                  className="px-0 text-destructive hover:text-destructive"
                  disabled={isCurrentSession}
                  loading={isPending}
                  onClick={() => {
                    revokeSession.mutate({ token: activeSession.token });
                  }}
                  size="sm"
                  type="button"
                  variant="link"
                >
                  {isCurrentSession ? "Current session" : "Sign out"}
                </Button>
              </div>
            );
          })
        )}
      </CardPanel>
    </Card>
  );
}

const changePasswordSchema = z
  .object({
    currentPassword: z.string().check(z.minLength(1, "Current password is required")),
    newPassword: z.string().check(z.minLength(8, "Password must be at least 8 characters")),
    confirmNewPassword: z.string(),
  })
  .check(
    z.refine((data) => data.newPassword === data.confirmNewPassword, {
      message: "Passwords don't match",
      path: ["confirmNewPassword"],
    }),
  );

type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
type ActiveSession = {
  token: string;
  userAgent: string | null;
};
type ProviderAccount = {
  providerId: string;
  accountId: string;
};
type PasskeyCredential = {
  id: string;
  name: string | null;
  createdAt: Date;
};

function SecurityChangePassword() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: accounts } = useSuspenseQuery(trpc.profile.listAccounts.queryOptions());
  const typedAccounts = accounts as ProviderAccount[];
  const hasPasswordAccount = typedAccounts.some((account) => account.providerId === "credential");
  const [showConfirm, setShowConfirm] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const changePassword = useMutation({
    ...trpc.profile.changePassword.mutationOptions({
      onSuccess: () => {
        toastManager.add({ title: "Password updated", type: "success" });
        void queryClient.invalidateQueries(trpc.profile.listAccounts.queryOptions());
        form.reset();
      },
      onError: (error) => {
        toastManager.add({ title: error.message, type: "error" });
      },
    }),
  });

  const form = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmNewPassword: "" },
  });

  const onSubmit = async (data: ChangePasswordInput) => {
    try {
      await changePassword.mutateAsync({
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
        revokeOtherSessions: true,
      });
    } catch (error) {
      toastManager.add({
        title: "Couldn't change password",
        description:
          error instanceof Error
            ? error.message
            : "Couldn't reach server. Check your connection and try again.",
        type: "error",
      });
    }
  };

  return (
    <Card>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardHeader>
            <CardTitle className="text-sm">Change password</CardTitle>
            <CardDescription className="text-sm">
              {hasPasswordAccount
                ? "Update your password to keep your account secure."
                : "You signed in with an external provider. Use the password reset flow if you'd like to set a Sycom password."}
            </CardDescription>
          </CardHeader>
          <CardPanel className="space-y-4 py-0">
            <FormField
              control={form.control}
              name="currentPassword"
              render={({ field, fieldState }) => (
                <FormItem>
                  <Field>
                    <FieldLabel>Current password</FieldLabel>
                    <FormControl>
                      <InputGroup>
                        <InputGroupInput
                          autoComplete="current-password"
                          disabled={!hasPasswordAccount}
                          placeholder="Current password"
                          type={showCurrent ? "text" : "password"}
                          {...field}
                        />
                        <InputGroupAddon align="inline-end">
                          <InputGroupButton
                            aria-label={showCurrent ? "Hide password" : "Show password"}
                            disabled={!hasPasswordAccount}
                            onClick={() => setShowCurrent((state) => !state)}
                          >
                            {showCurrent ? (
                              <EyeOffIcon className="size-3.5" />
                            ) : (
                              <EyeIcon className="size-3.5" />
                            )}
                          </InputGroupButton>
                        </InputGroupAddon>
                      </InputGroup>
                    </FormControl>
                    <FieldError reserveSpace>{fieldState.error?.message}</FieldError>
                  </Field>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="newPassword"
              render={({ field, fieldState }) => (
                <FormItem>
                  <Field>
                    <FieldLabel>New password</FieldLabel>
                    <FormControl>
                      <InputGroup>
                        <InputGroupInput
                          autoComplete="new-password"
                          disabled={!hasPasswordAccount}
                          placeholder="New password"
                          type={showNew ? "text" : "password"}
                          {...field}
                        />
                        <InputGroupAddon align="inline-end">
                          <InputGroupButton
                            aria-label={showNew ? "Hide password" : "Show password"}
                            disabled={!hasPasswordAccount}
                            onClick={() => setShowNew((state) => !state)}
                          >
                            {showNew ? (
                              <EyeOffIcon className="size-3.5" />
                            ) : (
                              <EyeIcon className="size-3.5" />
                            )}
                          </InputGroupButton>
                        </InputGroupAddon>
                      </InputGroup>
                    </FormControl>
                    <FieldDescription>
                      At least 8 characters with a mix of letters and numbers.
                    </FieldDescription>
                    <FieldError reserveSpace>{fieldState.error?.message}</FieldError>
                  </Field>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="confirmNewPassword"
              render={({ field, fieldState }) => (
                <FormItem>
                  <Field>
                    <FieldLabel>Confirm new password</FieldLabel>
                    <FormControl>
                      <InputGroup>
                        <InputGroupInput
                          autoComplete="new-password"
                          disabled={!hasPasswordAccount}
                          placeholder="Confirm new password"
                          type={showConfirm ? "text" : "password"}
                          {...field}
                        />
                        <InputGroupAddon align="inline-end">
                          <InputGroupButton
                            aria-label={showConfirm ? "Hide password" : "Show password"}
                            disabled={!hasPasswordAccount}
                            onClick={() => setShowConfirm((state) => !state)}
                          >
                            {showConfirm ? (
                              <EyeOffIcon className="size-3.5" />
                            ) : (
                              <EyeIcon className="size-3.5" />
                            )}
                          </InputGroupButton>
                        </InputGroupAddon>
                      </InputGroup>
                    </FormControl>
                    <FieldError reserveSpace>{fieldState.error?.message}</FieldError>
                  </Field>
                </FormItem>
              )}
            />
          </CardPanel>
          <CardFooter className="justify-end pt-0">
            <Button
              disabled={!hasPasswordAccount}
              loading={form.formState.isSubmitting}
              type="submit"
            >
              Update password
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}

function SecurityPasskeys() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const listPasskeysQueryOptions = trpc.profile.listPasskeys.queryOptions();
  const { data: passkeys } = useSuspenseQuery(listPasskeysQueryOptions);
  const typedPasskeys = passkeys as PasskeyCredential[];
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [deletingPasskeyId, setDeletingPasskeyId] = useState<string | null>(null);

  const handleAddPasskey = async () => {
    try {
      const { error } = await authClient.passkey.addPasskey({
        authenticatorAttachment: "platform",
        name: "Sycom LMS",
      });

      if (error) {
        toastManager.add({
          title: "Couldn't add passkey",
          description: error.message,
          type: "error",
        });
        return;
      }

      setAddDialogOpen(false);
      toastManager.add({ title: "Passkey added", type: "success" });
      void queryClient.invalidateQueries(listPasskeysQueryOptions);
    } catch (error) {
      toastManager.add({
        title: "Couldn't add passkey",
        description:
          error instanceof Error
            ? error.message
            : "Couldn't reach server. Check your connection and try again.",
        type: "error",
      });
    }
  };

  const handleDeletePasskey = async (id: string) => {
    setDeletingPasskeyId(id);

    try {
      const { error } = await authClient.passkey.deletePasskey({ id });

      if (error) {
        toastManager.add({
          title: "Couldn't remove passkey",
          description: error.message,
          type: "error",
        });
        return;
      }

      toastManager.add({ title: "Passkey removed", type: "success" });
      void queryClient.invalidateQueries(listPasskeysQueryOptions);
    } catch (error) {
      toastManager.add({
        title: "Couldn't remove passkey",
        description:
          error instanceof Error
            ? error.message
            : "Couldn't reach server. Check your connection and try again.",
        type: "error",
      });
    } finally {
      setDeletingPasskeyId(null);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Passkeys</CardTitle>
          <CardDescription className="text-sm">
            Register a passkey on this device for faster, phishing-resistant sign-in later.
          </CardDescription>
        </CardHeader>
        <CardPanel className="space-y-3 py-0">
          {typedPasskeys.length === 0 ? (
            <div className="border px-3 py-2.5 text-sm text-muted-foreground">
              No passkeys registered yet.
            </div>
          ) : (
            typedPasskeys.map((passkey) => (
              <div
                className="flex items-center justify-between gap-3 border px-3 py-2.5"
                key={passkey.id}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {passkey.name ?? "Unnamed passkey"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Added {passkey.createdAt.toLocaleDateString()}
                  </p>
                </div>
                <Button
                  aria-label="Remove passkey"
                  loading={deletingPasskeyId === passkey.id}
                  onClick={() => {
                    void handleDeletePasskey(passkey.id);
                  }}
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </div>
            ))
          )}
        </CardPanel>
        <CardFooter className="justify-end">
          <Button onClick={() => setAddDialogOpen(true)} size="sm" type="button">
            <PlusIcon className="size-4" />
            Add passkey
          </Button>
        </CardFooter>
      </Card>

      <Dialog onOpenChange={setAddDialogOpen} open={addDialogOpen}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>Add passkey</DialogTitle>
            <DialogDescription>
              Your browser will ask you to confirm with Face ID, Touch ID, Windows Hello, or your
              device PIN.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setAddDialogOpen(false)} type="button" variant="outline">
              Cancel
            </Button>
            <Button onClick={() => void handleAddPasskey()} type="button">
              Add passkey
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </>
  );
}
const linkedAccountProviders = ["google", "linkedin"] as const;
type LinkedAccountProvider = (typeof linkedAccountProviders)[number];
const linkedAccountProviderConfig = {
  google: {
    label: "Google",
    description: "Connect your Google account to your Sycom account.",
    icon: GoogleIcon,
  },
  linkedin: {
    label: "LinkedIn",
    description: "Connect your LinkedIn account to your Sycom account.",
    icon: LinkedinOAuthIcon,
  },
};

function SecurityLinkedAccounts() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const listAccountsQueryOptions = trpc.profile.listAccounts.queryOptions();
  const { data: accounts } = useSuspenseQuery(listAccountsQueryOptions);
  const typedAccounts = accounts as ProviderAccount[];
  const [linkingProvider, setLinkingProvider] = useState<LinkedAccountProvider | null>(null);
  const [unlinkingAccountId, setUnlinkingAccountId] = useState<string | null>(null);

  const getProviderAccount = (provider: LinkedAccountProvider) =>
    typedAccounts.find(
      (account) => account.providerId === provider || account.providerId.startsWith(`${provider}:`),
    );

  const handleLinkAccount = async (provider: LinkedAccountProvider) => {
    setLinkingProvider(provider);

    try {
      const { error } = await authClient.linkSocial({
        callbackURL: "/dashboard/settings/security",
        provider,
      });

      if (error) {
        toastManager.add({
          title: "Couldn't link account",
          description: error.message,
          type: "error",
        });
      }
      void queryClient.invalidateQueries(listAccountsQueryOptions);
    } catch (error) {
      toastManager.add({
        title: "Couldn't link account",
        description:
          error instanceof Error
            ? error.message
            : "Couldn't reach server. Check your connection and try again.",
        type: "error",
      });
    } finally {
      setLinkingProvider(null);
    }
  };

  const handleUnlinkAccount = async (accountId: string) => {
    setUnlinkingAccountId(accountId);

    try {
      const { error } = await authClient.unlinkAccount({ accountId });

      if (error) {
        toastManager.add({
          title: "Couldn't unlink account",
          description: error.message,
          type: "error",
        });
        return;
      }

      toastManager.add({ title: "Account unlinked", type: "success" });
      void queryClient.invalidateQueries(listAccountsQueryOptions);
    } catch (error) {
      toastManager.add({
        title: "Couldn't unlink account",
        description:
          error instanceof Error
            ? error.message
            : "Couldn't reach server. Check your connection and try again.",
        type: "error",
      });
    } finally {
      setUnlinkingAccountId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Linked accounts</CardTitle>
        <CardDescription className="text-sm">
          Connect a trusted social account so you can sign in with fewer steps.
        </CardDescription>
      </CardHeader>
      <CardPanel className="space-y-3">
        {linkedAccountProviders.map((provider) => {
          const providerAccount = getProviderAccount(provider);
          const providerConfig = linkedAccountProviderConfig[provider];
          const ProviderIcon = providerConfig.icon;

          return (
            <div
              className="flex items-center justify-between gap-3 border px-3 py-2.5"
              key={provider}
            >
              <div className="flex min-w-0 items-start gap-3">
                <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full border bg-muted">
                  <ProviderIcon />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{providerConfig.label}</p>
                    {providerAccount ? (
                      <Badge className="gap-1" variant="success">
                        <CheckIcon className="size-3" />
                        Linked
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground">{providerConfig.description}</p>
                </div>
              </div>
              {providerAccount ? (
                <Button
                  loading={unlinkingAccountId === providerAccount.accountId}
                  onClick={() => {
                    void handleUnlinkAccount(providerAccount.accountId);
                  }}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  Disconnect
                </Button>
              ) : (
                <Button
                  loading={linkingProvider === provider}
                  onClick={() => {
                    void handleLinkAccount(provider);
                  }}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Connect
                </Button>
              )}
            </div>
          );
        })}
      </CardPanel>
    </Card>
  );
}

const passwordConfirmationSchema = z.object({
  password: z.string().check(z.minLength(1, "Current password is required")),
});

const verifyTotpSchema = z.object({
  code: z.string().check(z.minLength(6, "Enter your authenticator code")),
});

type PasswordConfirmationInput = z.infer<typeof passwordConfirmationSchema>;
type VerifyTotpInput = z.infer<typeof verifyTotpSchema>;

type EnabledAction = "disable" | "regenerate" | null;

type TwoFactorState = {
  backupCodes: string[];
  setupDialogOpen: boolean;
  totpUri: string | null;
  enabledAction: EnabledAction;
  showEnablePassword: boolean;
  showManagePassword: boolean;
};

type TwoFactorAction =
  | { type: "setEnabledAction"; value: EnabledAction }
  | { type: "setManageBackupCodes"; backupCodes: string[] }
  | { type: "startSetup"; backupCodes: string[]; totpUri: string | null }
  | { type: "setSetupDialogOpen"; open: boolean }
  | { type: "toggleEnablePasswordVisibility" }
  | { type: "toggleManagePasswordVisibility" }
  | { type: "verifySuccess" }
  | { type: "disableSuccess" };

const initialTwoFactorState: TwoFactorState = {
  backupCodes: [],
  setupDialogOpen: false,
  totpUri: null,
  enabledAction: null,
  showEnablePassword: false,
  showManagePassword: false,
};

function twoFactorStateReducer(state: TwoFactorState, action: TwoFactorAction): TwoFactorState {
  switch (action.type) {
    case "setEnabledAction":
      return { ...state, enabledAction: action.value };
    case "setManageBackupCodes":
      return { ...state, backupCodes: action.backupCodes };
    case "startSetup":
      return {
        ...state,
        backupCodes: action.backupCodes,
        setupDialogOpen: true,
        totpUri: action.totpUri,
      };
    case "setSetupDialogOpen":
      return action.open
        ? { ...state, setupDialogOpen: true }
        : { ...state, setupDialogOpen: false, totpUri: null };
    case "toggleEnablePasswordVisibility":
      return { ...state, showEnablePassword: !state.showEnablePassword };
    case "toggleManagePasswordVisibility":
      return { ...state, showManagePassword: !state.showManagePassword };
    case "verifySuccess":
      return { ...state, setupDialogOpen: false, totpUri: null };
    case "disableSuccess":
      return { ...state, backupCodes: [] };
  }
}

function SecurityTwoFactorAuthentication() {
  const queryClient = useQueryClient();
  const trpc = useTRPC();
  const {
    data: { user },
  } = useUser();
  const twoFactorEnabled = Boolean(user.twoFactorEnabled);
  const [state, dispatchState] = useReducer(twoFactorStateReducer, initialTwoFactorState);
  const {
    backupCodes,
    enabledAction,
    setupDialogOpen,
    showEnablePassword,
    showManagePassword,
    totpUri,
  } = state;

  const enableForm = useForm<PasswordConfirmationInput>({
    resolver: zodResolver(passwordConfirmationSchema),
    defaultValues: { password: "" },
  });
  const verifyForm = useForm<VerifyTotpInput>({
    resolver: zodResolver(verifyTotpSchema),
    defaultValues: { code: "" },
  });
  const manageEnabledForm = useForm<PasswordConfirmationInput>({
    resolver: zodResolver(passwordConfirmationSchema),
    defaultValues: { password: "" },
  });

  const handleEnable = async (data: PasswordConfirmationInput) => {
    try {
      const { data: response, error } = await authClient.twoFactor.enable({
        issuer: "Sycom LMS",
        password: data.password,
      });

      if (error) {
        toastManager.add({
          title: "Couldn't start 2FA setup",
          description: error.message,
          type: "error",
        });
        return;
      }

      dispatchState({
        type: "startSetup",
        backupCodes: response?.method === "totp" ? response.backupCodes : [],
        totpUri: response?.method === "totp" ? response.totpURI : null,
      });
      verifyForm.reset({ code: "" });
      toastManager.add({ title: "2FA setup started", type: "success" });
    } catch (error) {
      toastManager.add({
        title: "Couldn't start 2FA setup",
        description:
          error instanceof Error
            ? error.message
            : "Couldn't reach server. Check your connection and try again.",
        type: "error",
      });
    }
  };

  const handleVerify = async (data: VerifyTotpInput) => {
    try {
      const { error } = await authClient.twoFactor.verifyTotp({
        code: data.code,
        trustDevice: true,
      });

      if (error) {
        toastManager.add({
          title: "Couldn't verify code",
          description: error.message,
          type: "error",
        });
        return;
      }

      dispatchState({ type: "verifySuccess" });
      verifyForm.reset({ code: "" });
      toastManager.add({ title: "Two-factor enabled", type: "success" });
      void queryClient.invalidateQueries(trpc.profile.get.queryOptions());
    } catch (error) {
      toastManager.add({
        title: "Couldn't verify code",
        description:
          error instanceof Error
            ? error.message
            : "Couldn't reach server. Check your connection and try again.",
        type: "error",
      });
    }
  };

  const handleDisable = async (data: PasswordConfirmationInput) => {
    try {
      const { error } = await authClient.twoFactor.disable({ password: data.password });

      if (error) {
        toastManager.add({
          title: "Couldn't disable 2FA",
          description: error.message,
          type: "error",
        });
        return;
      }

      manageEnabledForm.reset({ password: "" });
      dispatchState({ type: "disableSuccess" });
      toastManager.add({ title: "Two-factor disabled", type: "success" });
      void queryClient.invalidateQueries(trpc.profile.get.queryOptions());
    } catch (error) {
      toastManager.add({
        title: "Couldn't disable 2FA",
        description:
          error instanceof Error
            ? error.message
            : "Couldn't reach server. Check your connection and try again.",
        type: "error",
      });
    }
  };

  const handleRegenerateBackupCodes = async (data: PasswordConfirmationInput) => {
    try {
      const { data: response, error } = await authClient.twoFactor.generateBackupCodes({
        password: data.password,
      });

      if (error) {
        toastManager.add({
          title: "Couldn't regenerate backup codes",
          description: error.message,
          type: "error",
        });
        return;
      }

      dispatchState({ type: "setManageBackupCodes", backupCodes: response?.backupCodes ?? [] });
      manageEnabledForm.reset({ password: "" });
      toastManager.add({ title: "Backup codes regenerated", type: "success" });
    } catch (error) {
      toastManager.add({
        title: "Couldn't regenerate backup codes",
        description:
          error instanceof Error
            ? error.message
            : "Couldn't reach server. Check your connection and try again.",
        type: "error",
      });
    }
  };

  const copyText = async (text: string, title: string) => {
    await navigator.clipboard.writeText(text);
    toastManager.add({ title, type: "success" });
  };

  const resetTwoFactorDialog = (open: boolean) => {
    dispatchState({ type: "setSetupDialogOpen", open });

    if (!open) {
      verifyForm.reset({ code: "" });
    }
  };

  const submitEnabledAction = (action: "disable" | "regenerate") => {
    dispatchState({ type: "setEnabledAction", value: action });

    void manageEnabledForm
      .handleSubmit(async (data) => {
        if (action === "regenerate") {
          await handleRegenerateBackupCodes(data);
          return;
        }

        await handleDisable(data);
      })()
      .finally(() => {
        dispatchState({ type: "setEnabledAction", value: null });
      });
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Two-factor authentication</CardTitle>
          <CardDescription className="text-sm">
            Add a verification step with an authenticator app to better protect your account.
          </CardDescription>
        </CardHeader>
        <CardPanel className="space-y-4">
          {twoFactorEnabled ? (
            <>
              <div className="border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-900 dark:border-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-100">
                Two-factor authentication is enabled for this account.
              </div>

              <Form {...manageEnabledForm}>
                <form className="space-y-3">
                  <FormField
                    control={manageEnabledForm.control}
                    name="password"
                    render={({ field, fieldState }) => (
                      <FormItem>
                        <Field>
                          <FieldLabel>Current password</FieldLabel>
                          <FormControl>
                            <InputGroup>
                              <InputGroupInput
                                autoComplete="current-password"
                                placeholder="Current password"
                                type={showManagePassword ? "text" : "password"}
                                {...field}
                              />
                              <InputGroupAddon align="inline-end">
                                <InputGroupButton
                                  aria-label={
                                    showManagePassword ? "Hide password" : "Show password"
                                  }
                                  onClick={() =>
                                    dispatchState({ type: "toggleManagePasswordVisibility" })
                                  }
                                >
                                  {showManagePassword ? (
                                    <EyeOffIcon className="size-3.5" />
                                  ) : (
                                    <EyeIcon className="size-3.5" />
                                  )}
                                </InputGroupButton>
                              </InputGroupAddon>
                            </InputGroup>
                          </FormControl>
                          <FieldDescription>
                            Required to regenerate backup codes or disable two-factor
                            authentication.
                          </FieldDescription>
                          <FieldError reserveSpace>{fieldState.error?.message}</FieldError>
                        </Field>
                      </FormItem>
                    )}
                  />

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      loading={
                        manageEnabledForm.formState.isSubmitting && enabledAction === "regenerate"
                      }
                      onClick={() => submitEnabledAction("regenerate")}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <RefreshCwIcon className="size-4" />
                      Regenerate backup codes
                    </Button>
                    <Button
                      loading={
                        manageEnabledForm.formState.isSubmitting && enabledAction === "disable"
                      }
                      onClick={() => submitEnabledAction("disable")}
                      size="sm"
                      type="button"
                      variant="destructive"
                    >
                      Disable 2FA
                    </Button>
                  </div>
                </form>
              </Form>

              {backupCodes.length > 0 ? (
                <Accordion defaultValue={[]}>
                  <AccordionItem
                    className="border bg-muted/40 px-3 last:border-b"
                    value="backup-codes"
                  >
                    <AccordionTrigger className="py-2.5">Backup codes</AccordionTrigger>
                    <AccordionContent className="space-y-2 pb-2.5">
                      <div className="flex justify-end">
                        <Button
                          className="px-0"
                          onClick={() =>
                            void copyText(backupCodes.join("\n"), "Backup codes copied")
                          }
                          size="sm"
                          type="button"
                          variant="link"
                        >
                          <CopyIcon className="size-4" />
                          Copy
                        </Button>
                      </div>
                      <pre className="text-xs break-all whitespace-pre-wrap text-muted-foreground">
                        {backupCodes.join("\n")}
                      </pre>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              ) : null}
            </>
          ) : (
            <Form {...enableForm}>
              <form className="space-y-3" onSubmit={enableForm.handleSubmit(handleEnable)}>
                <FormField
                  control={enableForm.control}
                  name="password"
                  render={({ field, fieldState }) => (
                    <FormItem>
                      <Field>
                        <FieldLabel>Current password</FieldLabel>
                        <FormControl>
                          <InputGroup>
                            <InputGroupInput
                              autoComplete="current-password"
                              placeholder="Current password"
                              type={showEnablePassword ? "text" : "password"}
                              {...field}
                            />
                            <InputGroupAddon align="inline-end">
                              <InputGroupButton
                                aria-label={showEnablePassword ? "Hide password" : "Show password"}
                                onClick={() =>
                                  dispatchState({ type: "toggleEnablePasswordVisibility" })
                                }
                              >
                                {showEnablePassword ? (
                                  <EyeOffIcon className="size-3.5" />
                                ) : (
                                  <EyeIcon className="size-3.5" />
                                )}
                              </InputGroupButton>
                            </InputGroupAddon>
                          </InputGroup>
                        </FormControl>
                        <FieldDescription>
                          Confirm your password before starting setup.
                        </FieldDescription>
                        <FieldError reserveSpace>{fieldState.error?.message}</FieldError>
                      </Field>
                    </FormItem>
                  )}
                />

                <Button loading={enableForm.formState.isSubmitting} size="sm" type="submit">
                  <ShieldCheckIcon className="size-4" />
                  Start setup
                </Button>
              </form>
            </Form>
          )}
        </CardPanel>
      </Card>

      <Dialog onOpenChange={resetTwoFactorDialog} open={setupDialogOpen}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>Set up two-factor authentication</DialogTitle>
            <DialogDescription>
              Scan this code with your authenticator app, then enter the 6-digit verification code.
            </DialogDescription>
          </DialogHeader>
          {totpUri ? (
            <>
              <DialogPanel className="space-y-4">
                <div className="mx-auto w-full max-w-52 border bg-background p-3">
                  <QRCode className="aspect-square w-full" data={totpUri} robustness="H" />
                </div>

                <div className="flex justify-center">
                  <Button
                    className="px-0"
                    onClick={() => void copyText(totpUri, "Setup URI copied")}
                    size="sm"
                    type="button"
                    variant="link"
                  >
                    <CopyIcon className="size-4" />
                    Copy setup URI
                  </Button>
                </div>

                {/* <p className="text-xs break-all text-muted-foreground">{totpUri}</p> */}

                {backupCodes.length > 0 ? (
                  <Accordion defaultValue={[]}>
                    <AccordionItem
                      className="border bg-muted/40 px-3 last:border-b"
                      value="setup-backup-codes"
                    >
                      <AccordionTrigger className="py-2.5">Backup codes</AccordionTrigger>
                      <AccordionContent className="space-y-2 pb-2.5">
                        <div className="flex justify-end">
                          <Button
                            className="px-0"
                            onClick={() =>
                              void copyText(backupCodes.join("\n"), "Backup codes copied")
                            }
                            size="sm"
                            type="button"
                            variant="link"
                          >
                            <CopyIcon className="size-4" />
                            Copy
                          </Button>
                        </div>
                        <pre className="text-xs break-all whitespace-pre-wrap text-muted-foreground">
                          {backupCodes.join("\n")}
                        </pre>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                ) : null}

                <Form {...verifyForm}>
                  <form className="space-y-3" onSubmit={verifyForm.handleSubmit(handleVerify)}>
                    <FormField
                      control={verifyForm.control}
                      name="code"
                      render={({ field, fieldState }) => (
                        <FormItem>
                          <Field>
                            <FieldLabel>Verification code</FieldLabel>
                            <FormControl>
                              <Input
                                autoComplete="one-time-code"
                                inputMode="numeric"
                                placeholder="123456"
                                {...field}
                              />
                            </FormControl>
                            <FieldError reserveSpace>{fieldState.error?.message}</FieldError>
                          </Field>
                        </FormItem>
                      )}
                    />

                    <Button loading={verifyForm.formState.isSubmitting} size="sm" type="submit">
                      Enable 2FA
                    </Button>
                  </form>
                </Form>
              </DialogPanel>
              <DialogFooter>
                <Button onClick={() => resetTwoFactorDialog(false)} type="button" variant="outline">
                  Close
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogPopup>
      </Dialog>
    </>
  );
}

function GoogleIcon() {
  return <GoogleLogo aria-hidden className="size-4" />;
}

function LinkedinOAuthIcon() {
  return <LinkedinLogo aria-hidden className="size-4" colorScheme="brand" />;
}
