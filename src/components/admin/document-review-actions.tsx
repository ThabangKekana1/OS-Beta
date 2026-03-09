"use client";

import { useState } from "react";
import { reviewDocument, forwardToPartner } from "@/actions/document-actions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Check, X, Send } from "lucide-react";

export function DocumentReviewActions({ documentId }: { documentId: string }) {
  const [loading, setLoading] = useState(false);

  async function handleApprove() {
    setLoading(true);
    const formData = new FormData();
    formData.set("documentSubmissionId", documentId);
    formData.set("status", "APPROVED");
    const result = await reviewDocument(formData);
    setLoading(false);
    if (result.error) toast.error(result.error);
    else toast.success("Document approved");
  }

  async function handleReject() {
    setLoading(true);
    const formData = new FormData();
    formData.set("documentSubmissionId", documentId);
    formData.set("status", "REJECTED");
    formData.set("rejectionReason", "Does not meet requirements");
    const result = await reviewDocument(formData);
    setLoading(false);
    if (result.error) toast.error(result.error);
    else toast.success("Document rejected");
  }

  async function handleForward() {
    setLoading(true);
    const result = await forwardToPartner(documentId);
    setLoading(false);
    if (result.error) toast.error(result.error);
    else toast.success("Forwarded to partner");
  }

  return (
    <div className="flex items-center gap-1">
      <Button onClick={handleApprove} disabled={loading} variant="ghost" size="icon" className="h-6 w-6" title="Approve">
        <Check size={12} />
      </Button>
      <Button onClick={handleReject} disabled={loading} variant="ghost" size="icon" className="h-6 w-6" title="Reject">
        <X size={12} />
      </Button>
      <Button onClick={handleForward} disabled={loading} variant="ghost" size="icon" className="h-6 w-6" title="Forward to Partner">
        <Send size={12} />
      </Button>
    </div>
  );
}
