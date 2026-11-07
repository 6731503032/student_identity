-- API keys for service clients (other teams' backends).
-- Only a SHA-256 hash of the key is stored; the key itself is shown once.
alter table public.service_clients add column if not exists api_key_hash text unique;
alter table public.service_clients add column if not exists key_prefix text;
alter table public.service_clients add column if not exists scopes jsonb not null default '["profile:read"]'::jsonb;
