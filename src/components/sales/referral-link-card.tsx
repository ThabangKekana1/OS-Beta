"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface ReferralLinkCardProps {
  referralCode: string;
  referralLink: string;
}

export function ReferralLinkCard({ referralCode, referralLink }: ReferralLinkCardProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(referralLink);
    setCopied(true);
    toast.success("Referral link copied");
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex items-center justify-between gap-4 p-4">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">Your Referral Code</p>
        <p className="text-sm font-mono font-semibold">{referralCode}</p>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] text-muted-foreground">Registration Link</p>
        <div className="mt-1 flex items-center gap-2">
          <input
            readOnly
            value={referralLink}
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-[10px] text-muted-foreground"
          />
          <Button type="button" variant="outline" size="sm" className="shrink-0 gap-1" onClick={handleCopy}>
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </div>
    </div>
  );
}
