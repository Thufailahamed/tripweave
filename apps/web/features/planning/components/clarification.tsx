"use client";
import * as React from "react";
import { defineComponent, useIsStreaming, useTriggerAction } from "@openuidev/react-lang";
import { ArrowRight, Check, CircleHelp } from "lucide-react";
import { ClarificationFormSchema, type PlanningQuestion } from "@tripweave/planning-contract";
import { usePlanningSnapshot } from "../context";
import { EmptyBlock } from "../ui";

const DESCRIPTION = "Interactive form for the open clarification questions computed by the backend. Use only when CONTEXT.questions is not empty. Never invent fields or options.";

type FieldValue = string | boolean;

function initialValue(question: PlanningQuestion): FieldValue {
  if (question.kind === "boolean") return question.currentValue === true;
  if (question.currentValue === null || question.currentValue === undefined) return "";
  return String(question.currentValue);
}

function validate(questions: PlanningQuestion[], values: Record<string, FieldValue>): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const question of questions) {
    const value = values[question.id];
    if (question.kind === "boolean") continue;
    if (question.required && (value === undefined || String(value).trim() === "")) {
      errors[question.id] = "This detail is still needed.";
      continue;
    }
    if (value === undefined || String(value).trim() === "") continue;
    if (question.kind === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
      errors[question.id] = "Choose a valid calendar date.";
    }
    if (question.kind === "number") {
      const number = Number(value);
      if (!Number.isFinite(number) || (question.min !== undefined && number < question.min) || (question.max !== undefined && number > question.max)) {
        errors[question.id] = `Enter a number between ${question.min ?? 0} and ${question.max ?? "the allowed maximum"}.`;
      }
    }
    if (question.kind === "select" && question.options && !question.options.some((option) => option.value === value)) {
      errors[question.id] = "Choose one of the listed options.";
    }
    if (question.id === "child_ages") {
      const ages = String(value)
        .split(",")
        .map((part) => Number(part.trim()))
        .filter((age) => Number.isInteger(age) && age >= 0 && age <= 17);
      if (ages.length === 0) errors[question.id] = "Enter ages separated by commas.";
    }
  }
  return errors;
}

