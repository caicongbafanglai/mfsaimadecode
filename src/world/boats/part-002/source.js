  hull.castShadow = false;
  hull.receiveShadow = true;
  group.add(hull);

  const bow = new THREE.Mesh(new THREE.ConeGeometry(spec.beam * 0.58, spec.length * 0.16, 4), hullMaterial);
  bow.rotation.x = Math.PI / 2;
  bow.rotation.z = Math.PI / 4;
  bow.position.set(0, spec.height * 0.48, spec.length * 0.56);
  bow.scale.y = 0.7;
  group.add(bow);

  const deck = new THREE.Mesh(new THREE.BoxGeometry(spec.beam * 0.88, spec.height * 0.2, spec.length * 0.78), deckMaterial);
  deck.position.y = spec.height + spec.height * 0.08;
  deck.position.z = -spec.length * 0.04;
  group.add(deck);

  const detailGroup = new THREE.Group();
  detailGroup.userData.boatDetail = true;
  group.add(detailGroup);

  if (spec.containers) {
    const containerRows = type === 'largeCargo' ? 4 : 2;
    const containerCols = type === 'largeCargo' ? 6 : 3;
    const colors = [0xc95345, 0xd8a23a, 0x4078a8, 0x4d9b64, 0xb7bcc4];
    for (let row = 0; row < containerRows; row++) {
      for (let col = 0; col < containerCols; col++) {
        if (rng() < 0.16) continue;
        const material = new THREE.MeshStandardMaterial({ color: colors[(row + col) % colors.length], roughness: 0.66 });
        const box = new THREE.Mesh(new THREE.BoxGeometry(spec.beam * 0.18, spec.height * 0.36, spec.length * 0.12), material);
        box.position.set(
          (row - (containerRows - 1) / 2) * spec.beam * 0.21,
          spec.height * 1.28,
          -spec.length * 0.24 + col * spec.length * 0.095
        );
        detailGroup.add(box);
      }
    }
  }

  const cabinWidth = spec.beam * (type === 'largeCargo' ? 0.58 : 0.62);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(cabinWidth, spec.height * 0.8, spec.length * (type === 'fishing' || type === 'workBoat' ? 0.22 : 0.16)),
    type === 'ferry' ? glassMaterial : deckMaterial
  );
  cabin.position.set(0, spec.height * 1.45, -spec.length * 0.32);
  detailGroup.add(cabin);

  if (spec.workDeck || spec.cabinDeck) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(spec.beam * 0.72, spec.height * 0.12, spec.length * 0.22), accentMaterial);
    stripe.position.set(0, spec.height * 1.08, spec.length * 0.18);
    detailGroup.add(stripe);
  }

  addNavigationLights(group, spec);
  addWake(group, spec);
  return group;
}

function addNavigationLights(group, spec) {
  const material = new THREE.MeshBasicMaterial({
    color: 0xffe6a0,
    transparent: true,
    opacity: 0.88,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false
  });
  material.userData.nightControlled = true;
  material.userData.baseOpacity = 0.08;
  material.userData.nightOpacity = 0.88;

  const geometry = new THREE.BoxGeometry(spec.beam * 0.12, spec.height * 0.1, spec.length * 0.035);
  for (const side of [-1, 1]) {
    const light = new THREE.Mesh(geometry, material);
    light.position.set(side * spec.beam * 0.44, spec.height * 1.18, spec.length * 0.36);
    light.renderOrder = 30;
    group.add(light);
  }
  const stern = new THREE.Mesh(geometry, material);
  stern.position.set(0, spec.height * 1.08, -spec.length * 0.52);
  stern.renderOrder = 30;
  group.add(stern);
}

function addWake(group, spec) {
  const wakeMaterial = new THREE.MeshBasicMaterial({
    color: 0xd6fbff,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
    toneMapped: false
  });
  const wake = new THREE.Mesh(new THREE.PlaneGeometry(spec.beam * 1.45, spec.length * 0.55), wakeMaterial);
  wake.rotation.x = -Math.PI / 2;
  wake.position.set(0, 0.08, -spec.length * 0.72);
  wake.renderOrder = 5;
  group.add(wake);
}
