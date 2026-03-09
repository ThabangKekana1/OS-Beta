"use client";

import { useState } from "react";
import { advanceStage } from "@/actions/pipeline-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface Stage {
  id: string;
  code: string;
  name: string;
  orderIndex: number;
}

export function StageTransitionPanel({
  dealPipelineId,
  currentStageCode,
  stages,
}: {
  dealPipelineId: string;
  currentStageCode: string;
  stages: Stage[];
}) {
  const [selectedStage, setSelectedStage] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  const currentIndex = stages.findIndex((s) => s.code === currentStageCode);
  const availableStages = stages.filter((s) => s.orderIndex > (stages[currentIndex]?.orderIndex ?? 0));

  async function handleAdvance() {
    if (!selectedStage) return;
    setLoading(true);

    const formData = new FormData();
    formData.set("dealPipelineId", dealPipelineId);
    formData.set("toStageCode", selectedStage);
    if (note) formData.set("note", note);

    const result = await advanceStage(formData);
    setLoading(false);

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Stage advanced successfully");
      setSelectedStage("");
      setNote("");
    }
  }

  return (
    <Card className="border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium">Advance Stage</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Select value={selectedStage} onValueChange={(v) => v && setSelectedStage(v)}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Select next stage" />
          </SelectTrigger>
          <SelectContent>
            {availableStages.map((s) => (
              <SelectItem key={s.code} value={s.code} className="text-xs">
                {s.name}
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
          onClick={handleAdvance}
          disabled={!selectedStage || loading}
          size="sm"
          className="w-full text-xs"
        >
          {loading ? "Advancing..." : "Advance Stage"}
        </Button>
      </CardContent>
    </Card>
  );
}
