const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const OpenAI = require('openai');

require('dotenv').config({ path: './config/.env' });

const app = express();
const port = process.env.PORT || 3000;
const modelId = process.env.OPENAI_MODEL || 'gpt-5-mini';
const openAiApiKey = process.env.OPENAI_API_KEY;
const memoryDir = path.join(__dirname, 'data', 'genmil_memory');
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

function loadPortalMemoryDocs() {
    try {
        const filenames = fs
            .readdirSync(memoryDir)
            .filter((filename) => filename.endsWith('.md') && filename !== 'README.md');

        return filenames.map((filename) => {
            const filepath = path.join(memoryDir, filename);
            const content = fs.readFileSync(filepath, 'utf8');
            const titleMatch = content.match(/^#\s+(.+)$/m);
            const urlMatch = content.match(/^- URL:\s+(.+)$/m);

            return {
                filename,
                title: titleMatch ? titleMatch[1].trim() : filename,
                url: urlMatch ? urlMatch[1].trim() : '',
                content
            };
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
            return `Title: ${match.title}\nURL: ${match.url}\nSnippet: ${snippet}`;
        })
        .join('\n\n');
}

function getPortalFallbackResponse(userMessage, memoryMatches = []) {
    const text = userMessage.toLowerCase();

    if (memoryMatches.length) {
        const bestMatch = memoryMatches[0];
        const snippet = extractRelevantSnippet(bestMatch.content, normalizeTokens(userMessage));
        return `${snippet}\n\nSource: ${bestMatch.title}${bestMatch.url ? ` - ${bestMatch.url}` : ''}`;
    }

    if (text.includes('leave')) {
        return 'Open the Leave Management system, choose your leave type, select the dates, then submit it for approval.';
    }

    if (text.includes('payslip') || text.includes('payroll') || text.includes('salary')) {
        return 'You can view your payslip in the Payroll system under My Payslips.';
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

    return 'I can help with leave, payslips, IT support, gate pass, entry pass, and portal navigation. Ask me a short question and I will point you to the right system.';
}

function buildOpenAiInput(messages, systemInstruction) {
    const input = [];

    if (systemInstruction) {
        input.push({
            role: 'system',
            content: systemInstruction
        });
    }

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
        const response = await client.responses.create({
            model: modelId,
            input: buildOpenAiInput(
                messages,
                memoryContext
                    ? `${systemInstruction || ''}\n\nUse this local GMC website memory if relevant:\n${memoryContext}`.trim()
                    : systemInstruction
            )
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
    if (!hasValidOpenAiKey) {
        console.warn('OpenAI API key is missing or still set to the placeholder value in server/config/.env');
    }
});
