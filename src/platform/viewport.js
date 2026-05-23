const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 720;

export function createViewportManager({ root = document.documentElement, app = null, onChange = () => {} } = {}) {
  let lastWidth = 0;
  let lastHeight = 0;
  let scheduled = false;
  const scheduledRefresh = () => schedule(true);

  function measure() {
    const visual = window.visualViewport;
    const width = Math.max(1, Math.round(visual?.width || window.innerWidth || app?.clientWidth || DEFAULT_WIDTH));
    const height = Math.max(1, Math.round(visual?.height || window.innerHeight || app?.clientHeight || DEFAULT_HEIGHT));
    return { width, height };
  }

  function apply(force = false) {
    scheduled = false;
    const size = measure();
    if (!force && size.width === lastWidth && size.height === lastHeight) return size;
    lastWidth = size.width;
    lastHeight = size.height;
    root.style.setProperty('--app-width', `${size.width}px`);
    root.style.setProperty('--app-height', `${size.height}px`);
    app?.style.setProperty('--app-width', `${size.width}px`);
    app?.style.setProperty('--app-height', `${size.height}px`);
    onChange(size);
    return size;
  }

  function schedule(force = false) {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => apply(force));
  }

  function start() {
    apply(true);
    window.addEventListener('resize', scheduledRefresh, { passive: true });
    window.addEventListener('orientationchange', scheduledRefresh, { passive: true });
    window.visualViewport?.addEventListener('resize', scheduledRefresh, { passive: true });
    window.visualViewport?.addEventListener('scroll', scheduledRefresh, { passive: true });
  }

  function stop() {
    window.removeEventListener('resize', scheduledRefresh);
    window.removeEventListener('orientationchange', scheduledRefresh);
    window.visualViewport?.removeEventListener('resize', scheduledRefresh);
    window.visualViewport?.removeEventListener('scroll', scheduledRefresh);
  }

  return {
    start,
    stop,
    refresh: () => apply(true),
    size: () => ({ width: lastWidth || measure().width, height: lastHeight || measure().height })
  };
}
