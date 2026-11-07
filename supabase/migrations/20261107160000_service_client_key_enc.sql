-- Store each service API key encrypted (AES-256-GCM, key held only by the
-- server in API_KEY_SECRET / JWT_SECRET) so staff can copy it again later.
-- api_key_hash is still used to authenticate requests.
alter table public.service_clients add column if not exists api_key_enc text;
