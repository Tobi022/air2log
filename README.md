# Airside ⟶ LogTen Importer v1.3.6

## What changed in v1.3.6

- Live preview now shows every exported CSV column.
- The table still scrolls horizontally, so no output fields are hidden.


## What changed in v1.3.6

- Reworked the Optional rules panel into grouped Conversion rules.
- Replaced checkbox styling with slide switches.
- Added a clearer AirLabs scheduled-time card with privacy, SK-only, cache, and 60-minute validation notes.
- Improved the live preview so Scheduled Time Note is easier to spot.


## What changed in v1.3.6

- Admin page can now manually edit the current UTC-month AirLabs usage count.
- Backup JSON now includes monthly AirLabs usage rows, so usage can be restored if you move databases.
- Help popup now explains the **Download unknown PIC IDs** workflow and how to add missing IDs to LogTen People, then re-export People Export.
- Keeps the v1.3.3 scheduled-time 60-minute validation.

# Airside ⟶ LogTen Importer v1.3.6

## What changed in v1.3.6

Scheduled-time lookup now only adds AirLabs scheduled departure/arrival times when the scheduled time is within 60 minutes of the actual time in the uploaded CSV. If the candidate is more than 60 minutes away, the CSV can still be downloaded, but `Scheduled Dep` / `Scheduled Arr` stay empty and `Scheduled Time Note` explains why.


This is the Airside to LogTen CSV importer with optional AirLabs scheduled-time lookup and a private admin page.

## What changed in v1.3.6

- Added `/admin/debug` diagnostics page.
- Added **Import test mode** inside `/admin` to test one SAS flight without uploading a CSV.
- Added **Download error report** for scheduled-time failures.
- The exported LogTen CSV now includes `Scheduled Time Note`; it stays blank for successful rows and explains missing/error rows while `Scheduled Dep` and `Scheduled Arr` remain blank.
- Added backup/restore of admin settings and optional schedule cache as JSON.

## What changed in v1.3.6

- Accepts the Wasmer database variable names seen in the dashboard, including `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`/`MYSQL_NAME`, `MYSQL_USER`/`MYSQL_USERNAME`, `MYSQL_PASSWORD`, plus the `DB_*` variants Wasmer shows when database support is enabled.
- Added a configurable **Historical request cost** in `/admin`.
- Monthly usage now counts request units, not just raw HTTP requests, if you set the historical cost above 1.
- The public AirLabs historical docs show the endpoint and fields, but do not clearly state a separate request multiplier. Keep the value at `1` unless your AirLabs dashboard shows that historical calls deduct more than one request unit.
- Cache is still stored in MySQL and does not expire automatically, so it safely preserves old route/schedule matches for at least a month.
- If a cached scheduled departure is more than 60 minutes away from the Airside actual departure / Block off time, the backend ignores that cache row and refreshes that flight from AirLabs.

## What changed in v1.3.6

- Added `/admin` setup and settings page.
- AirLabs API key is stored in MySQL through the admin page, not in the public HTML.
- Approved Employee IDs are managed in the admin page and support multiple IDs.
- Monthly AirLabs request limit is managed in the admin page.
- Admin page shows monthly usage and schedule-cache count.
- Admin page can clear the schedule cache, reset current-month usage, test a single import, and export/restore settings/cache backups.
- Scheduled-time lookup only appears for approved `Employee id` values.
- Scheduled-time lookup only scans SAS `SK` flight numbers.
- `SK0602` is normalized to `SK602` before the AirLabs request.

## Folder structure

```txt
public/
  index.html
index.php
wasmer.toml
README.md
.env.example
```

`public/index.html` is the browser app.

`index.php` is the backend. It serves the frontend, exposes the schedule API, stores settings/cache/usage in MySQL, and serves the `/admin` page.

## Database tables

The PHP backend auto-creates these tables when it can connect to MySQL:

- `app_settings` — admin password hash, AirLabs key, monthly limit, historical request cost, allowed Employee IDs.
- `schedule_cache` — cached scheduled departure/arrival times.
- `api_usage_month` — counted AirLabs request units per UTC month.

No SQL setup is normally needed; the app creates the tables on first request.

## First run after deployment

