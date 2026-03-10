import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { createCommunicationThread, replyToCommunicationThread, updateCommunicationThreadStatus } from "@/actions/communication-actions";
import { deliverDocumentToBusiness, requestDocumentFromBusiness } from "@/actions/document-actions";
import { COMMUNICATION_STATUS_LABELS, COMMUNICATION_THREAD_LABELS } from "@/lib/communication";
import { DOCUMENT_PHASE_LABELS, getAdminExchangeGroups, getBusinessExchangeGroups, getDocumentPurposeLabel } from "@/lib/document-exchange";
import { getBusinessCommunicationThreadsForAdmin, getBusinessDetail, getStageDefinitions, getStallReasonDefinitions } from "@/lib/queries";
import { computeStageAge } from "@/lib/stage-engine";
import { PageHeader } from "@/components/shared/page-header";
import { StageBadge } from "@/components/shared/stage-badge";
import { HealthIndicator } from "@/components/shared/health-indicator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StageTransitionPanel } from "@/components/admin/stage-transition-panel";
import { StallPanel } from "@/components/admin/stall-panel";
import { NotePanel } from "@/components/admin/note-panel";
import { formatDistanceToNow, format } from "date-fns";

export default async function BusinessDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || !["ADMINISTRATOR", "SUPER_ADMIN"].includes(session.user.role)) {
    redirect("/login");
  }

  const { id } = await params;
  const [business, stages, stallReasons, communicationThreads] = await Promise.all([
    getBusinessDetail(id),
    getStageDefinitions(),
    getStallReasonDefinitions(),
    getBusinessCommunicationThreadsForAdmin(id),
  ]);

  if (!business) notFound();

  const deal = business.dealPipeline;
  const stageAge = deal ? computeStageAge(deal.stageEnteredAt) : null;
  const adminExchange = getAdminExchangeGroups(business.documents);
  const businessExchange = getBusinessExchangeGroups(business.documents);
  const waitingOnPartner = business.documents.filter(
    (doc) => doc.partnerHandoffRequired && !doc.forwardedToPartnerAt
  );

  return (
    <div>
      <PageHeader
        title={business.legalName}
        description={`${business.registrationNumber} · ${business.industry ?? "No industry"}`}
      />

      {/* Top Summary */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-border">
          <CardContent className="p-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Current Stage</p>
            <div className="mt-1">
              {business.currentStage ? (
                <StageBadge stageName={business.currentStage.name} category={business.currentStage.category} />
              ) : (
                <span className="text-xs text-muted-foreground">No stage</span>
              )}
            </div>
            {stageAge && <p className="mt-1 text-xs text-muted-foreground">{stageAge.label} in stage</p>}
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Qualification</p>
            <Badge variant="outline" className="mt-1 text-[10px]">
              {business.qualificationStatus.replace(/_/g, " ")}
            </Badge>
            {business.disqualificationReason && (
              <p className="mt-1 text-[10px] text-destructive">{business.disqualificationReason}</p>
            )}
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Health</p>
            {deal && <HealthIndicator status={deal.healthStatus} className="mt-1" />}
            {deal?.isStalled && (
              <p className="mt-1 text-[10px] text-destructive">
                Stalled: {deal.stallReason?.name}
              </p>
            )}
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Monthly Spend</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">
              R{business.monthlyElectricitySpendEstimate?.toLocaleString() ?? "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Attribution & Assignment */}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium">Attribution & Assignment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Source Rep</span>
              <span className="font-medium">
                {business.sourceSalesRepresentative.firstName} {business.sourceSalesRepresentative.lastName}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Assigned Admin</span>
              <span className="font-medium">
                {business.assignedAdministrator
                  ? `${business.assignedAdministrator.firstName} ${business.assignedAdministrator.lastName}`
                  : "Unassigned"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Priority</span>
              <Badge variant="outline" className="text-[10px]">{deal?.priority ?? "—"}</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Created</span>
              <span>{format(business.createdAt, "dd MMM yyyy")}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium">Contact</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Contact</span>
              <span>{business.contactPersonName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Email</span>
              <span>{business.contactPersonEmail}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Phone</span>
              <span>{business.contactPersonPhone ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Location</span>
              <span>{business.city}, {business.province}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <Card className="border-border"><CardContent className="p-4"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Admin Sent</p><p className="mt-1 text-lg font-semibold">{business.documents.filter((doc) => doc.direction === "ADMIN_TO_BUSINESS" && doc.visibleToAdministrator).length}</p></CardContent></Card>
        <Card className="border-border"><CardContent className="p-4"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Business Sent Back</p><p className="mt-1 text-lg font-semibold">{business.documents.filter((doc) => doc.direction === "BUSINESS_TO_ADMIN").length}</p></CardContent></Card>
        <Card className="border-border"><CardContent className="p-4"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Missing</p><p className="mt-1 text-lg font-semibold">{adminExchange.requestsAwaitingUpload.length + adminExchange.deliveredAwaitingSignedReturn.length}</p></CardContent></Card>
        <Card className="border-border"><CardContent className="p-4"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Waiting Review</p><p className="mt-1 text-lg font-semibold">{adminExchange.businessUploadsAwaitingReview.length}</p></CardContent></Card>
        <Card className="border-border"><CardContent className="p-4"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Waiting Partner</p><p className="mt-1 text-lg font-semibold">{waitingOnPartner.length}</p></CardContent></Card>
        <Card className="border-border"><CardContent className="p-4"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Next Action</p><p className="mt-1 text-xs font-medium">{businessExchange.nextAction ? DOCUMENT_PHASE_LABELS[businessExchange.nextAction.exchangePhase] : "No document action open"}</p></CardContent></Card>
      </div>

      {/* Stage Controls */}
      {deal && (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <StageTransitionPanel
            dealPipelineId={deal.id}
            currentStageCode={deal.currentStage.code}
            stages={stages}
          />
          <StallPanel
            dealPipelineId={deal.id}
            isStalled={deal.isStalled}
            stallReasons={stallReasons}
          />
        </div>
      )}

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Admin Document Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2 md:grid-cols-3">
              {(["EXPRESSION_OF_INTEREST", "UTILITY_BILL", "KNOW_YOUR_CUSTOMER"] as const).map((phase) => (
                <form key={phase} action={async (formData) => {
                  "use server";
                  await requestDocumentFromBusiness(formData);
                }}>
                  <input type="hidden" name="businessId" value={business.id} />
                  <input type="hidden" name="exchangePhase" value={phase} />
                  <Button type="submit" variant="outline" size="sm" className="w-full text-[10px]">
                    Request {DOCUMENT_PHASE_LABELS[phase]}
                  </Button>
                </form>
              ))}
            </div>
            {(["PROPOSAL", "TERM_SHEET"] as const).map((phase) => (
              <form key={phase} action={async (formData) => {
                "use server";
                await deliverDocumentToBusiness(formData);
              }} className="rounded-md border border-border p-3 space-y-2">
                <input type="hidden" name="businessId" value={business.id} />
                <input type="hidden" name="exchangePhase" value={phase} />
                <input type="hidden" name="publishToBusiness" value="true" />
                <p className="text-xs font-medium">Deliver {DOCUMENT_PHASE_LABELS[phase]}</p>
                <input className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" name="originalFileName" placeholder={`${phase.toLowerCase().replace("_", "-")}.pdf`} />
                <input className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" name="fileUrl" placeholder={`/uploads/${phase.toLowerCase().replace("_", "-")}.pdf`} />
                <Button type="submit" size="sm">Upload to Business</Button>
              </form>
            ))}
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Document Exchange Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div>
              <p className="font-medium">What admin sent to the business</p>
              {business.documents.filter((doc) => doc.direction === "ADMIN_TO_BUSINESS").length === 0 ? (
                <p className="text-muted-foreground">No administrator-delivered or requested documents yet.</p>
              ) : (
                business.documents.filter((doc) => doc.direction === "ADMIN_TO_BUSINESS").slice(0, 6).map((doc) => (
                  <p key={doc.id} className="text-muted-foreground">{DOCUMENT_PHASE_LABELS[doc.exchangePhase]} · {doc.originalFileName}</p>
                ))
              )}
            </div>
            <div>
              <p className="font-medium">What the business sent back</p>
              {business.documents.filter((doc) => doc.direction === "BUSINESS_TO_ADMIN").length === 0 ? (
                <p className="text-muted-foreground">No business submissions yet.</p>
              ) : (
                business.documents.filter((doc) => doc.direction === "BUSINESS_TO_ADMIN").slice(0, 6).map((doc) => (
                  <p key={doc.id} className="text-muted-foreground">{DOCUMENT_PHASE_LABELS[doc.exchangePhase]} · {doc.originalFileName}</p>
                ))
              )}
            </div>
            <div>
              <p className="font-medium">What is still missing</p>
              {adminExchange.requestsAwaitingUpload.length + adminExchange.deliveredAwaitingSignedReturn.length === 0 ? (
                <p className="text-muted-foreground">Nothing is currently missing.</p>
              ) : (
                [...adminExchange.requestsAwaitingUpload, ...adminExchange.deliveredAwaitingSignedReturn].map((doc) => (
                  <p key={doc.id} className="text-muted-foreground">{DOCUMENT_PHASE_LABELS[doc.exchangePhase]} · Waiting on business</p>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Stage History Timeline */}
      <div className="mt-6">
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Stage History</CardTitle>
          </CardHeader>
          <CardContent>
            {deal?.stageHistory && deal.stageHistory.length > 0 ? (
              <div className="space-y-3">
                {deal.stageHistory.map((h) => (
                  <div key={h.id} className="flex items-start gap-3 border-l border-border pl-4">
                    <div className="mt-0.5 h-2 w-2 -ml-[1.3rem] rounded-full bg-primary" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        {h.fromStage && (
                          <StageBadge stageName={h.fromStage.name} category={h.fromStage.category} />
                        )}
                        <span className="text-[10px] text-muted-foreground">→</span>
                        <StageBadge stageName={h.toStage.name} category={h.toStage.category} />
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span>{h.changedBy.firstName} {h.changedBy.lastName}</span>
                        <span>·</span>
                        <span>{formatDistanceToNow(h.changedAt, { addSuffix: true })}</span>
                        {h.previousStageDurationHours != null && (
                          <>
                            <span>·</span>
                            <span>{Math.round(h.previousStageDurationHours)}h in previous stage</span>
                          </>
                        )}
                      </div>
                      {h.note && <p className="mt-1 text-xs text-muted-foreground">{h.note}</p>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No stage transitions recorded</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Documents */}
      <div className="mt-6">
        <Card className="border-border">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Communications</CardTitle>
              <Badge variant="outline" className="text-[10px]">{communicationThreads.length}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <form action={async (formData) => {
                "use server";
                await createCommunicationThread(formData);
              }} className="space-y-2 rounded-md border border-border p-3">
                <input type="hidden" name="threadType" value="BUSINESS_SUPPORT" />
                <input type="hidden" name="businessId" value={business.id} />
                {deal && <input type="hidden" name="dealPipelineId" value={deal.id} />}
                <p className="text-xs font-medium">Create Business Support Thread</p>
                <input name="subject" required placeholder="Subject" className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-xs" />
                <textarea name="body" required placeholder="Message to business..." className="h-20 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-xs" />
                <Button type="submit" size="sm">Create support thread</Button>
              </form>
              <form action={async (formData) => {
                "use server";
                await createCommunicationThread(formData);
              }} className="space-y-2 rounded-md border border-border p-3">
                <input type="hidden" name="threadType" value="INTERNAL_ADMIN_NOTE" />
                <input type="hidden" name="businessId" value={business.id} />
                {deal && <input type="hidden" name="dealPipelineId" value={deal.id} />}
                <p className="text-xs font-medium">Create Internal Administrator Note</p>
                <input name="subject" required placeholder="Subject" className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-xs" />
                <textarea name="body" required placeholder="Internal note..." className="h-20 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-xs" />
                <Button type="submit" size="sm" variant="outline">Create internal note</Button>
              </form>
            </div>
            {communicationThreads.length === 0 ? (
              <p className="text-xs text-muted-foreground">No communication threads linked to this business.</p>
            ) : (
              <div className="space-y-3">
                {communicationThreads.map((thread) => (
                  <div key={thread.id} className="rounded-md border border-border p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium">{thread.subject ?? "Untitled thread"}</p>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">{COMMUNICATION_THREAD_LABELS[thread.threadType]}</Badge>
                        <Badge variant="outline" className="text-[10px]">{COMMUNICATION_STATUS_LABELS[thread.status]}</Badge>
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Last updated {formatDistanceToNow(thread.lastMessageAt, { addSuffix: true })}
                    </p>
                    <div className="space-y-2">
                      {thread.messages.slice(-6).map((message) => (
                        <div key={message.id} className="rounded-md border border-border p-2.5">
                          <p className="text-[10px] text-muted-foreground">
                            {message.author.firstName} {message.author.lastName} · {message.author.role.replace(/_/g, " ")} · {formatDistanceToNow(message.createdAt, { addSuffix: true })}
                          </p>
                          <p className="mt-1 text-xs">{message.body}</p>
                        </div>
                      ))}
                    </div>
                    <form action={async (formData) => {
                      "use server";
                      await replyToCommunicationThread(formData);
                    }} className="space-y-2">
                      <input type="hidden" name="threadId" value={thread.id} />
                      <textarea name="body" required placeholder="Reply..." className="h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-xs" />
                      <Button type="submit" size="sm" variant="outline">Reply</Button>
                    </form>
                    <form action={async (formData) => {
                      "use server";
                      await updateCommunicationThreadStatus(formData);
                    }} className="flex items-center gap-2">
                      <input type="hidden" name="threadId" value={thread.id} />
                      <select name="status" defaultValue={thread.status} className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-xs">
                        <option value="OPEN">Open</option>
                        <option value="PENDING">Pending</option>
                        <option value="RESOLVED">Resolved</option>
                        <option value="CLOSED">Closed</option>
                      </select>
                      <Button type="submit" size="sm" variant="outline">Update status</Button>
                    </form>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6">
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Documents</CardTitle>
          </CardHeader>
          <CardContent>
            {business.documents.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="pb-2 text-left font-medium text-muted-foreground">Phase</th>
                      <th className="pb-2 text-left font-medium text-muted-foreground">Direction</th>
                      <th className="pb-2 text-left font-medium text-muted-foreground">Purpose</th>
                      <th className="pb-2 text-left font-medium text-muted-foreground">File</th>
                      <th className="pb-2 text-left font-medium text-muted-foreground">Status</th>
                      <th className="pb-2 text-left font-medium text-muted-foreground">Uploaded</th>
                      <th className="pb-2 text-left font-medium text-muted-foreground">Partner</th>
                    </tr>
                  </thead>
                  <tbody>
                    {business.documents.map((doc) => (
                      <tr key={doc.id} className="border-b border-border/50">
                        <td className="py-2">{DOCUMENT_PHASE_LABELS[doc.exchangePhase]}</td>
                        <td className="py-2 text-muted-foreground">{doc.direction === "ADMIN_TO_BUSINESS" ? "Admin → Business" : "Business → Admin"}</td>
                        <td className="py-2 text-muted-foreground">{getDocumentPurposeLabel(doc.purpose)}</td>
                        <td className="py-2 text-muted-foreground">{doc.originalFileName}</td>
                        <td className="py-2">
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${
                              doc.reviewStatus === "APPROVED" ? "border-border" :
                              doc.reviewStatus === "REJECTED" ? "border-destructive/40 text-destructive" :
                              "border-border text-muted-foreground"
                            }`}
                          >
                            {doc.reviewStatus.replace(/_/g, " ")}
                          </Badge>
                        </td>
                        <td className="py-2 text-muted-foreground">
                          {formatDistanceToNow(doc.createdAt, { addSuffix: true })}
                        </td>
                        <td className="py-2 text-muted-foreground">
                          {doc.forwardedToPartnerAt && !doc.returnedFromPartnerAt && "Sent"}
                          {doc.returnedFromPartnerAt && doc.partnerStatus}
                          {!doc.forwardedToPartnerAt && "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No documents submitted</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tasks */}
      <div className="mt-6">
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Tasks</CardTitle>
          </CardHeader>
          <CardContent>
            {business.tasks.length > 0 ? (
              <div className="space-y-2">
                {business.tasks.map((task) => (
                  <div key={task.id} className="flex items-center justify-between rounded-md border border-border p-2.5">
                    <div>
                      <p className="text-xs font-medium">{task.title}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {task.assignedTo ? `${task.assignedTo.firstName} ${task.assignedTo.lastName}` : "Unassigned"}
                        {task.dueAt && ` · Due ${formatDistanceToNow(task.dueAt, { addSuffix: true })}`}
                      </p>
                    </div>
                    <Badge variant="outline" className={`text-[10px] ${task.status === "COMPLETED" ? "border-border" : "border-border text-muted-foreground"}`}>
                      {task.status}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No tasks</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Notes */}
      <div className="mt-6">
        <NotePanel
          dealPipelineId={deal?.id}
          businessId={business.id}
          notes={business.notes}
        />
      </div>
    </div>
  );
}
