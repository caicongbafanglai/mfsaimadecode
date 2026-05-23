    ctx.save();
    ctx.font = marker.expanded
      ? '800 10px ui-monospace, SFMono-Regular, Menlo, monospace'
      : '800 7.5px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const line1 = marker.subCode ? `${marker.code} ${marker.subCode}` : `${marker.code}${stale ? ' LOST' : ''}`;
    const line2 = `${trend} ${altitude}FT`;
    const line3 = marker.expanded
      ? `HDG ${heading}${bearing ? ` BRG ${bearing}` : ''}`
      : `H${heading}${bearing ? ` B${bearing}` : ''}`;
    const width = Math.max(ctx.measureText(line1).width, ctx.measureText(line2).width, ctx.measureText(line3).width) + 8;
    const height = marker.expanded ? 37 : 28;
    ctx.fillStyle = stale ? 'rgba(12, 18, 20, 0.72)' : marker.self ? 'rgba(34, 22, 4, 0.72)' : 'rgba(2, 20, 28, 0.72)';
    ctx.fillRect(labelX - 3, labelY - 2, width, height);
    ctx.strokeStyle = stale ? 'rgba(145, 163, 169, 0.72)' : marker.self ? 'rgba(255, 209, 102, 0.88)' : 'rgba(124, 244, 255, 0.84)';
    ctx.lineWidth = 1;
    ctx.strokeRect(labelX - 3, labelY - 2, width, height);
    ctx.fillStyle = color;
    ctx.fillText(line1, labelX, labelY);
    ctx.fillStyle = marker.self ? '#fff2bd' : '#dffbff';
    ctx.fillText(line2, labelX, labelY + (marker.expanded ? 12 : 9));
    ctx.fillStyle = stale ? '#b8c7cc' : marker.self ? '#ffe7a0' : '#bff8ff';
    ctx.fillText(line3, labelX, labelY + (marker.expanded ? 24 : 18));
    ctx.restore();
  }

  function drawUfoContactMarker(ctx, marker) {
    const { contact } = marker;
    const now = performance.now();
    const blinkDimmed = contact.intermittent && !contact.lost && Math.sin(now * 0.012) < -0.35;
    const size = marker.expanded ? 12 : 8;
    const pulse = 0.5 + 0.5 * Math.sin(now * 0.009);
    const color = contact.lost ? '#9fb7c2' : '#76d9ff';
    const glow = contact.signalDegraded ? '#ffd166' : color;

    ctx.save();
    ctx.globalAlpha = blinkDimmed ? 0.34 : 1;
    ctx.translate(marker.x, marker.y);
    ctx.strokeStyle = contact.lost
      ? 'rgba(159, 183, 194, 0.62)'
      : `rgba(118, 217, 255, ${0.58 + pulse * 0.22})`;
    ctx.fillStyle = contact.lost
      ? 'rgba(10, 17, 20, 0.62)'
      : `rgba(6, 29, 40, ${0.66 + pulse * 0.12})`;
    ctx.lineWidth = marker.expanded ? 1.8 : 1.25;
    ctx.setLineDash(contact.signalDegraded || contact.intermittent ? [4, 4] : []);
    ctx.beginPath();
    ctx.arc(0, 0, size * (1.2 + pulse * 0.25), 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.lineTo(size, 0);
    ctx.lineTo(0, size);
    ctx.lineTo(-size, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = glow;
    ctx.stroke();
    if (!contact.lost && contact.fast) {
      ctx.strokeStyle = 'rgba(118, 217, 255, 0.48)';
      ctx.lineWidth = marker.expanded ? 2 : 1.4;
      ctx.beginPath();
      ctx.moveTo(-size * 2.2, size * 1.2);
      ctx.lineTo(size * 1.9, -size * 1.1);
      ctx.stroke();
    }
    ctx.restore();

    const altitude = Number.isFinite(contact.altitude) ? Math.max(0, Math.round(contact.altitude)) : null;
    const speed = contact.speedUnknown ? '---' : contact.fast || contact.speed >= 999 ? '999+' : contact.speed > 0 ? String(Math.round(contact.speed)) : '0';
    const heading = Number.isFinite(contact.heading) ? normalizeHeading(contact.heading).toString().padStart(3, '0') : '---';
    const line1 = contact.lost ? 'CONTACT LOST' : 'UNKNOWN CONTACT';
    const line2 = contact.lost
      ? 'SIGNAL LOST'
      : contact.visualContact ? 'VISUAL CONTACT'
        : contact.signalOffset ? 'SIGNAL OFFSET'
        : contact.hover ? 'HOVER' : `ALT ${altitude == null ? '----' : altitude}`;
    const line3 = contact.lost
      ? ''
      : contact.hover && !contact.speedUnknown ? 'SPD 0  HDG ---' : `SPD ${speed}  HDG ${heading}`;
    const line4 = contact.signalDegraded && !contact.lost ? 'SIGNAL DEGRADED' : '';
    let labelX = marker.x + (marker.expanded ? 15 : 11);
    let labelY = marker.y - (marker.expanded ? 15 : 10);

    ctx.save();
    ctx.globalAlpha = blinkDimmed ? 0.46 : 1;
    ctx.font = marker.expanded
      ? '850 10px ui-monospace, SFMono-Regular, Menlo, monospace'
      : '850 7.5px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const lines = [line1, line2, line3, line4].filter(Boolean);
    const width = Math.max(...lines.map(line => ctx.measureText(line).width)) + 9;
    const lineHeight = marker.expanded ? 12 : 9;
    const height = lines.length * lineHeight + 7;
    if (marker.bounds) {
      const pad = marker.expanded ? 8 : 4;
      const minX = marker.bounds.left + pad;
      const minY = marker.bounds.top + pad;
      const maxX = marker.bounds.left + marker.bounds.size - width - pad;
      const maxY = marker.bounds.top + marker.bounds.size - height - pad;
      if (labelX > maxX) labelX = marker.x - width - (marker.expanded ? 15 : 11);
      labelX = Math.min(Math.max(labelX, minX), Math.max(minX, maxX));
      labelY = Math.min(Math.max(labelY, minY), Math.max(minY, maxY));
    }
    ctx.fillStyle = contact.lost ? 'rgba(8, 13, 16, 0.75)' : 'rgba(1, 18, 27, 0.76)';
    ctx.fillRect(labelX - 3, labelY - 2, width, height);
    ctx.strokeStyle = contact.lost ? 'rgba(159, 183, 194, 0.74)' : 'rgba(118, 217, 255, 0.88)';
    ctx.lineWidth = 1;
    ctx.strokeRect(labelX - 3, labelY - 2, width, height);
    for (let i = 0; i < lines.length; i++) {
      ctx.fillStyle = i === 0 ? color : i === lines.length - 1 && line4 ? '#ffd166' : '#dffbff';
      ctx.fillText(lines[i], labelX, labelY + i * lineHeight);
    }
    ctx.restore();
  }

  function handleMapWheel(event) {
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.18 : 0.84;
    mapZoom = THREE.MathUtils.clamp(mapZoom * factor, 1, 6);
    clampMapPan();
    drawNavMap();
  }

  function panExpandedMap(deltaX, deltaY, canvas) {
    if (mapZoom <= 1) return;
    const rect = canvas.getBoundingClientRect();
    const viewSpan = MAP_SIZE / mapZoom;
    mapPanX -= deltaX / Math.max(1, rect.width) * viewSpan;
    mapPanZ -= deltaY / Math.max(1, rect.height) * viewSpan;
    clampMapPan();
    drawNavMap();
  }

  function resetMapView() {
    mapZoom = 1;
    mapPanX = 0;
    mapPanZ = 0;
    drawNavMap();
  }

  function clampMapPan() {
    const limit = Math.max(0, MAP_SIZE * 0.5 - MAP_SIZE / mapZoom * 0.5);
    mapPanX = THREE.MathUtils.clamp(mapPanX, -limit, limit);
    mapPanZ = THREE.MathUtils.clamp(mapPanZ, -limit, limit);
  }

  function nearestAirport() {
    let best = AIRPORTS[0];
    let bestDistance = Infinity;
    for (const airport of AIRPORTS) {
      const distance = Math.hypot(state.position.x - airport.x, state.position.z - airport.z);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = airport;
      }
    }
    const name = window.innerWidth < 560 ? best.short || best.name : best.name;
    if (best.airportCategory === 'HIDDEN_REMOTE_AIRFIELD') {
      return { name: 'nothing there', distanceNm: bestDistance / 1852 };
    }
    const classTag = best.runwayClass || (best.tier === 'international' ? 'A' : best.tier === 'regional' ? 'B' : 'C');
    const a320Tag = best.a320Recommended === false ? ' NO A320' : best.a320Recommended === 'challenge' ? ' CHALLENGE' : '';
    const nightTag = best.isNightCapable === false ? ' NO LIGHT' : '';
    return { name: `${name} [${classTag}${a320Tag}${nightTag}]`, distanceNm: bestDistance / 1852 };
  }

  function normalizeHeading(deg) {
    return Math.round((deg % 360 + 360) % 360) % 360;
  }

  function currentHeadingDeg() {
    return normalizeHeading(-THREE.MathUtils.radToDeg(state.yaw));
  }

  return {
    updateHud,
    drawNavMap,
    currentHeadingDeg,
    handleMapWheel,
    panExpandedMap,
    resetMapView
  };
}
