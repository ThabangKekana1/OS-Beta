"use client";

import { useState } from "react";
import { createLead } from "@/actions/lead-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export function CreateLeadForm() {
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const result = await createLead(formData);

    setLoading(false);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Lead created");
      (e.target as HTMLFormElement).reset();
    }
  }

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Create New Lead</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label className="text-xs">Business Name</Label>
            <Input name="businessName" required className="mt-1 h-8 text-xs" />
          </div>
          <div>
            <Label className="text-xs">Contact Name</Label>
            <Input name="contactName" required className="mt-1 h-8 text-xs" />
          </div>
          <div>
            <Label className="text-xs">Contact Email</Label>
            <Input name="contactEmail" type="email" required className="mt-1 h-8 text-xs" />
          </div>
          <div>
            <Label className="text-xs">Contact Phone</Label>
            <Input name="contactPhone" className="mt-1 h-8 text-xs" />
          </div>
          <Button type="submit" disabled={loading} size="sm" className="w-full text-xs">
            {loading ? "Creating..." : "Create Lead"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