export const ClarificationForm = defineComponent({
  name: "ClarificationForm",
  description: DESCRIPTION,
  props: ClarificationFormSchema,
  component: function ClarificationFormView({ props }) {
    const snapshot = usePlanningSnapshot();
    const questions = snapshot.questions;
    const triggerAction = useTriggerAction();
    const streaming = useIsStreaming();
    const canWrite = snapshot.permissions.canWriteTrips;
    const signature = questions.map((question) => `${question.id}:${String(question.currentValue)}`).join("|");
    const [values, setValues] = React.useState<Record<string, FieldValue>>(() => Object.fromEntries(questions.map((question) => [question.id, initialValue(question)])));
    const [errors, setErrors] = React.useState<Record<string, string>>({});
    const [sent, setSent] = React.useState(false);
    const formId = React.useId();

    React.useEffect(() => {
      setValues(Object.fromEntries(questions.map((question) => [question.id, initialValue(question)])));
      setErrors({});
      setSent(false);
      // The signature is the stable reset trigger when the server answers or changes the questions.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [signature]);

    React.useEffect(() => {
      if (!sent) return;
      const timer = setTimeout(() => setSent(false), 4_000);
      return () => clearTimeout(timer);
    }, [sent]);

    if (questions.length === 0) return <EmptyBlock>No clarification questions are open. The saved requirements are complete enough for the next step.</EmptyBlock>;

    const answered = questions.filter((question) => {
      const value = values[question.id];
      return question.kind === "boolean" ? value === true : String(value ?? "").trim() !== "";
    }).length;
    const progress = Math.round((answered / questions.length) * 100);

    const submit = (event: React.FormEvent) => {
      event.preventDefault();
      if (!canWrite || streaming) return;
      const nextErrors = validate(questions, values);
      setErrors(nextErrors);
      if (Object.keys(nextErrors).length > 0) return;
      const answers = questions.map((question) => {
        const value = values[question.id];
        if (question.kind === "boolean") return { questionId: question.id, value: value === true };
        if (question.kind === "number") return { questionId: question.id, value: Number(value) };
        return { questionId: question.id, value: String(value ?? "").trim() };
      });
      setSent(true);
      void triggerAction("Apply clarification answers", undefined, { type: "apply_clarification", params: { answers } });
    };

    return (
      <section aria-label="Clarification questions" className="pl-card overflow-hidden">
        <div className="p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="pl-eyebrow">
                <CircleHelp className="size-3" aria-hidden /> A few details
              </p>
              <h3 className="pl-display mt-1 text-[1.9rem] leading-none">Help us finish the plan</h3>
            </div>
            <span className={`pl-chip ${answered === questions.length ? "pl-chip-sage" : ""}`}>
              {answered === questions.length ? <Check className="size-3" aria-hidden /> : <CircleHelp className="size-3" aria-hidden />} {answered}/{questions.length} answered
            </span>
          </div>
          <p className="pl-hand mt-1.5">{props.prompt ?? "only what the backend still needs"}</p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--pl-surface-2)] ring-1 ring-inset ring-[var(--pl-line)]" aria-hidden>
            <span className="pl-bar block h-full rounded-full bg-[var(--pl-accent)]" style={{ width: `${Math.max(4, progress)}%` }} />
          </div>

          {!canWrite ? <p className="mt-3 rounded-xl bg-[var(--pl-accent-soft)] px-3 py-2 text-[11px] text-[var(--pl-accent)]">You can view this trip but you do not have permission to change its requirements.</p> : null}
          {streaming ? <p role="status" className="mt-2 text-[11px] text-[var(--pl-muted)]">The assistant is still composing this reply. The form is available when it finishes.</p> : null}

          <form id={formId} noValidate onSubmit={submit} className="mt-4 flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {questions.map((question) => {
                const id = `${formId}-${question.id}`;
                const value = values[question.id] ?? "";
                const error = errors[question.id];
                if (question.kind === "boolean") {
                  return (
                    <div key={question.id} className="sm:col-span-2">
                      <label htmlFor={id} className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-[var(--pl-line)] bg-[var(--pl-surface)] px-3 py-2.5">
                        <input
                          id={id}
                          type="checkbox"
                          checked={value === true}
                          disabled={!canWrite || streaming}
                          onChange={(event) => setValues((current) => ({ ...current, [question.id]: event.target.checked }))}
                          className="mt-0.5 size-4 rounded border-[var(--pl-line)] accent-[var(--pl-accent)]"
                        />
                        <span>
                          <span className="block text-[12.5px] font-semibold">{question.label}</span>
                          {question.help ? <span className="mt-0.5 block text-[11px] text-[var(--pl-muted)]">{question.help}</span> : null}
                        </span>
                      </label>
                    </div>
                  );
                }
                return (
                  <div key={question.id} className="flex flex-col gap-1">
                    <label htmlFor={id} className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--pl-muted)]">
                      {question.label}
                      {question.required ? <span className="text-[var(--pl-accent)]"> *</span> : null}
                    </label>
                    {question.kind === "select" ? (
                      <select id={id} value={String(value)} disabled={!canWrite || streaming} aria-invalid={!!error} onChange={(event) => setValues((current) => ({ ...current, [question.id]: event.target.value }))} className="pl-input">
                        <option value="">Choose…</option>
                        {question.options?.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        id={id}
                        type={question.kind === "date" ? "date" : question.kind === "number" ? "number" : "text"}
                        inputMode={question.kind === "number" ? "numeric" : undefined}
                        min={question.kind === "number" ? question.min : undefined}
                        max={question.kind === "number" ? question.max : undefined}
                        value={String(value)}
                        disabled={!canWrite || streaming}
                        aria-invalid={!!error}
                        placeholder={question.id === "child_ages" ? "8, 11" : undefined}
                        onChange={(event) => setValues((current) => ({ ...current, [question.id]: event.target.value }))}
                        className="pl-input"
                      />
                    )}
                    {question.help && !error ? <p className="text-[10px] text-[var(--pl-muted)]">{question.help}</p> : null}
                    {error ? (
                      <p role="alert" className="text-[10px] font-semibold text-[var(--pl-accent)]">
                        {error}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
            {sent ? (
              <p role="status" className="text-[11px] text-[var(--pl-sage)]">
                Answers sent. The assistant is applying them through the server.
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <button type="submit" disabled={!canWrite || streaming || sent} className="pl-btn pl-btn-accent disabled:cursor-not-allowed disabled:opacity-50">
                {sent ? "Sending…" : "Apply answers"} <ArrowRight className="size-3.5" aria-hidden />
              </button>
              <span className="text-[10px] text-[var(--pl-muted)]">Validated by the API. Prices and availability are not changed by this form.</span>
            </div>
          </form>
        </div>
      </section>
    );
  },
});
