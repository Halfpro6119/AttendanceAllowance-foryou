-- Whether the admin notification email was sent (updated by Vercel /api/notify-submission)

alter table public.application_submissions
  add column if not exists email_sent boolean not null default false;

alter table public.callback_submissions
  add column if not exists email_sent boolean not null default false;

comment on column public.application_submissions.email_sent is
  'True after notify-submission successfully sent the notification email.';
comment on column public.callback_submissions.email_sent is
  'True after notify-submission successfully sent the notification email.';

-- Upgrade path if a previous revision added email_notification_* columns
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'application_submissions'
      and column_name = 'email_notification_sent_at'
  ) then
    update public.application_submissions
      set email_sent = true
      where email_notification_sent_at is not null;
    alter table public.application_submissions drop column if exists email_notification_sent_at;
    alter table public.application_submissions drop column if exists email_notification_error;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'callback_submissions'
      and column_name = 'email_notification_sent_at'
  ) then
    update public.callback_submissions
      set email_sent = true
      where email_notification_sent_at is not null;
    alter table public.callback_submissions drop column if exists email_notification_sent_at;
    alter table public.callback_submissions drop column if exists email_notification_error;
  end if;
end $$;
