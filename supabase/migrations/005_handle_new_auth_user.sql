-- Signup: create public.accounts when auth.users is inserted (no JWT session required).
-- Fixes RLS failure when email confirmation is enabled — client insert used auth.uid() = null.

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  biz text;
BEGIN
  IF EXISTS (SELECT 1 FROM public.accounts WHERE owner_user_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  biz := COALESCE(NEW.raw_user_meta_data->>'business_name', '');
  IF TRIM(biz) = '' THEN
    biz := '';
  END IF;

  INSERT INTO public.accounts (owner_user_id, business_name, plan_slug, vertical)
  VALUES (
    NEW.id,
    biz,
    'trial',
    'hvac'::vertical
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();

COMMENT ON FUNCTION public.handle_new_auth_user() IS
  'Creates accounts row + account_users (via trg_accounts_create_owner) for every new auth user; signup must not insert accounts from the browser.';
