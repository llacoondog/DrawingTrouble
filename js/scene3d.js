// ==========================================
// 반반 무마니 3D - Three.js 씬, 캐릭터, 캔버스, 파티클 (scene3d.js)
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

  const dropletGeo = new THREE.SphereGeometry(0.11, 8, 8);
  const rippleGeo = new THREE.RingGeometry(0.75, 0.95, 28);
  rippleGeo.rotateX(-Math.PI / 2);
  const confettiGeo = new THREE.BoxGeometry(0.28, 0.08, 0.28);

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

    // 도화지 외곽 원목 액자 테두리 (Wooden Easel Frame)
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
      new THREE.BoxGeometry(16, 0.6, 4.2),
      new THREE.MeshStandardMaterial({ color: 0x262936, roughness: 0.5, metalness: 0.2 })
    );
    controlDeck.position.set(0, -0.3, -6.8);
    controlDeck.receiveShadow = true;
    scene.add(controlDeck);

    // 컨트롤 데크 위 원통형 압력 발판(Pressure Pads) 및 베이스 링
    Config.PADS_DATA.forEach(data => {
      const baseRing = new THREE.Mesh(
        new THREE.CylinderGeometry(1.02, 1.08, 0.1, 24),
        new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.4, metalness: 0.5 })
      );
      baseRing.position.set(data.x, 0.05, data.z);
      baseRing.receiveShadow = true;
      scene.add(baseRing);

      const padMat = new THREE.MeshStandardMaterial({
        color: data.color,
        roughness: 0.25,
        metalness: 0.1,
        emissive: data.color,
        emissiveIntensity: 0.12
      });
      const pad = new THREE.Mesh(
        new THREE.CylinderGeometry(0.85, 0.92, 0.26, 24),
        padMat
      );
      pad.position.set(data.x, 0.14, data.z);
      pad.receiveShadow = true;
      pad.castShadow = true;
      scene.add(pad);
      padMeshes.push({ mesh: pad, mat: padMat, data, wasStepped: false });
    });

    // 1P 브러시 러너 (핑크 젤리빈), 2P 팔레트 엔지니어 (시안 젤리빈)
    p1Obj = createJellyCharacter(0xec4899, 'P1');
    p2Obj = createJellyCharacter(0x06b6d4, 'P2');
    scene.add(p1Obj.group);
    scene.add(p2Obj.group);

    window.addEventListener('resize', handleResize);
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

  function createJellyCharacter(bodyColor, roleType) {
    const root = new THREE.Group();
    const animGroup = new THREE.Group();
    root.add(animGroup);

    const jellyMat = new THREE.MeshToonMaterial({ color: bodyColor });
    const darkMat = new THREE.MeshBasicMaterial({ color: 0x111827 });
    const whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const blushMat = new THREE.MeshBasicMaterial({ color: 0xf43f5e, transparent: true, opacity: 0.55 });

    // 1) 통통한 젤리빈 캡슐 몸통 (실린더 + 상/하 반구)
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

    // 2) 귀여운 3D 눈 & 발그레 볼터치
    const faceGroup = new THREE.Group();
    faceGroup.position.set(0, 0.92, 0.41);

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

    [-0.28, 0.28].forEach(offsetX => {
      const blush = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 12), blushMat);
      blush.scale.set(1.2, 0.65, 0.4);
      blush.position.set(offsetX, -0.07, -0.02);
      faceGroup.add(blush);
    });
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

    // 4) 역할별 전용 3D 소품 장착
    const tipMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 });
    let brushPivot = null;

    if (roleType === 'P1') {
      const beret = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.32, 0.12, 20), new THREE.MeshToonMaterial({ color: 0xf472b6 }));
      beret.position.set(0, 1.48, -0.04);
      beret.rotation.z = -0.15;
      animGroup.add(beret);

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
    } else {
      const helmet = new THREE.Mesh(
        new THREE.SphereGeometry(0.49, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.55),
        new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.3 })
      );
      helmet.position.y = 1.08;
      helmet.castShadow = true;
      animGroup.add(helmet);

      const visor = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, 0.08, 0.35),
        new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.3 })
      );
      visor.position.set(0, 1.12, 0.38);
      animGroup.add(visor);

      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 12), tipMat);
      bulb.position.y = 1.65;
      animGroup.add(bulb);
    }

    return {
      group: root,
      animGroup,
      leftArm,
      rightArm,
      leftLeg,
      rightLeg,
      brushPivot,
      tipMat,
      targetAngle: 0
    };
  }

  function updateCharacterVisuals(charObj, vx, vz, elapsedTime, isPenActive) {
    const speed = Math.hypot(vx, vz);
    if (speed > 0.008) {
      charObj.targetAngle = Math.atan2(vx, vz);
      let diff = charObj.targetAngle - charObj.group.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      charObj.group.rotation.y += diff * 0.25;

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
      charObj.animGroup.position.y *= 0.8;
      const breathe = 1 + Math.sin(elapsedTime * 4) * 0.025;
      charObj.animGroup.scale.set(1 / Math.sqrt(breathe), breathe, 1 / Math.sqrt(breathe));
      charObj.leftLeg.position.z = 0.05;
      charObj.rightLeg.position.z = 0.05;
      charObj.leftLeg.position.y = 0.14;
      charObj.rightLeg.position.y = 0.14;
      charObj.leftArm.rotation.x *= 0.8;
      charObj.rightArm.rotation.x *= 0.8;
    }

    if (charObj.brushPivot) {
      const targetPitch = isPenActive ? 0.55 : -0.45;
      const targetY = isPenActive ? 0.52 : 0.85;
      charObj.brushPivot.rotation.x += (targetPitch - charObj.brushPivot.rotation.x) * 0.2;
      charObj.brushPivot.position.y += (targetY - charObj.brushPivot.position.y) * 0.2;
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
    confettiParticles.forEach(p => scene.remove(p.mesh));
    confettiParticles.length = 0;
    paintDroplets.forEach(d => scene.remove(d.mesh));
    paintDroplets.length = 0;
    padRipples.forEach(r => scene.remove(r.mesh));
    padRipples.length = 0;
  }

  function updateParticles() {
    // 1) 3D 물감 방울 파티클 업데이트
    for (let i = paintDroplets.length - 1; i >= 0; i--) {
      const d = paintDroplets[i];
      d.vy -= 0.008;
      d.mesh.position.x += d.vx;
      d.mesh.position.y += d.vy;
      d.mesh.position.z += d.vz;
      d.life -= 0.035;
      d.mesh.scale.multiplyScalar(0.95);

      if (d.mesh.position.y <= 0.03 || d.life <= 0) {
        scene.remove(d.mesh);
        paintDroplets.splice(i, 1);
      }
    }

    // 2) 발판 파동(Ripple) 링 업데이트
    for (let i = padRipples.length - 1; i >= 0; i--) {
      const r = padRipples[i];
      r.scale += 0.06;
      r.opacity -= 0.04;
      r.mesh.scale.set(r.scale, 1, r.scale);
      r.mat.opacity = Math.max(0, r.opacity);
      if (r.opacity <= 0) {
        scene.remove(r.mesh);
        r.mat.dispose();
        padRipples.splice(i, 1);
      }
    }

    // 3) 3D 폭죽(Confetti) 중력 물리 업데이트
    for (let i = confettiParticles.length - 1; i >= 0; i--) {
      const p = confettiParticles[i];
      p.vy -= 0.009;
      p.mesh.position.x += p.vx;
      p.mesh.position.y += p.vy;
      p.mesh.position.z += p.vz;
      p.mesh.rotation.x += p.rx;
      p.mesh.rotation.y += p.ry;
      p.mesh.rotation.z += p.rz;

      if (p.mesh.position.y < 0.05) {
        p.mesh.position.y = 0.05;
        p.vx *= 0.8;
        p.vz *= 0.8;
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
        ctx.beginPath();
        ctx.moveTo(State.p1State.prevX, State.p1State.prevZ);
        ctx.lineTo(pixelX, pixelY);
        ctx.stroke();
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

  function renderFrame() {
    renderer.render(scene, camera);
  }

  return {
    initScene,
    clearCanvas,
    loadCanvasFromDataURL,
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
