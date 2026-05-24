do $$
begin
  if to_regclass('public.oneos_agent_config') is not null then
    execute 'drop policy if exists "service role manages oneos agent config" on public.oneos_agent_config';
    execute 'create policy "service role manages oneos agent config" on public.oneos_agent_config for all to service_role using (true) with check (true)';
  end if;

  if to_regclass('public.oneos_case_documents') is not null then
    execute 'drop policy if exists "service role manages oneos case documents" on public.oneos_case_documents';
    execute 'create policy "service role manages oneos case documents" on public.oneos_case_documents for all to service_role using (true) with check (true)';
  end if;

  if to_regclass('public.oneos_notifications') is not null then
    execute 'drop policy if exists "service role manages oneos notifications" on public.oneos_notifications';
    execute 'create policy "service role manages oneos notifications" on public.oneos_notifications for all to service_role using (true) with check (true)';
  end if;

  if to_regclass('public.oneos_registration_drafts') is not null then
    execute 'drop policy if exists "service role manages oneos registration drafts" on public.oneos_registration_drafts';
    execute 'create policy "service role manages oneos registration drafts" on public.oneos_registration_drafts for all to service_role using (true) with check (true)';
  end if;
end $$;

revoke execute on function public.rls_auto_enable() from anon, authenticated, public;
