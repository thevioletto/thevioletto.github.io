const STORAGE_KEY = 'violetto:console-enabled';
const noop = () => {};
const originalConsole = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  debug: console.debug.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console)
};

function isLocalhost() {
  if (typeof window === 'undefined') {
    return false;
  }

  return (
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1'
  );
}

function readStoredValue() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredValue(enabled) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    // Ignore storage access failures.
  }
}

export function isConsoleLoggingEnabled() {
  if (isLocalhost()) {
    return true;
  }

  return readStoredValue() === 'true';
}

export function applyConsoleLoggingState() {
  const enabled = isConsoleLoggingEnabled();

  console.log = enabled ? originalConsole.log : noop;
  console.info = enabled ? originalConsole.info : noop;
  console.debug = enabled ? originalConsole.debug : noop;
  console.warn = enabled ? originalConsole.warn : noop;
  console.error = originalConsole.error;
}

export function enableConsoleLogging() {
  writeStoredValue(true);
  applyConsoleLoggingState();
  originalConsole.log('Console logging enabled');
}

export function disableConsoleLogging() {
  writeStoredValue(false);
  applyConsoleLoggingState();
}

export function getConsoleLoggingStatus() {
  return {
    enabled: isConsoleLoggingEnabled(),
    storageKey: STORAGE_KEY
  };
}

export const logger = {
  log: (...args) => {
    if (isConsoleLoggingEnabled()) {
      originalConsole.log(...args);
    }
  },
  info: (...args) => {
    if (isConsoleLoggingEnabled()) {
      originalConsole.info(...args);
    }
  },
  debug: (...args) => {
    if (isConsoleLoggingEnabled()) {
      originalConsole.debug(...args);
    }
  },
  warn: (...args) => {
    if (isConsoleLoggingEnabled()) {
      originalConsole.warn(...args);
    }
  },
  error: (...args) => {
    originalConsole.error(...args);
  }
};
