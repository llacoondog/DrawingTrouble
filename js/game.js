// ==========================================
// 반반 무마니 3D - 메인 게임 루프, 라운드, 채팅 및 조작 제어 (game.js)
// ==========================================
window.BanBan = window.BanBan || {};

window.onload = function () {
  const { Config, State, Scene3D, Network } = window.BanBan;

  // 1. 3D 씬 초기화
  const container = document.getElementById('canvas-container');
  Scene3D.initScene(container);
  const { camera, renderer, drawCanvas, drawingBoard, p1Obj, p2Obj, padMeshes } = Scene3D.getSceneObjects();

  // 2. UI 요소 참조
  const chatMessagesEl = document.getElementById('chat-messages');
  const chatInputEl = document.getElementById('chat-input');
  const timerTextEl = document.getElementById('timer-text');
  const uiPenStatus = document.getElementById('pen-status');
  const uiColorPreview = document.getElementById('color-preview');
  const uiColorName = document.getElementById('color-name');

  // 3. 모드 스위처 & 2P 자동 도우미 UI 제어
  function updatePromptVisibility() {
    const promptEl = document.getElementById('prompt-text');
    if (State.controlMode === 'SPECTATOR') {
      promptEl.textContent = `제시어: ${State.currentPrompt.word.replace(/[^\s]/g, '❓')}`;
    } else {
      promptEl.textContent = `제시어: ${State.currentPrompt.word}`;
    }
  }

  function updateAiButtonUI() {
    const aiBtn = document.getElementById('btn-ai-p2');
    if (State.aiHelperEnabled) {
      aiBtn.textContent = '🤖 2P 자동 도우미: ON';
      aiBtn.className = 'bg-emerald-500 text-emerald-950 border border-emerald-300 px-3 py-1.5 rounded-xl text-xs font-extrabold shadow transition hover:brightness-110';
    } else {
      aiBtn.textContent = '🤖 2P 자동 도우미: OFF';
      aiBtn.className = 'bg-slate-800/90 text-slate-300 border border-white/10 px-3 py-1.5 rounded-xl text-xs font-bold shadow transition hover:bg-slate-700';
    }
  }

  function setMode(mode, activeBtnId) {
    State.controlMode = mode;
    const btnIds = ['mode-both', 'mode-p1', 'mode-p2', 'mode-spec'];
    btnIds.forEach(id => {
      const el = document.getElementById(id);
      if (id === activeBtnId) {
        el.className = 'mode-btn bg-pink-600 text-white border border-pink-400 px-3 py-1.5 rounded-xl text-xs font-bold shadow transition';
      } else {
        el.className = 'mode-btn bg-slate-800/90 hover:bg-slate-700 text-slate-300 border border-white/10 px-3 py-1.5 rounded-xl text-xs font-bold shadow transition';
      }
    });
    updatePromptVisibility();
  }

  document.getElementById('mode-both').addEventListener('click', () => setMode('BOTH', 'mode-both'));
  document.getElementById('mode-p1').addEventListener('click', () => setMode('P1', 'mode-p1'));
  document.getElementById('mode-p2').addEventListener('click', () => {
    State.aiHelperEnabled = false;
    updateAiButtonUI();
    setMode('P2', 'mode-p2');
  });
  document.getElementById('mode-spec').addEventListener('click', () => setMode('SPECTATOR', 'mode-spec'));

  document.getElementById('btn-ai-p2').addEventListener('click', () => {
    State.aiHelperEnabled = !State.aiHelperEnabled;
    updateAiButtonUI();
    if (State.aiHelperEnabled && !State.isPenDown) {
      State.aiTargetX = -6.2;
    }
  });

  // 4. 실시간 채팅 & 라운드 진행 제어
  chatInputEl.addEventListener('focus', () => { State.isTypingChat = true; });
  chatInputEl.addEventListener('blur', () => { State.isTypingChat = false; });

  function addChatMessage(sender, text, type = 'normal') {
    const div = document.createElement('div');
    if (type === 'system') {
      div.className = 'px-3 py-1.5 rounded-xl bg-sky-500/15 text-sky-300 font-semibold text-center';
      div.textContent = text;
    } else if (type === 'hint') {
      div.className = 'px-3 py-1.5 rounded-xl bg-amber-400/15 text-amber-300 font-bold text-center border border-dashed border-amber-400/40';
      div.textContent = text;
    } else if (type === 'correct') {
      div.className = 'px-3 py-2 rounded-xl bg-emerald-500/20 text-emerald-300 font-extrabold text-center border border-emerald-500';
      div.textContent = text;
    } else {
      div.className = 'px-2.5 py-1.5 rounded-xl bg-white/5 break-words';
      div.innerHTML = `<span class="font-bold text-slate-400 mr-1.5">${sender}:</span><span class="text-slate-100">${text}</span>`;
    }
    chatMessagesEl.appendChild(div);
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
  }

  function normalizeAnswer(str) {
    return str.replace(/\s+/g, '').toLowerCase();
  }

  // 정답자 점수(100 + 남은시간*2) 및 1P/2P 협동 보너스(+80점) 부여
  function awardRoundScores(winnerName, earnedScore, coopBonus) {
    let winnerMatched = false;
    State.playerRoster.forEach(p => {
      if (p.role === 'P1' || p.role === 'P2') {
        p.score += coopBonus;
      }
      if (p.nickname === winnerName) {
        p.score += earnedScore;
        winnerMatched = true;
      }
    });

    // 로컬 싱글/탭 테스트에서 '나'로 정답을 맞혔을 때 로스터에 반영
    if (!winnerMatched && !State.isP2PConnected) {
      const p1Entry = State.playerRoster.find(p => p.role === 'P1');
      if (p1Entry) p1Entry.score += earnedScore;
    }

    State.totalScore += earnedScore;
    Network.renderPlayerRoster();
  }

  function handleSendChat() {
    const rawText = chatInputEl.value.trim();
    if (!rawText) return;
    chatInputEl.value = '';

    const senderName = State.isP2PConnected ? State.myNickname : '나';

    if (State.gameState === 'PLAYING' && normalizeAnswer(rawText) === normalizeAnswer(State.currentPrompt.word)) {
      addChatMessage('', `🎊 [${senderName}]님이 정답 [${State.currentPrompt.word}] 판정 성공!`, 'correct');
      endRound(true, senderName, State.timeLeft, false);
      Network.sendNetworkPacket({
        type: 'ROUND_WIN',
        winnerName: senderName,
        timeLeft: State.timeLeft,
        roster: State.playerRoster
      });
    } else {
      Network.sendNetworkPacket({ type: 'CHAT', sender: senderName, text: rawText, timeLeft: State.timeLeft });
      addChatMessage(senderName, rawText);
    }
  }

  document.getElementById('btn-send').addEventListener('click', handleSendChat);
  chatInputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleSendChat();
  });

  let timerInterval = null;
  function startRound(isFromNetwork = false) {
    State.gameState = 'PLAYING';
    State.timeLeft = 60;
    if (!isFromNetwork) {
      State.currentPromptIndex = (State.currentRound - 1) % Config.WORD_POOL.length;
    }
    State.currentPrompt = Config.WORD_POOL[State.currentPromptIndex % Config.WORD_POOL.length];

    document.getElementById('round-text').textContent = `ROUND ${State.currentRound}`;
    timerTextEl.textContent = `${State.timeLeft}s`;
    timerTextEl.classList.remove('urgent-timer');
    document.getElementById('result-modal').classList.add('hidden');
    document.getElementById('result-modal').classList.remove('flex');
    updatePromptVisibility();

    Scene3D.clearCanvas();
    Scene3D.clearConfetti();

    p1Obj.group.position.set(0, 0, 2.2);
    p2Obj.group.position.set(-4, 0, -6.8);
    State.p1State.vx = State.p1State.vz = State.p2State.vx = State.p2State.vz = 0;
    State.isPenDown = false;
    State.aiTargetX = -6.2;

    const p1Player = State.playerRoster.find(p => p.role === 'P1');
    const p2Player = State.playerRoster.find(p => p.role === 'P2');
    const roleSummary = (p1Player && p2Player)
      ? ` (🎨 1P: ${p1Player.nickname} / 🕹️ 2P: ${p2Player.nickname})`
      : '';

    addChatMessage('', `🎨 ROUND ${State.currentRound} 시작!${roleSummary}`, 'system');

    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      if (State.gameState !== 'PLAYING') return;
      State.timeLeft--;
      timerTextEl.textContent = `${State.timeLeft}s`;

      if (State.timeLeft <= 10) timerTextEl.classList.add('urgent-timer');

      // 30초 남았을 때 초성 힌트 자동 출력
      if (State.timeLeft === 30) {
        const hintText = State.currentPrompt.hint || Config.extractChosung(State.currentPrompt.word);
        addChatMessage('', `💡 [초성 힌트] ${hintText}`, 'hint');
      }

      // 가상 봇 구경꾼들의 유쾌한 추리 채팅
      const botToggle = document.getElementById('bot-toggle');
      if (botToggle && botToggle.checked && State.timeLeft > 5 && State.timeLeft % 13 === 0) {
        const botName = Config.BOT_NAMES[Math.floor(Math.random() * Config.BOT_NAMES.length)];
        const botMsg = Config.BOT_FUNNY_GUESSES[Math.floor(Math.random() * Config.BOT_FUNNY_GUESSES.length)];
        addChatMessage(botName, botMsg);
      }

      if (State.timeLeft <= 0) {
        addChatMessage('', `⏰ 시간 초과! 정답은 [${State.currentPrompt.word}] 였습니다.`, 'system');
        endRound(false, null, 0, false);
      }
    }, 1000);
  }

  function endRound(isSuccess, winnerName, remainSeconds = State.timeLeft, skipRosterAward = false) {
    State.gameState = 'ROUND_END';
    if (timerInterval) clearInterval(timerInterval);

    const modalEl = document.getElementById('result-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalDesc = document.getElementById('modal-desc');

    if (isSuccess) {
      const effectiveTime = typeof remainSeconds === 'number' ? remainSeconds : State.timeLeft;
      const earned = 100 + effectiveTime * 2;
      const coopBonus = Config.COOP_BONUS_SCORE;

      if (!skipRosterAward) {
        awardRoundScores(winnerName || '나', earned, coopBonus);
      } else {
        Network.renderPlayerRoster();
      }

      const p1Player = State.playerRoster.find(p => p.role === 'P1');
      const p2Player = State.playerRoster.find(p => p.role === 'P2');
      const coopNames = [p1Player?.nickname, p2Player?.nickname].filter(Boolean).join(' & ');

      Scene3D.spawnConfettiExplosion();
      modalTitle.textContent = '🎉 정답 판정 성공!';
      modalTitle.className = 'text-2xl font-black text-emerald-400 mb-1';
      modalDesc.innerHTML =
        `👀 정답자 <b>${winnerName || '플레이어'}</b>: <b class="text-emerald-400">+${earned}점</b><br>` +
        `🤝 1P·2P 협동 보너스 (${coopNames || '1P & 2P'}): <b class="text-sky-400">+${coopBonus}점</b><br>` +
        `제시어: <b class="text-amber-300">${State.currentPrompt.word}</b>`;
    } else {
      modalTitle.textContent = '⏰ 아쉽게 시간 초과!';
      modalTitle.className = 'text-2xl font-black text-rose-500 mb-1';
      modalDesc.innerHTML = `정답자가 나오지 않았습니다.<br>제시어: <b class="text-amber-300">${State.currentPrompt.word}</b>`;
    }

    document.getElementById('result-img').src = drawCanvas.toDataURL('image/png');
    setTimeout(() => {
      modalEl.classList.remove('hidden');
      modalEl.classList.add('flex');
    }, isSuccess ? 1200 : 350);
  }

  document.getElementById('btn-next-round').addEventListener('click', () => {
    State.currentRound++;
    State.currentPromptIndex = (State.currentRound - 1) % Config.WORD_POOL.length;

    // 라운드마다 역할(1P / 2P / 구경꾼) 순환 로테이션 수행
    Network.rotatePlayerRoles();
    startRound(false);

    Network.sendNetworkPacket({
      type: 'NEXT_ROUND',
      round: State.currentRound,
      promptIndex: State.currentPromptIndex,
      roster: State.playerRoster
    });
  });

  document.getElementById('btn-clear').addEventListener('click', () => {
    Scene3D.clearCanvas();
    Network.sendNetworkPacket({ type: 'CLEAR' });
  });

  document.getElementById('btn-save').addEventListener('click', () => {
    const link = document.createElement('a');
    link.download = `banban-round-${State.currentRound}.png`;
    link.href = drawCanvas.toDataURL('image/png');
    link.click();
  });

  // 5. 네트워크/로비 초기화
  Network.initNetworkAndLobby({
    onAddChatMessage: addChatMessage,
    onEndRound: endRound,
    onStartRound: startRound,
    onSetMode: setMode,
    onUpdateAiButtonUI: updateAiButtonUI,
    normalizeAnswer
  });

  // 6. 키보드 및 마우스/터치 입력
  const keys = {};
  window.addEventListener('keydown', (e) => {
    if (!State.isTypingChat) keys[e.code] = true;
  });
  window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
  });

  let pointerTarget = null;
  const raycaster = new THREE.Raycaster();
  const pointerNDC = new THREE.Vector2();

  renderer.domElement.addEventListener('pointerdown', (e) => {
    if (State.gameState !== 'PLAYING') return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointerNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointerNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointerNDC, camera);
    const hits = raycaster.intersectObject(drawingBoard);
    if (hits.length > 0) {
      pointerTarget = { x: hits[0].point.x, z: hits[0].point.z };
    }
  });
  window.addEventListener('pointerup', () => { pointerTarget = null; });

  // 7. 메인 애니메이션 루프
  const clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);
    const elapsedTime = clock.getElapsedTime();

    if (State.gameState === 'PLAYING') {
      const { p1State, p2State } = State;

      // --- 1P 브러시 러너 이동 ---
      if (State.controlMode === 'BOTH' || State.controlMode === 'P1') {
        if (keys['KeyW']) { p1State.vz -= p1State.accel; pointerTarget = null; }
        if (keys['KeyS']) { p1State.vz += p1State.accel; pointerTarget = null; }
        if (keys['KeyA']) { p1State.vx -= p1State.accel; pointerTarget = null; }
        if (keys['KeyD']) { p1State.vx += p1State.accel; pointerTarget = null; }

        if (pointerTarget) {
          const dx = pointerTarget.x - p1Obj.group.position.x;
          const dz = pointerTarget.z - p1Obj.group.position.z;
          const dist = Math.hypot(dx, dz);
          if (dist > 0.25) {
            p1State.vx += (dx / dist) * p1State.accel * 0.85;
            p1State.vz += (dz / dist) * p1State.accel * 0.85;
          } else {
            pointerTarget = null;
          }
        }

        p1State.vx *= p1State.friction;
        p1State.vz *= p1State.friction;
        p1Obj.group.position.x += p1State.vx;
        p1Obj.group.position.z += p1State.vz;

        const halfBoard = Config.CANVAS_SIZE / 2 - 0.45;
        p1Obj.group.position.x = Math.max(-halfBoard, Math.min(halfBoard, p1Obj.group.position.x));
        p1Obj.group.position.z = Math.max(2.2 - halfBoard, Math.min(2.2 + halfBoard, p1Obj.group.position.z));

        if (Math.hypot(p1State.vx, p1State.vz) > 0.002) {
          Network.sendNetworkPacket({ type: 'MOVE_P1', x: p1Obj.group.position.x, z: p1Obj.group.position.z });
        }
      }

      // --- 2P 팔레트 엔지니어 이동 ---
      const manualP2Pressed = keys['ArrowUp'] || keys['ArrowDown'] || keys['ArrowLeft'] || keys['ArrowRight'];
      if (manualP2Pressed && State.aiHelperEnabled) {
        State.aiHelperEnabled = false;
        updateAiButtonUI();
      }

      const prevP2X = p2Obj.group.position.x;
      const prevP2Z = p2Obj.group.position.z;

      if ((State.controlMode === 'BOTH' || State.controlMode === 'P2') && !State.aiHelperEnabled) {
        if (keys['ArrowUp'])    p2State.vz -= p2State.accel;
        if (keys['ArrowDown'])  p2State.vz += p2State.accel;
        if (keys['ArrowLeft'])  p2State.vx -= p2State.accel;
        if (keys['ArrowRight']) p2State.vx += p2State.accel;

        p2State.vx *= p2State.friction;
        p2State.vz *= p2State.friction;
        p2Obj.group.position.x += p2State.vx;
        p2Obj.group.position.z += p2State.vz;
      } else if (State.aiHelperEnabled) {
        State.aiTimer++;
        const colorPadsX = [-3.5, -1.5, 0.5, 2.5, 4.5];
        if (!State.isPenDown) {
          State.aiTargetX = -6.2;
        } else if (State.aiTimer % 240 === 0) {
          State.aiColorIdx = (State.aiColorIdx + 1) % colorPadsX.length;
          State.aiTargetX = colorPadsX[State.aiColorIdx];
        } else if (State.aiTargetX === -6.2 && State.isPenDown) {
          State.aiTargetX = colorPadsX[State.aiColorIdx];
        }
        p2Obj.group.position.x += (State.aiTargetX - p2Obj.group.position.x) * 0.08;
        p2Obj.group.position.z += (-6.8 - p2Obj.group.position.z) * 0.1;
        p2State.vx = p2Obj.group.position.x - prevP2X;
        p2State.vz = p2Obj.group.position.z - prevP2Z;
      }

      p2Obj.group.position.x = Math.max(-7.5, Math.min(7.5, p2Obj.group.position.x));
      p2Obj.group.position.z = Math.max(-8.5, Math.min(-5.1, p2Obj.group.position.z));

      // --- 2P 발판 충돌 판정 & 파동 이펙트 ---
      State.activeColorHex = null;
      State.activeColorName = '발판 대기';
      let currentlyOnToggle = false;

      padMeshes.forEach((padItem) => {
        const { mesh, mat, data } = padItem;
        const dist = Math.hypot(p2Obj.group.position.x - data.x, p2Obj.group.position.z - data.z);
        const isStepped = dist < 0.92;

        if (isStepped) {
          mesh.position.y += (0.04 - mesh.position.y) * 0.35;
          mat.emissiveIntensity = 0.45;
          if (!padItem.wasStepped) {
            Scene3D.spawnPadRipple(data.x, data.z, data.color);
          }
          if (data.type === 'toggle') {
            currentlyOnToggle = true;
          } else if (data.type === 'color') {
            State.activeColorHex = data.hex;
            State.activeColorName = data.label;
          }
        } else {
          mesh.position.y += (0.14 - mesh.position.y) * 0.25;
          mat.emissiveIntensity = 0.12;
        }
        padItem.wasStepped = isStepped;
      });

      if (currentlyOnToggle && !State.wasOnTogglePad) {
        State.isPenDown = !State.isPenDown;
      }
      State.wasOnTogglePad = currentlyOnToggle;

      // 캐릭터 3D 비주얼/모션 업데이트
      Scene3D.updateCharacterVisuals(p1Obj, p1State.vx, p1State.vz, elapsedTime, State.isPenDown);
      Scene3D.updateCharacterVisuals(p2Obj, p2State.vx, p2State.vz, elapsedTime, false);

      // 상단 상태바 & 브러시/전구 색상 반영
      uiPenStatus.textContent = State.isPenDown ? 'ON (드로잉!)' : 'OFF';
      uiPenStatus.className = State.isPenDown ? 'text-emerald-400 font-extrabold' : 'text-rose-500 font-extrabold';
      uiColorPreview.style.background = State.activeColorHex || 'transparent';
      uiColorName.textContent = State.activeColorName;
      p1Obj.tipMat.color.set(State.activeColorHex || '#ffffff');
      p2Obj.tipMat.color.set(State.activeColorHex || '#63666f');

      if (State.controlMode === 'BOTH' || State.controlMode === 'P2' || (State.isP2PHost && State.aiHelperEnabled)) {
        Network.sendNetworkPacket({
          type: 'MOVE_P2',
          x: p2Obj.group.position.x,
          z: p2Obj.group.position.z,
          isPenDown: State.isPenDown
        });
      }

      // 바닥 페인팅 및 물감 튀김 파티클
      Scene3D.paintStrokeOnBoard();
    }

    // 파티클 업데이트 및 렌더링
    Scene3D.updateParticles();
    Scene3D.renderFrame();
  }

  // 게임 시작!
  startRound(false);
  animate();
};
