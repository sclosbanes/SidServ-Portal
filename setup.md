# GMC Portal Setup

This project uses an Express backend in `server/index.js` to serve the portal UI and chat API.

## What API you need

The backend can use the OpenAI API when `OPENAI_API_KEY` is configured. If the key is missing or still set to the placeholder, the chat endpoint falls back to local GMC portal responses and memory files.

## How to add it to this project

Copy the example environment file:

```bash
cp server/config/.env.example server/config/.env
```

Then edit `server/config/.env` and replace:

```env
OPENAI_API_KEY=your_api_key_here
```

with:

```env
OPENAI_API_KEY=PASTE_YOUR_REAL_KEY_HERE
```

The current default model is:

```env
OPENAI_MODEL=gpt-5.4-mini
```

## How to make GeMil smarter

Add permanent chatbot memory in:

```text
server/data/genmil_consciousness
```

Use Markdown files for FAQs, workflows, contacts, policies, and approved internal guidance. Restart the server after editing this folder so the local fallback memory reloads.

For smarter semantic search with OpenAI File Search, run:

```bash
cd /Users/sclosbanes/Desktop/AntiGravity/GMC_Portal/server
npm run upload:memory
```

The upload script creates or updates an OpenAI vector store with:

- `server/data/genmil_consciousness`
- `server/data/genmil_memory`
- `server/data/links.json`

It then writes the vector store ID into `server/config/.env` as:

```env
OPENAI_VECTOR_STORE_ID=vs_your_vector_store_id
```

## How to run the app

From the project server folder:

```bash
cd /Users/sclosbanes/Desktop/AntiGravity/GMC_Portal/server
node index.js
```

Then open:

```text
http://localhost:3000
```

## Notes

- The frontend chat widget talks to `/api/chat`, so the Express server must be running.
- If `OPENAI_API_KEY` is missing or still set to the placeholder, the backend uses local fallback responses.
- If `OPENAI_VECTOR_STORE_ID` is configured, the backend lets OpenAI search the uploaded GenMil memory before answering.
- Do not commit your real API key to Git.