1. Open your app URL.
2. Go to `/admin`.
3. Create the first admin password immediately.
4. Save:
   - AirLabs API key
   - monthly limit, usually `1000`
   - historical request cost, usually `1` unless AirLabs deducts more
   - allowed Employee IDs, for example one per line
5. Go back to the importer and upload an Airside CSV.

The scheduled-time option only appears if the uploaded CSV contains an approved `Employee id`.

## Important security note

The first person to open `/admin` after a brand-new deployment can create the admin password. Open `/admin` immediately after deployment and create the password before sharing the app URL.

## Wasmer database variables

The app accepts either a single database URL:

```txt
DATABASE_URL=mysql://user:password@host:3306/database
```

or these variables:

```txt
DB_HOST
DB_PORT
DB_NAME
DB_USER
DB_PASSWORD
```

It also accepts equivalent `MYSQL_*` names, which are the ones that worked in your Wasmer setup:

```txt
MYSQL_HOST
MYSQL_PORT
MYSQL_DATABASE
MYSQL_USER
MYSQL_PASSWORD
```

## Optional local development

You can test locally with PHP:

```bash
php -S 127.0.0.1:8080 index.php
```

Then open:

```txt
http://127.0.0.1:8080
http://127.0.0.1:8080/admin
http://127.0.0.1:8080/admin/debug
```

For local scheduled-time lookup, set MySQL connection variables in your shell before starting PHP.

## AirLabs endpoint used

The backend calls:

```txt
https://airlabs.co/api/v10/historical?flight_iata=SK1871&api_key=...
```

It reads `dep_time` and `arr_time`, then keeps only the `HH:MM` part for LogTen.

## Cache and refresh behavior

The backend caches matched schedule rows in MySQL using flight number, Airside date, departure airport, and arrival airport.

Matching order:

1. Try exact Airside date + route.
2. If AirLabs only returns a recent date, fall back to flight number + route.
3. Cache the scheduled departure/arrival times.
4. Later scans reuse cache unless the Airside actual departure / `Block off` time is more than 60 minutes away from the cached scheduled departure. In that case, the backend refreshes that flight from AirLabs.

## Privacy

Normal CSV conversion happens in the browser. Scheduled-time lookup sends only the minimum needed data to your own Wasmer backend: Employee ID, flight number, date, route, and actual departure/Block off time for cache-refresh checks. The backend checks the allow-list, checks the cache, and only then calls AirLabs if needed.


## v1.3.6 fix

Fixes the admin/debug page 500 error caused by a missing HTML escaping helper in v1.3.6. Database variables are still strictly `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USER`, and `MYSQL_PASSWORD`.


## v1.3.6 database variable fix

Wasmer has shown different MySQL variable names in different app/database screens. This build accepts all of these aliases:

- Host: `MYSQL_HOST` or `DB_HOST`
- Port: `MYSQL_PORT` or `DB_PORT`
- Database name: `MYSQL_DATABASE`, `MYSQL_NAME`, or `DB_NAME`
- Username: `MYSQL_USER`, `MYSQL_USERNAME`, `DB_USER`, or `DB_USERNAME`
- Password: `MYSQL_PASSWORD` or `DB_PASSWORD`

If diagnostics says the DB is missing, open `/admin/debug`; it will show which variables PHP can actually see and which alias it selected.


## Wasmer database variable names

Wasmer may expose the built-in database using either `DB_*` or `MYSQL_*` names depending on the creation flow. v1.3.6 accepts all of these aliases:

- Host: `DB_HOST` or `MYSQL_HOST`
- Port: `DB_PORT` or `MYSQL_PORT`
- Database name: `DB_NAME`, `MYSQL_NAME`, or `MYSQL_DATABASE`
- Username: `DB_USERNAME`, `DB_USER`, `MYSQL_USERNAME`, or `MYSQL_USER`
- Password: `DB_PASSWORD` or `MYSQL_PASSWORD`

Do not rename Wasmer's generated variables unless needed. The app will detect them automatically. After rotating credentials or changing variables, use Save and Redeploy.

If `/admin` fails, open `/admin/debug`. It reports variable presence and the MySQL connection error without showing passwords.
