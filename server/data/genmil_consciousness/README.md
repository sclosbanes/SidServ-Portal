# GenMil Consciousness

Use this folder for permanent chatbot memory that is not scraped from the public GMC website.

Add or edit Markdown files here when GeMil needs to remember company-specific instructions, FAQs,
portal workflows, department guidance, escalation paths, tone rules, or internal process notes.

Recommended file types:

- `identity.md` for who GeMil is and how it should answer.
- `portal-workflows.md` for step-by-step workflows.
- `faq.md` for common employee questions.
- `contacts.md` for official support contacts and escalation paths.
- `policies.md` for summarized policy guidance that has been approved for chatbot use.

After changing files in this folder:

1. Restart the server so local fallback memory reloads.
2. Run `npm run upload:memory` from the `server` folder if you use OpenAI File Search.
3. Copy the printed vector store ID into `server/config/.env` as `OPENAI_VECTOR_STORE_ID`.
