"use client";
import * as React from "react";
import { useParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { NotebookPen, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { TravelerNote } from "@tripweave/shared";
import { Alert, LoadingBlock } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";
import { ConfirmDialog } from "@/components/ui/overlay";
import { apiDelete, apiPatch, apiPost, errorMessage } from "@/lib/api";
import { relativeTime } from "@/lib/utils";
import { travelKeys, useTripNotes } from "./hooks";

export function TravelNotesPanel() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const notesQuery = useTripNotes(id);
  const [body, setBody] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<string | null>(null);
  const [editBody, setEditBody] = React.useState("");
  const [deleteTarget, setDeleteTarget] = React.useState<TravelerNote | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  if (notesQuery.isLoading) return <LoadingBlock label="Loading your notes" />;
  const notes = notesQuery.data?.items ?? [];

  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!body.trim()) return setError("Write something first.");
    setAdding(true);
    try {
      await apiPost(`/traveler/trips/${id}/notes`, { body: body.trim() });
      qc.invalidateQueries({ queryKey: travelKeys.notes(id) });
      setBody("");
      toast.success("Note saved");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setAdding(false);
    }
  };

  const saveEdit = async (note: TravelerNote) => {
    if (!editBody.trim()) return setError("Write something first.");
    try {
      await apiPatch(`/traveler/trips/${id}/notes/${note.id}`, { body: editBody.trim() });
      qc.invalidateQueries({ queryKey: travelKeys.notes(id) });
      setEditing(null);
      toast.success("Note updated");
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiDelete(`/traveler/trips/${id}/notes/${deleteTarget.id}`);
      qc.invalidateQueries({ queryKey: travelKeys.notes(id) });
      toast.success("Note removed");
      setDeleteTarget(null);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="tw-travel-eyebrow">Notes</p>
        <h2 className="tw-travel-display mt-2 text-4xl leading-none tracking-[-0.04em]">The things you will forget.</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">A train time, a restaurant, the name of the guesthouse. Private to your trip, and kept out of the shared link.</p>
      </header>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <form onSubmit={add} className="tw-travel-card flex flex-col gap-3 p-5">
        <Textarea value={body} rows={3} maxLength={4_000} onChange={(event) => setBody(event.target.value)} placeholder="The 9:45 train from Kandy is the one with the open windows." aria-label="New note" />
        <Button type="submit" className="self-start" loading={adding}><Plus className="size-4" /> Save note</Button>
      </form>

      {notes.length === 0 ? (
        <section className="tw-travel-card flex flex-col items-start gap-3 p-6">
          <span className="grid size-10 place-items-center rounded-full bg-accent-soft text-accent"><NotebookPen className="size-4" /></span>
          <p className="text-sm font-semibold">No notes yet.</p>
          <p className="max-w-md text-sm text-muted-foreground">Use this for the small things that do not belong in the day-by-day plan.</p>
        </section>
      ) : (
        <ol className="flex flex-col gap-3">
          {notes.map((note) => (
            <li key={note.id} className="tw-travel-card p-5">
              {editing === note.id ? (
                <div className="flex flex-col gap-3">
                  <Textarea value={editBody} rows={4} maxLength={4_000} onChange={(event) => setEditBody(event.target.value)} aria-label="Edit note" />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => void saveEdit(note)}>Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/85">{note.body}</p>
                    <div className="flex shrink-0 gap-1">
                      <Button type="button" size="icon" variant="ghost" aria-label="Edit note" onClick={() => { setEditing(note.id); setEditBody(note.body); }}><Pencil className="size-3.5" /></Button>
                      <Button type="button" size="icon" variant="ghost" aria-label="Delete note" onClick={() => setDeleteTarget(note)}><Trash2 className="size-3.5" /></Button>
                    </div>
                  </div>
                  <p className="mt-3 text-[11px] text-muted-foreground">{relativeTime(note.createdAt)}{note.updatedAt !== note.createdAt ? ` · edited ${relativeTime(note.updatedAt)}` : ""}</p>
                </>
              )}
            </li>
          ))}
        </ol>
      )}

      <ConfirmDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)} title="Delete this note?" description="This cannot be undone." confirmLabel="Delete" destructive loading={deleting} onConfirm={() => void remove()} />
    </div>
  );
}
