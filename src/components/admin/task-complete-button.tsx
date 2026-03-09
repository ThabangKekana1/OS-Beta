"use client";

import { completeTaskAction } from "@/actions/task-actions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Check } from "lucide-react";

export function TaskCompleteButton({ taskId }: { taskId: string }) {
  async function handleComplete() {
    const result = await completeTaskAction(taskId);
    if (result.success) {
      toast.success("Task completed");
    }
  }

  return (
    <Button onClick={handleComplete} variant="ghost" size="icon" className="h-6 w-6">
      <Check size={12} />
    </Button>
  );
}
