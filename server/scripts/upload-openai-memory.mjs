import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverDir = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(serverDir, 'config', '.env') });

const memoryDirs = [
    path.join(serverDir, 'data', 'genmil_consciousness'),
    path.join(serverDir, 'data', 'genmil_memory')
];
const extraFiles = [
    path.join(serverDir, 'data', 'links.json')
];
const apiKey = process.env.OPENAI_API_KEY;
const existingVectorStoreId = process.env.OPENAI_VECTOR_STORE_ID;

function listMemoryFiles(dir) {
    if (!fs.existsSync(dir)) {
        return [];
    }

    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const entryPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            return listMemoryFiles(entryPath);
        }

        if (entry.isFile() && /\.(md|txt|json)$/i.test(entry.name)) {
            return [entryPath];
        }

        return [];
    });
}

async function ensureEnvFileHasVectorStore(vectorStoreId) {
    const envPath = path.join(serverDir, 'config', '.env');

    if (!fs.existsSync(envPath)) {
        return;
    }

    const current = await fsp.readFile(envPath, 'utf8');
    const next = current.match(/^OPENAI_VECTOR_STORE_ID=/m)
        ? current.replace(/^OPENAI_VECTOR_STORE_ID=.*/m, `OPENAI_VECTOR_STORE_ID=${vectorStoreId}`)
        : `${current.trimEnd()}\nOPENAI_VECTOR_STORE_ID=${vectorStoreId}\n`;

    await fsp.writeFile(envPath, next, 'utf8');
}

async function main() {
    if (!apiKey || apiKey === 'your_api_key_here') {
        throw new Error('Set OPENAI_API_KEY in server/config/.env before uploading memory.');
    }

    const client = new OpenAI({ apiKey });
    const vectorStore = existingVectorStoreId
        ? await client.vectorStores.retrieve(existingVectorStoreId)
        : await client.vectorStores.create({ name: 'GMC Portal GenMil Memory' });
    const filepaths = [
        ...memoryDirs.flatMap(listMemoryFiles),
        ...extraFiles.filter((filepath) => fs.existsSync(filepath))
    ];

    if (!filepaths.length) {
        throw new Error('No memory files found to upload.');
    }

    const files = filepaths.map((filepath) => fs.createReadStream(filepath));
    const batch = await client.vectorStores.fileBatches.uploadAndPoll(
        vectorStore.id,
        { files },
        { pollIntervalMs: 2000, maxConcurrency: 5 }
    );

    await ensureEnvFileHasVectorStore(vectorStore.id);

    console.log(`Uploaded ${filepaths.length} memory files.`);
    console.log(`Vector store ID: ${vectorStore.id}`);
    console.log(`Batch status: ${batch.status}`);
    console.log(`File counts: ${JSON.stringify(batch.file_counts)}`);
    console.log('server/config/.env has been updated with OPENAI_VECTOR_STORE_ID.');
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
