#!/usr/bin/env node
// Rebuilds url-seo-file-map-data.json and url-seo-file-map.html from the
// developer handoff package (manifest.json + pages/<path>/).
//
//   node scripts/build-map.mjs [--repo owner/name] [--branch main] [--folder dev-handoff] [--path local/handoff/dir]
//
// Defaults come from map.config.json. The local handoff path defaults to
// ../<repo name>/<folder>, i.e. a clone next to this repo.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const { values: args } = parseArgs({
  options: {
    repo: { type: 'string' },
    branch: { type: 'string' },
    folder: { type: 'string' },
    path: { type: 'string' },
  },
});
const configPath = join(ROOT, 'map.config.json');
const config = { ...(existsSync(configPath) ? JSON.parse(readFileSync(configPath, 'utf8')) : {}) };
for (const k of ['repo', 'branch', 'folder', 'path']) if (args[k]) config[k] = args[k];
const { repo: REPO, branch: BRANCH = 'main', folder: FOLDER = '' } = config;
if (!REPO) throw new Error('No repo set: add "repo" to map.config.json or pass --repo owner/name');

const repoName = REPO.split('/').pop();
const HANDOFF = resolve(ROOT, config.path || join('..', repoName, FOLDER));
const prefix = FOLDER ? `${FOLDER.replace(/^\/|\/$/g, '')}/` : '';
const BLOB_BASE = `https://github.com/${REPO}/blob/${BRANCH}/${prefix}`;
const TREE_BASE = `https://github.com/${REPO}/tree/${BRANCH}/${prefix}`;

const manifestPath = join(HANDOFF, 'manifest.json');
if (!existsSync(manifestPath)) {
  console.error(`No manifest.json at ${HANDOFF}\nClone it next to this repo: gh repo clone ${REPO} ../${repoName}`);
  process.exit(1);
}

const encodePath = p => p.split('/').map(encodeURIComponent).join('/');

function sourceCommit() {
  try {
    return execFileSync('git', ['-C', HANDOFF, 'rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

// The manifest's folder case doesn't always match the repo (manifest "pages/support/…",
// git "pages/Support/…"). macOS hides this but GitHub URLs are case-sensitive, so walk
// the directory tree and take each segment's real name.
function realFolder(rel) {
  let cur = '';
  for (const seg of rel.split('/')) {
    const abs = join(HANDOFF, cur);
    if (!existsSync(abs)) return null;
    const names = readdirSync(abs);
    const hit = names.find(n => n === seg) ?? names.find(n => n.toLowerCase() === seg.toLowerCase());
    if (!hit) return null;
    cur = cur ? `${cur}/${hit}` : hit;
  }
  return cur;
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const fileNames = new Set();
const missingFolders = [];
const caseFixed = [];

const rows = manifest.pages.map(p => {
  const folder = realFolder(p.folder);
  const absFolder = folder && join(HANDOFF, folder);
  const filesPresent = Boolean(folder) && statSync(absFolder).isDirectory();
  if (!filesPresent) missingFolders.push(p.folder);
  else if (folder !== p.folder) caseFixed.push([p.folder, folder]);
  // Page folders can contain child page folders (pages/domain/transfer-domains), so list files only.
  const files = filesPresent
    ? readdirSync(absFolder).filter(f => !f.startsWith('.') && statSync(join(absFolder, f)).isFile()).sort()
    : [];
  files.forEach(f => fileNames.add(f));
  return {
    pageId: p.pageId,
    logicalPageId: p.logicalPageId,
    section: p.section,
    pagePath: p.path,
    title: p.title,
    targetUrl: p.plannedUrl,
    legacyUrls: p.legacyUrls || [],
    liveUrl: p.liveUrl,
    liveStatus: p.liveStatus,
    readiness: p.readiness || null,
    schemaAction: p.schemaAction || null,
    reason: p.reason || '',
    schemaIssues: p.schemaIssues || [],
    folder: folder || p.folder,
    githubFolderUrl: filesPresent ? TREE_BASE + encodePath(folder) : null,
    files: files.map(name => ({ name, url: BLOB_BASE + encodePath(`${folder}/${name}`) })),
    filesPresent,
  };
});

const tally = key => rows.reduce((acc, r) => (r[key] && (acc[r[key]] = (acc[r[key]] || 0) + 1), acc), {});
const data = {
  source: `${REPO}/${prefix}`,
  repo: REPO,
  branch: BRANCH,
  folder: FOLDER,
  sourceCommit: sourceCommit(),
  crawledAt: manifest.crawledAt || null,
  generatedAt: new Date().toISOString(),
  generatedBy: 'scripts/build-map.mjs',
  githubBase: BLOB_BASE,
  counts: {
    pages: rows.length,
    withFolder: rows.filter(r => r.filesPresent).length,
    fileTotal: rows.reduce((n, r) => n + r.files.length, 0),
    readiness: tally('readiness'),
    schemaAction: tally('schemaAction'),
    liveStatus: tally('liveStatus'),
    section: tally('section'),
  },
  fileNames: [...fileNames].sort(),
  rows,
};

writeFileSync(join(ROOT, 'url-seo-file-map-data.json'), JSON.stringify(data, null, 2) + '\n');

const template = readFileSync(join(ROOT, 'templates', 'url-seo-file-map.template.html'), 'utf8');
if (!template.includes('/*__DATA__*/null')) throw new Error('Template is missing the /*__DATA__*/null placeholder');
const embedded = JSON.stringify(data).replace(/</g, '\\u003c');
writeFileSync(join(ROOT, 'url-seo-file-map.html'), template.replace('/*__DATA__*/null', () => embedded));

const c = data.counts;
const fmt = o => Object.entries(o).map(([k, v]) => `${k} ${v}`).join(', ');
console.log(`Source: ${HANDOFF} @ ${data.sourceCommit?.slice(0, 7) ?? 'unknown'}`);
console.log(`Links:  ${BLOB_BASE}`);
console.log(`${c.pages} pages · ${c.withFolder} folders · ${c.fileTotal} files (${data.fileNames.join(', ')})`);
console.log(`Readiness: ${fmt(c.readiness)}`);
console.log(`Schema action: ${fmt(c.schemaAction)}`);
if (caseFixed.length) console.warn(`NOTE: ${caseFixed.length} manifest folders differ in case from the repo; linked the repo's case, e.g. ${caseFixed[0].join(' -> ')}`);
if (missingFolders.length) console.warn(`WARNING: ${missingFolders.length} manifest folders missing on disk, e.g. ${missingFolders[0]}`);
