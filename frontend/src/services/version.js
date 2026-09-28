import versionData from '../version.json';

export const APP_VERSION = versionData.version || '1.0.1';
export const APP_COMMIT = versionData.commit || '';
export const APP_UPDATED_AT = versionData.updatedAt || '';

let hasNewVersion = false;
let latestServerVersion = null;
const listeners = new Set();

export function checkServerVersion(serverVersion) {
  if (!serverVersion) return;

  // Compare versions (e.g. "1.0.2" !== "1.0.1")
  if (serverVersion !== APP_VERSION) {
    if (!hasNewVersion || latestServerVersion !== serverVersion) {
      hasNewVersion = true;
      latestServerVersion = serverVersion;
      notifyListeners();
    }
  }
}

export function getVersionStatus() {
  return {
    currentVersion: APP_VERSION,
    commit: APP_COMMIT,
    updatedAt: APP_UPDATED_AT,
    hasNewVersion,
    latestServerVersion,
  };
}

export function subscribeVersion(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifyListeners() {
  const status = getVersionStatus();
  listeners.forEach((cb) => {
    try {
      cb(status);
    } catch (err) {
      console.error('[VersionCheck] Listener error:', err);
    }
  });
}

export function performReload() {
  // Hard reload without browser cache
  window.location.reload();
}
