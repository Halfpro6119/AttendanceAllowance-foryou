-- Application form submissions for Attendance Allowance for You
-- Run this in Supabase Dashboard > SQL Editor

create table if not exists application_submissions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  
  -- Contact details
  full_name text not null,
  email text not null,
  phone text,
  
  -- Personal details
  address text,
  date_of_birth date,
  
  -- Application info
  care_needs_description text,
  preferred_contact_method text check (preferred_contact_method in ('phone', 'email', 'either')),
  
  -- Eligibility checker result (optional, if they came from checker)
  eligibility_result text
);

-- Index for querying recent submissions
create index if not exists idx_application_submissions_created_at 
  on application_submissions (created_at desc);

-- Enable Row Level Security (RLS)
alter table application_submissions enable row level security;

-- Allow anonymous inserts (for public form submissions)
-- Restrict read/update/delete to authenticated users only
create policy "Allow public insert" on application_submissions
  for insert
  to anon
  with check (true);

create policy "Allow authenticated read" on application_submissions
  for select
  to authenticated
  using (true);

create policy "Allow authenticated update" on application_submissions
  for update
  to authenticated
  using (true);

create policy "Allow authenticated delete" on application_submissions
  for delete
  to authenticated
  using (true);
