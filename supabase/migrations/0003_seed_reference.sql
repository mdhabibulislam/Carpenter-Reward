insert into roles (code, label, description) values
  ('admin', 'Administrator', 'Full system access'),
  ('management', 'Management', 'Organisation-wide read access'),
  ('finance', 'Finance', 'Manages periods, batches and payment statuses'),
  ('asm', 'Area Sales Manager', 'Access to assigned SRs and territories'),
  ('sr', 'Sales Representative', 'Access to own territory only')
on conflict do nothing;

insert into failure_reasons (code, label, sort_order) values
  ('INVALID_BKASH', 'Invalid bKash Number', 1),
  ('INACTIVE_ACCOUNT', 'Inactive bKash Account', 2),
  ('ACCOUNT_RESTRICTED', 'Account Restricted', 3),
  ('INFO_MISMATCH', 'Information Mismatch', 4),
  ('DUPLICATE_ENTRY', 'Duplicate Entry', 5),
  ('TECHNICAL_ISSUE', 'Technical Issue', 6),
  ('INSUFFICIENT_BALANCE', 'Insufficient Balance', 7),
  ('APPROVAL_PENDING', 'Approval Pending', 8),
  ('VERIFICATION_PENDING', 'Verification Pending', 9),
  ('NOT_IN_BATCH', 'Not Included in Payment Batch', 10),
  ('OTHER', 'Other', 11)
on conflict do nothing;
