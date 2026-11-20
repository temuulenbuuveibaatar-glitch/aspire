-- The project was created with "grant API access to new tables" off, so the server's
-- service role could not read Aspire's tables. Grant it (browsers/anon still get nothing;
-- RLS stays enabled with no client policies).
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
