// Import configuration
import { githubConfig, lastfmConfig } from './config.js';
import { apps } from './appList.js';

// Import modules
import { initializeApps } from './modules/apps.js';
import { fetchLastFmTracks } from './modules/lastfm.js';
import { initializeGitHubHeatmap } from './modules/github.js';
import { createBackgroundPattern } from './modules/background.js';
import { initializeContactDropdown } from './modules/contactDropdown.js';
import { initializeBackgroundAudio } from './modules/backgroundAudio.js';
import {
  applyConsoleLoggingState,
  enableConsoleLogging,
  disableConsoleLogging,
  getConsoleLoggingStatus,
  logger
} from './modules/logger.js';
// import { initializeQuotes } from './modules/quotes.js';

// Configuration
const CONFIG = {
  lastfm: lastfmConfig,
  github: githubConfig,
  apps: apps
};

window.__consoleLogging = {
  enable: enableConsoleLogging,
  disable: disableConsoleLogging,
  status: getConsoleLoggingStatus
};
window.enableConsoleLogging = enableConsoleLogging;
window.disableConsoleLogging = disableConsoleLogging;
window.consoleLoggingStatus = getConsoleLoggingStatus;
applyConsoleLoggingState();
logger.info('[app] bootstrap ready', {
  logging: getConsoleLoggingStatus()
});

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  logger.info('[app] DOM content loaded');
  createBackgroundPattern();
  initializeContactDropdown();
  initializeApps(CONFIG.apps);
  fetchLastFmTracks(CONFIG.lastfm);
  initializeGitHubHeatmap(CONFIG.github);
  initializeBackgroundAudio();
  logger.info('[app] initializers dispatched');
  // initializeQuotes();
});
