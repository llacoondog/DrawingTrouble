// ==========================================
// 반반 무마니 3D - Three.js 씬, 3D 캐릭터 커스터마이징, 프리뷰 렌더러 (scene3d.js)
// ==========================================
window.BanBan = window.BanBan || {};

window.BanBan.Scene3D = (function () {
  const { Config, State } = window.BanBan;

  let scene, camera, renderer;
  let drawCanvas, ctx, canvasTexture, drawingBoard;
  let p1Obj, p2Obj;
  const padMeshes = [];
  const paintDroplets = [];
  const padRipples = [];
  const confettiParticles = [];

  // 대기화면 전용 3D 캐릭터 클로즈업 프리뷰 씬
  let previewScene = null;
  let previewCamera = null;
  let previewRenderer = null;
  let previewCharObj = null;

  const dropletGeo = new THREE.SphereGeometry(0.11, 8, 8);
  const rippleGeo = new THREE.RingGeometry(0.75, 0.95, 28);
  rippleGeo.rotateX(-Math.PI / 2);
  const confettiGeo = new THREE.BoxGeometry(0.28, 0.08, 0.28);

  // 2D 캔버스 텍스트 스프라이트 생성 헬퍼
  function createTextSprite(text, bgColor, textColor, borderColor, scaleWidth = 2.1, scaleHeight = 0.65) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 80;
    const c = canvas.getContext('2d');

    c.clearRect(0, 0, canvas.width, canvas.height);

    const r = 24;
    const x = 10, y = 10, w = canvas.width - 20, h = canvas.height - 20;
    c.beginPath();
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y);
    c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r);
    c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h);
    c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r);
    c.quadraticCurveTo(x, y, x + r, y);
    c.closePath();

    c.fillStyle = bgColor;
    c.fill();
    if (borderColor) {
      c.lineWidth = 5;
      c.strokeStyle = borderColor;
      c.stroke();
    }

    c.font = '900 30px Inter, Malgun Gothic, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = textColor;
    c.fillText(text, canvas.width / 2, canvas.height / 2 + 1);

    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(scaleWidth, scaleHeight, 1);
    sprite.renderOrder = 999;
    return sprite;
  }

  // 캐릭터 머리 위 상단 'YOU' + 입체 화살표(▼) 마커 생성
  function createYouMarker(roleType) {
    const markerGroup = new THREE.Group();
    markerGroup.position.set(0, 2.52, 0);

    const isP1 = roleType === 'P1';
    const badgeColor = isP1 ? '#ec4899' : '#06b6d4';
    const coneColor = isP1 ? 0xf472b6 : 0x22d3ee;
    const labelText = isP1 ? 'YOU (1P)' : 'YOU (2P)';

    const sprite = createTextSprite(labelText, badgeColor, '#ffffff', '#ffffff', 1.85, 0.58);
    sprite.position.set(0, 0.42, 0);
    markerGroup.add(sprite);

    const arrowCone = new THREE.Mesh(
      new THREE.ConeGeometry(0.22, 0.38, 16),
      new THREE.MeshBasicMaterial({ color: coneColor })
    );
    arrowCone.rotation.x = Math.PI;
    arrowCone.position.set(0, 0, 0);
    markerGroup.add(arrowCone);

    return markerGroup;
  }

  // Three.js 메쉬/머티리얼 메모리 해제 헬퍼
  function disposeObject3D(obj) {
    if (!obj) return;
    obj.traverse(child => {
      if (child.geometry && child.geometry !== dropletGeo && child.geometry !== rippleGeo && child.geometry !== confettiGeo) {
        child.geometry.dispose();
      }
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m && m.dispose && m.dispose());
        } else if (child.material.dispose) {
          child.material.dispose();
        }
      }
    });
  }

  // 3D 모자/머리장식 메쉬 생성기 (7종)
  function populateHatGroup(hatGroup, hatId, tipMat) {
    while (hatGroup.children.length > 0) {
      const child = hatGroup.children[0];
      hatGroup.remove(child);
      disposeObject3D(child);
    }
    hatGroup.userData.propellerBlade = null;
    hatGroup.userData.haloRing = null;

    if (hatId === 'BERET') {
      const beretMat = new THREE.MeshToonMaterial({ color: 0xf472b6 });
      const beret = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.34, 0.14, 20), beretMat);
      beret.position.set(0, 1.48, -0.03);
      beret.rotation.z = -0.16;
      beret.castShadow = true;
      hatGroup.add(beret);

      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.1, 8), beretMat);
      stem.position.set(0.02, 1.57, -0.03);
      hatGroup.add(stem);
    } else if (hatId === 'HELMET') {
      const helmet = new THREE.Mesh(
        new THREE.SphereGeometry(0.49, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.55),
        new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.3 })
      );
      helmet.position.y = 1.08;
      helmet.castShadow = true;
      hatGroup.add(helmet);

      const visor = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, 0.08, 0.35),
        new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.3 })
      );
      visor.position.set(0, 1.12, 0.38);
      hatGroup.add(visor);

      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 12), tipMat);
      bulb.position.y = 1.65;
      hatGroup.add(bulb);
    } else if (hatId === 'CROWN') {
      const goldMat = new THREE.MeshStandardMaterial({
        color: 0xfbbf24,
        metalness: 0.65,
        roughness: 0.25,
        emissive: 0xd97706,
        emissiveIntensity: 0.15
      });
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.28, 0.22, 16), goldMat);
      base.position.set(0, 1.54, 0);
      base.castShadow = true;
      hatGroup.add(base);

      for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2;
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.18, 8), goldMat);
        spike.position.set(Math.cos(angle) * 0.24, 1.72, Math.sin(angle) * 0.24);
        hatGroup.add(spike);
      }

      const gem = new THREE.Mesh(
        new THREE.SphereGeometry(0.07, 10, 10),
        new THREE.MeshBasicMaterial({ color: 0xf43f5e })
      );
      gem.position.set(0, 1.55, 0.29);
      hatGroup.add(gem);
    } else if (hatId === 'CAT_EARS') {
      const outerMat = new THREE.MeshToonMaterial({ color: 0x1e293b });
      const innerMat = new THREE.MeshBasicMaterial({ color: 0xf472b6 });

      [-1, 1].forEach(dir => {
        const earGroup = new THREE.Group();
        earGroup.position.set(dir * 0.28, 1.44, 0.02);
        earGroup.rotation.z = -dir * 0.32;

        const outerCone = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.34, 12), outerMat);
        outerCone.castShadow = true;
        earGroup.add(outerCone);

        const innerCone = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.22, 10), innerMat);
        innerCone.position.set(0, -0.02, 0.06);
        earGroup.add(innerCone);

        hatGroup.add(earGroup);
      });
    } else if (hatId === 'HALO') {
      const haloRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.34, 0.055, 12, 32),
        new THREE.MeshBasicMaterial({ color: 0xfef08a })
      );
      haloRing.rotation.x = Math.PI / 2;
      haloRing.position.set(0, 1.76, 0);
      hatGroup.add(haloRing);
      hatGroup.userData.haloRing = haloRing;
    } else if (hatId === 'PROPELLER') {
      const capDome = new THREE.Mesh(
        new THREE.SphereGeometry(0.42, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.5),
        new THREE.MeshToonMaterial({ color: 0x3b82f6 })
      );
      capDome.position.y = 1.16;
      hatGroup.add(capDome);

      const pin = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.03, 0.16, 8),
        new THREE.MeshStandardMaterial({ color: 0xfacc15 })
      );
      pin.position.set(0, 1.62, 0);
      hatGroup.add(pin);

      const blade = new THREE.Mesh(
        new THREE.BoxGeometry(0.68, 0.03, 0.1),
        new THREE.MeshBasicMaterial({ color: 0xef4444 })
      );
      blade.position.set(0, 1.70, 0);
      hatGroup.add(blade);
      hatGroup.userData.propellerBlade = blade;
    }
  }

  // 3D 얼굴/눈 표정 생성기 (4종: NORMAL, COOL, HAPPY, STAR)
  function populateFaceGroup(faceGroup, faceId) {
    while (faceGroup.children.length > 0) {
      const child = faceGroup.children[0];
      faceGroup.remove(child);
      disposeObject3D(child);
    }

    const darkMat = new THREE.MeshBasicMaterial({ color: 0x111827 });
    const whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const goldMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
    const blushMat = new THREE.MeshBasicMaterial({ color: 0xf43f5e, transparent: true, opacity: 0.55 });

    // 공통 볼터치
    [-0.28, 0.28].forEach(offsetX => {
      const blush = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 12), blushMat);
      blush.scale.set(1.2, 0.65, 0.4);
      blush.position.set(offsetX, -0.07, -0.02);
      faceGroup.add(blush);
    });

    if (faceId === 'COOL') {
      // 패기 넘치는 선글라스
      const frameBridge = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.05, 0.06), darkMat);
      frameBridge.position.set(0, 0.08, 0.06);
      faceGroup.add(frameBridge);

      [-0.17, 0.17].forEach(offsetX => {
        const lens = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.16, 0.07), darkMat);
        lens.position.set(offsetX, 0.04, 0.06);
        faceGroup.add(lens);

        const glint = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.11, 0.08), whiteMat);
        glint.rotation.z = -0.35;
        glint.position.set(offsetX - 0.05, 0.05, 0.065);
        faceGroup.add(glint);
      });
    } else if (faceId === 'HAPPY') {
      // 귀여운 반달 눈웃음 (^ ^)
      [-0.17, 0.17].forEach(offsetX => {
        const arc = new THREE.Mesh(
          new THREE.TorusGeometry(0.085, 0.026, 8, 16, Math.PI),
          darkMat
        );
        arc.position.set(offsetX, 0.02, 0.04);
        faceGroup.add(arc);
      });
    } else if (faceId === 'STAR') {
      // 반짝반짝 황금 별 눈동자
      [-0.17, 0.17].forEach(offsetX => {
        const eyeBase = new THREE.Mesh(new THREE.SphereGeometry(0.115, 16, 16), darkMat);
        eyeBase.scale.set(1, 1.15, 0.55);
        eyeBase.position.set(offsetX, 0.04, 0);
        faceGroup.add(eyeBase);

        const star1 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.04), goldMat);
        star1.position.set(offsetX, 0.04, 0.06);
        faceGroup.add(star1);

        const star2 = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 0.04), goldMat);
        star2.position.set(offsetX, 0.04, 0.06);
        faceGroup.add(star2);
      });
    } else {
      // 기본 초롱초롱 눈 (NORMAL)
      [-0.17, 0.17].forEach(offsetX => {
        const eyeWhite = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 16), whiteMat);
        eyeWhite.scale.set(1, 1.15, 0.55);
        eyeWhite.position.set(offsetX, 0.04, 0);
        faceGroup.add(eyeWhite);

        const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 12), darkMat);
        pupil.scale.set(1, 1.1, 0.5);
        pupil.position.set(offsetX, 0.04, 0.045);
        faceGroup.add(pupil);

        const shine = new THREE.Mesh(new THREE.SphereGeometry(0.024, 8, 8), whiteMat);
        shine.position.set(offsetX + 0.025, 0.07, 0.07);
        faceGroup.add(shine);
      });
    }
  }

  // 캐릭터에 커스터마이징 데이터(색상, 모자, 표정) 즉시 반영
  function applyCharacterCustomization(charObj, customData) {
    if (!charObj || !customData) return;
    const colorHex = customData.color || '#ec4899';
    const hatId = customData.hat || 'BERET';
    const faceId = customData.face || 'NORMAL';

    charObj.jellyMat.color.set(colorHex);
    populateHatGroup(charObj.hatGroup, hatId, charObj.tipMat);
    populateFaceGroup(charObj.faceGroup, faceId);
  }

  // playerRoster 기준으로 1P, 2P 인게임 캐릭터 및 프리뷰 캐릭터 외형 동기화
  function syncRosterCustomizations() {
    if (p1Obj) {
      const p1Entry = State.playerRoster.find(p => p.role === 'P1');
      const p1Custom = p1Entry?.custom || State.myCustom;
      applyCharacterCustomization(p1Obj, p1Custom);
    }
    if (p2Obj) {
      const p2Entry = State.playerRoster.find(p => p.role === 'P2');
      const p2Custom = p2Entry?.custom || State.p2DefaultCustom;
      applyCharacterCustomization(p2Obj, p2Custom);
    }
    if (previewCharObj) {
      applyCharacterCustomization(previewCharObj, State.myCustom);
    }
  }

  // 대기화면(Entry Screen) 내부 3D 캐릭터 프리뷰 캔버스 초기화
  function initPreviewCanvas(canvasEl) {
    if (!canvasEl) return;
    previewScene = new THREE.Scene();
    previewScene.background = new THREE.Color(0x141824);

    previewCamera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    previewCamera.position.set(0, 1.25, 3.6);
    previewCamera.lookAt(0, 0.95, 0);

    previewRenderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true });
    previewRenderer.setSize(220, 220);
    previewRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    previewScene.add(new THREE.AmbientLight(0xffffff, 0.85));
    const pLight = new THREE.DirectionalLight(0xffffff, 0.65);
    pLight.position.set(3, 6, 5);
    previewScene.add(pLight);

    // 프리뷰 받침대 원형 단상
    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(0.82, 0.92, 0.16, 32),
      new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.4, metalness: 0.3 })
    );
    pedestal.position.y = -0.08;
    previewScene.add(pedestal);

    previewCharObj = createJellyCharacter(State.myCustom.color, 'PREVIEW', State.myCustom);
    previewCharObj.youMarker.visible = false;
    previewScene.add(previewCharObj.group);
  }

  function initScene(container) {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x12141c);

    const viewSize = Config.VIEW_SIZE;
    const aspect = window.innerWidth / window.innerHeight;
    camera = new THREE.OrthographicCamera(
      -viewSize * aspect, viewSize * aspect, viewSize, -viewSize, 1, 1000
    );
    camera.position.set(1.6, 18, 16);
    camera.lookAt(1.6, 0, -0.6);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // 조명 추가
    scene.add(new THREE.AmbientLight(0xffffff, 0.76));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.62);
    dirLight.position.set(10, 25, 15);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(1024, 1024);
    dirLight.shadow.camera.left = -15;
    dirLight.shadow.camera.right = 15;
    dirLight.shadow.camera.top = 15;
    dirLight.shadow.camera.bottom = -15;
    scene.add(dirLight);

    // 동적 1024x1024 2D CanvasTexture 바닥 생성
    drawCanvas = document.createElement('canvas');
    drawCanvas.width = 1024;
    drawCanvas.height = 1024;
    ctx = drawCanvas.getContext('2d');
    canvasTexture = new THREE.CanvasTexture(drawCanvas);
    clearCanvas();

    // 중앙 12x12 도화지 보드
    const CANVAS_SIZE = Config.CANVAS_SIZE;
    const boardMaterials = [
      new THREE.MeshLambertMaterial({ color: 0xcbd5e1 }),
      new THREE.MeshLambertMaterial({ color: 0xcbd5e1 }),
      new THREE.MeshBasicMaterial({ map: canvasTexture }),
      new THREE.MeshLambertMaterial({ color: 0xcbd5e1 }),
      new THREE.MeshLambertMaterial({ color: 0xcbd5e1 }),
      new THREE.MeshLambertMaterial({ color: 0xcbd5e1 })
    ];
    drawingBoard = new THREE.Mesh(
      new THREE.BoxGeometry(CANVAS_SIZE, 0.4, CANVAS_SIZE),
      boardMaterials
    );
    drawingBoard.position.set(0, -0.2, 2.2);
    drawingBoard.receiveShadow = true;
    scene.add(drawingBoard);

    // 도화지 외곽 원목 액자 테두리
    const frameGroup = new THREE.Group();
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.65 });
    const frameThickness = 0.5;
    const frameHeight = 0.55;
    const topFrame = new THREE.Mesh(new THREE.BoxGeometry(CANVAS_SIZE + frameThickness * 2, frameHeight, frameThickness), woodMat);
    topFrame.position.set(0, -0.15, 2.2 - CANVAS_SIZE / 2 - frameThickness / 2);
    const bottomFrame = new THREE.Mesh(new THREE.BoxGeometry(CANVAS_SIZE + frameThickness * 2, frameHeight, frameThickness), woodMat);
    bottomFrame.position.set(0, -0.15, 2.2 + CANVAS_SIZE / 2 + frameThickness / 2);
    const leftFrame = new THREE.Mesh(new THREE.BoxGeometry(frameThickness, frameHeight, CANVAS_SIZE), woodMat);
    leftFrame.position.set(-CANVAS_SIZE / 2 - frameThickness / 2, -0.15, 2.2);
    const rightFrame = new THREE.Mesh(new THREE.BoxGeometry(frameThickness, frameHeight, CANVAS_SIZE), woodMat);
    rightFrame.position.set(CANVAS_SIZE / 2 + frameThickness / 2, -0.15, 2.2);
    [topFrame, bottomFrame, leftFrame, rightFrame].forEach(m => {
      m.castShadow = true;
      m.receiveShadow = true;
      frameGroup.add(m);
    });
    scene.add(frameGroup);

    // 상단 2P 컨트롤 데크
    const controlDeck = new THREE.Mesh(
      new THREE.BoxGeometry(17.6, 0.6, 4.4),
      new THREE.MeshStandardMaterial({ color: 0x262936, roughness: 0.5, metalness: 0.2 })
    );
    controlDeck.position.set(0.2, -0.3, -6.8);
    controlDeck.receiveShadow = true;
    scene.add(controlDeck);

    // 색상 발판 구역과 우측 멀리 떨어진 [도화지 지우기] 구역 사이 경고 분리선
    const dividerLine = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.04, 3.8),
      new THREE.MeshBasicMaterial({ color: 0xf43f5e })
    );
    dividerLine.position.set(5.0, 0.02, -6.8);
    scene.add(dividerLine);

    // 컨트롤 데크 위 원통형 압력 발판(Pressure Pads) 및 라벨 생성
    Config.PADS_DATA.forEach(data => {
      const isClearPad = data.type === 'clear';
      const baseRing = new THREE.Mesh(
        new THREE.CylinderGeometry(isClearPad ? 1.12 : 0.96, isClearPad ? 1.18 : 1.02, 0.1, 24),
        new THREE.MeshStandardMaterial({
          color: isClearPad ? 0xfbbf24 : 0x475569,
          roughness: 0.4,
          metalness: 0.5
        })
      );
      baseRing.position.set(data.x, 0.05, data.z);
      baseRing.receiveShadow = true;
      scene.add(baseRing);

      const padMat = new THREE.MeshStandardMaterial({
        color: data.color,
        roughness: 0.25,
        metalness: 0.1,
        emissive: data.color,
        emissiveIntensity: isClearPad ? 0.28 : 0.12
      });
      const pad = new THREE.Mesh(
        new THREE.CylinderGeometry(isClearPad ? 0.92 : 0.80, isClearPad ? 0.98 : 0.86, 0.26, 24),
        padMat
      );
      pad.position.set(data.x, 0.14, data.z);
      pad.receiveShadow = true;
      pad.castShadow = true;
      scene.add(pad);

      const labelSprite = createTextSprite(
        data.label,
        isClearPad ? 'rgba(159, 18, 57, 0.92)' : 'rgba(15, 23, 42, 0.82)',
        isClearPad ? '#fde047' : '#f8fafc',
        isClearPad ? '#fb7185' : 'rgba(255,255,255,0.25)',
        isClearPad ? 2.15 : 1.35,
        isClearPad ? 0.52 : 0.42
      );
      labelSprite.position.set(data.x, 0.62, data.z + 0.65);
      scene.add(labelSprite);

      padMeshes.push({ mesh: pad, mat: padMat, data, wasStepped: false });
    });

    // 1P 브러시 러너, 2P 팔레트 엔지니어 생성 및 커스터마이징 적용
    p1Obj = createJellyCharacter(State.myCustom.color, 'P1', State.myCustom);
    p2Obj = createJellyCharacter(State.p2DefaultCustom.color, 'P2', State.p2DefaultCustom);
    scene.add(p1Obj.group);
    scene.add(p2Obj.group);

    // 대기화면용 프리뷰 캔버스도 함께 초기화
    const previewCanvasEl = document.getElementById('custom-preview-canvas');
    if (previewCanvasEl) {
      initPreviewCanvas(previewCanvasEl);
    }

    updateYouMarkersVisibility();
    window.addEventListener('resize', handleResize);
  }

  function updateYouMarkersVisibility() {
    if (!p1Obj || !p2Obj) return;
    if (State.controlMode === 'P1') {
      p1Obj.youMarker.visible = true;
      p2Obj.youMarker.visible = false;
    } else if (State.controlMode === 'P2') {
      p1Obj.youMarker.visible = false;
      p2Obj.youMarker.visible = true;
    } else if (State.controlMode === 'BOTH') {
      p1Obj.youMarker.visible = true;
      p2Obj.youMarker.visible = true;
    } else {
      p1Obj.youMarker.visible = false;
      p2Obj.youMarker.visible = false;
    }
  }

  function handleResize() {
    const viewSize = Config.VIEW_SIZE;
    const newAspect = window.innerWidth / window.innerHeight;
    camera.left = -viewSize * newAspect;
    camera.right = viewSize * newAspect;
    camera.top = viewSize;
    camera.bottom = -viewSize;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  function clearCanvas() {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, drawCanvas.width, drawCanvas.height);
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, drawCanvas.width - 10, drawCanvas.height - 10);
    canvasTexture.needsUpdate = true;
    State.p1State.prevX = null;
    State.p1State.prevZ = null;
  }

  function loadCanvasFromDataURL(dataUrl) {
    if (!dataUrl) return;
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, drawCanvas.width, drawCanvas.height);
      canvasTexture.needsUpdate = true;
    };
    img.src = dataUrl;
  }

  function createJellyCharacter(bodyColor, roleType, initialCustom = null) {
    const root = new THREE.Group();
    const animGroup = new THREE.Group();
    root.add(animGroup);

    const jellyMat = new THREE.MeshToonMaterial({ color: bodyColor });

    // 1) 통통한 젤리빈 캡슐 몸통
    const torsoGroup = new THREE.Group();
    const midCyl = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.48, 0.65, 24), jellyMat);
    midCyl.position.y = 0.72;
    midCyl.castShadow = true;
    torsoGroup.add(midCyl);

    const topDome = new THREE.Mesh(new THREE.SphereGeometry(0.46, 24, 16), jellyMat);
    topDome.position.y = 1.04;
    topDome.castShadow = true;
    torsoGroup.add(topDome);

    const botDome = new THREE.Mesh(new THREE.SphereGeometry(0.48, 24, 16), jellyMat);
    botDome.position.y = 0.42;
    botDome.castShadow = true;
    torsoGroup.add(botDome);
    animGroup.add(torsoGroup);

    // 2) 커스텀 가능한 얼굴 그룹
    const faceGroup = new THREE.Group();
    faceGroup.position.set(0, 0.92, 0.41);
    animGroup.add(faceGroup);

    // 3) 짧은 젤리 팔 & 다리
    const limbGeo = new THREE.SphereGeometry(0.14, 12, 12);
    const leftArm = new THREE.Mesh(limbGeo, jellyMat);
    leftArm.scale.set(0.85, 1.6, 0.85);
    leftArm.position.set(-0.52, 0.72, 0);
    leftArm.castShadow = true;
    animGroup.add(leftArm);

    const rightArm = new THREE.Mesh(limbGeo, jellyMat);
    rightArm.scale.set(0.85, 1.6, 0.85);
    rightArm.position.set(0.52, 0.72, 0);
    rightArm.castShadow = true;
    animGroup.add(rightArm);

    const footMat = new THREE.MeshToonMaterial({ color: 0x1e293b });
    const leftLeg = new THREE.Mesh(limbGeo, footMat);
    leftLeg.scale.set(0.95, 0.8, 1.35);
    leftLeg.position.set(-0.22, 0.14, 0.05);
    leftLeg.castShadow = true;
    root.add(leftLeg);

    const rightLeg = new THREE.Mesh(limbGeo, footMat);
    rightLeg.scale.set(0.95, 0.8, 1.35);
    rightLeg.position.set(0.22, 0.14, 0.05);
    rightLeg.castShadow = true;
    root.add(rightLeg);

    // 4) 모자/장식 그룹 & 1P 전용 붓 소품
    const tipMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 });
    const hatGroup = new THREE.Group();
    animGroup.add(hatGroup);

    let brushPivot = null;
    if (roleType === 'P1' || roleType === 'PREVIEW') {
      brushPivot = new THREE.Group();
      brushPivot.position.set(0.45, 0.75, 0.1);

      const handle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.11, 1.35, 16),
        new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.5 })
      );
      handle.position.y = 0.25;
      handle.castShadow = true;
      brushPivot.add(handle);

      const ferrule = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.10, 0.24, 16),
        new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.7, roughness: 0.2 })
      );
      ferrule.position.y = -0.48;
      brushPivot.add(ferrule);

      const bristle = new THREE.Mesh(
        new THREE.ConeGeometry(0.19, 0.45, 16),
        tipMat
      );
      bristle.rotation.x = Math.PI;
      bristle.position.y = -0.78;
      bristle.castShadow = true;
      brushPivot.add(bristle);

      animGroup.add(brushPivot);
    }

    // 5) 머리 위 'YOU' 화살표 마커 부착
    const youMarker = createYouMarker(roleType === 'P2' ? 'P2' : 'P1');
    root.add(youMarker);

    const charObj = {
      group: root,
      animGroup,
      jellyMat,
      faceGroup,
      hatGroup,
      leftArm,
      rightArm,
      leftLeg,
      rightLeg,
      brushPivot,
      tipMat,
      youMarker,
      targetAngle: 0
    };

    const customToApply = initialCustom || {
      color: bodyColor,
      hat: roleType === 'P2' ? 'HELMET' : 'BERET',
      face: 'NORMAL'
    };
    applyCharacterCustomization(charObj, customToApply);

    return charObj;
  }

  function updateCharacterVisuals(charObj, vx, vz, elapsedTime, isPenActive, dtScale = 1) {
    const speed = Math.hypot(vx, vz);
    const lerpFactor = 1 - Math.pow(0.75, dtScale);

    if (speed > 0.008) {
      charObj.targetAngle = Math.atan2(vx, vz);
      let diff = charObj.targetAngle - charObj.group.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      charObj.group.rotation.y += diff * lerpFactor;

      const stride = elapsedTime * 18;
      const bounce = Math.abs(Math.sin(stride));
      charObj.animGroup.position.y = bounce * 0.24;
      const stretch = 1 + bounce * 0.12;
      const squash = 1 / Math.sqrt(stretch);
      charObj.animGroup.scale.set(squash, stretch, squash);

      const swing = Math.sin(stride) * 0.65;
      charObj.leftLeg.position.z = 0.05 + swing * 0.25;
      charObj.rightLeg.position.z = 0.05 - swing * 0.25;
      charObj.leftLeg.position.y = 0.14 + Math.max(0, swing) * 0.12;
      charObj.rightLeg.position.y = 0.14 + Math.max(0, -swing) * 0.12;
      charObj.leftArm.rotation.x = -swing * 0.8;
      charObj.rightArm.rotation.x = swing * 0.8;
    } else {
      const decay = Math.pow(0.8, dtScale);
      charObj.animGroup.position.y *= decay;
      const breathe = 1 + Math.sin(elapsedTime * 4) * 0.025;
      charObj.animGroup.scale.set(1 / Math.sqrt(breathe), breathe, 1 / Math.sqrt(breathe));
      charObj.leftLeg.position.z = 0.05;
      charObj.rightLeg.position.z = 0.05;
      charObj.leftLeg.position.y = 0.14;
      charObj.rightLeg.position.y = 0.14;
      charObj.leftArm.rotation.x *= decay;
      charObj.rightArm.rotation.x *= decay;
    }

    // 프로펠러 모자 회전 및 헤일로 부유 애니메이션
    if (charObj.hatGroup?.userData.propellerBlade) {
      charObj.hatGroup.userData.propellerBlade.rotation.y += 0.32 * dtScale;
    }
    if (charObj.hatGroup?.userData.haloRing) {
      charObj.hatGroup.userData.haloRing.position.y = 1.76 + Math.sin(elapsedTime * 5) * 0.05;
    }

    // 상단 'YOU' 화살표 위아래 바운스 애니메이션
    if (charObj.youMarker && charObj.youMarker.visible) {
      charObj.youMarker.position.y = 2.52 + Math.sin(elapsedTime * 6) * 0.14;
      charObj.youMarker.rotation.y = -charObj.group.rotation.y;
    }

    if (charObj.brushPivot) {
      const targetPitch = isPenActive ? 0.55 : -0.45;
      const targetY = isPenActive ? 0.52 : 0.85;
      const brushLerp = 1 - Math.pow(0.8, dtScale);
      charObj.brushPivot.rotation.x += (targetPitch - charObj.brushPivot.rotation.x) * brushLerp;
      charObj.brushPivot.position.y += (targetY - charObj.brushPivot.position.y) * brushLerp;
    }
  }

  function spawnPaintSplatter(x, z, vx, vz, colorHex) {
    const mat = new THREE.MeshBasicMaterial({ color: colorHex });
    const drop = new THREE.Mesh(dropletGeo, mat);
    const scale = 0.6 + Math.random() * 0.9;
    drop.scale.set(scale, scale, scale);
    drop.position.set(
      x + (Math.random() - 0.5) * 0.4,
      0.18 + Math.random() * 0.15,
      z + (Math.random() - 0.5) * 0.4
    );
    scene.add(drop);
    paintDroplets.push({
      mesh: drop,
      vx: -vx * 0.4 + (Math.random() - 0.5) * 0.09,
      vy: 0.09 + Math.random() * 0.09,
      vz: -vz * 0.4 + (Math.random() - 0.5) * 0.09,
      life: 1.0
    });
  }

  function spawnPadRipple(x, z, colorVal) {
    const mat = new THREE.MeshBasicMaterial({
      color: colorVal,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9
    });
    const ring = new THREE.Mesh(rippleGeo, mat);
    ring.position.set(x, 0.08, z);
    scene.add(ring);
    padRipples.push({ mesh: ring, mat, scale: 1.0, opacity: 0.9 });
  }

  function spawnConfettiExplosion() {
    const colors = Config.CONFETTI_COLORS;
    for (let i = 0; i < 160; i++) {
      const mat = new THREE.MeshLambertMaterial({
        color: colors[Math.floor(Math.random() * colors.length)]
      });
      const mesh = new THREE.Mesh(confettiGeo, mat);
      mesh.position.set(
        (Math.random() - 0.5) * 4,
        1.0 + Math.random() * 1.5,
        2.2 + (Math.random() - 0.5) * 4
      );
      const angle = Math.random() * Math.PI * 2;
      const power = 0.08 + Math.random() * 0.22;
      scene.add(mesh);
      confettiParticles.push({
        mesh,
        vx: Math.cos(angle) * power,
        vy: 0.25 + Math.random() * 0.35,
        vz: Math.sin(angle) * power,
        rx: (Math.random() - 0.5) * 0.25,
        ry: (Math.random() - 0.5) * 0.25,
        rz: (Math.random() - 0.5) * 0.25
      });
    }
  }

  function clearConfetti() {
    confettiParticles.forEach(p => {
      scene.remove(p.mesh);
      if (p.mesh.material) p.mesh.material.dispose();
    });
    confettiParticles.length = 0;
    paintDroplets.forEach(d => {
      scene.remove(d.mesh);
      if (d.mesh.material) d.mesh.material.dispose();
    });
    paintDroplets.length = 0;
    padRipples.forEach(r => {
      scene.remove(r.mesh);
      if (r.mat) r.mat.dispose();
    });
    padRipples.length = 0;
  }

  function updateParticles(dtScale = 1) {
    for (let i = paintDroplets.length - 1; i >= 0; i--) {
      const d = paintDroplets[i];
      d.vy -= 0.008 * dtScale;
      d.mesh.position.x += d.vx * dtScale;
      d.mesh.position.y += d.vy * dtScale;
      d.mesh.position.z += d.vz * dtScale;
      d.life -= 0.035 * dtScale;
      d.mesh.scale.multiplyScalar(Math.pow(0.95, dtScale));

      if (d.mesh.position.y <= 0.03 || d.life <= 0) {
        scene.remove(d.mesh);
        if (d.mesh.material) d.mesh.material.dispose();
        paintDroplets.splice(i, 1);
      }
    }

    for (let i = padRipples.length - 1; i >= 0; i--) {
      const r = padRipples[i];
      r.scale += 0.06 * dtScale;
      r.opacity -= 0.04 * dtScale;
      r.mesh.scale.set(r.scale, 1, r.scale);
      r.mat.opacity = Math.max(0, r.opacity);
      if (r.opacity <= 0) {
        scene.remove(r.mesh);
        r.mat.dispose();
        padRipples.splice(i, 1);
      }
    }

    for (let i = confettiParticles.length - 1; i >= 0; i--) {
      const p = confettiParticles[i];
      p.vy -= 0.009 * dtScale;
      p.mesh.position.x += p.vx * dtScale;
      p.mesh.position.y += p.vy * dtScale;
      p.mesh.position.z += p.vz * dtScale;
      p.mesh.rotation.x += p.rx * dtScale;
      p.mesh.rotation.y += p.ry * dtScale;
      p.mesh.rotation.z += p.rz * dtScale;

      if (p.mesh.position.y < 0.05) {
        p.mesh.position.y = 0.05;
        const groundFriction = Math.pow(0.8, dtScale);
        p.vx *= groundFriction;
        p.vz *= groundFriction;
        p.vy = 0;
      }
    }
  }

  function paintStrokeOnBoard() {
    const CANVAS_SIZE = Config.CANVAS_SIZE;
    const uvX = (p1Obj.group.position.x + CANVAS_SIZE / 2) / CANVAS_SIZE;
    const uvY = (p1Obj.group.position.z - (2.2 - CANVAS_SIZE / 2)) / CANVAS_SIZE;
    const pixelX = uvX * drawCanvas.width;
    const pixelY = uvY * drawCanvas.height;

    if (State.isPenDown && State.activeColorHex) {
      ctx.save();
      ctx.strokeStyle = State.activeColorHex;
      ctx.fillStyle = State.activeColorHex;
      ctx.lineWidth = State.activeColorName === '지우개' ? 48 : 28;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (State.p1State.prevX !== null && State.p1State.prevZ !== null) {
        // 원격 패킷 지연 등으로 이전 좌표와 현재 좌표가 비정상적으로 멀리 뛴 경우(순간이동) 직선 연결 방지
        const jumpDist = Math.hypot(pixelX - State.p1State.prevX, pixelY - State.p1State.prevZ);
        if (jumpDist < 180) {
          ctx.beginPath();
          ctx.moveTo(State.p1State.prevX, State.p1State.prevZ);
          ctx.lineTo(pixelX, pixelY);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(pixelX, pixelY, ctx.lineWidth / 2, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        ctx.beginPath();
        ctx.arc(pixelX, pixelY, ctx.lineWidth / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      canvasTexture.needsUpdate = true;

      const p1Speed = Math.hypot(State.p1State.vx, State.p1State.vz);
      if (p1Speed > 0.02 && Math.random() < 0.55) {
        spawnPaintSplatter(
          p1Obj.group.position.x,
          p1Obj.group.position.z,
          State.p1State.vx,
          State.p1State.vz,
          State.activeColorHex
        );
      }
    }
    State.p1State.prevX = pixelX;
    State.p1State.prevZ = pixelY;
  }

  function renderFrame(elapsedTime = 0, dtScale = 1) {
    renderer.render(scene, camera);

    // 대기화면(Entry Lobby)이 열려 있을 때 3D 클로즈업 프리뷰 캐릭터도 회전/바운스 렌더링
    if (previewRenderer && previewScene && previewCamera && previewCharObj) {
      const entryModal = document.getElementById('entry-screen');
      if (entryModal && !entryModal.classList.contains('hidden')) {
        previewCharObj.group.rotation.y = Math.sin(elapsedTime * 1.4) * 0.55;
        const bounce = Math.abs(Math.sin(elapsedTime * 5.5));
        previewCharObj.animGroup.position.y = bounce * 0.1;
        previewCharObj.leftArm.rotation.x = Math.sin(elapsedTime * 5.5) * 0.35;
        previewCharObj.rightArm.rotation.x = -Math.sin(elapsedTime * 5.5) * 0.35;
        if (previewCharObj.hatGroup?.userData.propellerBlade) {
          previewCharObj.hatGroup.userData.propellerBlade.rotation.y += 0.32 * dtScale;
        }
        if (previewCharObj.hatGroup?.userData.haloRing) {
          previewCharObj.hatGroup.userData.haloRing.position.y = 1.76 + Math.sin(elapsedTime * 5) * 0.05;
        }
        previewRenderer.render(previewScene, previewCamera);
      }
    }
  }

  return {
    initScene,
    clearCanvas,
    loadCanvasFromDataURL,
    applyCharacterCustomization,
    syncRosterCustomizations,
    updateYouMarkersVisibility,
    updateCharacterVisuals,
    spawnPaintSplatter,
    spawnPadRipple,
    spawnConfettiExplosion,
    clearConfetti,
    updateParticles,
    paintStrokeOnBoard,
    renderFrame,
    getSceneObjects: () => ({
      scene,
      camera,
      renderer,
      drawCanvas,
      drawingBoard,
      p1Obj,
      p2Obj,
      padMeshes
    })
  };
})();
