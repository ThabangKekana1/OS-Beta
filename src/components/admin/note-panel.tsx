"use client";

import { useState } from "react";
import { createNote } from "@/actions/note-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface NoteData {
  id: string;
  noteType: string;
  body: string;
  createdAt: Date;
  author: { firstName: string; lastName: string; role: string };
}

export function NotePanel({
  dealPipelineId,
  businessId,
  notes,
}: {
  dealPipelineId?: string;
  businessId: string;
  notes: NoteData[];
}) {
  const [body, setBody] = useState("");
  const [noteType, setNoteType] = useState("INTERNAL");
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!body.trim()) return;
    setLoading(true);

    const formData = new FormData();
    formData.set("body", body);
    formData.set("noteType", noteType);
    formData.set("businessId", businessId);
    if (dealPipelineId) formData.set("dealPipelineId", dealPipelineId);

    const result = await createNote(formData);
    setLoading(false);

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Note added");
      setBody("");
    }
  }

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Notes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          <div className="flex gap-2">
            <Select value={noteType} onValueChange={(v) => v && setNoteType(v)}>
              <SelectTrigger className="h-8 w-40 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="INTERNAL" className="text-xs">Internal</SelectItem>
                <SelectItem value="CUSTOMER_VISIBLE" className="text-xs">Customer Visible</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Add a note..."
            className="h-20 resize-none text-xs"
          />
          <Button onClick={handleSubmit} disabled={!body.trim() || loading} size="sm" className="text-xs">
            {loading ? "Saving..." : "Add Note"}
          </Button>
        </div>

        {notes.length > 0 && (
          <div className="space-y-2 border-t border-border pt-4">
            {notes.map((note) => (
              <div key={note.id} className="rounded-md border border-border p-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium">{note.author.firstName} {note.author.lastName}</span>
                  <Badge variant="outline" className="text-[9px]">
                    {note.noteType === "INTERNAL" ? "Internal" : "Visible"}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">
                    {formatDistanceToNow(note.createdAt, { addSuffix: true })}
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">{note.body}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
