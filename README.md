# Life Plan

Simon's daily check-in, progress and goals app. Installable web app (PWA).

- **Hosting:** Netlify (`life-plan-simon.netlify.app`), static files, no build step.
- **Data and sign-in:** Supabase project "Life Plan" (London). Tables: `entries`, `goals`, `settings`, `push_subscriptions`, `reminder_log`, `app_secrets`. Row-level security on everything; only one account can ever be created.
- **Reminders:** Supabase edge function `send-reminders`, triggered every 15 minutes by `pg_cron`; sends web push at the times set in the app (default 07:45 and 21:30, Europe/London).

## Files
- `js/fields.js`: every daily field, its options and points, plus scoring.
- `js/app.js`: the app (Today, Progress, Goals, Settings).
- `js/goals-seed.js`: starting goals and categories.
- `sw.js`: offline cache and notifications.
