"use client";
import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, KeyRound, Mail, Save, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { TRAVELER_PACE_LABELS, TRAVELER_PACES, type TravelerPace } from "@tripweave/shared";
import { Alert, LoadingBlock } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { TagInput } from "@/features/trips/tag-input";
import { apiPatch, apiPost, errorMessage } from "@/lib/api";
import { useRefreshSession } from "@/lib/session";
import { TRAVELER_COUNTRIES } from "./countries";
import { travelKeys, useTravelerProfile, type TravelerProfileResponse } from "./hooks";

const INTEREST_SUGGESTIONS = ["food", "hiking", "beaches", "temples", "wildlife", "trains", "museums", "markets", "photography", "diving", "tea", "slow mornings"];

export function TravelProfilePanel() {
  const qc = useQueryClient();
  const profileQuery = useTravelerProfile();
  const refreshSession = useRefreshSession();
  const [displayName, setDisplayName] = React.useState("");
  const [homeCity, setHomeCity] = React.useState("");
  const [country, setCountry] = React.useState("LK");
  const [currency, setCurrency] = React.useState("USD");
  const [pace, setPace] = React.useState<TravelerPace>("balanced");
  const [interests, setInterests] = React.useState<string[]>([]);
  const [dietary, setDietary] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [resending, setResending] = React.useState(false);
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [passwordBusy, setPasswordBusy] = React.useState(false);

  React.useEffect(() => {
    if (!profileQuery.data) return;
    const profile = profileQuery.data.profile;
    setDisplayName(profileQuery.data.user.displayName);
    setHomeCity(profile.homeCity);
    setCountry(profile.country);
    setCurrency(profile.currency);
    setPace(profile.pace);
    setInterests(profile.interests);
    setDietary(profile.dietary);
    setNotes(profile.notes);
  }, [profileQuery.data]);

  if (profileQuery.isLoading) return <LoadingBlock label="Loading your profile" />;
  if (!profileQuery.data) return null;
  const { user, profile } = profileQuery.data;

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await apiPatch<TravelerProfileResponse>("/traveler/profile", { displayName, homeCity, country, currency, pace, interests, dietary, notes });
      qc.invalidateQueries({ queryKey: travelKeys.profile });
      qc.invalidateQueries({ queryKey: travelKeys.trips });
      refreshSession();
      toast.success("Profile updated");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const resendVerification = async () => {
    setResending(true);
    try {
      await apiPost("/auth/resend-verification", {});
      toast.success("Verification email sent");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setResending(false);
    }
  };

  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (newPassword !== confirmPassword) return toast.error("The new passwords do not match.");
    setPasswordBusy(true);
    try {
      await apiPost("/auth/change-password", { currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Password changed");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setPasswordBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="tw-travel-eyebrow">Profile</p>
        <h2 className="tw-travel-display mt-2 text-4xl leading-none tracking-[-0.04em]">A little about you.</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">These details feed the planner and the default currency on new trips. They are never shown on a shared trip link.</p>
      </header>

      {error ? <Alert tone="danger">{error}</Alert> : null}
      {!user.emailVerified ? (
        <Alert tone="warning" title="Your email is not verified yet">
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span>Verify {user.email} so you can recover the account later.</span>
            <Button size="sm" variant="outline" loading={resending} onClick={() => void resendVerification()}>Resend verification</Button>
          </div>
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-start">
        <form onSubmit={save} className="tw-travel-card flex flex-col gap-5 p-5 md:p-6">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-full bg-accent-soft text-accent"><BadgeCheck className="size-5" /></span>
            <div>
              <h3 className="text-base font-semibold">Traveller details</h3>
              <p className="text-xs text-muted-foreground">Used to personalise the planner, not shared.</p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Display name" htmlFor="profile-name" required><Input id="profile-name" value={displayName} maxLength={120} onChange={(event) => setDisplayName(event.target.value)} /></Field>
            <Field label="Home city" htmlFor="profile-city"><Input id="profile-city" value={homeCity} maxLength={80} onChange={(event) => setHomeCity(event.target.value)} /></Field>
            <Field label="Country" htmlFor="profile-country"><Select id="profile-country" value={country} onChange={(event) => setCountry(event.target.value)}>{TRAVELER_COUNTRIES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</Select></Field>
            <Field label="Default currency" htmlFor="profile-currency"><Select id="profile-currency" value={currency} onChange={(event) => setCurrency(event.target.value)}>{["USD", "EUR", "GBP", "LKR"].map((value) => <option key={value}>{value}</option>)}</Select></Field>
            <Field label="Travel pace" htmlFor="profile-pace"><Select id="profile-pace" value={pace} onChange={(event) => setPace(event.target.value as TravelerPace)}>{TRAVELER_PACES.map((value) => <option key={value} value={value}>{TRAVELER_PACE_LABELS[value]}</option>)}</Select></Field>
            <Field label="Email" htmlFor="profile-email"><Input id="profile-email" value={user.email} disabled /></Field>
          </div>
          <TagInput id="profile-interests" label="Interests" value={interests} onChange={setInterests} placeholder="e.g. food, trains" suggestions={INTEREST_SUGGESTIONS} maxLength={60} />
          <Field label="Dietary needs" htmlFor="profile-dietary" hint="Optional"><Input id="profile-dietary" value={dietary} maxLength={300} onChange={(event) => setDietary(event.target.value)} placeholder="Vegetarian, no nuts…" /></Field>
          <Field label="Anything else the planner should know?" htmlFor="profile-notes" hint="Optional"><Textarea id="profile-notes" rows={3} maxLength={1_000} value={notes} onChange={(event) => setNotes(event.target.value)} /></Field>
          <Button type="submit" className="self-start" loading={saving}><Save className="size-4" /> Save profile</Button>
        </form>

        <div className="flex flex-col gap-4">
          <section className="tw-travel-card p-5">
            <div className="flex items-center gap-2 text-sm font-semibold"><Mail className="size-4 text-accent" /> Account</div>
            <p className="mt-3 text-sm">{user.email}</p>
            <p className="mt-1 text-xs text-muted-foreground">{user.emailVerified ? "Email verified" : "Verification pending"} · personal workspace</p>
            {profile.currency ? <p className="mt-3 text-xs text-muted-foreground">Future trips default to {profile.currency}.</p> : null}
          </section>

          <form onSubmit={changePassword} className="tw-travel-card flex flex-col gap-3 p-5">
            <div className="flex items-center gap-2 text-sm font-semibold"><KeyRound className="size-4 text-accent" /> Change password</div>
            <Field label="Current password" htmlFor="current-password"><Input id="current-password" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></Field>
            <Field label="New password" htmlFor="new-password" hint="10+ characters, letters and numbers."><Input id="new-password" type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></Field>
            <Field label="Confirm new password" htmlFor="confirm-password"><Input id="confirm-password" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></Field>
            <Button type="submit" variant="outline" loading={passwordBusy} disabled={!currentPassword || newPassword.length < 10}>Update password</Button>
          </form>

          <section className="tw-travel-card p-5 text-xs leading-relaxed text-muted-foreground">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground"><ShieldCheck className="size-4 text-accent" /> Privacy</div>
            <p className="mt-2">Your trips, notes, packing list and budget are private. A share link only shows the route, dates and — if you choose — a budget summary. Notes and packing are never included.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
