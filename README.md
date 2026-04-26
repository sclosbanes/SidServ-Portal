# GMC Portal

Internal portal prototype for General Milling Corporation. The app provides a central landing page for office systems, a searchable telephone directory, an admin panel, and the GeMil chatbot for quick employee assistance.

## Features

- Portal dashboard with office system cards
- IT-focused "Did You Know?" tips and reminders
- Floating GeMil chatbot
- Deterministic local-number lookup from the Cebu telephone directory
- Searchable directory page at `/directory.html`
- Admin panel at `/admin.html`
- Admin login with password verification
- Portal link management
- Directory entry creation from admin
- Searchable admin logs
- Optional OpenAI File Search for smarter memory-based answers
- Local fallback responses when OpenAI is unavailable or over quota

## Project Structure

```text
GMC_Portal/
├── Directory/
│   └── 2025 Telephone Directory - Cebu.csv
├── public/
│   ├── index.html
│   ├── admin.html
│   ├── directory.html
│   ├── css/style.css
│   └── image assets
├── server/
│   ├── index.js
│   ├── config/.env.example
│   ├── data/
│   │   ├── links.json
│   │   ├── directory-cebu.json
│   │   ├── genmil_consciousness/
│   │   └── genmil_memory/
│   └── scripts/
│       ├── import-directory-memory.mjs
│       ├── import-genmil-memory.mjs
│       └── upload-openai-memory.mjs
└── setup.md
```

## Requirements

- Node.js 20 or newer recommended
- npm
- Optional: OpenAI API key for AI-powered GeMil responses

## Environment Setup

Copy the example environment file:

```bash
cp server/config/.env.example server/config/.env
```

Edit `server/config/.env`:

```env
PORT=3000
ADMIN_PASSWORD=change_me
OPENAI_API_KEY=your_api_key_here
OPENAI_MODEL=gpt-5.4-mini
OPENAI_VECTOR_STORE_ID=
```

Do not commit real credentials. The repo ignores `server/config/.env`.

## Install Dependencies

```bash
cd server
npm install
```

## Run Locally

```bash
cd server
node index.js
```

Open:

```text
http://localhost:3000
```

Useful pages:

- Portal: `http://localhost:3000`
- Admin: `http://localhost:3000/admin.html`
- Directory: `http://localhost:3000/directory.html`

## Admin Panel

The admin panel uses `ADMIN_PASSWORD` from `server/config/.env`.

Admin can:

- Unlock with the admin password
- Add portal links
- Delete portal links
- Add telephone directory entries
- Search directory entries
- View and search admin logs

Admin logs are written to:

```text
server/data/admin-logs.jsonl
```

## Portal Links

Portal cards are stored in:

```text
server/data/links.json
```

Each link uses this shape:

```json
{
  "id": "card-directory",
  "name": "Directory",
  "description": "Local Numbers",
  "url": "/directory.html",
  "target": "_self",
  "color": "teal",
  "iconType": "lucide",
  "icon": "phone-call"
}
```

The current starter set includes 20 office-use links such as Gmail, Calendar, Drive, HRIS, Payroll, Leave Management, Support Ticket, Directory, GatePass, Entry Pass, Policies, Forms, Procurement, and Power BI.

## Telephone Directory

The source CSV is:

```text
Directory/2025 Telephone Directory - Cebu.csv
```

Generate app-ready directory data and GeMil memory:

```bash
cd server
npm run import:directory
```

This creates:

```text
server/data/directory-cebu.json
server/data/genmil_consciousness/telephone-directory-cebu.md
```

GeMil answers local-number questions directly from `directory-cebu.json`, so directory questions still work even if OpenAI is down or over quota.

Example questions:

- `local number for IT`
- `what is the local number for HR Payroll?`
- `main gate local`

## GeMil Chatbot Memory

Permanent internal memory lives in:

```text
server/data/genmil_consciousness/
```

Use Markdown files for:

- FAQs
- portal workflows
- approved policy guidance
- contact notes
- support routing
- directory knowledge

Website-imported memory lives in:

```text
server/data/genmil_memory/
```

To refresh website memory:

```bash
cd server
npm run import:genmil-memory
```

## OpenAI File Search

To make GeMil smarter with semantic search, upload memory files to OpenAI:

```bash
cd server
npm run upload:memory
```

The script uploads:

- `server/data/genmil_consciousness`
- `server/data/genmil_memory`
- `server/data/links.json`

It writes the vector store ID back to `server/config/.env`:

```env
OPENAI_VECTOR_STORE_ID=vs_your_vector_store_id
```

If OpenAI returns `429 insufficient_quota`, GeMil still uses local fallback logic for directory, leave, payroll, support, gate pass, entry pass, and other saved memory matches.

## API Endpoints

Public:

- `GET /api/links`
- `GET /api/directory`
- `GET /api/directory?q=IT`
- `POST /api/chat`

Admin:

- `POST /api/admin/verify`
- `GET /api/admin/logs`
- `POST /api/links`
- `POST /api/directory`

Admin endpoints require the `x-admin-password` header.

## Version Control Notes

Ignored local files include:

- `server/config/.env`
- `server/config/service-account.json`
- `server/node_modules/`
- logs
- `.DS_Store`

Commit normal source, public assets, scripts, and non-secret data files.

## Current Known Note

The app is configured for OpenAI, but it gracefully falls back to local responses when the API key is missing, invalid, or over quota.
