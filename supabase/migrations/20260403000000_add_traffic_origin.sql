-- Optional attribution: set from the browser only when Google Ads click IDs are present on landing.
alter table public.application_submissions
  add column if not exists traffic_origin text;

alter table public.callback_submissions
  add column if not exists traffic_origin text;

comment on column public.application_submissions.traffic_origin is
  'google_ads when gclid/gbraid/wbraid was present on first page load in the session; otherwise null.';

comment on column public.callback_submissions.traffic_origin is
  'google_ads when gclid/gbraid/wbraid was present on first page load in the session; otherwise null.';
