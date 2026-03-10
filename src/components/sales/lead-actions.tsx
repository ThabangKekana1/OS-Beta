"use client";

import { sendInviteLink, killLead } from "@/actions/lead-actions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Send, X } from "lucide-react";

export function LeadActions({ leadId, status }: { leadId: string; status: string }) {
  async function handleSendInvite() {
    const result = await sendInviteLink(leadId);
    if (result.error) {
      toast.error(result.error);
      return;
    }

    if (result.registrationLink) {
      try {
        await navigator.clipboard.writeText(result.registrationLink);
      } catch {}
    }

    toast.success(result.message ?? "Registration link generated. Copy and send manually.");
  }

  async function handleKill() {
    const result = await killLead(leadId, "Not viable");
    if (result.error) toast.error(result.error);
    else toast.success("Lead marked as dead");
  }

  return (
    <div className="flex items-center gap-1">
      {status === "NEW" && (
        <Button onClick={handleSendInvite} variant="ghost" size="icon" className="h-6 w-6" title="Generate registration link">
          <Send size={12} />
        </Button>
      )}
      {status !== "CONVERTED" && status !== "DEAD" && (
        <Button onClick={handleKill} variant="ghost" size="icon" className="h-6 w-6" title="Mark dead">
          <X size={12} />
        </Button>
      )}
    </div>
  );
}
