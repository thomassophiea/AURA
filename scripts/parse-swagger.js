/**
 * Parses public/swagger.json and outputs a structured markdown catalog
 * grouped by tag, with method, path, operationId, summary, params, and response info.
 */
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const swagger = JSON.parse(readFileSync(path.join(__dirname, '..', 'public', 'swagger.json'), 'utf-8'));

const endpoints = [];

for (const [pathStr, methods] of Object.entries(swagger.paths)) {
  for (const [method, spec] of Object.entries(methods)) {
    if (!['get', 'post', 'put', 'delete', 'patch'].includes(method)) continue;
    const tags = spec.tags || ['Untagged'];
    const params = (spec.parameters || []).map(p => `${p.name} (${p.in}${p.required ? ', required' : ''})`).join(', ');
    const hasBody = !!spec.requestBody;
    const responses = Object.keys(spec.responses || {}).join(', ');

    for (const tag of tags) {
      endpoints.push({
        tag,
        method: method.toUpperCase(),
        path: pathStr,
        operationId: spec.operationId || '-',
        summary: (spec.summary || '-').replace(/\|/g, '\\|'),
        params: params || (hasBody ? '[request body]' : '-'),
        responses,
      });
    }
  }
}

// Group by tag
const byTag = {};
for (const ep of endpoints) {
  if (!byTag[ep.tag]) byTag[ep.tag] = [];
  byTag[ep.tag].push(ep);
}

// Sort tags alphabetically
const sortedTags = Object.keys(byTag).sort();

// Build markdown
let md = `# AURA Swagger Endpoint Catalog\n\n`;
md += `Generated: ${new Date().toISOString().split('T')[0]}\n`;
md += `Source: public/swagger.json (v${swagger.info.version})\n`;
md += `Total Paths: ${Object.keys(swagger.paths).length} | Total Methods: ${endpoints.length} | Tags: ${sortedTags.length}\n\n`;
md += `---\n\n`;

// Summary table of tags
md += `## Tag Summary\n\n`;
md += `| Tag | Endpoint Count | Methods |\n`;
md += `|-----|---------------|--------|\n`;
for (const tag of sortedTags) {
  const eps = byTag[tag];
  const methods = [...new Set(eps.map(e => e.method))].join(', ');
  md += `| ${tag} | ${eps.length} | ${methods} |\n`;
}
md += `\n---\n\n`;

// Detailed tables per tag
md += `## Endpoints by Tag\n\n`;
for (const tag of sortedTags) {
  const eps = byTag[tag];
  // Sort: GET first, then by path
  eps.sort((a, b) => {
    const methodOrder = { GET: 0, POST: 1, PUT: 2, PATCH: 3, DELETE: 4 };
    const diff = (methodOrder[a.method] || 5) - (methodOrder[b.method] || 5);
    return diff !== 0 ? diff : a.path.localeCompare(b.path);
  });

  md += `### ${tag}\n\n`;
  md += `| Method | Path | OperationId | Summary | Params | Responses |\n`;
  md += `|--------|------|-------------|---------|--------|-----------|\n`;
  for (const ep of eps) {
    md += `| ${ep.method} | \`${ep.path}\` | ${ep.operationId} | ${ep.summary} | ${ep.params} | ${ep.responses} |\n`;
  }
  md += `\n`;
}

// Unused endpoint detection helper: list all GET endpoints
md += `---\n\n`;
md += `## All GET Endpoints (for unused endpoint detection)\n\n`;
md += `| Path | OperationId | Tag | Summary |\n`;
md += `|------|-------------|-----|---------|\n`;
const getEndpoints = endpoints.filter(e => e.method === 'GET').sort((a, b) => a.path.localeCompare(b.path));
// Deduplicate by path
const seen = new Set();
for (const ep of getEndpoints) {
  if (seen.has(ep.path)) continue;
  seen.add(ep.path);
  md += `| \`${ep.path}\` | ${ep.operationId} | ${ep.tag} | ${ep.summary} |\n`;
}

writeFileSync(path.join(__dirname, '..', 'audit', 'aura-swagger-endpoint-catalog.md'), md, 'utf-8');
console.log(`Wrote ${endpoints.length} endpoints across ${sortedTags.length} tags to audit/aura-swagger-endpoint-catalog.md`);
