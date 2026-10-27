"use client";
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Download, ShieldCheck } from "lucide-react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, LoadingBlock } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { apiGet, apiPost, errorMessage } from "@/lib/api";
import { SESSION_KEY } from "@/lib/session";

interface MfaStatus {
  available: boolean;
  enabled: boolean;
  recoveryCodesRemaining: number;
}
interface Setup {
  secret: string;
  otpauthUri: string;
}

const STATUS_KEY = ["mfa-status"] as const;

function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const text = codes.join("\n");
  const download = () => {
    const url = URL.createObjectURL(new Blob([`TripWeave recovery codes\nEach code can be used once.\n\n${text}\n`], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "tripweave-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="flex flex-col gap-4">
      <Alert tone="warning" title="Save these recovery codes now">
        They are shown only once. If you lose your phone, each code lets you sign in once. Store them somewhere safe, like a password manager.
      </Alert>
      <ul className="grid max-w-md grid-cols-2 gap-x-6 gap-y-1 rounded-md border border-border bg-muted/40 p-4 font-mono text-sm" aria-label="Recovery codes">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigator.clipboard?.writeText(text).then(() => toast.success("Codes copied"), () => toast.error("Could not copy; select the codes manually"))}
        >
          <Copy /> Copy
        </Button>
        <Button variant="outline" size="sm" onClick={download}>
          <Download /> Download
        </Button>
        <Button size="sm" onClick={onDone}>
          I have saved them
        </Button>
      </div>
    </div>
  );
}

function Enrol({ onFinished }: { onFinished: (codes: string[]) => void }) {
  const [setup, setSetup] = React.useState<Setup | null>(null);
  const [qr, setQr] = React.useState<string | null>(null);
  const [code, setCode] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const start = useMutation({
    mutationFn: () => apiPost<Setup>("/auth/mfa/setup"),
    onSuccess: async (s) => {
      setSetup(s);
      setError(null);
      setQr(await QRCode.toDataURL(s.otpauthUri, { margin: 1, width: 192 }));
    },
    onError: (e) => setError(errorMessage(e)),
  });
  const enable = useMutation({
    mutationFn: () => apiPost<{ recoveryCodes: string[] }>("/auth/mfa/enable", { code: code.replace(/\s/g, "") }),
    onSuccess: (r) => onFinished(r.recoveryCodes),
    onError: (e) => setError(errorMessage(e)),
  });

  if (!setup) {
    return (
      <div className="flex flex-col gap-3">
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <div>
          <Button loading={start.isPending} onClick={() => start.mutate()}>
            <ShieldCheck /> Set up two-step verification
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex max-w-md flex-col gap-4">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <ol className="list-decimal space-y-3 pl-5 text-sm">
        <li>
          Open an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password, Authy…) and scan this code.
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="QR code for your authenticator app" width={192} height={192} className="mt-2 rounded-md border border-border bg-white" />
          ) : null}
          <p className="mt-2 text-xs text-muted-foreground">
            Cannot scan? Enter this key manually: <code className="select-all break-all font-mono text-foreground">{setup.secret}</code>
          </p>
        </li>
        <li>Enter the 6-digit code the app shows to confirm.</li>
      </ol>
      <Field label="Authentication code" htmlFor="mfa-enable-code">
        <Input id="mfa-enable-code" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" placeholder="123456" maxLength={7} />
      </Field>
      <div>
        <Button loading={enable.isPending} disabled={code.replace(/\s/g, "").length !== 6} onClick={() => enable.mutate()}>
          Turn on two-step verification
        </Button>
      </div>
    </div>
  );
}

