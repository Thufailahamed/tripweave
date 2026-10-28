"use client";
import * as React from "react";
import { defineComponent } from "@openuidev/react-lang";
import { PACKAGE_PROP_SCHEMAS, packageShowcaseDescriptions } from "@tripweave/planning-contract";
import { Alert } from "@/components/ui/card";

export const PackageShowcase = defineComponent({
  name: "PackageShowcase",
  description: packageShowcaseDescriptions.PackageShowcase,
  props: PACKAGE_PROP_SCHEMAS.PackageShowcase,
  component: function PackageShowcaseView({ props, renderNode }) {
    const id = React.useId();
    return (
      <section aria-labelledby={id} className="flex min-w-0 flex-col gap-6">
        <header className="flex min-w-0 max-w-3xl flex-col gap-2">
          <h2 id={id} className="font-display text-[26px] font-semibold leading-tight tracking-[-0.04em] md:text-[34px]">
            {props.title}
          </h2>
          {props.subtitle ? <p className="text-sm leading-relaxed text-muted-foreground">{props.subtitle}</p> : null}
          {props.note ? <p className="text-sm italic text-accent">{props.note}</p> : null}
        </header>
        <div className="grid min-w-0 gap-6 [&>*]:min-w-0">{renderNode(props.blocks)}</div>
      </section>
    );
  },
});

export const Lead = defineComponent({
  name: "Lead",
  description: packageShowcaseDescriptions.Lead,
  props: PACKAGE_PROP_SCHEMAS.Lead,
  component: function LeadView({ props }) {
    return <p className="max-w-3xl text-[15px] leading-relaxed text-foreground/85">{props.text}</p>;
  },
});

const NOTE_TONE = { info: "info", tip: "success", caution: "warning" } as const;

export const Note = defineComponent({
  name: "Note",
  description: packageShowcaseDescriptions.Note,
  props: PACKAGE_PROP_SCHEMAS.Note,
  component: function NoteView({ props }) {
    return (
      <Alert tone={NOTE_TONE[props.tone]} title={props.title}>
        {props.body ?? null}
      </Alert>
    );
  },
});
