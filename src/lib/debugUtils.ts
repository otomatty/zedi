/**
 * Debug utilities that only log in development mode
 */

const isDev = import.meta.env.DEV;

/**
 * Log a message only in development mode
 */
export function debugLog(...args: unknown[]): void {
  if (isDev) {
    console.log(...args);
  }
}

/**
 * Log a warning only in development mode
 */
export function debugWarn(...args: unknown[]): void {
  if (isDev) {
    console.warn(...args);
  }
}

/**
 * Log an error only in development mode
 */
export function debugError(...args: unknown[]): void {
  if (isDev) {
    console.error(...args);
  }
}

/**
 * Start a console group only in development mode
 */
export function debugGroup(...args: unknown[]): void {
  if (isDev) {
    console.group(...args);
  }
}

/**
 * End a console group only in development mode
 */
export function debugGroupEnd(): void {
  if (isDev) {
    console.groupEnd();
  }
}
