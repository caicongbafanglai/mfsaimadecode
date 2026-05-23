const seen = new Set();

export function logOnce(key, level, ...args) {
  if (seen.has(key)) return;
  seen.add(key);
  const method = level === 'error' ? console.error : level === 'warn' ? console.warn : level === 'debug' ? console.debug : console.info;
  method(...args);
}

export function debugLog(enabled, ...args) {
  if (enabled) console.debug(...args);
}
