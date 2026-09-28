const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function getGitInfo() {
  let count = 0;
  let hash = 'unknown';

  try {
    const rootDir = path.resolve(__dirname, '..');
    count = parseInt(execSync('git rev-list --count HEAD', { cwd: rootDir }).toString().trim(), 10) || 0;
    hash = execSync('git rev-parse --short HEAD', { cwd: rootDir }).toString().trim();
  } catch (err) {
    console.warn('[update-version] Unable to read git info:', err.message);
  }

  return { count, hash };
}

function updateVersion() {
  const { count, hash } = getGitInfo();
  const isPreCommit = process.argv.includes('--pre-commit');
  const commitCount = isPreCommit ? count + 1 : (count || 1);

  const versionData = {
    version: `1.0.${commitCount}`,
    commit: hash,
    updatedAt: new Date().toISOString()
  };

  const rootPath = path.resolve(__dirname, '..');
  const filesToUpdate = [
    path.join(rootPath, 'version.json'),
    path.join(rootPath, 'frontend', 'src', 'version.json')
  ];

  for (const file of filesToUpdate) {
    try {
      if (!isPreCommit && fs.existsSync(file)) {
        const existing = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (existing.version === versionData.version && existing.commit === versionData.commit) {
          // Version is already up to date, skip writing to avoid dirty working tree
          continue;
        }
      }
      const dir = path.dirname(file);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(file, JSON.stringify(versionData, null, 2) + '\n');
      console.log(`[update-version] Successfully wrote ${file} -> v${versionData.version}`);
    } catch (err) {
      console.error(`[update-version] Failed to write ${file}:`, err.message);
    }
  }

  return versionData;
}

if (require.main === module) {
  updateVersion();
}

module.exports = updateVersion;
