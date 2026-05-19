#!/usr/bin/env node
import { execSync } from 'child_process';
import { writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

try {
  // Get git commit count (acts as version number)
  const commitCount = execSync('git rev-list --count HEAD', { encoding: 'utf-8' }).trim();

  // Get short commit hash
  const commitHash = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();

  // Get current branch
  const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();

  // Get commit date
  const commitDate = execSync('git log -1 --format=%cd --date=iso', { encoding: 'utf-8' }).trim();

  // Get commit message
  const commitMessage = execSync('git log -1 --format=%s', { encoding: 'utf-8' }).trim();

  // Format version string
  const version = `v${commitCount}.${commitHash}`;

  // Create env content
  const envContent = `# Auto-generated version info - DO NOT EDIT MANUALLY
# Generated at build time from git repository
VITE_APP_VERSION=${version}
VITE_APP_COMMIT_HASH=${commitHash}
VITE_APP_COMMIT_COUNT=${commitCount}
VITE_APP_BRANCH=${branch}
VITE_APP_BUILD_DATE=${new Date().toISOString()}
VITE_APP_COMMIT_DATE=${commitDate}
`;

  // Write to .env.production (for builds)
  const rootDir = join(__dirname, '..');
  writeFileSync(join(rootDir, '.env.production'), envContent);

  // Calculate cache version from commit count (used by service worker)
  // Adding base offset to ensure cache version is always higher than previous hard-coded values
  const cacheVersion = parseInt(commitCount, 10) + 500;

  // Also write version.json for deployment verification
  const versionJson = {
    version: version,
    commit: commitHash,
    commitFull: execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim(),
    commitCount: commitCount,
    cacheVersion: cacheVersion,
    branch: branch,
    buildDate: new Date().toISOString(),
    commitDate: commitDate,
    message: commitMessage,
    features: [
      'React 19 + Vite 7 + Recharts 3 Upgrade',
      'Error Boundaries & Railway Validation',
      'Mobile UX Audit (badges, search, AP detail, health score)',
      'Mobile Skeleton Loaders & Performance Analytics',
      'Data Normalization Layer (P0-002)',
      'Universal FilterBar Component (P0-003)',
      'Operational Health Summary Widget (P1-001)',
      'Column Customization Hook (P1-002)',
      'Tab Visibility Polling Hook (P1-003)',
      'Aggressive Caching (P1-004)',
      'Anomaly Detector Widget (P1-005)',
      'RF Quality Index (RFQI) Widget',
      'Application Analytics Widget',
      'Campus Controller Widget API Integration'
    ]
  };

  writeFileSync(
    join(rootDir, 'public', 'version.json'),
    JSON.stringify(versionJson, null, 2)
  );

  // Also write to build directory if it exists (for postbuild)
  const buildDir = join(rootDir, 'build');
  if (existsSync(buildDir)) {
    writeFileSync(
      join(buildDir, 'version.json'),
      JSON.stringify(versionJson, null, 2)
    );
    console.log('   version.json also written to build/');
  }

  console.log('✅ Version generated:', version);
  console.log('   Commit:', commitHash);
  console.log('   Count:', commitCount);
  console.log('   Branch:', branch);
  console.log('   version.json created in public/');

} catch (error) {
  console.error('❌ Local git unavailable:', error.message);
  await railwayFallback();
}

/**
 * Build container has no .git (Railway strips it). Re-create the version
 * payload from Railway's RAILWAY_GIT_* env vars and ask the GitHub API for
 * the true commit count reachable from the deployed SHA — that count is the
 * "push number" that local `git rev-list --count HEAD` would have produced.
 *
 * Auth: passes GITHUB_TOKEN if present (required for private repos and to
 * raise the unauthenticated 60/hr rate limit). Falls back to count=0 if the
 * API call fails or the env is incomplete — the rest of the version payload
 * still lands correctly.
 */
async function railwayFallback() {
  const buildDate = new Date().toISOString();
  const railwayCommit = process.env.RAILWAY_GIT_COMMIT_SHA || 'unknown';
  const railwayBranch = process.env.RAILWAY_GIT_BRANCH || 'unknown';
  const railwayOwner = process.env.RAILWAY_GIT_REPO_OWNER || '';
  const railwayRepo = process.env.RAILWAY_GIT_REPO_NAME || '';
  const commitShort = railwayCommit !== 'unknown' ? railwayCommit.substring(0, 7) : 'unknown';

  let commitCount = '0';
  if (railwayOwner && railwayRepo && railwayCommit !== 'unknown') {
    const count = await fetchCommitCountFromGitHub(railwayOwner, railwayRepo, railwayCommit);
    if (count) commitCount = String(count);
  }

  const rootDir = join(__dirname, '..');
  const cacheVersion = parseInt(commitCount, 10) + 500;
  const version = commitCount !== '0' ? `v${commitCount}.${commitShort}` : `v0.${commitShort}`;

  writeFileSync(
    join(rootDir, '.env.production'),
    `VITE_APP_VERSION=${version}
VITE_APP_COMMIT_HASH=${commitShort}
VITE_APP_COMMIT_COUNT=${commitCount}
VITE_APP_BRANCH=${railwayBranch}
VITE_APP_BUILD_DATE=${buildDate}
VITE_APP_COMMIT_DATE=unknown
`
  );

  const fallbackVersionJson = {
    version,
    commit: commitShort,
    commitFull: railwayCommit,
    commitCount,
    cacheVersion,
    branch: railwayBranch,
    buildDate,
    commitDate: 'unknown',
    message: process.env.RAILWAY_GIT_COMMIT_MESSAGE || 'Deployed via Railway',
    features: [],
  };

  writeFileSync(
    join(rootDir, 'public', 'version.json'),
    JSON.stringify(fallbackVersionJson, null, 2)
  );
  const buildDir = join(rootDir, 'build');
  if (existsSync(buildDir)) {
    writeFileSync(join(buildDir, 'version.json'), JSON.stringify(fallbackVersionJson, null, 2));
  }

  console.log('⚠️  Using Railway fallback (no .git in build container)');
  console.log('   Version:', version);
  console.log('   Railway Commit:', railwayCommit);
  console.log('   Railway Branch:', railwayBranch);
  console.log('   Commit count:', commitCount, commitCount === '0' ? '(GitHub API unavailable)' : '(from GitHub API)');
}

async function fetchCommitCountFromGitHub(owner, repo, sha) {
  const headers = {
    'User-Agent': 'aura-build',
    'Accept': 'application/vnd.github+json',
  };
  if (process.env.GITHUB_TOKEN) {
    headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  const url = `https://api.github.com/repos/${owner}/${repo}/commits?sha=${sha}&per_page=1`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, { headers, signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) {
      console.warn(`   GitHub API ${res.status}: ${res.statusText}`);
      return null;
    }
    const linkHeader = res.headers.get('link') || '';
    const lastMatch = linkHeader.match(/<[^>]*[?&]page=(\d+)[^>]*>;\s*rel="last"/);
    if (lastMatch) return parseInt(lastMatch[1], 10);
    // No "last" rel → single-page response. Count items in the body.
    const body = await res.json();
    return Array.isArray(body) ? body.length : 1;
  } catch (err) {
    console.warn('   GitHub API fetch failed:', err.message);
    return null;
  }
}
