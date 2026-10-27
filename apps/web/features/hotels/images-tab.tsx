"use client";
import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, ImageIcon, Link2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/form";
import { ConfirmDialog } from "@/components/ui/overlay";
import { apiDelete, apiPost, apiPut, errorMessage } from "@/lib/api";
import { mediaUrl } from "./hotel-card";
import { apiFieldErrors } from "./lib";
import type { HotelImage } from "./types";

const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp"];

function UploadCard({ propertyId, onDone }: { propertyId: string; onDone: () => void }) {
  const [file, setFile] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [alt, setAlt] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const input = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Choose an image first.");
      const form = new FormData();
      form.append("file", file);
      form.append("altText", alt.trim());
      return apiPost(`/hotels/${propertyId}/images`, form);
    },
    onSuccess: () => {
      toast.success("Image uploaded");
      setFile(null);
      setAlt("");
      setError(null);
      if (input.current) input.current.value = "";
      onDone();
    },
    onError: (e) => setError(errorMessage(e)),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="size-4" aria-hidden /> Upload an image
        </CardTitle>
        <CardDescription>JPEG, PNG or WebP, up to 5 MB. Only upload photos you own or are licensed to use.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <Field label="Image file" htmlFor="img-file">
          <Input
            id="img-file"
            ref={input}
            type="file"
            accept={TYPES.join(",")}
            className="h-auto py-1.5"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setError(null);
              if (f && !TYPES.includes(f.type)) {
                setError("Only JPEG, PNG or WebP images are allowed.");
                e.target.value = "";
                return setFile(null);
              }
              if (f && f.size > MAX_BYTES) {
                setError("Images must be 5 MB or smaller.");
                e.target.value = "";
                return setFile(null);
              }
              setFile(f);
            }}
          />
        </Field>
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Preview of the selected file" className="max-h-52 w-auto rounded-md border border-border object-contain" />
        ) : null}
        <Field label="Alt text" htmlFor="img-alt" hint="Describe the photo for screen readers and quotation PDFs.">
          <Input id="img-alt" maxLength={200} value={alt} onChange={(e) => setAlt(e.target.value)} />
        </Field>
        <div className="flex justify-end">
          <Button loading={upload.isPending} disabled={!file} onClick={() => upload.mutate()}>
            <Upload /> Upload
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function UrlCard({ propertyId, onDone }: { propertyId: string; onDone: () => void }) {
  const [url, setUrl] = React.useState("");
  const [alt, setAlt] = React.useState("");
  const [rights, setRights] = React.useState(false);
  const [source, setSource] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);

  const add = useMutation({
    mutationFn: async () => {
      const errs: Record<string, string> = {};
      if (!/^https:\/\/\S+$/.test(url.trim())) errs.sourceUrl = "Use a full https:// image URL";
      if (!rights) errs.rights = "Confirm you have the right to use this image";
      if (Object.keys(errs).length) {
        setErrors(errs);
        throw new Error("Please fix the highlighted fields.");
      }
      setErrors({});
      return apiPost(`/hotels/${propertyId}/images`, { sourceUrl: url.trim(), altText: alt.trim(), usageRights: { confirmedByUser: true, source: source.trim() || undefined } });
    },
    onSuccess: () => {
      toast.success("Image added");
      setUrl("");
      setAlt("");
      setSource("");
      setRights(false);
      setError(null);
      onDone();
    },
    onError: (e) => {
      setErrors((s) => ({ ...s, ...apiFieldErrors(e) }));
      setError(errorMessage(e));
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="size-4" aria-hidden /> Add by link
        </CardTitle>
        <CardDescription>The image stays on the other site; we only store the link. Make sure you are permitted to display it.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <Field label="Image URL (https)" htmlFor="img-url" error={errors.sourceUrl} required>
          <Input id="img-url" type="url" placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} aria-invalid={!!errors.sourceUrl} />
        </Field>
        <Field label="Alt text" htmlFor="img-url-alt">
          <Input id="img-url-alt" maxLength={200} value={alt} onChange={(e) => setAlt(e.target.value)} />
        </Field>
        <Field label="Credit / licence (optional)" htmlFor="img-url-src" hint="Photographer, website or licence name, recorded as usage-rights information.">
          <Textarea id="img-url-src" rows={2} value={source} onChange={(e) => setSource(e.target.value)} />
        </Field>
        <div>
          <Checkbox label="I confirm I have the right to use this image in quotations and partner sharing." checked={rights} onChange={(e) => setRights(e.target.checked)} />
          {errors.rights ? (
            <p role="alert" className="mt-1 text-xs font-medium text-destructive">
              {errors.rights}
            </p>
          ) : null}
        </div>
        <div className="flex justify-end">
          <Button loading={add.isPending} onClick={() => add.mutate()}>
            <Link2 /> Add image
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function ImagesTab({ propertyId, images, canEdit }: { propertyId: string; images: HotelImage[]; canEdit: boolean }) {
  const qc = useQueryClient();
  const [deleting, setDeleting] = React.useState<HotelImage | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["hotel", propertyId] });
  const del = useMutation({
    mutationFn: (i: HotelImage) => apiDelete(`/hotels/${propertyId}/images/${i.id}`),
    onSuccess: async () => {
      await refresh();
      toast.success("Image removed");
      setDeleting(null);
    },
    onError: (e) => {
      toast.error(errorMessage(e));
      setDeleting(null);
    },
  });
  const sorted = [...images].sort((a, b) => a.displayOrder - b.displayOrder);
  const move = useMutation({
    mutationFn: ({ from, to }: { from: number; to: number }) => {
      const ids = sorted.map((i) => i.id);
      const [moved] = ids.splice(from, 1);
      ids.splice(to, 0, moved!);
      return apiPut(`/hotels/${propertyId}/images/order`, { imageIds: ids });
    },
    onSuccess: () => refresh(),
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div className="flex flex-col gap-5">
      {sorted.length === 0 ? (
        <EmptyState icon={ImageIcon} title="No images yet" description={canEdit ? "Upload photos or add links below. The first image is used as the cover in the catalogue." : "The owner has not added any images."} />
      ) : (
        <>
          <p className="text-xs text-muted-foreground">Images are shown in the order below. The first one is the catalogue cover.</p>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sorted.map((img, i) => (
              <li key={img.id}>
                <Card className="overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={mediaUrl(img.id)} alt={img.altText || `Image ${i + 1}`} loading="lazy" className="h-44 w-full object-cover" />
                  <div className="flex items-center justify-between gap-2 p-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap gap-1">
                        <Badge tone={i === 0 ? "accent" : "neutral"}>{i === 0 ? "Cover" : `#${i + 1}`}</Badge>
                        <Badge tone="outline">{img.imageSource === "upload" ? "Uploaded" : "Linked"}</Badge>
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">{img.altText || "No alt text"}</p>
                    </div>
                    {canEdit ? (
                      <div className="flex shrink-0 gap-1">
                        <Button size="icon" variant="outline" aria-label={`Move image ${i + 1} earlier`} disabled={i === 0 || move.isPending} onClick={() => move.mutate({ from: i, to: i - 1 })}>
                          <ArrowLeft />
                        </Button>
                        <Button size="icon" variant="outline" aria-label={`Move image ${i + 1} later`} disabled={i === sorted.length - 1 || move.isPending} onClick={() => move.mutate({ from: i, to: i + 1 })}>
                          <ArrowRight />
                        </Button>
                        <Button size="icon" variant="outline" aria-label={`Delete image ${i + 1}`} onClick={() => setDeleting(img)}>
                          <Trash2 />
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}
      {canEdit ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <UploadCard propertyId={propertyId} onDone={refresh} />
          <UrlCard propertyId={propertyId} onDone={refresh} />
        </div>
      ) : null}
      <ConfirmDialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)} title="Delete this image?" description="It will be removed from the property. Uploaded files are deleted from storage." confirmLabel="Delete" destructive loading={del.isPending} onConfirm={() => deleting && del.mutate(deleting)} />
    </div>
  );
}
