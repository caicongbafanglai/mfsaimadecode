export function resizeRendererToViewport({ renderer, camera, quality, browser, viewport, configureCamera }) {
  const size = viewport?.size?.() || {
    width: Math.max(1, window.innerWidth || 1),
    height: Math.max(1, window.innerHeight || 1)
  };
  const requestedPixelRatio = quality?.pixelRatio ?? quality?.maxPixelRatio ?? 1;
  const pixelRatioCap = Math.min(quality?.maxPixelRatio ?? requestedPixelRatio, browser?.maxPixelRatio ?? Infinity);
  const pixelRatio = Math.min(window.devicePixelRatio || 1, requestedPixelRatio, pixelRatioCap);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(size.width, size.height, false);
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  configureCamera(camera, size.width, size.height, quality);
  return { ...size, pixelRatio };
}
