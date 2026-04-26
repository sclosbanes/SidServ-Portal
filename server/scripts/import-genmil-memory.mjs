import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { convert } from 'html-to-text';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverDir = path.resolve(__dirname, '..');
const outputDir = path.join(serverDir, 'data', 'genmil_memory');
const baseUrl = 'https://genmil.com.ph/wp-json/wp/v2';

const pageFields = 'slug,link,title,content,date,modified';

function slugify(value) {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);
}

function htmlToMarkdown(html) {
    return convert(html || '', {
        wordwrap: 100,
        selectors: [
            { selector: 'a', options: { hideLinkHrefIfSameAsText: true } },
            { selector: 'img', format: 'skip' },
            { selector: 'svg', format: 'skip' },
            { selector: 'video', format: 'skip' },
            { selector: '.elementor-share-buttons', format: 'skip' },
            { selector: 'style', format: 'skip' },
            { selector: 'script', format: 'skip' }
        ]
    })
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

async function fetchJson(url) {
    const response = await fetch(url, {
        headers: {
            'User-Agent': 'GMC-Portal-Knowledge-Importer/1.0'
        }
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.status}`);
    }

    return response.json();
}

function toMarkdownDoc(item, type) {
    const title = item?.title?.rendered?.trim() || item.slug;
    const body = htmlToMarkdown(item?.content?.rendered || '');

    return `# ${title}

- Type: ${type}
- URL: ${item.link}
- Slug: ${item.slug}
- Published: ${item.date || ''}
- Modified: ${item.modified || ''}

## Content

${body}
`;
}

async function writeDoc(filename, content) {
    await fs.writeFile(path.join(outputDir, filename), content, 'utf8');
}

async function main() {
    await fs.mkdir(outputDir, { recursive: true });

    const [pages, posts] = await Promise.all([
        fetchJson(`${baseUrl}/pages?per_page=100&_fields=${pageFields}`),
        fetchJson(`${baseUrl}/posts?per_page=20&_fields=${pageFields}`)
    ]);

    const docs = [];

    for (const page of pages) {
        const filename = `page-${slugify(page.slug || 'page')}.md`;
        const content = toMarkdownDoc(page, 'page');
        await writeDoc(filename, content);
        docs.push({ filename, title: page?.title?.rendered || page.slug, url: page.link, type: 'page' });
    }

    for (const post of posts) {
        const filename = `post-${slugify(post.slug || 'post')}.md`;
        const content = toMarkdownDoc(post, 'post');
        await writeDoc(filename, content);
        docs.push({ filename, title: post?.title?.rendered || post.slug, url: post.link, type: 'post' });
    }

    const index = `# GenMil Website Memory Index

Imported from:
- https://genmil.com.ph/
- https://genmil.com.ph/wp-json/wp/v2/pages
- https://genmil.com.ph/wp-json/wp/v2/posts

Generated on: ${new Date().toISOString()}

## Documents

${docs
    .map((doc) => `- [${doc.title}](./${doc.filename}) (${doc.type}) - ${doc.url}`)
    .join('\n')}
`;

    await writeDoc('README.md', index);

    console.log(`Imported ${docs.length} documents into ${outputDir}`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
