const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

let cachedVersionInfo = null;
let lastCheckTime = 0;
const CACHE_TTL_MS = 5000; // 5 seconds cache

function resolveVersionInfo() {
  const rootDir = path.resolve(__dirname, '..', '..');

  // 1. Try reading root version.json
  const versionFile = path.join(rootDir, 'version.json');
  try {
    if (fs.existsSync(versionFile)) {
      const data = JSON.parse(fs.readFileSync(versionFile, 'utf8'));
      if (data && data.version) {
        return {
          version: data.version,
          commit: data.commit || 'unknown',
          updatedAt: data.updatedAt || null
        };
      }
    }
  } catch (err) {
    // Ignore and fallback
  }

  // 2. Try git rev-list
  try {
    const count = execSync('git rev-list --count HEAD', { cwd: rootDir }).toString().trim();
    const hash = execSync('git rev-parse --short HEAD', { cwd: rootDir }).toString().trim();
    if (count) {
      return {
        version: `1.0.${count}`,
        commit: hash,
        updatedAt: new Date().toISOString()
      };
    }
  } catch (err) {
    // Ignore and fallback
  }

  // 3. Fallback default
  return {
    version: '1.0.1',
    commit: 'unknown',
    updatedAt: new Date().toISOString()
  };
}

function getVersionInfo() {
  const now = Date.now();
  if (!cachedVersionInfo || (now - lastCheckTime > CACHE_TTL_MS)) {
    cachedVersionInfo = resolveVersionInfo();
    lastCheckTime = now;
  }
  return cachedVersionInfo;
}

function getAppVersion() {
  return getVersionInfo().version;
}

module.exports = {
  getAppVersion,
  getVersionInfo
};
