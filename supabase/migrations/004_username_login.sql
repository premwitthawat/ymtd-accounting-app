-- Switches login from a pre-auth tile picker to a proper ID + PIN form.
-- The "ID" is a chosen username (e.g. "prem01"), not the account's real
-- name — role/permissions are still an attribute of the profile row, just
-- looked up by username instead of by tapping a tile.

alter table profiles add column username text;

-- Backfill the two accounts created during Milestone 2 setup.
update profiles set username = 'prem01' where label = 'เปรม';
update profiles set username = 'ploy01' where label = 'พลอย';

-- Keep auth.users.email in sync — login now derives email from username,
-- not from the account's id.
update auth.users u
set email = p.username || '@ymtd.internal'
from profiles p
where p.id = u.id and p.username is not null;

alter table profiles alter column username set not null;
alter table profiles add constraint profiles_username_key unique (username);
