/**
 * Association outreach vocabulary.
 *
 * Deliberately free of server imports: both the operator UI (a client
 * component) and the server-side outreach library depend on this, and pulling
 * the server library into the browser drags Supabase and the PDF canvas binary
 * along with it.
 */

export type AssociationOutreachStage =
  | "not_started"
  | "researching"
  | "contacted"
  | "in_conversation"
  | "proposal_sent"
  | "agreed"
  | "live"
  | "declined"
  | "dormant";

export const ASSOCIATION_OUTREACH_STAGES: {
  id: AssociationOutreachStage;
  label: string;
  nextAction: string;
}[] = [
  { id: "not_started", label: "Not started", nextAction: "Find the member-services contact." },
  { id: "researching", label: "Researching", nextAction: "Confirm the decision maker and member count." },
  { id: "contacted", label: "Contacted", nextAction: "Follow up if there is no reply in five working days." },
  { id: "in_conversation", label: "In conversation", nextAction: "Get a call in the diary and scope the member campaign." },
  { id: "proposal_sent", label: "Proposal sent", nextAction: "Chase a decision and offer to present to the board." },
  { id: "agreed", label: "Agreed", nextAction: "Agree the member announcement and launch date." },
  { id: "live", label: "Live", nextAction: "Track member cases and report results back monthly." },
  { id: "declined", label: "Declined", nextAction: "Record the reason and set a date to revisit." },
  { id: "dormant", label: "Dormant", nextAction: "Revisit when a sector trigger appears." },
];
