import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { markDocumentDownloaded, submitBusinessDocument } from "@/actions/document-actions";
import { getBusinessDocumentExchange } from "@/lib/queries";
import {
  DOCUMENT_PHASE_LABELS,
  getPhaseNextActionLabel,
  getReviewStatusLabel,
} from "@/lib/document-exchange";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";

export default async function BusinessDocumentsPage() {
  const session = await auth();
  if (!session || session.user.role !== "BUSINESS_USER") redirect("/login");

  const { profile, groups } = await getBusinessDocumentExchange(session.user.id);
  if (!profile?.business || !groups) redirect("/business/dashboard");

  const business = profile.business;

  return (
    <div>
      <PageHeader
        title="Document Exchange"
        description="Track what the administrator sent, what you sent back, and what is still required"
      />

      <Card className="border-border">
        <CardContent className="p-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Next Document Action</p>
          <p className="mt-1 text-sm font-medium">
            {groups.nextAction
              ? getPhaseNextActionLabel(groups.nextAction.exchangePhase, groups.nextAction.purpose)
              : "No document action is currently required from your business."}
          </p>
        </CardContent>
      </Card>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Documents You Need to Upload</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {groups.requiredUploads.length === 0 ? (
              <p className="text-xs text-muted-foreground">No uploads or signed returns are currently required.</p>
            ) : (
              groups.requiredUploads.map((doc) => (
                <div key={doc.id} className="rounded-md border border-border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium">{DOCUMENT_PHASE_LABELS[doc.exchangePhase]}</p>
                      <p className="text-[10px] text-muted-foreground">{doc.originalFileName}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {doc.purpose === "REQUESTED_DOCUMENT"
                          ? "Administrator requested a document from your business."
                          : "Administrator delivered a document that requires a signed return."}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-[10px]">
                      {doc.purpose === "REQUESTED_DOCUMENT" ? "Upload Required" : "Signed Return Required"}
                    </Badge>
                  </div>
                  {doc.purpose === "DELIVERED_DOCUMENT" && (
                    <div className="mt-3 flex items-center gap-2">
                      <a href={doc.fileUrl} target="_blank" rel="noreferrer" className="text-xs underline">
                        Download {doc.originalFileName}
                      </a>
                      <form action={async () => {
                        "use server";
                        await markDocumentDownloaded(doc.id);
                      }}>
                        <Button variant="outline" size="sm" className="h-7 text-[10px]">
                          Mark as Downloaded
                        </Button>
                      </form>
                    </div>
                  )}
                  <form action={async (formData) => {
                    "use server";
                    await submitBusinessDocument(formData);
                  }} className="mt-3 space-y-2">
                    <input type="hidden" name="businessId" value={business.id} />
                    <input type="hidden" name="dealPipelineId" value={business.dealPipeline?.id ?? ""} />
                    <input type="hidden" name="exchangePhase" value={doc.exchangePhase} />
                    <input type="hidden" name="parentSubmissionId" value={doc.id} />
                    <input
                      className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                      name="originalFileName"
                      placeholder={doc.purpose === "DELIVERED_DOCUMENT" ? "signed-document.pdf" : "document-upload.pdf"}
                    />
                    <input
                      className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                      name="fileUrl"
                      placeholder="/uploads/your-document.pdf"
                    />
                    <Button type="submit" size="sm">
                      {doc.purpose === "REQUESTED_DOCUMENT" ? "Submit to Administrator" : "Return Signed Document"}
                    </Button>
                  </form>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Documents Available for Download</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {groups.availableDownloads.length === 0 ? (
              <p className="text-xs text-muted-foreground">No administrator-delivered documents are available right now.</p>
            ) : (
              groups.availableDownloads.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between rounded-md border border-border p-3">
                  <div>
                    <p className="text-xs font-medium">{DOCUMENT_PHASE_LABELS[doc.exchangePhase]}</p>
                    <p className="text-[10px] text-muted-foreground">{doc.originalFileName}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {doc.businessDownloadedAt
                        ? `Downloaded ${formatDistanceToNow(doc.businessDownloadedAt, { addSuffix: true })}`
                        : "Not downloaded yet"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <a href={doc.fileUrl} target="_blank" rel="noreferrer" className="text-xs underline">
                      Download
                    </a>
                    {!doc.businessDownloadedAt && (
                      <form action={async () => {
                        "use server";
                        await markDocumentDownloaded(doc.id);
                      }}>
                        <Button variant="outline" size="sm" className="h-7 text-[10px]">
                          Mark Downloaded
                        </Button>
                      </form>
                    )}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Documents You Have Uploaded</CardTitle>
          </CardHeader>
          <CardContent>
            {groups.uploadedByBusiness.length === 0 ? (
              <p className="text-xs text-muted-foreground">You have not uploaded any documents yet.</p>
            ) : (
              <div className="space-y-2">
                {groups.uploadedByBusiness.map((doc) => (
                  <div key={doc.id} className="rounded-md border border-border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-medium">{DOCUMENT_PHASE_LABELS[doc.exchangePhase]}</p>
                        <p className="text-[10px] text-muted-foreground">{doc.originalFileName}</p>
                      </div>
                      <Badge variant="outline" className="text-[10px]">
                        {doc.purpose === "SIGNED_RETURN" ? "Signed Return" : "Submission"}
                      </Badge>
                    </div>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      Uploaded {formatDistanceToNow(doc.createdAt, { addSuffix: true })}
                    </p>
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
            {groups.underReview.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nothing is currently waiting for administrator review.</p>
            ) : (
              <div className="space-y-2">
                {groups.underReview.map((doc) => (
                  <div key={doc.id} className="rounded-md border border-border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-medium">{DOCUMENT_PHASE_LABELS[doc.exchangePhase]}</p>
                        <p className="text-[10px] text-muted-foreground">{doc.originalFileName}</p>
                      </div>
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
