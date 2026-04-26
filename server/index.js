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
const directoryFilePath = path.join(__dirname, 'data', 'directory-cebu.json');
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
const telephoneDirectory = loadTelephoneDirectory();

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

function loadTelephoneDirectory() {
    try {
        if (!fs.existsSync(directoryFilePath)) {
            return { entries: [] };
        }

        return JSON.parse(fs.readFileSync(directoryFilePath, 'utf8'));
    } catch (error) {
        console.error('Failed to load telephone directory:', error.message);
        return { entries: [] };
    }
}

function getDirectoryQueryTokens(text) {
    return (text.toLowerCase().match(/[a-z0-9*() -]{2,}/g) || [])
        .join(' ')
        .replace(/[()]/g, ' ')
        .split(/[^a-z0-9*]+/)
        .map((token) => token.trim())
        .filter((token) => {
            return token.length >= 2 && ![
                'the', 'and', 'for', 'of', 'to', 'in', 'is', 'are', 'what', 'whats', 'what is',
                'local', 'number', 'telephone', 'phone', 'extension', 'ext', 'directory', 'cebu',
                'gmc', 'genmil'
            ].includes(token);
        });
}

function searchTelephoneDirectory(query, limit = 8) {
    const entries = telephoneDirectory.entries || [];
    const tokens = getDirectoryQueryTokens(query);
    const exactNumber = query.match(/\*?\d{3,4}|\(\d{3}\)\s*\d{3}\s*\d{4}/)?.[0]?.replace(/\s+/g, ' ');

    if (!entries.length || (!tokens.length && !exactNumber)) {
        return [];
    }

    return entries
        .map((entry) => {
            const department = entry.department.toLowerCase();
            const name = entry.name.toLowerCase();
            const localNumber = entry.localNumber.toLowerCase();
            const haystack = `${department} ${name} ${localNumber}`;
            const words = haystack.split(/[^a-z0-9*]+/).filter(Boolean);
            let score = 0;

            if (exactNumber && localNumber.includes(exactNumber.toLowerCase())) {
                score += 10;
            }

            for (const token of tokens) {
                if (localNumber === token) score += 10;
                if (name === token) score += 8;
                if (department === token) score += 7;

                if (token.length <= 2) {
                    if (words.includes(token)) score += 5;
                    continue;
                }

                if (name.includes(token)) score += 4;
                if (department.includes(token)) score += 3;
                if (haystack.includes(token)) score += 1;
            }

            return { ...entry, score };
        })
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score || a.department.localeCompare(b.department))
        .slice(0, limit);
}

function formatDirectoryAnswer(matches) {
    if (!matches.length) {
        return '';
    }

    const lines = matches.map((entry) => {
        return `- ${entry.name} (${entry.department}): local ${entry.localNumber}`;
    });

    return `Here are the closest Cebu directory matches:\n${lines.join('\n')}`;
}

function isDirectoryQuestion(text) {
    return /\b(local|telephone|phone|extension|directory|contact|number)\b/i.test(text);
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
    const directoryMatches = searchTelephoneDirectory(userMessage);

    if (isDirectoryQuestion(userMessage) && directoryMatches.length) {
        return formatDirectoryAnswer(directoryMatches);
    }

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

app.get('/api/directory', (req, res) => {
    const query = String(req.query.q || '').trim();

    if (query) {
        return res.json({
            ...telephoneDirectory,
            entries: searchTelephoneDirectory(query, 25)
        });
    }

    return res.json(telephoneDirectory);
});

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
    console.log(`Loaded directory entries: ${(telephoneDirectory.entries || []).length}`);
    console.log(`OpenAI File Search: ${openAiVectorStoreId ? `enabled (${openAiVectorStoreId})` : 'disabled'}`);
    if (!hasValidOpenAiKey) {
        console.warn('OpenAI API key is missing or still set to the placeholder value in server/config/.env');
    }
});
