import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectDir = path.resolve(__dirname, '..', '..');
const serverDir = path.resolve(__dirname, '..');
const sourceFile = path.join(projectDir, 'Directory', '2025 Telephone Directory - Cebu.csv');
const outputJson = path.join(serverDir, 'data', 'directory-cebu.json');
const outputMemory = path.join(serverDir, 'data', 'genmil_consciousness', 'telephone-directory-cebu.md');

function parseCsvLine(line) {
    const values = [];
    let value = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
        const char = line[i];
        const next = line[i + 1];

        if (char === '"' && next === '"') {
            value += '"';
            i += 1;
            continue;
        }

        if (char === '"') {
            inQuotes = !inQuotes;
            continue;
        }

        if (char === ',' && !inQuotes) {
            values.push(value.trim());
            value = '';
            continue;
        }

        value += char;
    }

    values.push(value.trim());
    return values;
}

function parseDirectory(csv) {
    const rows = csv
        .split(/\r?\n/)
        .filter(Boolean)
        .map(parseCsvLine);
    const title = rows[0]?.find(Boolean) || 'GMC Cebu Telephone Directory';
    const entries = [];
    const departmentsByGroup = new Map();
    const maxColumns = Math.max(...rows.map((row) => row.length));

    for (const row of rows.slice(1)) {
        for (let groupStart = 0; groupStart < maxColumns; groupStart += 3) {
            const first = (row[groupStart] || '').trim();
            const second = (row[groupStart + 1] || '').trim();

            if (!first && !second) {
                continue;
            }

            if (first && !second && !/^\*?\d|^\(\d{3}\)/.test(first)) {
                departmentsByGroup.set(groupStart, first.replace(/\s+/g, ' '));
                continue;
            }

            if (first) {
                entries.push({
                    site: 'Cebu',
                    department: departmentsByGroup.get(groupStart) || 'Unassigned',
                    localNumber: first.replace(/\s+/g, ' '),
                    name: second.replace(/\s+/g, ' ') || 'Unassigned'
                });
            }
        }
    }

    return {
        title,
        source: path.relative(projectDir, sourceFile),
        generatedAt: new Date().toISOString(),
        entries
    };
}

function groupEntriesByDepartment(entries) {
    return entries.reduce((groups, entry) => {
        if (!groups.has(entry.department)) {
            groups.set(entry.department, []);
        }
        groups.get(entry.department).push(entry);
        return groups;
    }, new Map());
}

function toMarkdown(directory) {
    const groups = groupEntriesByDepartment(directory.entries);
    const sections = [...groups.entries()].map(([department, entries]) => {
        const rows = entries
            .map((entry) => `| ${entry.localNumber} | ${entry.name} |`)
            .join('\n');

        return `## ${department}\n\n| Local Number | Name / Area |\n| --- | --- |\n${rows}`;
    });

    return `# Telephone Directory - Cebu

- Type: internal directory
- Site: Cebu
- Source: ${directory.source}
- Generated: ${directory.generatedAt}

Use this memory when users ask for local numbers, telephone numbers, extensions, departments, names, areas, gates, conference rooms, direct lines, or speed dial numbers.

${sections.join('\n\n')}
`;
}

async function main() {
    const csv = await fs.readFile(sourceFile, 'utf8');
    const directory = parseDirectory(csv);

    await fs.writeFile(outputJson, `${JSON.stringify(directory, null, 2)}\n`, 'utf8');
    await fs.writeFile(outputMemory, toMarkdown(directory), 'utf8');

    console.log(`Imported ${directory.entries.length} directory entries.`);
    console.log(`JSON: ${path.relative(projectDir, outputJson)}`);
    console.log(`Memory: ${path.relative(projectDir, outputMemory)}`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
