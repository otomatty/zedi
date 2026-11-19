-- Magic links are gone (sign-in is Google, or the test IdP outside production), so the
-- development outbox that captured them is no longer used.
DROP TABLE IF EXISTS dev_outbox;
