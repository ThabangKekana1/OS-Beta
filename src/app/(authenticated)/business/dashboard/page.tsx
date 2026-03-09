import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getBusinessDashboardData } from "@/lib/queries";
import {
  DOCUMENT_PHASE_LABELS,
  getBusinessExchangeGroups,
  getPhaseNextActionLabel,
  getReviewStatusLabel,
} from "@/lib/document-exchange";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import Link from "next/link";
import { FileText, Upload, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export default async function BusinessDashboard() {
  const session = await auth();
  if (!session || session.user.role !== "BUSINESS_USER") redirect("/login");

  const data = await getBusinessDashboardData(session.user.id);

  if (!data?.business) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-sm text-muted-foreground">No business profile found. Contact your administrator.</p>
      </div>
    );
  }

  const biz = data.business;
  const deal = biz.dealPipeline;
  const currentStage = biz.currentStage;

  const totalStages = 28;
  const currentStageOrder = currentStage?.orderIndex ?? 0;
  const progressPercent = Math.round((currentStageOrder / totalStages) * 100);

  const outstandingTasks = biz.tasks;
  const exchange = getBusinessExchangeGroups(biz.documents);

  return (
    <div>
      <PageHeader
        title={`Welcome, ${biz.legalName}`}
        description="Your energy service application progress"
      />

      {/* Progress Tracker */}
      <Card className="border-border">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Current Stage</p>
              <p className="mt-0.5 text-sm font-medium">{currentStage?.name ?? "Unknown"}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Progress</p>
              <p className="text-sm font-semibold tabular-nums">{progressPercent}%</p>
            </div>
          </div>
          <Progress value={progressPercent} className="mt-3 h-1.5" />
        </CardContent>
      </Card>

      {/* Next Required Action */}
      {deal && deal.currentStage && (
        <Card className="mt-4 border-border">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-accent">
                <ArrowRight size={18} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Next Required Action</p>
                <p className="mt-0.5 text-sm font-medium">
                  {exchange.nextAction
                    ? getPhaseNextActionLabel(exchange.nextAction.exchangePhase, exchange.nextAction.purpose)
                    : deal.nextRequiredAction ?? getNextAction(deal.currentStage.code)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        {/* Outstanding Documents */}
        <Card className="border-border">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Pending Documents</CardTitle>
              <Badge variant="outline" className="text-[10px]">{exchange.underReview.length}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {exchange.underReview.length === 0 ? (
              <p className="text-xs text-muted-foreground">No documents pending review</p>
            ) : (
              <div className="space-y-2">
                {exchange.underReview.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between rounded-md border border-border p-2.5">
                    <div className="flex items-center gap-2">
                      <FileText size={14} className="text-muted-foreground" />
                      <div>
                        <p className="text-xs font-medium">{DOCUMENT_PHASE_LABELS[doc.exchangePhase]}</p>
                        <p className="text-[10px] text-muted-foreground">{doc.originalFileName}</p>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[10px]">Under Review</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tasks */}
        <Card className="border-border">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Your Actions</CardTitle>
              <Badge variant="outline" className="text-[10px]">{outstandingTasks.length}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {outstandingTasks.length === 0 ? (
              <p className="text-xs text-muted-foreground">No outstanding actions</p>
            ) : (
              <div className="space-y-2">
                {outstandingTasks.map((task) => (
                  <div key={task.id} className="rounded-md border border-border p-2.5">
                    <p className="text-xs font-medium">{task.title}</p>
                    {task.description && <p className="text-[10px] text-muted-foreground">{task.description}</p>}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card className="border-border">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Documents I Need to Upload</CardTitle>
              <Link href="/business/documents">
                <Button variant="outline" size="sm" className="gap-1 text-xs">
                  <Upload size={12} />
                  Open Exchange
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {exchange.requiredUploads.length === 0 ? (
              <p className="text-xs text-muted-foreground">No document upload is currently required.</p>
            ) : (
              <div className="space-y-2">
                {exchange.requiredUploads.map((doc) => (
                  <div key={doc.id} className="rounded-md border border-border p-2.5">
                    <p className="text-xs font-medium">{DOCUMENT_PHASE_LABELS[doc.exchangePhase]}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {doc.purpose === "REQUESTED_DOCUMENT" ? "Upload requested document" : "Return signed document"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Documents Available for Download</CardTitle>
          </CardHeader>
          <CardContent>
            {exchange.availableDownloads.length === 0 ? (
              <p className="text-xs text-muted-foreground">No administrator-delivered documents are waiting for download.</p>
            ) : (
              <div className="space-y-2">
                {exchange.availableDownloads.map((doc) => (
                  <div key={doc.id} className="rounded-md border border-border p-2.5">
                    <p className="text-xs font-medium">{DOCUMENT_PHASE_LABELS[doc.exchangePhase]}</p>
                    <p className="text-[10px] text-muted-foreground">{doc.originalFileName}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {doc.businessDownloadedAt ? "Downloaded" : "Ready for download"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Documents I Have Uploaded</CardTitle>
          </CardHeader>
          <CardContent>
            {exchange.uploadedByBusiness.length === 0 ? (
              <p className="text-xs text-muted-foreground">No documents uploaded yet.</p>
            ) : (
              <div className="space-y-2">
                {exchange.uploadedByBusiness.map((doc) => (
                  <div key={doc.id} className="rounded-md border border-border p-2.5">
                    <p className="text-xs font-medium">{DOCUMENT_PHASE_LABELS[doc.exchangePhase]}</p>
                    <p className="text-[10px] text-muted-foreground">{doc.originalFileName}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Documents Under Review</CardTitle>
          </CardHeader>
          <CardContent>
            {exchange.underReview.length === 0 ? (
              <p className="text-xs text-muted-foreground">No documents are currently waiting on administrator review.</p>
            ) : (
              <div className="space-y-2">
                {exchange.underReview.map((doc) => (
                  <div key={doc.id} className="rounded-md border border-border p-2.5">
                    <p className="text-xs font-medium">{DOCUMENT_PHASE_LABELS[doc.exchangePhase]}</p>
                    <div className="mt-1 flex items-center justify-between">
                      <p className="text-[10px] text-muted-foreground">{doc.originalFileName}</p>
                      <Badge variant="outline" className="text-[10px]">
                        {getReviewStatusLabel(doc.reviewStatus)}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function getNextAction(stageCode: string): string {
  const actions: Record<string, string> = {
    BUSINESS_REGISTERED: "Complete your business application",
    APPLICATION_COMPLETED: "Sign the Foundation-1 contract",
    FOUNDATION_ONE_CONTRACT_SIGNED: "Wait for Expression of Interest request",
    EXPRESSION_OF_INTEREST_REQUESTED: "Upload your Expression of Interest",
    EXPRESSION_OF_INTEREST_UPLOADED: "Waiting for review",
    UTILITY_BILL_REQUESTED: "Upload your 6-month utility bill",
    UTILITY_BILL_UPLOADED: "Waiting for review",
    PROPOSAL_DELIVERED_TO_BUSINESS: "Review and sign the proposal",
    TERM_SHEET_DELIVERED_TO_BUSINESS: "Review and sign the term sheet",
    KNOW_YOUR_CUSTOMER_REQUESTED: "Upload KYC documents",
    KNOW_YOUR_CUSTOMER_UPLOADED: "Waiting for review",
  };
  return actions[stageCode] ?? "No action required. Your application is being processed.";
}
