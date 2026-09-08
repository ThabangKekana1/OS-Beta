-- Delivery truth (doc 21): Resend's delivery webhooks land delivered / bounced
-- / complained into foundation1_outcomes beside the funnel stages. The original
-- CHECK knew only the nine stages; the mail chain now speaks further. The
-- constraint is replaced, not widened, so the rule stays in one place.

alter table public.foundation1_outcomes
  drop constraint foundation1_outcomes_event_check;

alter table public.foundation1_outcomes
  add constraint foundation1_outcomes_event_check
  check (event in (
    'sent', 'reply', 'bills_in', 'assessment_out', 'meeting', 'eoi_signed',
    'proposal_accepted', 'mandate_signed', 'term_sheet',
    'delivered', 'bounced', 'complained'
  ));
