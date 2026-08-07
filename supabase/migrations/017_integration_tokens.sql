-- FlowAccount receipt issuing, part 2: OAuth token cache.
--
-- FlowAccount uses client-credentials OAuth: any holder of a live
-- access_token can create tax documents in the firm's name — that's the
-- whole account, not one client's data. So unlike payment_records
-- (authenticated staff can read), this table gets RLS enabled with
-- **zero policies**: every client role (anon, authenticated) is denied
-- everything, and only the Edge Function's service_role key — which
-- bypasses RLS — can touch it. Don't "fix" the missing policies.
--
-- It's a cache, not a vault: tokens expire on their own (expires_at),
-- and the function refreshes through FLOWACCOUNT_CLIENT_SECRET (a
-- function secret, never stored in the DB). Caching matters because the
-- sandbox allows only 20 req/min — burning one of those on a fresh
-- token per receipt halves the budget for no reason.
--
-- Keyed by provider name so a future integration (e-Tax, other APIs)
-- reuses the table instead of growing a sibling.
create table integration_tokens (
  provider     text primary key,
  access_token text not null,
  expires_at   timestamptz not null,
  updated_at   timestamptz not null default now()
);

alter table integration_tokens enable row level security;

-- Deliberately NOT added to the supabase_realtime publication: realtime
-- delivery isn't gated by RLS the same way selects are, and no client
-- has any business observing token rotation anyway.
