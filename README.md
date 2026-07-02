# Airside ⟶ LogTen Importer v1.4.5

Wasmer/PHP app for converting Airside Flight CSV exports into LogTen-ready CSV files.

## v1.4.5 changes

- Top help button now opens a general onboarding/about guide instead of the LogTen field mapping.
- Summary panel Full Mapping Guide still opens the detailed LogTen import field mapping.
- Help guide now explains what the tool does, privacy, Airside export, LogTen People Export, missing PIC workflow, scheduled times, and LogTen import.
- Section headings now include workflow step labels for Upload, Conversion options, and Review.


- Moved Conversion progress into the right column below Active LogTen rules.
- Made Conversion options rows more compact while keeping full-width clickable switch rows.
- Kept Scheduled times hidden until a Flight CSV is uploaded and the Employee ID is approved.

- Removes the accidental unused `script.js` and `script2.js` files from the package.
- Keeps the AirLabs scheduled-times card completely hidden until a Flight CSV is uploaded and the backend confirms an approved Employee ID.
- Makes the Conversion rules panel more compact with horizontally flowing grouped rule cards.
- Keeps slide switches and the existing current workflow.
- Live preview continues to show all exported columns, including `Scheduled Time Note`.

## Deploy

Use the ZIP contents as your GitHub repository root:

```text
public/
  index.html
  styles.css
  js/
    app.js
    csv.js
    people.js
    airlabs.js
    preview.js
    ui.js
    utils.js
index.php
wasmer.toml
.env.example
README.md
```

Do not place the files inside an extra nested folder.

## Wasmer database variables

The backend accepts Wasmer database variable aliases:

```text
Host:      DB_HOST or MYSQL_HOST
Port:      DB_PORT or MYSQL_PORT
Database:  DB_NAME, MYSQL_NAME, or MYSQL_DATABASE
Username:  DB_USERNAME, DB_USER, MYSQL_USERNAME, or MYSQL_USER
Password:  DB_PASSWORD or MYSQL_PASSWORD
```

Check `/health` first, then `/admin/debug`, then `/admin`.

## Admin

Open `/admin` after deployment to configure:

- AirLabs API key
- monthly limit
- historical request cost
- allowed Employee IDs
- current month usage
- backup/restore

## Notes

The AirLabs API key stays server-side in the Wasmer/PHP backend and is not exposed in `public/index.html`.


## v1.4.5 code structure

The frontend has been modularized for easier maintenance:

- `public/index.html` - page markup only
- `public/styles.css` - app styling
- `public/js/app.js` - bootstrap, global state, event binding
- `public/js/csv.js` - Flight CSV parsing, conversion, export, reset
- `public/js/people.js` - LogTen People export, PIC/SIC matching, manual fixes
- `public/js/airlabs.js` - AirLabs access checks, scan, usage text, schedule report
- `public/js/preview.js` - live preview tables, PIC preview, and schedule preview rendering
- `public/js/ui.js` - modals, mapping guide, status cards, rules panel, tabs
- `public/js/utils.js` - shared helpers

The backend remains in `index.php` for Wasmer compatibility, but the static frontend is now split into small files.


## v1.4.5

- Adds duplicate root-level static assets plus a hardened PHP router so styles and modular JavaScript load reliably on Wasmer rebuilds.
- Flight CSV and People export chips turn green once a file is selected.
