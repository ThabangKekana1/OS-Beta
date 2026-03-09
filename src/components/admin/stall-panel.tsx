"use client";

import { useState } from "react";
import { markDealStalled, markDealUnstalled } from "@/actions/pipeline-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface StallReason {
  id: string;
  code: string;
  name: string;
  category: string | null;
}

export function StallPanel({
  dealPipelineId,
  isStalled,
  stallReasons,
}: {
  dealPipelineId: string;
  isStalled: boolean;
  stallReasons: StallReason[];
}) {
  const [selectedReason, setSelectedReason] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleStall() {
    if (!selectedReason) return;
    setLoading(true);

    const formData = new FormData();
    formData.set("dealPipelineId", dealPipelineId);
    formData.set("stallReasonCode", selectedReason);
    if (note) formData.set("note", note);

    const result = await markDealStalled(formData);
    setLoading(false);

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Deal marked as stalled");
      setSelectedReason("");
      setNote("");
    }
  }

  async function handleUnstall() {
    setLoading(true);
    const result = await markDealUnstalled(dealPipelineId);
    setLoading(false);

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Deal unstalled");
    }
  }

  return (
    <Card className="border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium">
          {isStalled ? "Deal is Stalled" : "Mark as Stalled"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isStalled ? (
          <Button
            onClick={handleUnstall}
            disabled={loading}
            size="sm"
            variant="outline"
            className="w-full text-xs"
          >
            {loading ? "Processing..." : "Remove Stall"}
          </Button>
        ) : (
          <>
            <Select value={selectedReason} onValueChange={(v) => v && setSelectedReason(v)}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Select stall reason" />
              </SelectTrigger>
              <SelectContent>
                {stallReasons.map((r) => (
                  <SelectItem key={r.code} value={r.code} className="text-xs">
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional note..."
              className="h-16 resize-none text-xs"
            />
            <Button
              onClick={handleStall}
              disabled={!selectedReason || loading}
              size="sm"
              variant="outline"
              className="w-full text-xs"
            >
              {loading ? "Processing..." : "Mark Stalled"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
