-- Local dev bootstrap — mimics the subset of the Supabase auth schema that
-- the Vector48 migrations reference. NOT for production use. Only exists so
-- `psql -f supabase/migrations/*.sql` applies cleanly against a vanilla
-- Postgres 16 instance (e.g. this sandbox, where docker is unavailable).
--
-- Supabase Cloud provides all of this out of the box.

CREATE SCHEMA IF NOT EXISTS auth;

-- Roles used in RLS policies and the tenant_agents immutability trigger.
-- Supabase creates these by default; on a vanilla cluster we stub them as
-- NOLOGIN, SET-able roles so auth.role() can return their names.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END $$;

-- Minimal auth.users — only the fields the Vector48 triggers read.
-- Supabase's real auth.users has many more columns.
CREATE TABLE IF NOT EXISTS auth.users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw_user_meta_data JSONB DEFAULT '{}'::jsonb
);

-- auth.uid() — reads the `request.jwt.claim.sub` GUC the way Supabase
-- PostgREST sets it. In smoke tests we either leave it NULL (service role)
-- or call `SET LOCAL "request.jwt.claim.sub" = '<uuid>'` before a query.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID
LANGUAGE SQL STABLE AS $$
  SELECT NULLIF(
    current_setting('request.jwt.claim.sub', true),
    ''
  )::UUID
$$;

-- auth.role() — returns the role name from the JWT or the current role.
-- Our tenant_agents_protect_immutable trigger compares this against
-- 'service_role'. For smoke tests we SET ROLE to control it.
CREATE OR REPLACE FUNCTION auth.role() RETURNS TEXT
LANGUAGE SQL STABLE AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    current_user
  )
$$;

-- Required extensions. Supabase enables these by default.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- supabase_realtime publication. Supabase ships this by default;
-- 001_initial_schema.sql does `ALTER PUBLICATION supabase_realtime
-- ADD TABLE …` and fails on a vanilla cluster without the publication.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;
