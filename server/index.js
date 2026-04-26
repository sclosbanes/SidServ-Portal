const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const OpenAI = require('openai');

require('dotenv').config({ path: './config/.env' });

const app = express();
const port = process.env.PORT || 3000;
const modelId = process.env.OPENAI_MODEL || 'gpt-5.4-mini';
const openAiApiKey = process.env.OPENAI_API_KEY;
const openAiVectorStoreId = process.env.OPENAI_VECTOR_STORE_ID;
const memorySources = [
    {
        label: 'GenMil consciousness',
        dir: path.join(__dirname, 'data', 'genmil_consciousness')
    },
    {
        label: 'GMC website memory',
        dir: path.join(__dirname, 'data', 'genmil_memory')
    }
];
const hasValidOpenAiKey = Boolean(
    openAiApiKey &&
    openAiApiKey !== 'your_api_key_here'
);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

const client = hasValidOpenAiKey ? new OpenAI({ apiKey: openAiApiKey }) : null;
const portalMemoryDocs = loadPortalMemoryDocs();

function getLatestUserMessage(messages = []) {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
        const message = messages[i];
        if (message?.role !== 'user') continue;

        const text = message.parts
            ?.map((part) => part?.text || '')
            .join(' ')
            .trim();

        if (text) return text;
    }

    return '';
}

function listMarkdownFiles(dir) {
    if (!fs.existsSync(dir)) {
        return [];
    }

    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const entryPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            return listMarkdownFiles(entryPath);
        }

        if (entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'README.md') {
            return [entryPath];
        }

        return [];
    });
}

function loadPortalMemoryDocs() {
    try {
        return memorySources.flatMap((source) => {
            return listMarkdownFiles(source.dir).map((filepath) => {
                const filename = path.relative(__dirname, filepath);
                const content = fs.readFileSync(filepath, 'utf8');
                const titleMatch = content.match(/^#\s+(.+)$/m);
                const urlMatch = content.match(/^- URL:\s+(.+)$/m);

                return {
                    filename,
                    source: source.label,
                    title: titleMatch ? titleMatch[1].trim() : path.basename(filepath),
                    url: urlMatch ? urlMatch[1].trim() : '',
                    content
                };
            });
        });
    } catch (error) {
        console.error('Failed to load portal memory docs:', error.message);
        return [];
    }
}

function normalizeTokens(text) {
    return (text.toLowerCase().match(/[a-z0-9]{3,}/g) || []).filter((token) => {
        return ![
            'with', 'from', 'that', 'this', 'have', 'will', 'your', 'about', 'into', 'they',
            'them', 'their', 'what', 'when', 'where', 'which', 'could', 'would', 'there',
            'these', 'those', 'general', 'milling', 'corporation', 'genmil'
        ].includes(token);
    });
}

function findRelevantMemory(userMessage) {
    const queryTokens = normalizeTokens(userMessage);
    if (!queryTokens.length || !portalMemoryDocs.length) {
        return [];
    }

    const scored = portalMemoryDocs
        .map((doc) => {
            const haystack = `${doc.title}\n${doc.content}`.toLowerCase();
            let score = 0;

            for (const token of queryTokens) {
                if (haystack.includes(token)) {
                    score += 1;
                }
                if (doc.title.toLowerCase().includes(token)) {
                    score += 2;
                }
            }

            return { ...doc, score };
        })
        .filter((doc) => doc.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);

    return scored;
}

function extractRelevantSnippet(content, queryTokens) {
    const contentBody = content.includes('## Content')
        ? content.split('## Content')[1]
        : content;
    const lines = contentBody
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => {
            return Boolean(line) &&
                !line.startsWith('#') &&
                !line.startsWith('- Type:') &&
                !line.startsWith('- URL:') &&
                !line.startsWith('- Slug:') &&
                !line.startsWith('- Published:') &&
                !line.startsWith('- Modified:');
        });
    const relevant = lines.filter((line) => {
        const lower = line.toLowerCase();
        return queryTokens.some((token) => lower.includes(token));
    });

    return (relevant.slice(0, 4).join(' ') || lines.slice(0, 6).join(' ')).slice(0, 900);
}

function buildMemoryContext(matches, userMessage) {
    const queryTokens = normalizeTokens(userMessage);
    return matches
        .map((match) => {
            const snippet = extractRelevantSnippet(match.content, queryTokens);
            return `Source: ${match.source}\nTitle: ${match.title}\nURL: ${match.url}\nSnippet: ${snippet}`;
        })
        .join('\n\n');
}

