-- Pin search_path on all SECURITY DEFINER / utility functions to mitigate
-- search_path hijacking. Addresses Supabase advisor lint
-- `function_search_path_mutable` (0011).

ALTER FUNCTION public.oneos_set_updated_at() SET search_path = pg_catalog, public;
ALTER FUNCTION public.oneos_prune_rate_limits() SET search_path = pg_catalog, public;
ALTER FUNCTION public.oneos_prune_auth_sessions() SET search_path = pg_catalog, public;
