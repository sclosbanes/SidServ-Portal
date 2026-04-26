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
OPENAI_MODEL=gpt-5-mini
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
- Do not commit your real API key to Git.
