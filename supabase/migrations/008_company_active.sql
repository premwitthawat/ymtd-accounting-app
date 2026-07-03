-- Lets a company be closed out (client relationship ended) without
-- deleting it — deletion would cascade and destroy historical tasks.
-- Closed-out companies are hidden from the default company list but
-- stay in the database with their history intact.

alter table companies add column active boolean not null default true;
