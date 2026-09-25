# FBA
Program to simulate a fictional basketball league

## Folder Differences

### FBA
The top professional league

### FBAD2
The division 2 level of the professional league

### FBAJC
College basketball

### FBAWC
The FBA world cup which occurs every other season

## Web app (`web/`)

A browser version of all four leagues. The Java programs above are kept as the reference (git tag `java-v1`).

    cd web
    npm install
    npm run dev        # app on http://localhost:5173, data server on 127.0.0.1:5174
    npm test           # engine, importer, server, and UI tests

League data lives in `web/data/` as JSON and is committed like the old `.txt` files. `npm run import` rebuilt it from the `.txt` files and Google Sheets once. Re-running it needs `-- --force` and overwrites all league data. The design is in `docs/superpowers/specs/2026-09-25-fba-web-design.md`.
