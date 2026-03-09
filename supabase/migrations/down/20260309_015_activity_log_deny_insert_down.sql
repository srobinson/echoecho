-- DOWN migration for 20260309_015_activity_log_deny_insert
DROP POLICY IF EXISTS activity_log_deny_insert ON activity_log;
