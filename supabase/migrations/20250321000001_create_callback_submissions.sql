-- Callback form submissions for Attendance Allowance for You
-- Run this in Supabase Dashboard > SQL Editor

create table if not exists callback_submissions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  full_name text not null,
  email text not null,
  phone text not null
);

create index if not exists idx_callback_submissions_created_at 
  on callback_submissions (created_at desc);

alter table callback_submissions enable row level security;

create policy "Allow public insert" on callback_submissions
  for insert to anon with check (true);

create policy "Allow authenticated read" on callback_submissions
  for select to authenticated using (true);
