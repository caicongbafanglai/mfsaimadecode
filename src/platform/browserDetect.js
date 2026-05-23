export function detectBrowser() {
  const ua = navigator.userAgent || '';
  const vendor = navigator.vendor || '';
  const platform = navigator.platform || '';
  const maxTouchPoints = navigator.maxTouchPoints || 0;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (platform === 'MacIntel' && maxTouchPoints > 1);
  const isIPadOS = /iPad/.test(ua) || (platform === 'MacIntel' && maxTouchPoints > 1);
  const isChrome = /Chrome|CriOS/.test(ua) && !/Edg|OPR|SamsungBrowser/.test(ua);
  const isEdge = /Edg|EdgiOS/.test(ua);
  const isFirefox = /Firefox|FxiOS/.test(ua);
  const isSafari = /Safari/.test(ua) && /Apple/.test(vendor) && !/Chrome|CriOS|Chromium|Edg|OPR|FxiOS/.test(ua);
  const isWebKit = isSafari || isIOS || /AppleWebKit/.test(ua);
  const isMac = /Mac/.test(platform) || /Macintosh/.test(ua);
  const coreCount = navigator.hardwareConcurrency || 0;
  const isLikelyMacBookAir = isMac && (isSafari || coreCount > 0 && coreCount <= 8);

  return {
    name: isEdge ? 'edge' : isChrome ? 'chrome' : isFirefox ? 'firefox' : isSafari ? 'safari' : isWebKit ? 'webkit' : 'unknown',
    isSafari,
    isWebKit,
    isIOS,
    isIPadOS,
    isChrome,
    isEdge,
    isFirefox,
    isMac,
    isLikelyMacBookAir,
    maxPixelRatio: isSafari || isIOS ? 1.25 : Infinity
  };
}

export function applyBrowserClasses(target = document.body, browser = detectBrowser()) {
  target.classList.toggle('safari', browser.isSafari);
  target.classList.toggle('webkit-browser', browser.isWebKit);
  target.classList.toggle('ios', browser.isIOS);
  target.classList.toggle('ipad-os', browser.isIPadOS);
  target.classList.toggle('chrome', browser.isChrome);
  target.classList.toggle('edge', browser.isEdge);
  target.classList.toggle('firefox', browser.isFirefox);
  target.classList.toggle('likely-macbook-air', browser.isLikelyMacBookAir);
  target.dataset.browser = browser.name;
  return browser;
}