/** Password plus a current code (or recovery code) is required before MFA can be changed. */
function Reauth({ action, label, destructive, onSuccess }: { action: "disable" | "recovery-codes"; label: string; destructive?: boolean; onSuccess: (r: { recoveryCodes?: string[] }) => void }) {
  const [password, setPassword] = React.useState("");
  const [factor, setFactor] = React.useState("");
  const [recovery, setRecovery] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const run = useMutation({
    mutationFn: () => apiPost<{ recoveryCodes?: string[] }>(`/auth/mfa/${action}`, { password, ...(recovery ? { recoveryCode: factor.trim() } : { code: factor.replace(/\s/g, "") }) }),
    onSuccess: (r) => {
      setPassword("");
      setFactor("");
      onSuccess(r);
    },
    onError: (e) => setError(errorMessage(e)),
  });
  return (
    <div className="flex max-w-sm flex-col gap-3">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Field label="Current password" htmlFor={`mfa-${action}-pw`}>
        <Input id={`mfa-${action}-pw`} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <Field label={recovery ? "Recovery code" : "Authentication code"} htmlFor={`mfa-${action}-code`}>
        <Input id={`mfa-${action}-code`} value={factor} onChange={(e) => setFactor(e.target.value)} autoComplete="one-time-code" inputMode={recovery ? "text" : "numeric"} maxLength={recovery ? 16 : 7} />
      </Field>
      <button
        type="button"
        className="self-start text-xs font-semibold text-primary hover:underline"
        onClick={() => {
          setRecovery((v) => !v);
          setFactor("");
        }}
      >
        {recovery ? "Use authenticator code instead" : "Use a recovery code instead"}
      </button>
      <div>
        <Button variant={destructive ? "destructive" : "outline"} loading={run.isPending} disabled={!password || factor.trim().length < 6} onClick={() => run.mutate()}>
          {label}
        </Button>
      </div>
    </div>
  );
}

export function MfaCard() {
  const qc = useQueryClient();
  const status = useQuery({ queryKey: STATUS_KEY, queryFn: () => apiGet<MfaStatus>("/auth/mfa") });
  const [codes, setCodes] = React.useState<string[] | null>(null);
  const [panel, setPanel] = React.useState<"disable" | "codes" | null>(null);
  const refresh = async () => {
    await Promise.all([qc.invalidateQueries({ queryKey: STATUS_KEY }), qc.invalidateQueries({ queryKey: SESSION_KEY })]);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Two-step verification
          {status.data ? <Badge tone={status.data.enabled ? "success" : "neutral"}>{status.data.enabled ? "On" : "Off"}</Badge> : null}
        </CardTitle>
        <CardDescription>Require a code from an authenticator app in addition to your password when you sign in.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {status.isLoading ? <LoadingBlock rows={2} /> : null}
        {status.isError ? <Alert tone="danger">{errorMessage(status.error)}</Alert> : null}
        {status.data && !status.data.available ? <Alert tone="info">Two-step verification has not been enabled on this platform yet. Ask your administrator to configure it.</Alert> : null}

        {codes ? (
          <RecoveryCodes
            codes={codes}
            onDone={async () => {
              setCodes(null);
              setPanel(null);
              await refresh();
            }}
          />
        ) : status.data?.available && !status.data.enabled ? (
          <Enrol
            onFinished={(c) => {
              setCodes(c);
              toast.success("Two-step verification is on");
            }}
          />
        ) : status.data?.enabled ? (
          <>
            <p className="text-sm text-muted-foreground">
              You have <strong className="text-foreground">{status.data.recoveryCodesRemaining}</strong> unused recovery code{status.data.recoveryCodesRemaining === 1 ? "" : "s"}.
              {status.data.recoveryCodesRemaining <= 2 ? " Generate a new set soon." : ""}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setPanel(panel === "codes" ? null : "codes")}>
                New recovery codes
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPanel(panel === "disable" ? null : "disable")}>
                Turn off
              </Button>
            </div>
            {panel === "codes" ? (
              <Reauth
                action="recovery-codes"
                label="Generate new codes"
                onSuccess={(r) => {
                  setCodes(r.recoveryCodes ?? []);
                  toast.success("New recovery codes generated. The old ones no longer work.");
                }}
              />
            ) : null}
            {panel === "disable" ? (
              <Reauth
                action="disable"
                label="Turn off two-step verification"
                destructive
                onSuccess={async () => {
                  setPanel(null);
                  toast.success("Two-step verification is off");
                  await refresh();
                }}
              />
            ) : null}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
