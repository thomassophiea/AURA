#!/usr/bin/env node
import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
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

  console.log('✅ Version generated:', version);
  console.log('   Commit:', commitHash);
  console.log('   Count:', commitCount);
  console.log('   Branch:', branch);

} catch (error) {
  console.error('❌ Failed to generate version:', error.message);

  // Fallback for non-git environments
  const fallbackContent = `VITE_APP_VERSION=v0.0.0
VITE_APP_COMMIT_HASH=unknown
VITE_APP_COMMIT_COUNT=0
VITE_APP_BRANCH=unknown
VITE_APP_BUILD_DATE=${new Date().toISOString()}
VITE_APP_COMMIT_DATE=unknown
`;
  writeFileSync(join(__dirname, '..', '.env.production'), fallbackContent);
  console.log('⚠️  Using fallback version (not a git repository)');
}
