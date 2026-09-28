const express = require('express');
const router = express.Router();
const { getVersionInfo, getAppVersion } = require('../lib/version');

// GET /api/system/version - Return current running version info
router.get('/version', (req, res) => {
  try {
    const versionInfo = getVersionInfo();
    res.json(versionInfo);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve version information', message: err.message });
  }
});

// GET /api/system/check-update - Check if there is an update available on remote GitHub repository
router.get('/check-update', async (req, res) => {
  const currentInfo = getVersionInfo();
  try {
    // Query GitHub API for the latest commit on main branch
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const ghRes = await fetch('https://api.github.com/repos/Aumcomputer/virtualhos/commits/main', {
      headers: {
        'User-Agent': 'VirtualHospital-App',
        'Accept': 'application/vnd.github.v3+json'
      },
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (ghRes.ok) {
      const ghData = await ghRes.json();
      const latestSha = (ghData.sha || '').substring(0, 7);
      const commitMessage = ghData.commit?.message || '';
      const commitDate = ghData.commit?.committer?.date || '';

      const isDifferent = latestSha && currentInfo.commit && currentInfo.commit !== 'unknown' && latestSha !== currentInfo.commit;

      return res.json({
        checked: true,
        updateAvailable: isDifferent,
        currentVersion: currentInfo.version,
        currentCommit: currentInfo.commit,
        latestCommit: latestSha,
        commitMessage: commitMessage.split('\n')[0],
        commitDate,
        checkedAt: new Date().toISOString()
      });
    }

    // If GitHub API rate-limited or error, still return current version
    res.json({
      checked: false,
      updateAvailable: false,
      currentVersion: currentInfo.version,
      currentCommit: currentInfo.commit,
      message: `GitHub check returned status ${ghRes.status}`,
      checkedAt: new Date().toISOString()
    });
  } catch (err) {
    res.json({
      checked: false,
      updateAvailable: false,
      currentVersion: currentInfo.version,
      currentCommit: currentInfo.commit,
      message: err.name === 'AbortError' ? 'GitHub connection timeout' : err.message,
      checkedAt: new Date().toISOString()
    });
  }
});

module.exports = router;
