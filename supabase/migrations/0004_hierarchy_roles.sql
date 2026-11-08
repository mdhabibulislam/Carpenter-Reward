-- Migration 0004: six-level hierarchy roles.
-- New enum values must be committed before use, so they live in their own migration.
alter type app_role add value if not exists 'super_admin';
alter type app_role add value if not exists 'gm';
alter type app_role add value if not exists 'dgm';
alter type app_role add value if not exists 'zsm';
