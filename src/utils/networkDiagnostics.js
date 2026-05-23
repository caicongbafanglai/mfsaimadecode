const DEFAULT_RETRY_AFTER_MS = 60000;
const NOT_FOUND_RETRY_AFTER_MS = 10 * 60 * 1000;

export class HttpError extends Error {
  constructor(url, status, statusText) {
    super(`${url} ${status}${statusText ? ` ${statusText}` : ''}`);
    this.name = 'HttpError';
    this.url = url;
    this.status = status;
    this.statusText = statusText;
  }
}

export const networkDiagnostics = {
  pendingRequests: 0,
  failedRequestsCount: 0,
  assetMissingCount: 0,
  worldLoaded: false,
  multiplayerMode: 'local',
  sessionStatus: 'disabled',
  lastApiError: '',
  failedCache: new Map()
};

export function getNetworkDiagnosticsSnapshot() {
  return {
    pendingRequests: networkDiagnostics.pendingRequests,
    failedRequestsCount: networkDiagnostics.failedRequestsCount,
    assetMissingCount: networkDiagnostics.assetMissingCount,
    worldLoaded: networkDiagnostics.worldLoaded,
    multiplayerMode: networkDiagnostics.multiplayerMode,
    sessionStatus: networkDiagnostics.sessionStatus,
    lastApiError: networkDiagnostics.lastApiError
  };
}

export function markWorldLoaded(loaded = true) {
  networkDiagnostics.worldLoaded = loaded;
}

export function setMultiplayerNetworkState({ mode, sessionStatus, lastApiError } = {}) {
  if (mode) networkDiagnostics.multiplayerMode = mode;
  if (sessionStatus) networkDiagnostics.sessionStatus = sessionStatus;
  if (lastApiError != null) networkDiagnostics.lastApiError = lastApiError;
}

export function shouldRetry(url, now = Date.now()) {
  const failed = networkDiagnostics.failedCache.get(url);
  if (!failed) return true;
  return now - failed.lastFailedAt >= failed.retryAfter;
}

export function markFailed(url, { status = 0, retryAfter = DEFAULT_RETRY_AFTER_MS, asset = false } = {}) {
  const effectiveRetryAfter = status === 404 ? Math.max(retryAfter, NOT_FOUND_RETRY_AFTER_MS) : retryAfter;
  networkDiagnostics.failedRequestsCount++;
  if (asset) networkDiagnostics.assetMissingCount++;
  networkDiagnostics.failedCache.set(url, {
    status,
    lastFailedAt: Date.now(),
    retryAfter: effectiveRetryAfter
  });
}

export async function requestJson(url, options = {}, metadata = {}) {
  const label = metadata.label || url;
  if (!shouldRetry(url)) {
    const error = new HttpError(url, 'cached-failure', label);
    networkDiagnostics.lastApiError = error.message;
    throw error;
  }

  networkDiagnostics.pendingRequests++;
  try {
    const response = await fetch(url, {
      cache: metadata.cache || 'no-store',
      ...options
    });
    if (!response.ok) {
      markFailed(url, { status: response.status, retryAfter: metadata.retryAfter || DEFAULT_RETRY_AFTER_MS, asset: metadata.asset === true });
      const error = new HttpError(url, response.status, response.statusText);
      networkDiagnostics.lastApiError = error.message;
      throw error;
    }
    if (metadata.world === true) markWorldLoaded(true);
    return response.json();
  } catch (error) {
    if (!(error instanceof HttpError)) {
      markFailed(url, { status: 0, retryAfter: metadata.retryAfter || DEFAULT_RETRY_AFTER_MS, asset: metadata.asset === true });
      networkDiagnostics.lastApiError = error?.message || `${label} failed`;
    }
    throw error;
  } finally {
    networkDiagnostics.pendingRequests = Math.max(0, networkDiagnostics.pendingRequests - 1);
  }
}
