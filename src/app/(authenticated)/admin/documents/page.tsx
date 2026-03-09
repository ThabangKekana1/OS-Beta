import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { publishDocumentToBusiness } from "@/actions/document-actions";
import { getAdminDocumentExchangeOverview } from "@/lib/queries";
import {
  DOCUMENT_PHASE_LABELS,
  getReviewStatusLabel,
  type ExchangeDocumentView,
} from "@/lib/document-exchange";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { DocumentReviewActions } from "@/components/admin/document-review-actions";
import Link from "next/link";

function QueueTable({
  title,
  description,
  rows,
  renderActions,
}: {
  title: string;
  description: string;
  rows: Array<ExchangeDocumentView & { business: { id: string; legalName: string } }>;
  renderActions?: (row: ExchangeDocumentView & { business: { id: string; legalName: string } }) => ReactNode;
}) {
  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          <Badge variant="outline" className="text-[10px]">{rows.length}</Badge>
        </div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <div className="p-6 text-xs text-muted-foreground">Nothing in this queue.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Phase</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Business</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Document</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">State</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Updated</th>
                  {renderActions && <th className="px-4 py-3 text-left font-medium text-muted-foreground">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-border/50">
                    <td className="px-4 py-3 font-medium">{DOCUMENT_PHASE_LABELS[row.exchangePhase]}</td>
                    <td className="px-4 py-3">
                      <Link href={`/admin/businesses/${row.business.id}`} className="hover:underline">
                        {row.business.legalName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{row.originalFileName}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="text-[10px]">
                        {row.purpose === "REQUESTED_DOCUMENT"
                          ? "Waiting on business upload"
                          : row.purpose === "DELIVERED_DOCUMENT" && !row.visibleToBusiness
                            ? "Held by admin"
                            : row.returnedSignedAt
                          ? "Signed return received"
                          : row.purpose === "DELIVERED_DOCUMENT" && row.businessActionRequired
                            ? "Awaiting signed return"
                            : row.businessDownloadedAt
                            ? "Downloaded by business"
                            : getReviewStatusLabel(row.reviewStatus)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDistanceToNow(row.createdAt, { addSuffix: true })}
                    </td>
                    {renderActions && <td className="px-4 py-3">{renderActions(row)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default async function DocumentsPage() {
  const session = await auth();
  if (!session || !["ADMINISTRATOR", "SUPER_ADMIN"].includes(session.user.role)) redirect("/login");

  const { groups } = await getAdminDocumentExchangeOverview();

  return (
    <div>
      <PageHeader
        title="Document Exchange"
        description="Track every administrator-to-business and business-to-administrator handoff by phase"
      />

      <div className="grid gap-6">
        <QueueTable
          title="Requested Documents Not Yet Uploaded"
          description="Requests sent to the business that are still waiting on a business upload."
          rows={groups.requestsAwaitingUpload}
        />

        <QueueTable
          title="Documents Uploaded by Business Awaiting Review"
          description="Business submissions waiting for administrator review, approval, rejection, or forwarding."
          rows={groups.businessUploadsAwaitingReview}
          renderActions={(row) => <DocumentReviewActions documentId={row.id} />}
        />

        <QueueTable
          title="Documents Delivered to Business"
          description="Documents that the administrator has made available to the business."
          rows={groups.deliveredToBusiness}
        />

        <QueueTable
          title="Delivered Documents Awaiting Signed Return"
          description="Administrator-delivered documents that still require a signed business return."
          rows={groups.deliveredAwaitingSignedReturn}
        />

        <QueueTable
          title="Signed Returns Awaiting Forwarding to Partner"
          description="Signed returns that have been approved and still need partner handoff."
          rows={groups.signedReturnsAwaitingForward}
          renderActions={(row) => <DocumentReviewActions documentId={row.id} />}
        />

        <QueueTable
          title="Partner-Returned Documents Awaiting Upload to Business"
          description="Documents already received from a partner but not yet published to the business dashboard."
          rows={groups.partnerReturnedAwaitingUpload}
          renderActions={(row) => (
            <form action={async () => {
              "use server";
              await publishDocumentToBusiness(row.id);
            }}>
              <Button size="sm" variant="outline" className="text-[10px]">
                Deliver to Business
              </Button>
            </form>
          )}
        />
      </div>
    </div>
  );
}
