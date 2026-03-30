-- Estimate Audit: per-account audit runs (no raw estimate text stored)

CREATE TABLE estimate_audit_log (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id              uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  vertical                vertical NOT NULL,
  job_type                text NOT NULL,
  suggestions             jsonb NOT NULL,
  total_potential_value   numeric NOT NULL,
  accepted_suggestions    jsonb,
  accepted_value_total    numeric
);

ALTER TABLE estimate_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "estimate_audit_log_select" ON estimate_audit_log FOR SELECT USING (
  auth.uid() IN (SELECT user_id FROM account_users WHERE account_id = estimate_audit_log.account_id)
);
CREATE POLICY "estimate_audit_log_insert" ON estimate_audit_log FOR INSERT WITH CHECK (
  auth.uid() IN (SELECT user_id FROM account_users WHERE account_id = estimate_audit_log.account_id)
);
CREATE POLICY "estimate_audit_log_update" ON estimate_audit_log FOR UPDATE USING (
  auth.uid() IN (SELECT user_id FROM account_users WHERE account_id = estimate_audit_log.account_id)
);

CREATE INDEX idx_estimate_audit_log_account_created
  ON estimate_audit_log (account_id, created_at DESC);