function getPortalFallbackResponse(userMessage, memoryMatches = []) {
    const text = userMessage.toLowerCase();

    if (text.includes('leave')) {
        return 'For leave requests, open HiTS HRIS or the Leave Management system, choose your leave type, select the dates, add the required reason/details, then submit it for approval.';
    }

    if (text.includes('payslip') || text.includes('payroll') || text.includes('salary')) {
        return 'For payslips or payroll records, open the Payroll system or the HRIS payroll section if available. If you cannot access the record, contact HR or Payroll support.';
    }

    if (text.includes('it') || text.includes('ticket') || text.includes('support') || text.includes('helpdesk')) {
        return 'For IT issues, open the Support Ticket or IT Helpdesk link from the portal and include the problem details and screenshots if needed.';
    }

    if (text.includes('gate pass') || text.includes('gatepass')) {
        return 'Use the GatePass system, complete the request details, and submit it for supervisor approval.';
    }

    if (text.includes('visitor') || text.includes('entry pass')) {
        return 'Use Entry Pass to register visitors, ideally at least 24 hours before arrival.';
    }

    if (text.includes('password') || text.includes('reset')) {
        return 'For password reset, open Employee Self Service and go to Security Settings.';
    }

    if (text.includes('holiday')) {
        return 'You can check the company holiday list in the Company Policies section of the portal.';
    }

    if (memoryMatches.length) {
        const bestMatch = memoryMatches[0];
        const snippet = extractRelevantSnippet(bestMatch.content, normalizeTokens(userMessage));
        return `${snippet}\n\nSource: ${bestMatch.title}${bestMatch.url ? ` - ${bestMatch.url}` : ''}`;
    }

    return 'I do not have an exact saved policy for that yet, but I can still help. For portal access or work requests, start from the GMC Portal search, then check HRIS for HR items, Payroll for payslips, Support Ticket for IT issues, GatePass for gate access, or Entry Pass for visitors. Add the exact process to server/data/genmil_consciousness if you want me to remember it permanently.';
}

function buildGenMilInstruction(systemInstruction, memoryContext) {
    return `${systemInstruction || ''}

You are GeMil, the General Milling Corporation portal assistant.
Use the GenMil consciousness and GMC memory as your primary source of truth.
Answer every user question as helpfully as possible. If exact company information is missing, say what is known, give the best next step, and ask one short follow-up question only when needed.
Do not invent policy details, dates, rates, contacts, approvals, or legal/HR commitments. If a topic needs official confirmation, say which department or portal system should confirm it.
Keep answers concise, direct, and practical for GMC employees.
For portal tasks, point users to the correct system or workflow.

${memoryContext ? `Relevant local memory:\n${memoryContext}` : ''}`.trim();
}

function buildOpenAiInput(messages) {
    const input = [];

    messages.forEach((message) => {
        const role = message?.role === 'model' || message?.role === 'assistant' ? 'assistant' : 'user';
        const text = message?.parts?.map((part) => part?.text || '').join(' ').trim();

        if (!text) return;

        input.push({
            role,
            content: text
        });
    });

    return input;
}

function buildOpenAiTools() {
    if (!openAiVectorStoreId) {
        return undefined;
    }

    return [
        {
            type: 'file_search',
            vector_store_ids: [openAiVectorStoreId],
            max_num_results: 6
        }
    ];
}

app.post('/api/chat', async (req, res) => {
    try {
        const { messages, systemInstruction } = req.body;
        const latestUserMessage = getLatestUserMessage(messages);
        const memoryMatches = findRelevantMemory(latestUserMessage);

        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ error: 'Messages array is required' });
        }

        if (!hasValidOpenAiKey || !client) {
            return res.json({ text: getPortalFallbackResponse(latestUserMessage, memoryMatches) });
        }

        const memoryContext = buildMemoryContext(memoryMatches, latestUserMessage);
        const tools = buildOpenAiTools();
        const response = await client.responses.create({
            model: modelId,
            instructions: buildGenMilInstruction(systemInstruction, memoryContext),
            input: buildOpenAiInput(messages),
            ...(tools ? { tools } : {})
        });

        const aiText = response.output_text?.trim();

        if (aiText) {
            return res.json({ text: aiText });
        }

        return res.json({ text: getPortalFallbackResponse(latestUserMessage, memoryMatches) });
    } catch (error) {
        console.error('Error calling OpenAI API:', error);

        const latestUserMessage = getLatestUserMessage(req.body?.messages);
        const memoryMatches = findRelevantMemory(latestUserMessage);
        return res.json({ text: getPortalFallbackResponse(latestUserMessage, memoryMatches) });
    }
});

const linksFilePath = path.join(__dirname, 'data', 'links.json');

app.get('/api/links', (req, res) => {
    try {
        const rawData = fs.readFileSync(linksFilePath);
        res.json(JSON.parse(rawData));
    } catch (error) {
        res.status(500).json({ error: 'Failed to load links data' });
    }
});

app.post('/api/links', (req, res) => {
    const adminPassword = req.headers['x-admin-password'];

    if (adminPassword !== process.env.ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Unauthorized: Invalid Admin Password' });
    }

    try {
        const newLinks = req.body;
        if (!Array.isArray(newLinks)) {
            return res.status(400).json({ error: 'Invalid data format. Expected an array of links.' });
        }

        fs.writeFileSync(linksFilePath, JSON.stringify(newLinks, null, 2));
        res.json({ success: true, message: 'Links updated successfully!' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to save links data' });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log(`Using OpenAI Model: ${modelId}`);
    console.log(`Loaded portal memory docs: ${portalMemoryDocs.length}`);
    console.log(`OpenAI File Search: ${openAiVectorStoreId ? `enabled (${openAiVectorStoreId})` : 'disabled'}`);
    if (!hasValidOpenAiKey) {
        console.warn('OpenAI API key is missing or still set to the placeholder value in server/config/.env');
    }
});
