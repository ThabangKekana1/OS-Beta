-- Consent-basis drift (2026-08-09 founder decision): anonymous first-party
-- signals switched to notice-based legitimate interest (POPIA s11(1)(f)), and
-- the website began sending consent_basis 'legitimate_interest_notice'. The
-- behaviour events table's CHECK predates that decision and only allowed
-- 'analytics_consent' and 'test', so every public-website event died at insert.
-- The constraint is replaced to carry the basis the code actually sends.

alter table public.foundation1_behavior_events
  drop constraint foundation1_behavior_events_consent_check;

alter table public.foundation1_behavior_events
  add constraint foundation1_behavior_events_consent_check
  check (consent_basis in ('analytics_consent', 'legitimate_interest_notice', 'test'));
