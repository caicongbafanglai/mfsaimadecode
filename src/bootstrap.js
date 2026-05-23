window.MHFS_BOOT = window.MHFS_BOOT || {};
window.MHFS_BOOT.moduleStarted = true;
window.MHFS_BOOT.setStep?.('Loading renderer...');

try {
  await import('./main.js?v=202605070200');
} catch (error) {
  console.error('Game boot failed', error);
  window.MHFS_BOOT.fail?.({
    title: 'Game failed to start',
    reason: error?.message || String(error || 'Unknown startup error'),
    detail: error?.stack || ''
  });
}
