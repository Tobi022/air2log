# Airside ⟶ LogTen Importer v1.3.7

Wasmer/PHP app for converting Airside Flight CSV exports into LogTen-ready CSV files.

## v1.3.7 changes

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
