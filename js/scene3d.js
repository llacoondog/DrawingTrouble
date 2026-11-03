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
  const coopPings = [];

  // 관전자 / 대기자 3D 캐릭터 맵 (peerId -> charObj)
  const spectatorChars = new Map();
  let waitingLoungeMesh = null;

  // 👥 팀 모드용 독립 도화지 캔버스 & 텍스처 (팀 A, 팀 B 서브룸)
  let teamCanvasA = null, teamCtxA = null, teamTextureA = null;
  let teamCanvasB = null, teamCtxB = null, teamTextureB = null;
  let activeBoardRoom = 'MAIN'; // 'MAIN' | 'teamA' | 'teamB'

  // 대기화면 전용 3D 캐릭터 클로즈업 프리뷰 씬
  let previewScene = null;
  let previewCamera = null;
  let previewRenderer = null;
  let previewCharObj = null;

  // 공간 좌측 (팔레트 옆 / 캔버스 옆) 현재 1P·2P 안내 3D 입체 표지판
  let p1RoleBoard = null;
  let p2RoleBoard = null;

  const dropletGeo = new THREE.SphereGeometry(0.11, 8, 8);
  const rippleGeo = new THREE.RingGeometry(0.75, 0.95, 28);
  rippleGeo.rotateX(-Math.PI / 2);
  const confettiGeo = new THREE.BoxGeometry(0.28, 0.08, 0.28);
  const pingRingGeo = new THREE.RingGeometry(0.3, 0.55, 32);
  pingRingGeo.rotateX(-Math.PI / 2);
  const pingColumnGeo = new THREE.CylinderGeometry(0.04, 0.22, 2.0, 16);

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

    c.font = '900 30px Jua, Inter, Malgun Gothic, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = textColor;
    c.fillText(text, canvas.width / 2, canvas.height / 2 + 2);

    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(scaleWidth, scaleHeight, 1);
    sprite.renderOrder = 999;
    return sprite;
  }

  // 닉네임 태그 스프라이트 생성 헬퍼
  function createNameTagSprite(name, isMe = false, roleTag = '') {
    const bg = isMe ? 'rgba(236, 72, 153, 0.94)' : 'rgba(30, 41, 59, 0.88)';
    const border = isMe ? '#fbcfe8' : '#94a3b8';
    const text = roleTag ? `[${roleTag}] ${name}` : name;
    const sprite = createTextSprite(text, bg, '#ffffff', border, 2.0, 0.52);
    sprite.position.set(0, 2.32, 0);
    return sprite;
  }

  // 캐릭터 머리 위 상단 'YOU' + 입체 화살표(▼) 마커 생성
  function createYouMarker(roleType) {
    const markerGroup = new THREE.Group();
    markerGroup.position.set(0, 2.52, 0);

    const isP1 = roleType === 'P1';
    const isP2 = roleType === 'P2';
    const badgeColor = isP1 ? '#ec4899' : isP2 ? '#06b6d4' : '#8b5cf6';
    const coneColor = isP1 ? 0xf472b6 : isP2 ? 0x22d3ee : 0xa78bfa;
    const labelText = isP1 ? 'YOU (1P)' : isP2 ? 'YOU (2P)' : 'YOU (대기)';

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
      if (previewRenderer && previewScene && previewCamera) {
        previewRenderer.render(previewScene, previewCamera);
      }
    }
    updateRoleSignboards();
  }

  function getHatEmoji(hatId) {
    const found = Config.CUSTOM_HATS.find(h => h.id === hatId);
    return found ? found.icon : '🎨';
  }

  // 공간 왼쪽 (팔레트 옆 / 캔버스 옆) 3D 역할 입체 표지판 생성
  function createRoleSignboard(roleType, defaultX, defaultZ) {
    const isP1 = roleType === 'P1';
    const group = new THREE.Group();
    group.position.set(defaultX, 0, defaultZ);

    const accentHex = isP1 ? 0xf472b6 : 0x22d3ee;
    const baseMat = new THREE.MeshToonMaterial({ color: 0x3b2d5e });
    const rimMat = new THREE.MeshToonMaterial({ color: accentHex });

    // 바닥 받침대 원판
    const baseDisc = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.18, 0.18, 24), baseMat);
    baseDisc.position.y = -0.22;
    baseDisc.receiveShadow = true;
    group.add(baseDisc);

    const rimDisc = new THREE.Mesh(new THREE.CylinderGeometry(1.12, 1.12, 0.06, 24), rimMat);
    rimDisc.position.y = -0.12;
    group.add(rimDisc);

    // 우측(캔버스/팔레트 방향)을 가리키는 입체 화살표 콘
    const arrowCone = new THREE.Mesh(
      new THREE.ConeGeometry(0.26, 0.52, 16),
      new THREE.MeshBasicMaterial({ color: accentHex })
    );
    arrowCone.rotation.z = -Math.PI / 2;
    arrowCone.position.set(1.38, 0.08, 0);
    group.add(arrowCone);

    // 고해상도 2D 캔버스 기반 3D 빌보드 카드 스프라이트
    const canvas = document.createElement('canvas');
    canvas.width = 480;
    canvas.height = 200;
    const tex = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(4.1, 1.71, 1);
    sprite.position.set(0, 1.05, 0);
    sprite.renderOrder = 950;
    group.add(sprite);

    return {
      roleType,
      group,
      sprite,
      canvas,
      tex,
      defaultX,
      defaultZ,
      lastKey: ''
    };
  }

  // 캔버스 옆(1P)과 팔레트 옆(2P) 표지판에 현재 누가 맡고 있는지 실시간 렌더링
  function updateRoleSignboards() {
    if (!p1RoleBoard || !p2RoleBoard) return;

    const p1Entry = State.playerRoster.find(p => p.role === 'P1');
    const p2Entry = State.playerRoster.find(p => p.role === 'P2');

    const myId = State.isP2PConnected ? State.myPeerId : 'local-1';
    const p1Nick = p1Entry?.nickname || State.myNickname || '1P 브러시';
    const p1Custom = p1Entry?.custom || State.myCustom;
    const isP1Me = p1Entry ? p1Entry.id === myId : State.controlMode === 'P1';

    const p2Nick = p2Entry?.nickname || '2P 팔레트';
    const p2Custom = p2Entry?.custom || State.p2DefaultCustom;
    const isP2Me = p2Entry ? p2Entry.id === myId : State.controlMode === 'P2';

    drawSignboardCard(p1RoleBoard, {
      badgeTitle: '🎨 캔버스 · 현재 1P ▶',
      nickname: p1Nick,
      hatEmoji: getHatEmoji(p1Custom?.hat),
      dotColor: p1Custom?.color || '#ec4899',
      isMe: Boolean(isP1Me),
      borderColor: '#f472b6',
      headerBg: '#db2777'
    });

    drawSignboardCard(p2RoleBoard, {
      badgeTitle: '🕹️ 팔레트 · 현재 2P ▶',
      nickname: p2Nick,
      hatEmoji: getHatEmoji(p2Custom?.hat),
      dotColor: p2Custom?.color || '#06b6d4',
      isMe: Boolean(isP2Me),
      borderColor: '#22d3ee',
      headerBg: '#0891b2'
    });
  }

  function drawSignboardCard(board, info) {
    const key = `${info.badgeTitle}|${info.nickname}|${info.hatEmoji}|${info.dotColor}|${info.isMe}`;
    if (board.lastKey === key) return;
    board.lastKey = key;

    const { canvas, tex } = board;
    const c = canvas.getContext('2d');
    c.clearRect(0, 0, canvas.width, canvas.height);

    const x = 12, y = 12, w = canvas.width - 24, h = canvas.height - 24, r = 34;

    // 1) 카드 배경
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

    c.fillStyle = 'rgba(26, 20, 46, 0.94)';
    c.fill();
    c.lineWidth = 7;
    c.strokeStyle = info.borderColor;
    c.stroke();

    // 2) 상단 역할 헤더 필 배지
    const hx = 28, hy = 26, hw = canvas.width - 56, hh = 50, hr = 22;
    c.beginPath();
    c.moveTo(hx + hr, hy);
    c.lineTo(hx + hw - hr, hy);
    c.quadraticCurveTo(hx + hw, hy, hx + hw, hy + hr);
    c.lineTo(hx + hw, hy + hh - hr);
    c.quadraticCurveTo(hx + hw, hy + hh, hx + hw - hr, hy + hh);
    c.lineTo(hx + hr, hy + hh);
    c.quadraticCurveTo(hx, hy + hh, hx, hy + hh - hr);
    c.lineTo(hx, hy + hr);
    c.quadraticCurveTo(hx, hy, hx + hr, hy);
    c.closePath();
    c.fillStyle = info.headerBg;
    c.fill();

    c.font = '900 28px Jua, Inter, Malgun Gothic, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = '#ffffff';
    c.fillText(info.badgeTitle, canvas.width / 2, hy + hh / 2 + 2);

    // 3) 하단 플레이어 컬러 도트 + 모자 아이콘 + 닉네임 + (나) 표시
    const centerY = 132;
    const meSuffix = info.isMe ? ' (나)' : '';
    const displayText = `${info.hatEmoji} ${info.nickname}${meSuffix}`;

    // 플레이어 커스텀 색상 원형 배지
    c.beginPath();
    c.arc(62, centerY, 18, 0, Math.PI * 2);
    c.fillStyle = info.dotColor;
    c.fill();
    c.lineWidth = 4;
    c.strokeStyle = '#ffffff';
    c.stroke();

    c.font = '900 36px Jua, Inter, Malgun Gothic, sans-serif';
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.fillStyle = info.isMe ? '#fde047' : '#ffffff';
    c.fillText(displayText, 94, centerY + 2);

    tex.needsUpdate = true;
  }

  // 대기화면(Entry Screen) 내부 3D 캐릭터 프리뷰 캔버스 초기화
  function initPreviewCanvas(canvasEl) {
    if (!canvasEl) return;
    try {
      previewScene = new THREE.Scene();
      previewScene.background = new THREE.Color(0x281e42);

      previewCamera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
      previewCamera.position.set(0, 1.25, 3.6);
      previewCamera.lookAt(0, 0.95, 0);

      previewRenderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true });
      previewRenderer.setSize(220, 220);
      previewRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

      previewScene.add(new THREE.AmbientLight(0xffffff, 0.88));
      const pLight = new THREE.DirectionalLight(0xfff1f2, 0.68);
      pLight.position.set(3, 6, 5);
      previewScene.add(pLight);

      // 프리뷰 받침대 귀여운 마카롱 단상
      const pedestal = new THREE.Mesh(
        new THREE.CylinderGeometry(0.84, 0.92, 0.18, 32),
        new THREE.MeshToonMaterial({ color: 0xf472b6 })
      );
      pedestal.position.y = -0.09;
      previewScene.add(pedestal);

      const pedestalRim = new THREE.Mesh(
        new THREE.CylinderGeometry(0.88, 0.88, 0.05, 32),
        new THREE.MeshToonMaterial({ color: 0xfef08a })
      );
      pedestalRim.position.y = -0.01;
      previewScene.add(pedestalRim);

      previewCharObj = createJellyCharacter(State.myCustom.color, 'PREVIEW', State.myCustom);
      previewCharObj.youMarker.visible = false;
      previewScene.add(previewCharObj.group);
      previewRenderer.render(previewScene, previewCamera);
    } catch (e) {
      console.warn('Preview WebGL canvas init skipped:', e);
    }
  }

  // 화실 주변을 꾸며주는 귀여운 3D 파스텔 소품(거대 크레파스, 구름, 별) 생성
  function addCuteStudioProps() {
    const propsGroup = new THREE.Group();

    // 1) 좌측 거대 핑크 크레파스 장식
    function createGiantCrayon(colorHex, bodyHex, x, z, rotY) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.38, 0.38, 2.6, 20),
        new THREE.MeshToonMaterial({ color: bodyHex })
      );
      body.rotation.z = Math.PI / 2;
      body.castShadow = true;
      g.add(body);

      const stripe = new THREE.Mesh(
        new THREE.CylinderGeometry(0.39, 0.39, 1.4, 20),
        new THREE.MeshToonMaterial({ color: 0xffffff })
      );
      stripe.rotation.z = Math.PI / 2;
      g.add(stripe);

      const tip = new THREE.Mesh(
        new THREE.ConeGeometry(0.38, 0.75, 20),
        new THREE.MeshToonMaterial({ color: colorHex })
      );
      tip.rotation.z = -Math.PI / 2;
      tip.position.x = 1.67;
      tip.castShadow = true;
      g.add(tip);

      g.position.set(x, 0.38, z);
      g.rotation.y = rotY;
      return g;
    }

    propsGroup.add(createGiantCrayon(0xf43f5e, 0xfb7185, 8.6, -1.4, -0.35));
    propsGroup.add(createGiantCrayon(0x06b6d4, 0x38bdf8, -8.5, 7.6, -0.25));
    propsGroup.add(createGiantCrayon(0xfacc15, 0xfde047, 8.5, 2.8, 2.75));

    // 2) 폭신폭신 3D 구름 & 파스텔 별 장식
    const cloudMat = new THREE.MeshToonMaterial({ color: 0xfdf2f8 });
    function createFluffyCloud(x, y, z, scale = 1) {
      const cg = new THREE.Group();
      const p1 = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 16), cloudMat);
      const p2 = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 16), cloudMat);
      p2.position.set(-0.48, -0.08, 0.05);
      const p3 = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 16), cloudMat);
      p3.position.set(0.48, -0.06, -0.05);
      cg.add(p1, p2, p3);
      cg.position.set(x, y, z);
      cg.scale.set(scale, scale, scale);
      return cg;
    }

    propsGroup.add(createFluffyCloud(-9.2, 0.5, -2.5, 0.95));
    propsGroup.add(createFluffyCloud(9.2, 0.5, -1.8, 0.85));

    // 3) 바닥 파스텔 도트 장식 타일
    const dotColors = [0xf472b6, 0x38bdf8, 0xfacc15, 0xa78bfa, 0x34d399];
    const dotCoords = [
      [-8.8, -5.2], [-9.2, 6.4], [8.8, 6.2], [9.4, -4.8], [-7.8, 8.8], [7.8, 8.8]
    ];
    dotCoords.forEach(([dx, dz], idx) => {
      const dot = new THREE.Mesh(
        new THREE.CylinderGeometry(0.45, 0.45, 0.06, 20),
        new THREE.MeshBasicMaterial({ color: dotColors[idx % dotColors.length], transparent: true, opacity: 0.45 })
      );
      dot.position.set(dx, -0.35, dz);
      propsGroup.add(dot);
    });

    scene.add(propsGroup);
  }

  function initScene(container) {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x281e42);

    const viewSize = Config.VIEW_SIZE;
    const aspect = window.innerWidth / window.innerHeight;
    camera = new THREE.OrthographicCamera(
      -viewSize * aspect, viewSize * aspect, viewSize, -viewSize, 1, 1000
    );
    // 상단 데크부터 중앙 도화지, 하단 대기 라운지까지 전체 시야를 고르게 포착
    camera.position.set(0.6, 20, 17.8);
    camera.lookAt(0.6, 0, 1.2);

    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      if (container) container.appendChild(renderer.domElement);
    } catch (e) {
      console.error('Main WebGLRenderer init error:', e);
    }

    // 따뜻하고 화사한 조명 추가
    scene.add(new THREE.AmbientLight(0xfff7ed, 0.82));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.64);
    dirLight.position.set(10, 25, 15);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(1024, 1024);
    dirLight.shadow.camera.left = -16;
    dirLight.shadow.camera.right = 16;
    dirLight.shadow.camera.top = 16;
    dirLight.shadow.camera.bottom = -16;
    scene.add(dirLight);

    // 동적 1024x1024 2D CanvasTexture 메인 바닥 생성
    drawCanvas = document.createElement('canvas');
    drawCanvas.width = 1024;
    drawCanvas.height = 1024;
    ctx = drawCanvas.getContext('2d');
    canvasTexture = new THREE.CanvasTexture(drawCanvas);
    clearCanvas();

    // 👥 팀 모드용 독립 서브룸 캔버스 2종 (A팀 / B팀)
    teamCanvasA = document.createElement('canvas');
    teamCanvasA.width = 1024;
    teamCanvasA.height = 1024;
    teamCtxA = teamCanvasA.getContext('2d');
    teamTextureA = new THREE.CanvasTexture(teamCanvasA);

    teamCanvasB = document.createElement('canvas');
    teamCanvasB.width = 1024;
    teamCanvasB.height = 1024;
    teamCtxB = teamCanvasB.getContext('2d');
    teamTextureB = new THREE.CanvasTexture(teamCanvasB);
    clearTeamCanvas('teamA');
    clearTeamCanvas('teamB');

    // 중앙 12x12 도화지 보드
    const CANVAS_SIZE = Config.CANVAS_SIZE;
    const boardMaterials = [
      new THREE.MeshLambertMaterial({ color: 0xfef3c7 }),
      new THREE.MeshLambertMaterial({ color: 0xfef3c7 }),
      new THREE.MeshBasicMaterial({ map: canvasTexture }),
      new THREE.MeshLambertMaterial({ color: 0xfef3c7 }),
      new THREE.MeshLambertMaterial({ color: 0xfef3c7 }),
      new THREE.MeshLambertMaterial({ color: 0xfef3c7 })
    ];
    drawingBoard = new THREE.Mesh(
      new THREE.BoxGeometry(CANVAS_SIZE, 0.4, CANVAS_SIZE),
      boardMaterials
    );
    drawingBoard.position.set(0, -0.2, 2.2);
    drawingBoard.receiveShadow = true;
    scene.add(drawingBoard);

    // 도화지 외곽 귀여운 버터-파스텔 액자 테두리 + 핑크 모서리 범퍼
    const frameGroup = new THREE.Group();
    const woodMat = new THREE.MeshToonMaterial({ color: 0xfbbf24 });
    const cornerMat = new THREE.MeshToonMaterial({ color: 0xf472b6 });
    const frameThickness = 0.55;
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

    // 액자 네 모서리 귀여운 핑크 원통 장식
    const halfF = CANVAS_SIZE / 2 + frameThickness / 2;
    [[-halfF, 2.2 - halfF], [halfF, 2.2 - halfF], [-halfF, 2.2 + halfF], [halfF, 2.2 + halfF]].forEach(([cx, cz]) => {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.62, 20), cornerMat);
      cap.position.set(cx, -0.12, cz);
      cap.castShadow = true;
      frameGroup.add(cap);
    });
    scene.add(frameGroup);

    // 화실 주변 귀여운 소품 배치
    addCuteStudioProps();

    // 상단 2P 파스텔 컨트롤 데크 (2열 10색 팔레트 지원)
    const controlDeck = new THREE.Mesh(
      new THREE.BoxGeometry(20.8, 0.6, 5.2),
      new THREE.MeshToonMaterial({ color: 0x3b2d5e })
    );
    controlDeck.position.set(0.0, -0.3, -6.8);
    controlDeck.receiveShadow = true;
    scene.add(controlDeck);

    // 컨트롤 데크 핑크 테두리 라인
    const deckRim = new THREE.Mesh(
      new THREE.BoxGeometry(21.0, 0.14, 5.4),
      new THREE.MeshToonMaterial({ color: 0xf472b6 })
    );
    deckRim.position.set(0.0, -0.05, -6.8);
    scene.add(deckRim);

    // 색상/굵기 발판 구역과 우측 멀리 떨어진 [도화지 지우기] 구역 사이 경고 분리선
    const dividerLine = new THREE.Mesh(
      new THREE.BoxGeometry(0.20, 0.06, 4.6),
      new THREE.MeshBasicMaterial({ color: 0xfde047 })
    );
    dividerLine.position.set(6.3, 0.03, -6.6);
    scene.add(dividerLine);

    // 컨트롤 데크 위 원통형 젤리 압력 버튼(Pressure Pads) 및 큼직한 라벨 생성
    Config.PADS_DATA.forEach(data => {
      const isClearPad = data.type === 'clear';
      const isSizePad = data.type === 'size';
      const isActiveSize = isSizePad && (State.brushSizeIdx === data.sizeIdx);

      const ringColor = isClearPad
        ? 0xfbbf24
        : isSizePad
          ? (isActiveSize ? 0x34d399 : 0x475569)
          : 0xffffff;

      const ringMat = new THREE.MeshStandardMaterial({
        color: ringColor,
        roughness: 0.3,
        metalness: 0.2,
        emissive: isClearPad ? 0xfbbf24 : isSizePad ? (isActiveSize ? 0x10b981 : 0x000000) : 0x000000,
        emissiveIntensity: isClearPad ? 0.25 : isSizePad && isActiveSize ? 0.35 : 0.15
      });
      const ringRTop = isClearPad ? 1.05 : isSizePad ? 0.64 : 0.68;
      const ringRBot = isClearPad ? 1.12 : isSizePad ? 0.70 : 0.74;
      const baseRing = new THREE.Mesh(
        new THREE.CylinderGeometry(ringRTop, ringRBot, 0.12, 28),
        ringMat
      );
      baseRing.position.set(data.x, 0.05, data.z);
      baseRing.receiveShadow = true;
      scene.add(baseRing);

      const padColor = isSizePad
        ? (isActiveSize ? 0x10b981 : 0x334155)
        : data.color;

      const padMat = new THREE.MeshStandardMaterial({
        color: padColor,
        roughness: 0.2,
        metalness: 0.08,
        emissive: padColor,
        emissiveIntensity: isClearPad ? 0.32 : isSizePad ? (isActiveSize ? 0.45 : 0.12) : 0.16
      });
      const padRTop = isClearPad ? 0.88 : isSizePad ? 0.50 : 0.54;
      const padRBot = isClearPad ? 0.94 : isSizePad ? 0.56 : 0.60;
      const pad = new THREE.Mesh(
        new THREE.CylinderGeometry(padRTop, padRBot, 0.28, 28),
        padMat
      );
      pad.position.set(data.x, 0.15, data.z);
      pad.receiveShadow = true;
      pad.castShadow = true;
      pad.userData = { padData: data };
      scene.add(pad);

      const labelBg = isClearPad
        ? 'rgba(190, 18, 60, 0.95)'
        : isSizePad
          ? (isActiveSize ? 'rgba(5, 150, 105, 0.95)' : 'rgba(30, 41, 59, 0.90)')
          : 'rgba(30, 27, 75, 0.90)';
      const labelColor = isClearPad ? '#fef08a' : isSizePad ? '#ffffff' : '#ffffff';
      const labelBorder = isClearPad ? '#fda4af' : isSizePad ? (isActiveSize ? '#6ee7b7' : '#64748b') : '#f472b6';
      const baseScaleW = isClearPad ? 2.05 : isSizePad ? 1.25 : 1.30;
      const baseScaleH = isClearPad ? 0.52 : isSizePad ? 0.44 : 0.44;

      const labelSprite = createTextSprite(
        data.label,
        labelBg,
        labelColor,
        labelBorder,
        baseScaleW,
        baseScaleH
      );
      // 2P 캐릭터 몸통에 가려지지 않도록 버튼 앞쪽(z + 0.76)에 배치
      labelSprite.position.set(data.x, 0.50, data.z + 0.76);
      scene.add(labelSprite);

      padMeshes.push({
        mesh: pad,
        mat: padMat,
        ringMat,
        labelSprite,
        baseScaleW,
        baseScaleH,
        defaultRingColor: ringColor,
        data,
        wasStepped: false
      });
    });

    // ☕ 하단 대기 & 관전 라운지 (플레이어 자유 이동 광장)
    waitingLoungeMesh = new THREE.Group();
    const loungeFloor = new THREE.Mesh(
      new THREE.BoxGeometry(20.4, 0.45, 4.4),
      new THREE.MeshToonMaterial({ color: 0x332554 })
    );
    loungeFloor.position.set(0, -0.22, 11.2);
    loungeFloor.receiveShadow = true;
    waitingLoungeMesh.add(loungeFloor);

    // 라운지 테두리 네온 림
    const loungeRim = new THREE.Mesh(
      new THREE.BoxGeometry(20.6, 0.12, 4.6),
      new THREE.MeshToonMaterial({ color: 0x8b5cf6 })
    );
    loungeRim.position.set(0, 0.02, 11.2);
    waitingLoungeMesh.add(loungeRim);

    // 라운지 후방 파스텔 가드레일 기둥들
    const postMat = new THREE.MeshToonMaterial({ color: 0xfbbf24 });
    [-9.6, -4.8, 0, 4.8, 9.6].forEach(px => {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.85, 12), postMat);
      p.position.set(px, 0.38, 13.2);
      p.castShadow = true;
      waitingLoungeMesh.add(p);
    });
    const railMat = new THREE.MeshToonMaterial({ color: 0xf472b6 });
    const rail = new THREE.Mesh(new THREE.BoxGeometry(19.6, 0.10, 0.14), railMat);
    rail.position.set(0, 0.65, 13.2);
    waitingLoungeMesh.add(rail);

    // 라운지 중앙 귀여운 네온 표지판 스프라이트
    const loungeSign = createTextSprite(
      '☕ 대기 & 관전 라운지 (자유 이동 광장)',
      'rgba(76, 29, 149, 0.92)',
      '#fef08a',
      '#c084fc',
      3.4,
      0.65
    );
    loungeSign.position.set(0, 1.35, 13.2);
    waitingLoungeMesh.add(loungeSign);
    scene.add(waitingLoungeMesh);

    // 1P 브러시 러너, 2P 팔레트 엔지니어 생성 및 커스터마이징 적용
    p1Obj = createJellyCharacter(State.myCustom.color, 'P1', State.myCustom);
    p2Obj = createJellyCharacter(State.p2DefaultCustom.color, 'P2', State.p2DefaultCustom);
    scene.add(p1Obj.group);
    scene.add(p2Obj.group);

    // 공간 왼쪽 (캔버스 옆 = 현재 1P, 팔레트 옆 = 현재 2P) 3D 입체 표지판 생성
    p1RoleBoard = createRoleSignboard('P1', -9.5, 2.2);
    p2RoleBoard = createRoleSignboard('P2', -11.35, -6.8);
    scene.add(p1RoleBoard.group);
    scene.add(p2RoleBoard.group);

    // 대기화면용 프리뷰 캔버스도 함께 초기화
    const previewCanvasEl = document.getElementById('custom-preview-canvas');
    if (previewCanvasEl) {
      initPreviewCanvas(previewCanvasEl);
    }

    updateYouMarkersVisibility();
    if (renderer && scene && camera) {
      renderer.render(scene, camera);
    }
    window.addEventListener('resize', handleResize);
  }

  function updateYouMarkersVisibility() {
    if (!p1Obj || !p2Obj) return;
    const myId = State.isP2PConnected ? State.myPeerId : 'local-1';
    const myEntry = State.playerRoster.find(p => p.id === myId);
    const myRole = myEntry?.role || 'P1';

    if (State.controlMode === 'P1') {
      p1Obj.youMarker.visible = true;
      p2Obj.youMarker.visible = false;
    } else if (State.controlMode === 'P2') {
      p1Obj.youMarker.visible = false;
      p2Obj.youMarker.visible = true;
    } else if (State.controlMode === 'BOTH') {
      p1Obj.youMarker.visible = myRole !== 'P2';
      p2Obj.youMarker.visible = myRole === 'P2';
    } else {
      p1Obj.youMarker.visible = false;
      p2Obj.youMarker.visible = false;
    }
    updateRoleSignboards();
  }

  function handleResize() {
    if (!camera) return;
    const viewSize = Config.VIEW_SIZE;
    const newAspect = window.innerWidth / window.innerHeight;
    camera.left = -viewSize * newAspect;
    camera.right = viewSize * newAspect;
    camera.top = viewSize;
    camera.bottom = -viewSize;
    camera.updateProjectionMatrix();
    if (renderer) renderer.setSize(window.innerWidth, window.innerHeight);
  }

  function clearCanvasContext(targetCtx, targetTex) {
    if (!targetCtx) return;
    targetCtx.fillStyle = '#ffffff';
    targetCtx.fillRect(0, 0, 1024, 1024);
    targetCtx.strokeStyle = '#e2e8f0';
    targetCtx.lineWidth = 10;
    targetCtx.strokeRect(5, 5, 1014, 1014);
    if (targetTex) targetTex.needsUpdate = true;
  }

  function clearCanvas() {
    clearCanvasContext(ctx, canvasTexture);
    State.p1State.prevX = null;
    State.p1State.prevZ = null;
  }

  function clearTeamCanvas(room) {
    if (room === 'teamA' && teamCtxA && teamTextureA) {
      clearCanvasContext(teamCtxA, teamTextureA);
    } else if (room === 'teamB' && teamCtxB && teamTextureB) {
      clearCanvasContext(teamCtxB, teamTextureB);
    }
  }

  function setActiveDrawingBoardTexture(room = 'MAIN') {
    activeBoardRoom = room;
    if (!drawingBoard || !drawingBoard.material || !drawingBoard.material[2]) return;
    if (room === 'teamA' && teamTextureA) {
      drawingBoard.material[2].map = teamTextureA;
    } else if (room === 'teamB' && teamTextureB) {
      drawingBoard.material[2].map = teamTextureB;
    } else {
      drawingBoard.material[2].map = canvasTexture;
    }
    drawingBoard.material[2].needsUpdate = true;
  }

  function getTeamCanvasDataURL(room) {
    if (room === 'teamA' && teamCanvasA) return teamCanvasA.toDataURL('image/png');
    if (room === 'teamB' && teamCanvasB) return teamCanvasB.toDataURL('image/png');
    return drawCanvas ? drawCanvas.toDataURL('image/png') : '';
  }

  function paintStrokeOnTeamBoard(room, x, z, prevX, prevZ, colorHex, brushSizeIdx = 1) {
    const targetCtx = room === 'teamA' ? teamCtxA : room === 'teamB' ? teamCtxB : ctx;
    const targetTex = room === 'teamA' ? teamTextureA : room === 'teamB' ? teamTextureB : canvasTexture;
    if (!targetCtx) return;

    const CANVAS_SIZE = Config.CANVAS_SIZE;
    const px = ((x + CANVAS_SIZE / 2) / CANVAS_SIZE) * 1024;
    const py = ((z - (2.2 - CANVAS_SIZE / 2)) / CANVAS_SIZE) * 1024;

    const brushConfig = Config.BRUSH_SIZES[brushSizeIdx] || Config.BRUSH_SIZES[1];
    const radius = brushConfig.radius || 20;

    targetCtx.beginPath();
    targetCtx.strokeStyle = colorHex || '#ec4899';
    targetCtx.lineWidth = radius * 2;
    targetCtx.lineCap = 'round';
    targetCtx.lineJoin = 'round';

    if (prevX !== null && prevZ !== null) {
      const ppx = ((prevX + CANVAS_SIZE / 2) / CANVAS_SIZE) * 1024;
      const ppy = ((prevZ - (2.2 - CANVAS_SIZE / 2)) / CANVAS_SIZE) * 1024;
      targetCtx.moveTo(ppx, ppy);
      targetCtx.lineTo(px, py);
      targetCtx.stroke();
    } else {
      targetCtx.arc(px, py, radius, 0, Math.PI * 2);
      targetCtx.fillStyle = colorHex || '#ec4899';
      targetCtx.fill();
    }
    if (targetTex) targetTex.needsUpdate = true;
  }

  // 👥 관전자 / 대기자 3D 캐릭터 실시간 동기화
  function syncSpectatorCharacters(roster = State.playerRoster) {
    if (!scene) return;
    const myId = State.isP2PConnected ? State.myPeerId : 'local-1';
    const validIds = new Set();

    (roster || []).forEach(p => {
      // 1P / 2P가 아니거나, 대기방 상태일 때 대기 라운지에 캐릭터 배치
      const isIngamePainter = (State.gameState === 'PLAYING' || State.gameState === 'CHOOSING_WORD') &&
                              (p.role === 'P1' || p.role === 'P2');
      const isSpectator = !isIngamePainter;

      if (isSpectator) {
        validIds.add(p.id);
        const isMe = p.id === myId;
        let char = spectatorChars.get(p.id);

        if (!char) {
          const cColor = p.custom?.color || (isMe ? State.myCustom.color : '#8b5cf6');
          char = createJellyCharacter(cColor, 'SPECTATOR', p.custom || State.myCustom);

          // 대기 라운지 바닥 위(z: 10.2 ~ 12.2, x: -8 ~ 8)에 고르게 배치
          const count = spectatorChars.size;
          const initX = isMe ? 0 : ((count % 6) - 2.5) * 2.4;
          const initZ = 10.8 + ((count % 2) * 1.0);
          char.group.position.set(initX, 0, initZ);
          char.userData = { id: p.id, vx: 0, vz: 0, vy: 0, y: 0 };

          const nameTag = createNameTagSprite(p.nickname || '관전자', isMe, isMe ? '나' : '대기');
          char.nameTagSprite = nameTag;
          char.group.add(nameTag);

          if (char.youMarker) {
            char.youMarker.visible = isMe;
          }

          scene.add(char.group);
          spectatorChars.set(p.id, char);
        } else {
          applyCharacterCustomization(char, p.custom || State.myCustom);
          if (char.youMarker) {
            char.youMarker.visible = isMe;
          }
        }
      }
    });

    // 퇴장한 인원 캐릭터 정리
    for (const [id, char] of spectatorChars.entries()) {
      if (!validIds.has(id)) {
        scene.remove(char.group);
        disposeObject3D(char.group);
        spectatorChars.delete(id);
      }
    }
  }

  function updateSpectatorPosition(id, x, z, y = 0, vx = 0, vz = 0, vy = 0) {
    const char = spectatorChars.get(id);
    if (!char) return;
    char.group.position.x = x;
    char.group.position.z = z;
    char.group.position.y = y;
    char.userData.vx = vx;
    char.userData.vz = vz;
    char.userData.vy = vy;
    char.userData.y = y;
  }

  // 🎬 상대 팀 그림 맞추기 시 1P/2P 이동 입력 리플레이 실행 헬퍼
  function playReplayAction(action, room = null) {
    if (!action) return;
    const targetCtx = room === 'teamA' ? teamCtxA : room === 'teamB' ? teamCtxB : ctx;
    const targetTex = room === 'teamA' ? teamTextureA : room === 'teamB' ? teamTextureB : canvasTexture;

    if (action.p1 && p1Obj) {
      p1Obj.group.position.set(action.p1.x, action.p1.y || 0, action.p1.z);
      State.p1State.vx = action.p1.vx || 0;
      State.p1State.vz = action.p1.vz || 0;
      State.p1State.y = action.p1.y || 0;
    }
    if (action.p2 && p2Obj) {
      p2Obj.group.position.set(action.p2.x, action.p2.y || 0, action.p2.z);
      State.p2State.vx = action.p2.vx || 0;
      State.p2State.vz = action.p2.vz || 0;
      State.p2State.y = action.p2.y || 0;
    }

    State.isPenDown = Boolean(action.isPenDown);
    if (action.colorHex) State.activeColorHex = action.colorHex;
    if (typeof action.brushSizeIdx === 'number') State.brushSizeIdx = action.brushSizeIdx;

    if (action.drawStroke && targetCtx) {
      const { fromX, fromZ, toX, toZ, color, size } = action.drawStroke;
      const CANVAS_SIZE = Config.CANVAS_SIZE;
      const px1 = ((fromX + CANVAS_SIZE / 2) / CANVAS_SIZE) * 1024;
      const py1 = ((fromZ - (2.2 - CANVAS_SIZE / 2)) / CANVAS_SIZE) * 1024;
      const px2 = ((toX + CANVAS_SIZE / 2) / CANVAS_SIZE) * 1024;
      const py2 = ((toZ - (2.2 - CANVAS_SIZE / 2)) / CANVAS_SIZE) * 1024;

      targetCtx.beginPath();
      targetCtx.strokeStyle = color || '#ec4899';
      targetCtx.lineWidth = size || 20;
      targetCtx.lineCap = 'round';
      targetCtx.lineJoin = 'round';
      targetCtx.moveTo(px1, py1);
      targetCtx.lineTo(px2, py2);
      targetCtx.stroke();
      if (targetTex) targetTex.needsUpdate = true;
    }
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
      brushPivot.userData.bristle = bristle;
      brushPivot.userData.ferrule = ferrule;

      animGroup.add(brushPivot);
    }

    // 5) 머리 위 'YOU' 화살표 마커 부착
    const youMarker = createYouMarker(roleType);
    root.add(youMarker);

    // 6) 2P 전용: 발판 밟을 때 머리 위에 뜨는 실시간 말풍선 스프라이트
    let stepBubble = null;
    if (roleType === 'P2') {
      const bCanvas = document.createElement('canvas');
      bCanvas.width = 320;
      bCanvas.height = 88;
      const bTex = new THREE.CanvasTexture(bCanvas);
      const bMat = new THREE.SpriteMaterial({ map: bTex, transparent: true, depthTest: false });
      const bSprite = new THREE.Sprite(bMat);
      bSprite.scale.set(2.45, 0.68, 1);
      bSprite.position.set(0, 3.35, 0);
      bSprite.renderOrder = 1000;
      bSprite.visible = false;
      root.add(bSprite);
      stepBubble = { sprite: bSprite, canvas: bCanvas, tex: bTex, lastKey: '' };
    }

    // 7) 1P ↔ 2P 비밀 협동 이모티콘 말풍선 스프라이트 (1P, 2P 모두 생성)
    const eCanvas = document.createElement('canvas');
    eCanvas.width = 360;
    eCanvas.height = 100;
    const eTex = new THREE.CanvasTexture(eCanvas);
    const eMat = new THREE.SpriteMaterial({ map: eTex, transparent: true, depthTest: false });
    const eSprite = new THREE.Sprite(eMat);
    eSprite.scale.set(2.9, 0.82, 1);
    eSprite.position.set(0, 3.5, 0);
    eSprite.renderOrder = 1010;
    eSprite.visible = false;
    root.add(eSprite);
    const emoteBubble = {
      sprite: eSprite,
      canvas: eCanvas,
      tex: eTex,
      timer: 0,
      maxTimer: 2.5
    };

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
      stepBubble,
      emoteBubble,
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

  function updateCharacterVisuals(charObj, vx, vz, elapsedTime, isPenActive, dtScale = 1, jumpY = 0, jumpVy = 0) {
    const speed = Math.hypot(vx, vz);
    const lerpFactor = 1 - Math.pow(0.75, dtScale);

    // 점프 높이를 캐릭터 루트 그룹 Y 좌표에 반영
    charObj.group.position.y = Math.max(0, jumpY);

    if (jumpY > 0.04) {
      // 마리오 점프 중 포즈: 이동 방향 회전 + 몸통 스트레치 & 팔 만세 포즈
      if (speed > 0.008) {
        charObj.targetAngle = Math.atan2(vx, vz);
        let diff = charObj.targetAngle - charObj.group.rotation.y;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        charObj.group.rotation.y += diff * lerpFactor;
      }
      charObj.animGroup.position.y = 0;
      const stretch = 1 + Math.max(-0.10, Math.min(0.18, jumpVy * 0.65));
      const squash = 1 / Math.sqrt(stretch);
      charObj.animGroup.scale.set(squash, stretch, squash);
      charObj.leftLeg.position.y = 0.22;
      charObj.rightLeg.position.y = 0.08;
      charObj.leftLeg.position.z = -0.10;
      charObj.rightLeg.position.z = 0.16;
      charObj.leftArm.rotation.x = -2.3;
      charObj.rightArm.rotation.x = -0.9;
    } else if (speed > 0.008) {
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

    if (charObj.stepBubble && charObj.stepBubble.sprite.visible) {
      const baseY = (charObj.youMarker && charObj.youMarker.visible) ? 3.42 : 2.35;
      charObj.stepBubble.sprite.position.y = baseY + Math.sin(elapsedTime * 8) * 0.10;
    }

    // 1P ↔ 2P 비밀 이모티콘 말풍선 애니메이션 (떠오름 + 바운스 + 페이드아웃)
    if (charObj.emoteBubble && charObj.emoteBubble.sprite.visible) {
      charObj.emoteBubble.timer -= 0.016 * dtScale;
      const progress = Math.max(0, 1 - (charObj.emoteBubble.timer / charObj.emoteBubble.maxTimer));
      const bounce = Math.sin(progress * Math.PI) * 0.22;
      const isStepVisible = charObj.stepBubble && charObj.stepBubble.sprite.visible;
      const isYouVisible = charObj.youMarker && charObj.youMarker.visible;
      const baseY = isStepVisible ? 4.15 : (isYouVisible ? 3.48 : 2.45);
      charObj.emoteBubble.sprite.position.y = baseY + progress * 0.45 + bounce;

      if (charObj.emoteBubble.timer < 0.5) {
        charObj.emoteBubble.sprite.material.opacity = Math.max(0, charObj.emoteBubble.timer / 0.5);
      } else {
        charObj.emoteBubble.sprite.material.opacity = 1;
      }

      if (charObj.emoteBubble.timer <= 0) {
        charObj.emoteBubble.sprite.visible = false;
      }
    }

    if (charObj.brushPivot) {
      const targetPitch = isPenActive ? 0.55 : -0.45;
      const targetY = isPenActive ? 0.52 : 0.85;
      const brushLerp = 1 - Math.pow(0.8, dtScale);
      charObj.brushPivot.rotation.x += (targetPitch - charObj.brushPivot.rotation.x) * brushLerp;
      charObj.brushPivot.position.y += (targetY - charObj.brushPivot.position.y) * brushLerp;

      // 붓 굵기 단계에 따라 1P의 3D 붓모(bristle) 크기 실시간 스케일링
      const sizeObj = Config.BRUSH_SIZES[State.brushSizeIdx] || Config.BRUSH_SIZES[1];
      const targetScale = sizeObj ? sizeObj.scale : 1.0;
      const bristle = charObj.brushPivot.userData.bristle;
      if (bristle) {
        bristle.scale.x += (targetScale - bristle.scale.x) * brushLerp;
        bristle.scale.z += (targetScale - bristle.scale.z) * brushLerp;
      }
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

  function clearCoopPings() {
    coopPings.forEach(p => {
      scene.remove(p.group);
      if (p.ringMat) p.ringMat.dispose();
      if (p.colMat) p.colMat.dispose();
      if (p.sprite && p.sprite.material) {
        if (p.sprite.material.map) p.sprite.material.map.dispose();
        p.sprite.material.dispose();
      }
    });
    coopPings.length = 0;
    if (p1Obj?.emoteBubble) p1Obj.emoteBubble.sprite.visible = false;
    if (p2Obj?.emoteBubble) p2Obj.emoteBubble.sprite.visible = false;
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
    clearCoopPings();
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

    // 1P ↔ 2P 비밀 핑 마커 애니메이션 (바닥 링 펄스 + 기둥 회전 + 페이드아웃)
    for (let i = coopPings.length - 1; i >= 0; i--) {
      const ping = coopPings[i];
      ping.life -= 0.016 * dtScale;
      const progress = Math.max(0, 1 - (ping.life / ping.maxLife));

      // 바닥 링 확장 및 투명도 감소
      const ringScale = 1.0 + progress * 2.6;
      ping.ringMesh.scale.set(ringScale, ringScale, 1);
      ping.ringMat.opacity = Math.max(0, 0.95 * (1 - progress));

      // 기둥 천천히 회전
      ping.colMesh.rotation.y += 0.04 * dtScale;
      ping.colMat.opacity = Math.max(0, 0.75 * (1 - progress * 0.7));

      // 상단 스프라이트 위아래 둥실 호버링
      ping.sprite.position.y = 2.35 + Math.sin(progress * 15) * 0.12;

      if (ping.life <= 0) {
        scene.remove(ping.group);
        ping.ringMat.dispose();
        ping.colMat.dispose();
        if (ping.sprite && ping.sprite.material) {
          if (ping.sprite.material.map) ping.sprite.material.map.dispose();
          ping.sprite.material.dispose();
        }
        coopPings.splice(i, 1);
      }
    }
  }

  function paintStrokeOnBoard() {
    // 1P가 점프 중(공중 체공 중)일 때는 도화지에 붓이 닿지 않으며 이전 궤적을 끊어줍니다.
    if ((State.p1State.y || 0) > 0.04) {
      State.p1State.prevX = null;
      State.p1State.prevZ = null;
      return;
    }

    const CANVAS_SIZE = Config.CANVAS_SIZE;
    const uvX = (p1Obj.group.position.x + CANVAS_SIZE / 2) / CANVAS_SIZE;
    const uvY = (p1Obj.group.position.z - (2.2 - CANVAS_SIZE / 2)) / CANVAS_SIZE;
    const pixelX = uvX * drawCanvas.width;
    const pixelY = uvY * drawCanvas.height;

    if (State.isPenDown && State.activeColorHex) {
      const sizeObj = Config.BRUSH_SIZES[State.brushSizeIdx] || Config.BRUSH_SIZES[1];
      const baseRadius = sizeObj ? sizeObj.radius : 26;

      ctx.save();
      ctx.strokeStyle = State.activeColorHex;
      ctx.fillStyle = State.activeColorHex;
      ctx.lineWidth = String(State.activeColorName).includes('지우개') ? Math.round(baseRadius * 1.55) : baseRadius;
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
    // 창 크기가 좁아도 캔버스 옆(1P)과 팔레트 옆(2P) 좌측 표지판이 화면 밖으로 잘리지 않게 클램핑 & 둥실둥실 애니메이션
    if (camera && p1RoleBoard && p2RoleBoard) {
      const minVisibleX = camera.position.x + camera.left + 2.35;
      p1RoleBoard.group.position.x = Math.min(-8.4, Math.max(minVisibleX, p1RoleBoard.defaultX));
      p2RoleBoard.group.position.x = Math.min(-10.2, Math.max(minVisibleX, p2RoleBoard.defaultX));
      p1RoleBoard.sprite.position.y = 1.05 + Math.sin(elapsedTime * 3.2) * 0.06;
      p2RoleBoard.sprite.position.y = 1.05 + Math.sin(elapsedTime * 3.2 + 1.2) * 0.06;
    }

    if (renderer && scene && camera) {
      renderer.render(scene, camera);
    }

    // ☕ 하단 대기 라운지 관전자 / 대기자 3D 캐릭터 애니메이션 루프
    if (spectatorChars && spectatorChars.size > 0) {
      spectatorChars.forEach(char => {
        const vx = char.userData?.vx || 0;
        const vz = char.userData?.vz || 0;
        const y = char.userData?.y || 0;
        const vy = char.userData?.vy || 0;
        updateCharacterVisuals(char, vx, vz, elapsedTime, false, dtScale, y, vy);
      });
    }

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

  // 2P 머리 위 3D 말풍선에 현재 밟고 있는 버튼 이름 표시
  function updateP2StepBubble(text, bgColor = '#ec4899', textColor = '#ffffff') {
    if (!p2Obj || !p2Obj.stepBubble) return;
    const { sprite, canvas, tex, lastKey } = p2Obj.stepBubble;

    if (!text) {
      sprite.visible = false;
      p2Obj.stepBubble.lastKey = '';
      return;
    }

    const key = `${text}|${bgColor}|${textColor}`;
    sprite.visible = true;
    if (lastKey === key) return;
    p2Obj.stepBubble.lastKey = key;

    const c = canvas.getContext('2d');
    c.clearRect(0, 0, canvas.width, canvas.height);

    const r = 28;
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
    c.lineWidth = 6;
    c.strokeStyle = '#ffffff';
    c.stroke();

    c.font = '900 30px Jua, Inter, Malgun Gothic, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = textColor;
    c.fillText(text, canvas.width / 2, canvas.height / 2 + 2);
    tex.needsUpdate = true;
  }

  // 1P / 2P 머리 위에 협동 이모티콘 말풍선 띄우기
  function showCharacterEmote(roleType, emoteId) {
    const char = (roleType === 'P2') ? p2Obj : p1Obj;
    if (!char || !char.emoteBubble) return;

    const emoteDef = (Config.COOP_EMOTES || []).find(e => e.id === emoteId) || {
      icon: '💬',
      text: emoteId || '신호!'
    };

    const { sprite, canvas, tex } = char.emoteBubble;
    const c = canvas.getContext('2d');
    c.clearRect(0, 0, canvas.width, canvas.height);

    const r = 24;
    const x = 8, y = 8, w = canvas.width - 16, h = canvas.height - 16;
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

    c.fillStyle = roleType === 'P2' ? 'rgba(6, 182, 212, 0.95)' : 'rgba(236, 72, 153, 0.95)';
    c.fill();
    c.lineWidth = 5;
    c.strokeStyle = '#ffffff';
    c.stroke();

    c.font = '900 32px Jua, Tossface, Apple Color Emoji, Segoe UI Emoji, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = '#ffffff';
    c.fillText(`${emoteDef.icon} ${emoteDef.text}`, canvas.width / 2, canvas.height / 2 + 2);
    tex.needsUpdate = true;

    char.emoteBubble.timer = 2.4;
    char.emoteBubble.maxTimer = 2.4;
    if (sprite.material) sprite.material.opacity = 1;
    sprite.visible = true;

    // 캐릭터 깜짝 바운스 반응
    if (char.animGroup) {
      char.animGroup.position.y = 0.32;
    }
  }

  // 1P ↔ 2P 비밀 3D 핑 마커 스폰
  function spawnCoopPing(x, z, label = '핑!', isPad = false) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    // 1) 바닥 펄스 링
    const ringMat = new THREE.MeshBasicMaterial({
      color: isPad ? 0xf59e0b : 0x06b6d4,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide
    });
    const ringMesh = new THREE.Mesh(pingRingGeo, ringMat);
    ringMesh.position.y = 0.05;
    group.add(ringMesh);

    // 2) 수직 빔 기둥
    const colMat = new THREE.MeshBasicMaterial({
      color: isPad ? 0xfbbf24 : 0x38bdf8,
      transparent: true,
      opacity: 0.75
    });
    const colMesh = new THREE.Mesh(pingColumnGeo, colMat);
    colMesh.position.y = 1.0;
    group.add(colMesh);

    // 3) 상단 라벨 스프라이트
    const sprite = createTextSprite(
      label,
      isPad ? '#f59e0b' : '#0284c7',
      '#ffffff',
      '#ffffff',
      2.7,
      0.72
    );
    sprite.position.y = 2.35;
    group.add(sprite);

    scene.add(group);
    coopPings.push({
      group,
      ringMesh,
      ringMat,
      colMesh,
      colMat,
      sprite,
      life: 3.2,
      maxLife: 3.2
    });
  }

  return {
    initScene,
    clearCanvas,
    loadCanvasFromDataURL,
    applyCharacterCustomization,
    syncRosterCustomizations,
    updateYouMarkersVisibility,
    updateP2StepBubble,
    showCharacterEmote,
    spawnCoopPing,
    clearCoopPings,
    updateCharacterVisuals,
    spawnPaintSplatter,
    spawnPadRipple,
    spawnConfettiExplosion,
    clearConfetti,
    updateParticles,
    paintStrokeOnBoard,
    renderFrame,

    // 👥 팀 모드 & 하단 대기 라운지 확장 함수
    syncSpectatorCharacters,
    updateSpectatorPosition,
    clearTeamCanvas,
    setActiveDrawingBoardTexture,
    getTeamCanvasDataURL,
    paintStrokeOnTeamBoard,
    playReplayAction,
    getSpectatorChars: () => spectatorChars,

    getSceneObjects: () => ({
      scene,
      camera,
      renderer,
      drawCanvas,
      drawingBoard,
      p1Obj,
      p2Obj,
      padMeshes,
      teamCanvasA,
      teamCanvasB
    })
  };
})();
