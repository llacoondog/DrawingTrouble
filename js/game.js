// ==========================================
// 반반 무마니 3D - 접속 대기화면(커스터마이징), 게임 루프 & 물리 제어 (game.js)
// ==========================================
window.BanBan = window.BanBan || {};

let isGameBootstrapped = false;

function initGameApp() {
  if (isGameBootstrapped) return;
  isGameBootstrapped = true;

  const { Config, State, Sound, Scene3D, Network } = window.BanBan;

  // 1. UI 요소 참조
  const chatMessagesEl = document.getElementById('chat-messages');
  const chatInputEl = document.getElementById('chat-input');
  const timerTextEl = document.getElementById('timer-text');
  const timerBadgeEl = document.getElementById('timer-badge');
  const timerIconEl = document.getElementById('timer-icon');
  const timerProgressBar = document.getElementById('timer-progress-bar');
  const urgentVignetteEl = document.getElementById('urgent-vignette');
  const uiPenStatus = document.getElementById('pen-status');
  const uiColorPreview = document.getElementById('color-preview');
  const uiColorName = document.getElementById('color-name');
  const uiBrushSizeName = document.getElementById('brush-size-name');
  const btnSoundToggle = document.getElementById('btn-sound-toggle');
  const padToastEl = document.getElementById('pad-step-toast');
  const padToastIcon = document.getElementById('pad-toast-icon');
  const padToastDot = document.getElementById('pad-toast-dot');
  const padToastText = document.getElementById('pad-toast-text');
  const padToastSub = document.getElementById('pad-toast-sub');
  const entryScreenEl = document.getElementById('entry-screen');
  const entryNicknameEl = document.getElementById('entry-nickname');
  let lastSteppedPadId = null;

  // 2. 3D 씬 및 프리뷰 캔버스 초기화
  const container = document.getElementById('canvas-container');
  try {
    Scene3D.initScene(container);
  } catch (err) {
    console.error('Scene3D initialization error:', err);
  }
  const { camera, renderer, drawCanvas, drawingBoard, p1Obj, p2Obj, padMeshes } = Scene3D.getSceneObjects();

  function updatePadStepHUD(padData, isP2Airborne = false) {
    if (isP2Airborne) {
      if (lastSteppedPadId !== '__JUMPING__') {
        lastSteppedPadId = '__JUMPING__';
        if (padToastEl) {
          padToastEl.classList.add('hidden');
          padToastEl.classList.remove('flex', 'pad-toast-active');
        }
        Scene3D.updateP2StepBubble('🦘 점프 중! (발판 패스)', '#6366f1', '#fef08a');
      }
      return;
    }

    if (!padData) {
      if (lastSteppedPadId !== null) {
        lastSteppedPadId = null;
        if (padToastEl) {
          padToastEl.classList.add('hidden');
          padToastEl.classList.remove('flex', 'pad-toast-active');
        }
        Scene3D.updateP2StepBubble(null);
      }
      return;
    }

    const curSize = Config.BRUSH_SIZES[State.brushSizeIdx] || Config.BRUSH_SIZES[1];
    const stateKey = `${padData.id}_${State.brushSizeIdx}`;
    if (lastSteppedPadId === stateKey) return;
    lastSteppedPadId = stateKey;

    let bubbleText = '';
    let toastMain = '';
    let toastSub = '';
    let bgHex = padData.hex || '#ec4899';

    if (padData.type === 'color') {
      const isEraser = padData.id === 'ERASER';
      bubbleText = `${padData.icon} ${padData.fullName} ON!`;
      toastMain = `[${padData.fullName}] 버튼 밟는 중!`;
      toastSub = isEraser ? `지우개 작동중 (${curSize.name})` : `물감 공급 ON (${curSize.name})`;
      bgHex = isEraser ? '#475569' : padData.hex;
    } else if (padData.type === 'size') {
      bubbleText = `🖌️ ${padData.fullName}!`;
      toastMain = `[${padData.fullName}] 버튼 밟음!`;
      toastSub = `현재 굵기: ${curSize.badge}`;
      bgHex = '#059669';
    } else if (padData.type === 'clear') {
      bubbleText = `💥 도화지 초기화!`;
      toastMain = `[전체 지우기] 버튼 밟음!`;
      toastSub = `새 도화지로 초기화!`;
      bgHex = '#be123c';
    }

    Scene3D.updateP2StepBubble(bubbleText, bgHex, '#ffffff');

    if (padToastEl) {
      if (padToastIcon) padToastIcon.textContent = padData.icon || '🎨';
      if (padToastText) padToastText.textContent = toastMain;
      if (padToastSub) padToastSub.textContent = toastSub;
      if (padToastDot) {
        if (padData.type === 'color') {
          padToastDot.classList.remove('hidden');
          padToastDot.style.background = padData.hex || '#ffffff';
        } else {
          padToastDot.classList.add('hidden');
        }
      }
      padToastEl.style.background = bgHex === '#111827' ? 'rgba(17, 24, 39, 0.95)' : `${bgHex}e6`;
      padToastEl.classList.remove('hidden', 'pad-toast-active');
      void padToastEl.offsetWidth;
      padToastEl.classList.add('flex', 'pad-toast-active');
    }
  }

  if (btnSoundToggle) {
    btnSoundToggle.addEventListener('click', () => {
      State.soundEnabled = !State.soundEnabled;
      if (State.soundEnabled) {
        btnSoundToggle.innerHTML = '<span>🔊 효과음: ON</span>';
        btnSoundToggle.className = 'bg-slate-800 hover:bg-slate-700 active:scale-95 text-amber-300 text-xs font-extrabold px-2.5 py-1.5 rounded-xl transition shadow border border-white/10 flex items-center gap-1';
        if (Sound) Sound.playClick();
      } else {
        btnSoundToggle.innerHTML = '<span>🔇 효과음: OFF</span>';
        btnSoundToggle.className = 'bg-slate-900/90 hover:bg-slate-800 active:scale-95 text-slate-500 text-xs font-bold px-2.5 py-1.5 rounded-xl transition shadow border border-white/5 flex items-center gap-1';
      }
    });
  }

  const keys = {};
  function clearAllKeys() {
    Object.keys(keys).forEach(k => { keys[k] = false; });
  }
  window.addEventListener('blur', clearAllKeys);

  // 3. 접속 대기화면 & 캐릭터 커스터마이징 UI 초기화
  function initCustomizerUI() {
    if (entryNicknameEl) {
      entryNicknameEl.value = State.myNickname;
      entryNicknameEl.addEventListener('focus', () => { State.isTypingChat = true; clearAllKeys(); });
      entryNicknameEl.addEventListener('blur', () => { State.isTypingChat = false; });
      entryNicknameEl.addEventListener('input', () => {
        State.myNickname = (entryNicknameEl.value || '열정화가').trim().slice(0, 10);
        const mpNick = document.getElementById('mp-nickname');
        if (mpNick) mpNick.value = State.myNickname;
        Config.saveProfile(State.myNickname, State.myCustom);
        Network.broadcastMyCustomization();
      });
    }

    const colorContainer = document.getElementById('custom-color-options');
    const hatContainer = document.getElementById('custom-hat-options');
    const faceContainer = document.getElementById('custom-face-options');

    function renderCustomButtons() {
      // 1) 색상 버튼
      if (colorContainer) {
        colorContainer.innerHTML = '';
        Config.CUSTOM_COLORS.forEach(c => {
          const isSelected = State.myCustom.color.toLowerCase() === c.hex.toLowerCase();
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.title = c.name;
          btn.className = `h-9 rounded-xl border-2 transition flex items-center justify-center ${
            isSelected ? 'border-white scale-105 shadow-lg ring-2 ring-pink-400' : 'border-white/20 opacity-80 hover:opacity-100'
          }`;
          btn.style.backgroundColor = c.hex;
          btn.innerHTML = isSelected ? '<span class="text-white text-xs font-black drop-shadow">✓</span>' : '';
          btn.addEventListener('click', () => {
            if (Sound) Sound.playClick();
            State.myCustom.color = c.hex;
            Config.saveProfile(State.myNickname, State.myCustom);
            renderCustomButtons();
            Network.broadcastMyCustomization();
          });
          colorContainer.appendChild(btn);
        });
      }

      // 2) 모자 버튼
      if (hatContainer) {
        hatContainer.innerHTML = '';
        Config.CUSTOM_HATS.forEach(h => {
          const isSelected = State.myCustom.hat === h.id;
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = `px-2.5 py-2 rounded-xl text-xs font-bold border transition flex items-center justify-center gap-1.5 ${
            isSelected
              ? 'bg-pink-600 text-white border-pink-400 shadow-md'
              : 'bg-[#12141c] hover:bg-slate-800 text-slate-300 border-white/10'
          }`;
          btn.innerHTML = `<span>${h.icon}</span><span>${h.name}</span>`;
          btn.addEventListener('click', () => {
            if (Sound) Sound.playClick();
            State.myCustom.hat = h.id;
            Config.saveProfile(State.myNickname, State.myCustom);
            renderCustomButtons();
            Network.broadcastMyCustomization();
          });
          hatContainer.appendChild(btn);
        });
      }

      // 3) 얼굴 표정 버튼
      if (faceContainer) {
        faceContainer.innerHTML = '';
        Config.CUSTOM_FACES.forEach(f => {
          const isSelected = State.myCustom.face === f.id;
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = `px-2.5 py-2 rounded-xl text-xs font-bold border transition flex items-center justify-center gap-1.5 ${
            isSelected
              ? 'bg-indigo-600 text-white border-indigo-400 shadow-md'
              : 'bg-[#12141c] hover:bg-slate-800 text-slate-300 border-white/10'
          }`;
          btn.innerHTML = `<span>${f.icon}</span><span>${f.name}</span>`;
          btn.addEventListener('click', () => {
            if (Sound) Sound.playClick();
            State.myCustom.face = f.id;
            Config.saveProfile(State.myNickname, State.myCustom);
            renderCustomButtons();
            Network.broadcastMyCustomization();
          });
          faceContainer.appendChild(btn);
        });
      }
    }

    // [🎲 랜덤 꾸미기] 버튼
    const btnRandom = document.getElementById('btn-random-custom');
    if (btnRandom) {
      btnRandom.addEventListener('click', () => {
        if (Sound) Sound.playClick();
        const randColor = Config.CUSTOM_COLORS[Math.floor(Math.random() * Config.CUSTOM_COLORS.length)];
        const randHat = Config.CUSTOM_HATS[Math.floor(Math.random() * Config.CUSTOM_HATS.length)];
        const randFace = Config.CUSTOM_FACES[Math.floor(Math.random() * Config.CUSTOM_FACES.length)];
        State.myCustom = {
          color: randColor.hex,
          hat: randHat.id,
          face: randFace.id
        };
        Config.saveProfile(State.myNickname, State.myCustom);
        renderCustomButtons();
        Network.broadcastMyCustomization();
      });
    }

    // [🎮 혼자 / 로컬 연습 시작하기] 버튼
    const btnSolo = document.getElementById('btn-entry-solo');
    if (btnSolo) {
      btnSolo.addEventListener('click', () => {
        if (entryNicknameEl && entryNicknameEl.value.trim()) {
          State.myNickname = entryNicknameEl.value.trim().slice(0, 10);
        }
        Config.saveProfile(State.myNickname, State.myCustom);
        Network.broadcastMyCustomization();
        entryScreenEl.classList.add('hidden');

        // 만약 멀티 대기방에 연결된 상태였다면 대기방 모달로 복귀, 아니면 로컬 제시어 선택 시작
        if (State.isP2PConnected && State.gameState === 'WAITING') {
          Network.openMultiModal();
        } else if (State.gameState !== 'PLAYING' && State.gameState !== 'CHOOSING_WORD') {
          startWordSelectionPhase(false);
        }
      });
    }

    // [🌐 멀티플레이 대기방 만들기 / 입장] 버튼
    const btnMulti = document.getElementById('btn-entry-multi');
    if (btnMulti) {
      btnMulti.addEventListener('click', () => {
        if (entryNicknameEl && entryNicknameEl.value.trim()) {
          State.myNickname = entryNicknameEl.value.trim().slice(0, 10);
        }
        Config.saveProfile(State.myNickname, State.myCustom);
        Network.broadcastMyCustomization();
        entryScreenEl.classList.add('hidden');
        Network.openMultiModal();
      });
    }

    // 상단 바 [👕 캐릭터 꾸미기] 버튼
    const btnOpenCustom = document.getElementById('btn-open-custom');
    if (btnOpenCustom) {
      btnOpenCustom.addEventListener('click', openCustomizerModal);
    }

    renderCustomButtons();
  }

  function openCustomizerModal() {
    if (entryNicknameEl) entryNicknameEl.value = State.myNickname;
    const btnSolo = document.getElementById('btn-entry-solo');
    if (btnSolo) {
      btnSolo.innerHTML = State.gameState === 'PLAYING'
        ? '<span>✅ 꾸미기 저장 & 게임으로 돌아가기</span>'
        : '<span>🎮 혼자 / 로컬 연습 시작하기</span>';
    }
    entryScreenEl.classList.remove('hidden');
  }

  // 3-2. 직관적인 실시간 타이머 게이지 & 상태별 시각 피드백 제어
  function updateTimerDisplay(seconds, maxSeconds = 60) {
    if (!timerTextEl) return;

    if (typeof seconds !== 'number' || State.gameState !== 'PLAYING') {
      timerTextEl.textContent = typeof seconds === 'string' ? seconds : `${State.timeLeft}s`;
      if (timerProgressBar) {
        timerProgressBar.style.width = '100%';
        timerProgressBar.className = 'h-full w-full bg-gradient-to-r from-teal-400 to-emerald-400 transition-all duration-300 ease-linear shadow-[0_0_8px_rgba(52,211,153,0.6)]';
      }
      if (timerBadgeEl) {
        timerBadgeEl.className = 'flex items-center gap-1.5 bg-black/40 px-2.5 py-0.5 rounded-2xl border border-white/10 shadow-inner transition-all duration-300';
      }
      if (timerIconEl) timerIconEl.textContent = '⏳';
      if (urgentVignetteEl) {
        urgentVignetteEl.classList.remove('vignette-pulse', 'vignette-pulse-fast', 'opacity-100');
        urgentVignetteEl.classList.add('opacity-0');
      }
      timerTextEl.classList.remove('urgent-timer');
      return;
    }

    const clampedSec = Math.max(0, Math.min(maxSeconds, seconds));
    const pct = Math.max(0, Math.min(100, (clampedSec / maxSeconds) * 100));

    timerTextEl.textContent = `${clampedSec}s`;

    if (timerProgressBar) {
      timerProgressBar.style.width = `${pct}%`;
    }

    // 잔여 시간에 따른 3단계 시각 피드백 (여유: 초록/청록 -> 중반: 노랑/주황 -> 긴급: 핫핑크/레드)
    if (clampedSec > 30) {
      // 1) 60s ~ 31s (여유 구간)
      if (timerProgressBar) {
        timerProgressBar.className = 'h-full bg-gradient-to-r from-teal-400 to-emerald-400 transition-all duration-300 ease-linear shadow-[0_0_8px_rgba(52,211,153,0.6)]';
      }
      if (timerBadgeEl) {
        timerBadgeEl.className = 'flex items-center gap-1.5 bg-black/40 px-2.5 py-0.5 rounded-2xl border border-emerald-400/40 shadow-inner transition-all duration-300';
      }
      timerTextEl.className = 'text-sm sm:text-base font-black text-emerald-300 min-w-[36px] text-center tracking-tight transition-colors duration-300';
      if (timerIconEl) timerIconEl.textContent = '⏳';
      if (urgentVignetteEl) {
        urgentVignetteEl.classList.remove('vignette-pulse', 'vignette-pulse-fast', 'opacity-100');
        urgentVignetteEl.classList.add('opacity-0');
      }
      timerTextEl.classList.remove('urgent-timer');
    } else if (clampedSec > 10) {
      // 2) 30s ~ 11s (중반 구간 & 20초 힌트 오픈)
      if (timerProgressBar) {
        timerProgressBar.className = 'h-full bg-gradient-to-r from-amber-400 to-orange-400 transition-all duration-300 ease-linear shadow-[0_0_8px_rgba(245,158,11,0.6)]';
      }
      if (timerBadgeEl) {
        timerBadgeEl.className = 'flex items-center gap-1.5 bg-black/40 px-2.5 py-0.5 rounded-2xl border border-amber-400/40 shadow-inner transition-all duration-300';
      }
      timerTextEl.className = 'text-sm sm:text-base font-black text-amber-300 min-w-[36px] text-center tracking-tight transition-colors duration-300';
      if (timerIconEl) timerIconEl.textContent = clampedSec <= 20 ? '💡' : '⏰';
      if (urgentVignetteEl) {
        urgentVignetteEl.classList.remove('vignette-pulse', 'vignette-pulse-fast', 'opacity-100');
        urgentVignetteEl.classList.add('opacity-0');
      }
      timerTextEl.classList.remove('urgent-timer');
    } else {
      // 3) 10s ~ 0s (긴급 카운트다운 구간!)
      if (timerProgressBar) {
        timerProgressBar.className = 'h-full bg-gradient-to-r from-rose-500 to-red-600 animate-pulse transition-all duration-300 ease-linear shadow-[0_0_12px_rgba(244,63,94,0.9)]';
      }
      if (timerBadgeEl) {
        timerBadgeEl.className = 'flex items-center gap-1.5 bg-rose-950/70 px-2.5 py-0.5 rounded-2xl border border-rose-500 shadow-[0_0_14px_rgba(244,63,94,0.6)] transition-all duration-300';
      }
      timerTextEl.className = 'text-sm sm:text-base font-black text-rose-300 min-w-[36px] text-center tracking-tight urgent-timer';
      if (timerIconEl) timerIconEl.textContent = '🔥';

      // 화면 테두리 붉은 비네트 펄스 연출
      if (urgentVignetteEl) {
        urgentVignetteEl.classList.remove('opacity-0');
        if (clampedSec <= 3) {
          urgentVignetteEl.classList.remove('vignette-pulse');
          urgentVignetteEl.classList.add('vignette-pulse-fast', 'opacity-100');
        } else {
          urgentVignetteEl.classList.remove('vignette-pulse-fast');
          urgentVignetteEl.classList.add('vignette-pulse', 'opacity-100');
        }
      }
    }
  }

  // 4. 모드 스위처 & 'YOU' 화살표 표시 제어
  function updatePromptVisibility() {
    const promptEl = document.getElementById('prompt-text');
    if (!promptEl) return;
    if (State.gameState === 'WAITING' || State.gameState === 'LOBBY') {
      promptEl.textContent = '제시어: (대기실 준비 중...)';
    } else if (State.gameState === 'CHOOSING_WORD') {
      promptEl.textContent = '제시어: (🎨 1P가 3개 중 선택 중...)';
    } else if (State.gameState === 'ROUND_END') {
      promptEl.textContent = `제시어: ${State.currentPrompt.word}`;
    } else if (State.controlMode === 'SPECTATOR') {
      if (State.gameState === 'PLAYING' && State.timeLeft <= 20) {
        const masked = State.currentPrompt.word.replace(/[^\s]/g, '❓');
        promptEl.textContent = `제시어: ${masked} (${State.currentPrompt.word.length}글자)`;
      } else {
        promptEl.textContent = '제시어: ❓ (20초에 공개)';
      }
    } else {
      promptEl.textContent = `제시어: ${State.currentPrompt.word}`;
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
    Scene3D.updateYouMarkersVisibility();
    Network.updateCoopUIVisibility();
  }

  document.getElementById('mode-both')?.addEventListener('click', () => setMode('BOTH', 'mode-both'));
  document.getElementById('mode-p1')?.addEventListener('click', () => setMode('P1', 'mode-p1'));
  document.getElementById('mode-p2')?.addEventListener('click', () => setMode('P2', 'mode-p2'));
  document.getElementById('mode-spec')?.addEventListener('click', () => setMode('SPECTATOR', 'mode-spec'));

  // 브러쉬 크기 세분화 UI 제어 (현재 활성화된 크기는 초록색 버튼으로 표시)
  let lastSyncedBrushSizeIdx = -1;
  function updateBrushSizeUI() {
    if (lastSyncedBrushSizeIdx === State.brushSizeIdx) return;
    lastSyncedBrushSizeIdx = State.brushSizeIdx;
    const btns = document.querySelectorAll('.brush-size-btn');
    btns.forEach(btn => {
      const idx = parseInt(btn.getAttribute('data-size'), 10);
      if (idx === State.brushSizeIdx) {
        btn.className = 'brush-size-btn px-2.5 py-0.5 rounded-xl text-xs font-black transition bg-emerald-500 text-white shadow-md border border-emerald-300 scale-105';
      } else {
        btn.className = 'brush-size-btn px-2.5 py-0.5 rounded-xl text-xs font-bold transition bg-white/10 hover:bg-white/20 text-slate-300';
      }
    });
  }

  function setBrushSize(newIdx, isFromNetwork = false) {
    if (typeof newIdx !== 'number' || newIdx < 0 || newIdx >= Config.BRUSH_SIZES.length) return;
    State.brushSizeIdx = newIdx;
    const sizeObj = Config.BRUSH_SIZES[State.brushSizeIdx];
    if (Sound) Sound.playBrushSize(State.brushSizeIdx);
    updateBrushSizeUI();

    if (!isFromNetwork) {
      addChatMessage('', `🖌️ 2P가 [${sizeObj.badge}] 크기 버튼을 활성화했습니다!`, 'system');
      Network.sendNetworkPacket({
        type: 'BRUSH_SIZE',
        brushSizeIdx: State.brushSizeIdx
      });
    }
  }

  document.querySelectorAll('.brush-size-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.getAttribute('data-size'), 10);
      setBrushSize(idx, false);
    });
  });

  // 5. 실시간 채팅 & 라운드 진행 제어
  chatInputEl?.addEventListener('focus', () => { State.isTypingChat = true; clearAllKeys(); });
  chatInputEl?.addEventListener('blur', () => { State.isTypingChat = false; });

  const mpNicknameEl = document.getElementById('mp-nickname');
  const mpRoomcodeEl = document.getElementById('mp-roomcode');
  [mpNicknameEl, mpRoomcodeEl].forEach(el => {
    if (el) {
      el.addEventListener('focus', () => { State.isTypingChat = true; clearAllKeys(); });
      el.addEventListener('blur', () => { State.isTypingChat = false; });
    }
  });

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
      const senderSpan = document.createElement('span');
      senderSpan.className = 'font-bold text-slate-400 mr-1.5';
      senderSpan.textContent = `${sender}:`;
      const textSpan = document.createElement('span');
      textSpan.className = 'text-slate-100';
      textSpan.textContent = text;
      div.appendChild(senderSpan);
      div.appendChild(textSpan);
    }
    chatMessagesEl.appendChild(div);
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
  }

  function normalizeAnswer(str) {
    return str.replace(/\s+/g, '').toLowerCase();
  }

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

    if (!winnerMatched && !State.isP2PConnected) {
      const p1Entry = State.playerRoster.find(p => p.role === 'P1');
      if (p1Entry) p1Entry.score += earnedScore;
    }

    State.totalScore += earnedScore;
    Network.renderPlayerRoster();
  }

  function handleSendChat() {
    const rawText = chatInputEl.value.trim();
    chatInputEl.value = '';
    chatInputEl.blur();
    State.isTypingChat = false;
    updateChatFocusIndicator(false);
    if (!rawText) return;

    const senderName = State.myNickname || '나';

    // 👥 팀 모드 맞추기(GUESSING) 단계 처리
    if (State.gameMode === 'TEAM' && State.teamModeState.phase === 'GUESSING') {
      handleTeamGuessInput(senderName, rawText);
      return;
    }

    // 깍두기는 관전 전용 (정답 체크 불가)
    if (State.teamModeState.isKkaktugi) {
      if (State.gameState === 'PLAYING' && normalizeAnswer(rawText) === normalizeAnswer(State.currentPrompt?.word || '')) {
        addChatMessage('', '👀 깍두기는 관전 모드이므로 정답을 맞힐 수 없습니다! (자유 관전)', 'system');
      } else {
        Network.sendNetworkPacket({ type: 'CHAT', sender: senderName, text: rawText, timeLeft: State.timeLeft });
        addChatMessage(senderName, rawText);
      }
      return;
    }

    if (State.gameState === 'PLAYING' && normalizeAnswer(rawText) === normalizeAnswer(State.currentPrompt.word)) {
      const hasSpectators = State.isP2PConnected && State.playerRoster.some(p => p.role === 'SPECTATOR');
      if (hasSpectators && State.controlMode !== 'SPECTATOR') {
        addChatMessage('', '⚠️ 구경꾼(정답자)이 있는 멀티플레이 방에서는 출제자(1P/2P)가 정답을 직접 입력할 수 없습니다!', 'system');
        return;
      }

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

  const chatFocusStatusEl = document.getElementById('chat-focus-status');
  function updateChatFocusIndicator(isTyping) {
    if (!chatFocusStatusEl) return;
    if (isTyping) {
      chatFocusStatusEl.className = 'text-amber-300 font-bold flex items-center gap-1';
      chatFocusStatusEl.innerHTML = `
        <span class="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
        <span>⌨️ 채팅 입력 중 (이동 정지 - Enter로 전송/복귀)</span>
      `;
    } else {
      chatFocusStatusEl.className = 'text-emerald-400 font-bold flex items-center gap-1';
      chatFocusStatusEl.innerHTML = `
        <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
        <span>🏃 이동 모드 (Enter 눌러 채팅)</span>
      `;
    }
  }

  chatInputEl?.addEventListener('focus', () => {
    State.isTypingChat = true;
    clearAllKeys();
    updateChatFocusIndicator(true);
  });
  chatInputEl?.addEventListener('blur', () => {
    State.isTypingChat = false;
    updateChatFocusIndicator(false);
  });

  document.getElementById('btn-send')?.addEventListener('click', handleSendChat);
  chatInputEl?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSendChat();
    } else if (e.key === 'Escape') {
      chatInputEl.blur();
      State.isTypingChat = false;
      updateChatFocusIndicator(false);
    }
  });

  let timerInterval = null;
  let wordChoiceInterval = null;
  let resultModalTimeout = null;

  function closeWordSelectModal() {
    if (wordChoiceInterval) clearInterval(wordChoiceInterval);
    const wordModal = document.getElementById('word-select-modal');
    if (wordModal) {
      wordModal.classList.add('hidden');
      wordModal.classList.remove('flex');
    }
  }

  function pauseForWaitingRoom() {
    State.gameState = 'WAITING';
    if (timerInterval) clearInterval(timerInterval);
    if (resultModalTimeout) clearTimeout(resultModalTimeout);
    closeWordSelectModal();
    document.getElementById('result-modal').classList.add('hidden');
    document.getElementById('result-modal').classList.remove('flex');
    updateTimerDisplay('대기중');
    updatePromptVisibility();
    Scene3D.clearCanvas();
    Scene3D.clearConfetti();
  }

  // 라운드 및 턴 계산 헬퍼 함수
  // "모든 사람이 1바퀴 돌면 1라운드" -> 한 라운드당 턴 수 = 참가자 수 (최소 1)
  function getTurnsPerRound() {
    return Math.max(1, State.playerRoster?.length || 1);
  }

  function updateRoundBadge() {
    const roundEl = document.getElementById('round-text');
    if (!roundEl) return;
    if (State.gameMode === 'TEAM') {
      const ts = State.teamModeState;
      if (ts.phase === 'DRAWING') {
        roundEl.textContent = `👥 [팀 드로잉] ${ts.drawIndex + 1}/3회차 동시 진행`;
      } else if (ts.phase === 'GUESSING') {
        roundEl.textContent = `🎯 [리플레이 맞추기] 퀴즈 ${ts.currentGuessStep + 1}/6`;
      } else {
        roundEl.textContent = `👥 [팀 모드] 2인 팀전 대기중`;
      }
      return;
    }
    const maxRounds = Config.MAX_ROUNDS || 3;
    const turns = getTurnsPerRound();
    roundEl.textContent = `🍓 ROUND ${State.currentRound}/${maxRounds} (${State.currentTurn}/${turns})`;
  }

  // [1단계] 라운드 시작 전 무작위 3개 제시어 후보 중 1P가 1개를 고르는 단계
  function startWordSelectionPhase(isFromNetwork = false, providedCandidates = null) {
    State.gameState = 'CHOOSING_WORD';
    Network.updateCoopUIVisibility();
    if (timerInterval) clearInterval(timerInterval);
    if (wordChoiceInterval) clearInterval(wordChoiceInterval);
    if (resultModalTimeout) clearTimeout(resultModalTimeout);

    if (Array.isArray(providedCandidates) && providedCandidates.length === 3) {
      State.candidatePromptIndices = providedCandidates;
    } else if (!isFromNetwork) {
      State.candidatePromptIndices = Config.pickThreeRandomPromptIndices(State.currentPromptIndex);
    }

    updateRoundBadge();
    updateTimerDisplay('선택중');
    document.getElementById('result-modal').classList.add('hidden');
    document.getElementById('result-modal').classList.remove('flex');
    if (entryScreenEl) entryScreenEl.classList.add('hidden');

    updatePromptVisibility();
    Scene3D.updateYouMarkersVisibility();
    Scene3D.syncRosterCustomizations();
    Scene3D.clearCanvas();
    Scene3D.clearConfetti();

    p1Obj.group.position.set(0, 0, 2.2);
    p2Obj.group.position.set(0.0, 0, -8.6);
    State.p1State.vx = State.p1State.vz = State.p2State.vx = State.p2State.vz = 0;
    State.p1State.y = State.p1State.vy = State.p2State.y = State.p2State.vy = 0;
    State.isPenDown = false;
    State.wasOnClearPad = false;
    State.wasOnSizePad = false;
    State.activeColorHex = null;
    State.activeColorName = '발판 대기 (OFF)';

    // 내가 1P 권한이 있는지 확인 (로컬 모드에서는 항상 직접 선택 가능, 멀티에서는 1P만 선택)
    const me = State.playerRoster.find(p => p.id === State.myPeerId);
    const canIPick = !State.isP2PConnected || !me || me.role === 'P1';
    const p1Player = State.playerRoster.find(p => p.role === 'P1');

    const wordModal = document.getElementById('word-select-modal');
    const choiceListEl = document.getElementById('word-choice-list');
    const waitNoticeEl = document.getElementById('word-wait-notice');
    const waitTextEl = document.getElementById('word-wait-text');
    const selectTimerEl = document.getElementById('word-select-timer');

    if (canIPick) {
      choiceListEl.classList.remove('hidden');
      waitNoticeEl.classList.add('hidden');
      choiceListEl.innerHTML = '';

      State.candidatePromptIndices.forEach((poolIdx, idx) => {
        const item = Config.WORD_POOL[poolIdx % Config.WORD_POOL.length];
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'w-full bg-[#12141c] hover:bg-indigo-600/30 active:scale-98 border border-white/15 hover:border-amber-400 rounded-2xl p-3.5 text-left transition flex items-center justify-between group shadow';
        btn.innerHTML = `
          <div>
            <span class="text-xs font-extrabold text-amber-400 mr-1.5">후보 ${idx + 1}</span>
            <span class="text-sm sm:text-base font-black text-white group-hover:text-amber-200">${item.word}</span>
            <div class="text-[11px] text-slate-400 mt-0.5">글자 수: ${item.word.length}글자</div>
          </div>
          <span class="bg-amber-400 text-slate-950 text-xs font-black px-3 py-1.5 rounded-xl group-hover:scale-105 transition">선택 ▶</span>
        `;
        btn.addEventListener('click', () => {
          confirmWordSelection(poolIdx);
        });
        choiceListEl.appendChild(btn);
      });
    } else {
      choiceListEl.classList.add('hidden');
      waitNoticeEl.classList.remove('hidden');
      if (waitTextEl) {
        waitTextEl.textContent = `🎨 1P 브러시 러너(${p1Player?.nickname || '1P'})님이 3개의 후보 중 제시어를 고르고 있습니다...`;
      }
    }

    wordModal.classList.remove('hidden');
    wordModal.classList.add('flex');

    let choiceTimeLeft = 10;
    const roundAtChoiceStart = State.currentRound;
    const turnAtChoiceStart = State.currentTurn;
    if (selectTimerEl) selectTimerEl.textContent = `${choiceTimeLeft}s`;

    wordChoiceInterval = setInterval(() => {
      if (State.gameState !== 'CHOOSING_WORD') {
        clearInterval(wordChoiceInterval);
        return;
      }
      choiceTimeLeft--;
      if (selectTimerEl) selectTimerEl.textContent = `${Math.max(0, choiceTimeLeft)}s`;

      if (choiceTimeLeft <= 3 && choiceTimeLeft > 0) {
        if (Sound) Sound.playTick(true);
      }

      if (choiceTimeLeft <= 0) {
        clearInterval(wordChoiceInterval);
        if (canIPick) {
          skipRoundOnWordTimeout();
        } else if (State.isP2PConnected && State.isP2PHost) {
          // 1P가 게스트이고 백그라운드 탭/잠수 상태로 인해 패킷이 오지 않을 때 방장이 대신 스킵 처리
          setTimeout(() => {
            if (State.gameState === 'CHOOSING_WORD' && State.currentRound === roundAtChoiceStart && State.currentTurn === turnAtChoiceStart) {
              skipRoundOnWordTimeout();
            }
          }, 800);
        }
      }
    }, 1000);
  }

  // 차례(턴) 및 라운드 전환 공통 함수
  function proceedToNextTurnOrRound(isTimeout = false, customSkipNotice = null) {
    if (wordChoiceInterval) clearInterval(wordChoiceInterval);
    if (resultModalTimeout) clearTimeout(resultModalTimeout);

    const turnsPerRound = getTurnsPerRound();
    const maxRounds = Config.MAX_ROUNDS || 3;
    const isRoundFinished = State.currentTurn >= turnsPerRound;

    // 만약 최대 라운드(3R)의 마지막 턴(모든 사람 3바퀴 완주) 완료 시 게임 최종 종료!
    if (isRoundFinished && State.currentRound >= maxRounds) {
      showFinalLeaderboard();
      Network.sendNetworkPacket({
        type: 'GAME_OVER',
        roster: State.playerRoster
      });
      return;
    }

    let roundNotice = '';

    if (isRoundFinished) {
      // 1바퀴 완료 -> 다음 라운드로 증가, 차례(턴)는 1로 리셋
      const finishedRound = State.currentRound;
      State.currentRound++;
      State.currentTurn = 1;
      roundNotice = `🎉 모든 참가자가 1바퀴를 돌아 ROUND ${finishedRound}이 종료되었습니다! ROUND ${State.currentRound}/${maxRounds} 시작!`;
    } else {
      // 라운드 내 다음 차례로 진행
      State.currentTurn++;
    }

    const lastCand = State.candidatePromptIndices[State.candidatePromptIndices.length - 1] ?? State.currentPromptIndex;
    State.candidatePromptIndices = Config.pickThreeRandomPromptIndices(lastCand);

    Network.rotatePlayerRoles();

    const nextP1 = State.playerRoster.find(p => p.role === 'P1');
    const nextP1Name = nextP1?.nickname || '1P';

    const fullNotice = customSkipNotice
      ? `${customSkipNotice}\n${roundNotice || `👉 차례 이동: ROUND ${State.currentRound}/${maxRounds} (차례 ${State.currentTurn}/${turnsPerRound}) - 새 1P: ${nextP1Name}`}`
      : (roundNotice || `👉 차례 이동: ROUND ${State.currentRound}/${maxRounds} (차례 ${State.currentTurn}/${turnsPerRound}) - 새 1P: ${nextP1Name}`);

    addChatMessage('', fullNotice, 'system');
    if (isTimeout && Sound) Sound.playTimeUp();

    updateRoundBadge();

    Network.sendNetworkPacket({
      type: 'NEXT_ROUND',
      round: State.currentRound,
      turn: State.currentTurn,
      maxRounds: maxRounds,
      candidateIndices: State.candidatePromptIndices,
      roster: State.playerRoster,
      skipNotice: isTimeout ? fullNotice : null
    });

    startWordSelectionPhase(false, State.candidatePromptIndices);
  }

  // 1P가 10초 안에 제시어를 고르지 않았을 때: 자동 스킵 + 다음 차례/라운드로 이동
  function skipRoundOnWordTimeout() {
    if (State.gameState !== 'CHOOSING_WORD') return;
    if (wordChoiceInterval) clearInterval(wordChoiceInterval);

    const prevP1 = State.playerRoster.find(p => p.role === 'P1');
    const prevP1Name = prevP1?.nickname || '1P';
    const notice = `⏩ [선택 시간 초과] 1P(${prevP1Name})님이 10초 내에 단어를 고르지 않아 자동 스킵되었습니다!`;

    proceedToNextTurnOrRound(true, notice);
  }

  function confirmWordSelection(chosenPromptIndex) {
    closeWordSelectModal();
    Network.sendNetworkPacket({
      type: 'WORD_SELECTED',
      round: State.currentRound,
      turn: State.currentTurn,
      promptIndex: chosenPromptIndex
    });
    startPlayingRound(chosenPromptIndex, false);
  }

  // [2단계] 1P가 제시어를 확정하면 60초 드로잉 라운드 본격 시작
  function startPlayingRound(chosenPromptIndex, isFromNetwork = false) {
    if (resultModalTimeout) clearTimeout(resultModalTimeout);
    closeWordSelectModal();
    State.gameState = 'PLAYING';
    State.timeLeft = 60;
    if (typeof chosenPromptIndex === 'number') {
      State.currentPromptIndex = chosenPromptIndex;
    }
    State.currentPrompt = Config.WORD_POOL[State.currentPromptIndex % Config.WORD_POOL.length];

    updateRoundBadge();
    updateTimerDisplay(60, 60);
    document.getElementById('result-modal').classList.add('hidden');
    document.getElementById('result-modal').classList.remove('flex');
    if (entryScreenEl) entryScreenEl.classList.add('hidden');

    updatePromptVisibility();
    Scene3D.updateYouMarkersVisibility();
    Scene3D.syncRosterCustomizations();
    Network.updateCoopUIVisibility();

    Scene3D.clearCanvas();
    Scene3D.clearConfetti();

    p1Obj.group.position.set(0, 0, 2.2);
    p2Obj.group.position.set(0.0, 0, -8.6);
    State.p1State.vx = State.p1State.vz = State.p2State.vx = State.p2State.vz = 0;
    State.p1State.y = State.p1State.vy = State.p2State.y = State.p2State.vy = 0;
    State.isPenDown = false;
    State.wasOnClearPad = false;
    State.wasOnSizePad = false;
    State.activeColorHex = null;
    State.activeColorName = '발판 대기 (OFF)';

    const p1Player = State.playerRoster.find(p => p.role === 'P1');
    const p2Player = State.playerRoster.find(p => p.role === 'P2');
    const roleSummary = (p1Player && p2Player)
      ? ` (🎨 1P: ${p1Player.nickname} / 🕹️ 2P: ${p2Player.nickname})`
      : '';

    const maxRounds = Config.MAX_ROUNDS || 3;
    const turns = getTurnsPerRound();
    addChatMessage('', `🎨 제시어 선택 완료! ROUND ${State.currentRound}/${maxRounds} (차례 ${State.currentTurn}/${turns}) 드로잉 시작!${roleSummary}`, 'system');
    if (Sound) Sound.playRoundStart();

    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      if (State.gameState !== 'PLAYING') return;
      State.timeLeft--;
      updateTimerDisplay(State.timeLeft, 60);

      if (State.timeLeft <= 10 && State.timeLeft > 0) {
        if (Sound) Sound.playTick(State.timeLeft <= 3);
      }

      if (State.timeLeft === 20) {
        const wordLen = State.currentPrompt.word.length;
        const masked = State.currentPrompt.word.replace(/[^\s]/g, '❓');
        addChatMessage('', `💡 [글자 수 힌트] 제시어는 ${wordLen}글자입니다! (${masked})`, 'hint');
        if (Sound) Sound.playHint();
        updatePromptVisibility();
      }

      if (State.timeLeft <= 0) {
        addChatMessage('', `⏰ 시간 초과! 정답은 [${State.currentPrompt.word}] 였습니다.`, 'system');
        endRound(false, null, 0, false);
      }
    }, 1000);
  }

  function endRound(isSuccess, winnerName, remainSeconds = State.timeLeft, skipRosterAward = false) {
    if (State.gameState !== 'PLAYING') return;
    State.gameState = 'ROUND_END';
    Network.updateCoopUIVisibility();
    if (timerInterval) clearInterval(timerInterval);
    if (resultModalTimeout) clearTimeout(resultModalTimeout);
    updateTimerDisplay(isSuccess ? '정답!' : '시간초과');

    const turnsPerRound = getTurnsPerRound();
    const maxRounds = Config.MAX_ROUNDS || 3;
    const isRoundEnd = State.currentTurn >= turnsPerRound;
    const isGameOver = isRoundEnd && State.currentRound >= maxRounds;

    const modalEl = document.getElementById('result-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalDesc = document.getElementById('modal-desc');
    const btnNext = document.getElementById('btn-next-round');

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
      if (Sound) Sound.playWin();
      modalTitle.textContent = '🎉 정답 판정 성공!';
      modalTitle.className = 'text-2xl font-black text-emerald-400 mb-1';
      modalDesc.innerHTML =
        `👀 정답자 <b>${winnerName || '플레이어'}</b>: <b class="text-emerald-400">+${earned}점</b><br>` +
        `🤝 1P·2P 협동 보너스 (${coopNames || '1P & 2P'}): <b class="text-sky-400">+${coopBonus}점</b><br>` +
        `제시어: <b class="text-amber-300">${State.currentPrompt.word}</b>`;
    } else {
      if (Sound) Sound.playTimeUp();
      modalTitle.textContent = '⏰ 아쉽게 시간 초과!';
      modalTitle.className = 'text-2xl font-black text-rose-500 mb-1';
      modalDesc.innerHTML = `정답자가 나오지 않았습니다.<br>제시어: <b class="text-amber-300">${State.currentPrompt.word}</b>`;
    }

    // 다음 버튼 텍스트와 스타일을 라운드 진행도에 따라 스마트하게 분기
    if (btnNext) {
      if (isGameOver) {
        btnNext.innerHTML = '🏆 최종 순위 발표 ▶';
        btnNext.className = 'bg-gradient-to-r from-amber-500 to-pink-500 hover:from-amber-400 hover:to-pink-400 text-slate-950 font-black px-5 py-2.5 rounded-xl text-xs sm:text-sm transition shadow-lg animate-pulse';
      } else if (isRoundEnd) {
        btnNext.innerHTML = `🎉 ROUND ${State.currentRound + 1} 시작 ▶`;
        btnNext.className = 'bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-400 hover:to-purple-500 text-white font-extrabold px-5 py-2.5 rounded-xl text-xs sm:text-sm transition shadow-lg';
      } else {
        btnNext.innerHTML = `다음 차례 ▶ (${State.currentTurn + 1}/${turnsPerRound})`;
        btnNext.className = 'bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-5 py-2.5 rounded-xl text-xs sm:text-sm transition shadow-lg';
      }
    }

    document.getElementById('result-img').src = drawCanvas.toDataURL('image/png');
    resultModalTimeout = setTimeout(() => {
      if (State.gameState === 'ROUND_END') {
        modalEl.classList.remove('hidden');
        modalEl.classList.add('flex');
      }
    }, isSuccess ? 1200 : 350);
  }

  // 최종 3라운드 완료 후 시상식 & 리더보드 모달 오픈
  function showFinalLeaderboard(rosterOverride = null) {
    State.gameState = 'GAME_OVER';
    Network.updateCoopUIVisibility();
    if (timerInterval) clearInterval(timerInterval);
    if (wordChoiceInterval) clearInterval(wordChoiceInterval);
    if (resultModalTimeout) clearTimeout(resultModalTimeout);

    document.getElementById('result-modal').classList.add('hidden');
    document.getElementById('result-modal').classList.remove('flex');
    document.getElementById('word-select-modal').classList.add('hidden');
    document.getElementById('word-select-modal').classList.remove('flex');

    if (Array.isArray(rosterOverride)) {
      State.playerRoster = rosterOverride;
      Network.renderPlayerRoster();
    }

    const sortedRoster = [...State.playerRoster].sort((a, b) => (b.score || 0) - (a.score || 0));
    const listEl = document.getElementById('final-roster-list');
    const mvpTextEl = document.getElementById('final-mvp-text');
    const modalEl = document.getElementById('final-leaderboard-modal');

    const winner = sortedRoster[0];
    if (mvpTextEl && winner) {
      mvpTextEl.innerHTML = `🥇 영광의 1위: <b class="text-amber-300 font-black text-base">${winner.nickname}</b> (<span class="text-emerald-400 font-extrabold">${winner.score || 0}점</span>)! 축하합니다!`;
    }

    if (listEl) {
      listEl.innerHTML = '';
      const medals = ['🥇 1위', '🥈 2위', '🥉 3위'];
      const badgeColors = [
        'bg-amber-400 text-slate-950 border-amber-300',
        'bg-slate-300 text-slate-950 border-slate-200',
        'bg-amber-700 text-amber-100 border-amber-600'
      ];

      sortedRoster.forEach((p, idx) => {
        const isWinner = idx === 0;
        const medalBadge = medals[idx] || `${idx + 1}위`;
        const colorCls = badgeColors[idx] || 'bg-slate-800 text-slate-300 border-white/10';

        const item = document.createElement('div');
        item.className = `flex items-center justify-between p-3 rounded-2xl border transition ${
          isWinner
            ? 'bg-gradient-to-r from-amber-500/15 via-pink-500/10 to-transparent border-amber-400/50 shadow-md'
            : 'bg-white/5 border-white/10'
        }`;
        item.innerHTML = `
          <div class="flex items-center gap-2.5">
            <span class="text-[11px] font-black px-2 py-0.5 rounded-lg border ${colorCls}">${medalBadge}</span>
            <div class="w-4 h-4 rounded-full border border-white/40 shadow-sm" style="background-color: ${p.custom?.color || '#ec4899'}"></div>
            <span class="font-extrabold text-sm ${isWinner ? 'text-amber-200' : 'text-white'}">${p.nickname}</span>
          </div>
          <div class="text-right">
            <span class="font-black text-sm text-emerald-400">${p.score || 0}점</span>
          </div>
        `;
        listEl.appendChild(item);
      });
    }

    Scene3D.spawnConfettiExplosion();
    if (Sound) Sound.playWin();

    addChatMessage('', `🏆 [게임 종료] 총 3라운드(모든 참가자 3바퀴) 대장정이 완료되었습니다! 🥇 최종 우승: ${winner?.nickname || '플레이어'} (${winner?.score || 0}점)`, 'system');

    if (modalEl) {
      modalEl.classList.remove('hidden');
      modalEl.classList.add('flex');
    }
  }

  // 최종 리더보드 모달 버튼 이벤트 바인딩
  document.getElementById('btn-final-to-lobby')?.addEventListener('click', () => {
    const modalEl = document.getElementById('final-leaderboard-modal');
    if (modalEl) {
      modalEl.classList.add('hidden');
      modalEl.classList.remove('flex');
    }
    Network.openMultiModal();
  });

  document.getElementById('btn-final-restart')?.addEventListener('click', () => {
    const modalEl = document.getElementById('final-leaderboard-modal');
    if (modalEl) {
      modalEl.classList.add('hidden');
      modalEl.classList.remove('flex');
    }

    State.currentRound = 1;
    State.currentTurn = 1;
    State.playerRoster.forEach(p => { p.score = 0; });
    Network.renderPlayerRoster();
    updateRoundBadge();

    State.candidatePromptIndices = Config.pickThreeRandomPromptIndices(-1);

    Network.sendNetworkPacket({
      type: 'START_GAME',
      round: 1,
      turn: 1,
      maxRounds: Config.MAX_ROUNDS || 3,
      candidateIndices: State.candidatePromptIndices,
      roster: State.playerRoster
    });

    addChatMessage('', `🔄 새 게임 시작! 총 3라운드 레이스를 다시 출발합니다!`, 'system');
    startWordSelectionPhase(false, State.candidatePromptIndices);
  });

  document.getElementById('btn-next-round')?.addEventListener('click', () => {
    const turnsPerRound = getTurnsPerRound();
    const maxRounds = Config.MAX_ROUNDS || 3;
    const isRoundEnd = State.currentTurn >= turnsPerRound;
    const isGameOver = isRoundEnd && State.currentRound >= maxRounds;

    document.getElementById('result-modal').classList.add('hidden');
    document.getElementById('result-modal').classList.remove('flex');

    if (isGameOver) {
      showFinalLeaderboard();
      Network.sendNetworkPacket({
        type: 'GAME_OVER',
        roster: State.playerRoster
      });
      return;
    }

    proceedToNextTurnOrRound(false);
  });

  document.getElementById('btn-save')?.addEventListener('click', () => {
    const link = document.createElement('a');
    link.download = `banban-round-${State.currentRound}-turn-${State.currentTurn}.png`;
    link.href = drawCanvas.toDataURL('image/png');
    link.click();
  });

  // ==========================================
  // 👥 팀 모드 (Team Mode) 시스템 구현
  // ==========================================
  let teamReplayTimer = null;
  let teamRecordInterval = null;

  function setGameMode(mode, fromNetwork = false) {
    State.gameMode = mode;
    const btnRelay = document.getElementById('btn-mode-relay');
    const btnTeam = document.getElementById('btn-mode-team');
    const badge = document.getElementById('current-mode-badge');
    const explain = document.getElementById('mode-explain-text');

    if (mode === 'TEAM') {
      btnTeam?.classList.remove('bg-[#181d2a]', 'text-slate-300', 'border-white/10');
      btnTeam?.classList.add('bg-cyan-600', 'text-white', 'border-2', 'border-cyan-400');
      btnRelay?.classList.remove('bg-pink-600', 'text-white', 'border-2', 'border-pink-400');
      btnRelay?.classList.add('bg-[#181d2a]', 'text-slate-300', 'border-white/10');

      if (badge) {
        badge.className = 'text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40';
        badge.textContent = '👥 팀 모드 (2인전)';
      }
      if (explain) {
        explain.innerHTML = '<b>👥 팀 모드:</b> 2명씩 팀을 이뤄 각자 3번씩 동시에 그림을 그리고(서브룸), 이후 다른 팀의 이동 입력을 리플레이로 보며 정답을 맞힙니다. 홀수 인원은 깍두기로 전 방 자유 관전!';
      }
      addChatMessage('', '🎮 게임 모드가 [👥 팀 모드 (2인 팀전)]로 변경되었습니다.', 'system');
    } else {
      btnRelay?.classList.remove('bg-[#181d2a]', 'text-slate-300', 'border-white/10');
      btnRelay?.classList.add('bg-pink-600', 'text-white', 'border-2', 'border-pink-400');
      btnTeam?.classList.remove('bg-cyan-600', 'text-white', 'border-2', 'border-cyan-400');
      btnTeam?.classList.add('bg-[#181d2a]', 'text-slate-300', 'border-white/10');

      if (badge) {
        badge.className = 'text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-pink-500/20 text-pink-300 border border-pink-500/40';
        badge.textContent = '🏃‍♂️ 릴레이 모드';
      }
      if (explain) {
        explain.innerHTML = '<b>🏃‍♂️ 릴레이 모드:</b> 플레이어가 한 번씩 로테이션해가며 라운드를 진행하고 최종 개인 점수를 비교합니다.';
      }
      addChatMessage('', '🎮 게임 모드가 [🏃‍♂️ 릴레이 모드 (개인 순환)]로 변경되었습니다.', 'system');
    }

    updateRoundBadge();

    if (!fromNetwork && State.isP2PHost) {
      Network.sendNetworkPacket({
        type: 'SET_GAME_MODE',
        mode
      });
    }
  }

  function initTeamModeUI() {
    document.getElementById('btn-mode-relay')?.addEventListener('click', () => {
      if (State.isP2PConnected && !State.isP2PHost) {
        addChatMessage('', '⚠️ 게임 모드 변경은 방장만 가능합니다!', 'system');
        return;
      }
      setGameMode('RELAY');
    });

    document.getElementById('btn-mode-team')?.addEventListener('click', () => {
      if (State.isP2PConnected && !State.isP2PHost) {
        addChatMessage('', '⚠️ 게임 모드 변경은 방장만 가능합니다!', 'system');
        return;
      }
      setGameMode('TEAM');
    });

    document.getElementById('btn-kkaktugi-view-a')?.addEventListener('click', () => {
      switchKkaktugiRoom('teamA');
    });
    document.getElementById('btn-kkaktugi-view-b')?.addEventListener('click', () => {
      switchKkaktugiRoom('teamB');
    });

    document.getElementById('btn-team-to-lobby')?.addEventListener('click', () => {
      document.getElementById('team-result-modal')?.classList.add('hidden');
      document.getElementById('team-result-modal')?.classList.remove('flex');
      Network.openMultiModal();
    });
    document.getElementById('btn-team-restart')?.addEventListener('click', () => {
      document.getElementById('team-result-modal')?.classList.add('hidden');
      document.getElementById('team-result-modal')?.classList.remove('flex');
      startTeamGame();
    });
  }

  function switchKkaktugiRoom(room) {
    State.teamModeState.activeSpectatorRoom = room;
    const btnA = document.getElementById('btn-kkaktugi-view-a');
    const btnB = document.getElementById('btn-kkaktugi-view-b');
    if (room === 'teamA') {
      btnA?.classList.remove('bg-slate-800', 'text-slate-300', 'border', 'border-white/10');
      btnA?.classList.add('bg-pink-600', 'text-white');
      btnB?.classList.remove('bg-cyan-600', 'text-white');
      btnB?.classList.add('bg-slate-800', 'text-slate-300', 'border', 'border-white/10');
      Scene3D.setActiveDrawingBoardTexture('teamA');
      addChatMessage('', '👀 [A팀 작업실]로 시점을 전환했습니다.', 'system');
    } else {
      btnB?.classList.remove('bg-slate-800', 'text-slate-300', 'border', 'border-white/10');
      btnB?.classList.add('bg-cyan-600', 'text-white');
      btnA?.classList.remove('bg-pink-600', 'text-white');
      btnA?.classList.add('bg-slate-800', 'text-slate-300', 'border', 'border-white/10');
      Scene3D.setActiveDrawingBoardTexture('teamB');
      addChatMessage('', '👀 [B팀 작업실]로 시점을 전환했습니다.', 'system');
    }
  }

  function setupTeamsAndWords() {
    const roster = [...State.playerRoster];
    let teamA_members = [];
    let teamB_members = [];
    let kkaktugi = null;

    if (roster.length >= 4) {
      teamA_members = roster.slice(0, 2);
      teamB_members = roster.slice(2, 4);
      if (roster.length % 2 !== 0) {
        kkaktugi = roster[roster.length - 1];
      }
    } else if (roster.length === 3) {
      teamA_members = roster.slice(0, 2);
      kkaktugi = roster[2];
      teamB_members = [
        { id: 'bot-b1', nickname: '소다봇1', role: 'P1', score: 0, custom: { color: '#06b6d4', hat: 'HELMET', face: 'NORMAL' } },
        { id: 'bot-b2', nickname: '소다봇2', role: 'P2', score: 0, custom: { color: '#38bdf8', hat: 'PROPELLER', face: 'COOL' } }
      ];
    } else if (roster.length === 2) {
      teamA_members = roster.slice(0, 2);
      teamB_members = [
        { id: 'bot-b1', nickname: '소다봇1', role: 'P1', score: 0, custom: { color: '#06b6d4', hat: 'HELMET', face: 'NORMAL' } },
        { id: 'bot-b2', nickname: '소다봇2', role: 'P2', score: 0, custom: { color: '#38bdf8', hat: 'PROPELLER', face: 'COOL' } }
      ];
    } else {
      teamA_members = [
        roster[0] || { id: 'local-1', nickname: State.myNickname, role: 'P1', score: 0, custom: State.myCustom },
        { id: 'bot-a2', nickname: '체리봇', role: 'P2', score: 0, custom: { color: '#ec4899', hat: 'BERET', face: 'HAPPY' } }
      ];
      teamB_members = [
        { id: 'bot-b1', nickname: '소다봇1', role: 'P1', score: 0, custom: { color: '#06b6d4', hat: 'HELMET', face: 'NORMAL' } },
        { id: 'bot-b2', nickname: '소다봇2', role: 'P2', score: 0, custom: { color: '#38bdf8', hat: 'PROPELLER', face: 'COOL' } }
      ];
    }

    const wordPool = Config.WORD_POOL;
    const shuffled = [...wordPool].sort(() => Math.random() - 0.5);
    const wordsA = shuffled.slice(0, 3);
    const wordsB = shuffled.slice(3, 6);

    return { teamA_members, teamB_members, kkaktugi, wordsA, wordsB };
  }

  function startTeamGame() {
    const setup = setupTeamsAndWords();
    const packet = {
      type: 'TEAM_SETUP',
      teamA_members: setup.teamA_members,
      teamB_members: setup.teamB_members,
      kkaktugi: setup.kkaktugi,
      wordsA: setup.wordsA,
      wordsB: setup.wordsB
    };

    applyTeamSetup(packet);
    Network.sendNetworkPacket(packet);

    startTeamDrawingStep(0);
  }

  function applyTeamSetup(data) {
    const myId = State.isP2PConnected ? State.myPeerId : 'local-1';
    const ts = State.teamModeState;
    ts.teams.teamA.members = data.teamA_members || [];
    ts.teams.teamB.members = data.teamB_members || [];
    ts.teams.teamA.words = data.wordsA || [];
    ts.teams.teamB.words = data.wordsB || [];
    ts.teams.teamA.score = 0;
    ts.teams.teamB.score = 0;
    ts.teams.teamA.drawings = [];
    ts.teams.teamB.drawings = [];
    ts.kkaktugiMember = data.kkaktugi;

    const inA = ts.teams.teamA.members.find(m => m.id === myId);
    const inB = ts.teams.teamB.members.find(m => m.id === myId);
    const isK = ts.kkaktugiMember && ts.kkaktugiMember.id === myId;

    if (isK) {
      ts.myTeam = 'kkaktugi';
      ts.isKkaktugi = true;
      setMode('SPECTATOR', 'mode-spec');
      document.getElementById('kkaktugi-bar')?.classList.remove('hidden');
      document.getElementById('kkaktugi-bar')?.classList.add('flex');
    } else if (inA) {
      ts.myTeam = 'teamA';
      ts.isKkaktugi = false;
      document.getElementById('kkaktugi-bar')?.classList.add('hidden');
      document.getElementById('kkaktugi-bar')?.classList.remove('flex');
      const idx = ts.teams.teamA.members.indexOf(inA);
      setMode(idx === 0 ? 'P1' : 'P2', idx === 0 ? 'mode-p1' : 'mode-p2');
    } else if (inB) {
      ts.myTeam = 'teamB';
      ts.isKkaktugi = false;
      document.getElementById('kkaktugi-bar')?.classList.add('hidden');
      document.getElementById('kkaktugi-bar')?.classList.remove('flex');
      const idx = ts.teams.teamB.members.indexOf(inB);
      setMode(idx === 0 ? 'P1' : 'P2', idx === 0 ? 'mode-p1' : 'mode-p2');
    } else {
      ts.myTeam = 'spectator';
      ts.isKkaktugi = true;
      setMode('SPECTATOR', 'mode-spec');
    }

    addChatMessage('', `👥 [팀 모드 편성 완료] A팀(${ts.teams.teamA.members.map(m=>m.nickname).join(', ')}) vs B팀(${ts.teams.teamB.members.map(m=>m.nickname).join(', ')})${ts.kkaktugiMember ? ` · 깍두기: [${ts.kkaktugiMember.nickname}]` : ''}`, 'system');
  }

  function startTeamDrawingStep(stepIdx) {
    if (timerInterval) clearInterval(timerInterval);
    if (teamRecordInterval) clearInterval(teamRecordInterval);

    State.gameState = 'PLAYING';
    const ts = State.teamModeState;
    ts.phase = 'DRAWING';
    ts.drawIndex = stepIdx;
    ts.recordedActionsThisRound = [];

    Scene3D.clearCanvas();
    Scene3D.clearTeamCanvas('teamA');
    Scene3D.clearTeamCanvas('teamB');

    if (ts.myTeam === 'teamA') {
      Scene3D.setActiveDrawingBoardTexture('teamA');
    } else if (ts.myTeam === 'teamB') {
      Scene3D.setActiveDrawingBoardTexture('teamB');
    } else {
      Scene3D.setActiveDrawingBoardTexture(ts.activeSpectatorRoom || 'teamA');
    }

    const myWordA = ts.teams.teamA.words[stepIdx];
    const myWordB = ts.teams.teamB.words[stepIdx];

    const promptTextEl = document.getElementById('prompt-text');
    if (promptTextEl) {
      if (ts.myTeam === 'teamA') {
        promptTextEl.innerHTML = `🎨 제시어: <span class="text-pink-300 font-black">${myWordA?.word || '그림'}</span> <span class="text-xs text-yellow-300">(${stepIdx + 1}/3회차)</span>`;
      } else if (ts.myTeam === 'teamB') {
        promptTextEl.innerHTML = `🎨 제시어: <span class="text-cyan-300 font-black">${myWordB?.word || '그림'}</span> <span class="text-xs text-yellow-300">(${stepIdx + 1}/3회차)</span>`;
      } else {
        promptTextEl.innerHTML = `👀 깍두기 관전 중 <span class="text-xs text-amber-300">(${stepIdx + 1}/3회차)</span>`;
      }
    }

    updateRoundBadge();

    State.timeLeft = ts.drawDuration || 45;
    updateTimerDisplay(`${State.timeLeft}s`);

    addChatMessage('', `🎨 [팀 동시 드로잉 ${stepIdx + 1}/3회차] 시작! 각 팀은 45초 동안 제시어를 그림으로 그려주세요! (이동 입력이 자동 레코딩됩니다)`, 'system');

    teamRecordInterval = setInterval(() => {
      recordCurrentTeamFrame();
    }, 80);

    timerInterval = setInterval(() => {
      State.timeLeft--;
      updateTimerDisplay(`${State.timeLeft}s`);
      if (State.timeLeft <= 0) {
        clearInterval(timerInterval);
        clearInterval(teamRecordInterval);
        finishTeamDrawingStep(stepIdx);
      }
    }, 1000);
  }

  function recordCurrentTeamFrame() {
    const ts = State.teamModeState;
    if (ts.phase !== 'DRAWING') return;
    const { p1Obj, p2Obj } = Scene3D.getSceneObjects();
    if (!p1Obj || !p2Obj) return;

    ts.recordedActionsThisRound.push({
      p1: {
        x: p1Obj.group.position.x,
        y: State.p1State.y || 0,
        z: p1Obj.group.position.z,
        vx: State.p1State.vx || 0,
        vz: State.p1State.vz || 0
      },
      p2: {
        x: p2Obj.group.position.x,
        y: State.p2State.y || 0,
        z: p2Obj.group.position.z,
        vx: State.p2State.vx || 0,
        vz: State.p2State.vz || 0
      },
      isPenDown: Boolean(State.isPenDown),
      colorHex: State.activeColorHex,
      brushSizeIdx: State.brushSizeIdx,
      drawStroke: (State.isPenDown && State.p1State.prevX !== null) ? {
        fromX: State.p1State.prevX,
        fromZ: State.p1State.prevZ,
        toX: p1Obj.group.position.x,
        toZ: p1Obj.group.position.z,
        color: State.activeColorHex,
        size: (Config.BRUSH_SIZES[State.brushSizeIdx] || Config.BRUSH_SIZES[1]).radius * 2
      } : null
    });
  }

  function finishTeamDrawingStep(stepIdx) {
    if (timerInterval) clearInterval(timerInterval);
    if (teamRecordInterval) clearInterval(teamRecordInterval);

    const ts = State.teamModeState;
    const actions = [...ts.recordedActionsThisRound];

    if (ts.myTeam === 'teamA' || (!State.isP2PConnected && !ts.teams.teamA.drawings[stepIdx])) {
      ts.teams.teamA.drawings[stepIdx] = {
        stepIdx,
        word: ts.teams.teamA.words[stepIdx]?.word || '그림',
        actions: actions
      };
    }
    if (ts.myTeam === 'teamB' || (!State.isP2PConnected && !ts.teams.teamB.drawings[stepIdx])) {
      ts.teams.teamB.drawings[stepIdx] = {
        stepIdx,
        word: ts.teams.teamB.words[stepIdx]?.word || '그림',
        actions: actions
      };
    }

    addChatMessage('', `✅ [${stepIdx + 1}/3회차 드로잉 완료!] 이동 입력과 그림 저장이 완료되었습니다.`, 'system');

    if (stepIdx < 2) {
      setTimeout(() => {
        startTeamDrawingStep(stepIdx + 1);
      }, 2500);
    } else {
      setTimeout(() => {
        addChatMessage('', `🎉 모든 팀이 3번의 드로잉을 모두 완료했습니다! 이제 [상대 팀 그림 맞추기] 단계로 돌입합니다!`, 'correct');
        startTeamGuessingPhase();
      }, 3000);
    }
  }

  function startTeamGuessingPhase() {
    const ts = State.teamModeState;
    ts.phase = 'GUESSING';
    document.getElementById('kkaktugi-bar')?.classList.add('hidden');
    document.getElementById('kkaktugi-bar')?.classList.remove('flex');

    ts.guessSteps = [
      { authorTeam: 'teamA', guessTeam: 'teamB', drawIdx: 0 },
      { authorTeam: 'teamA', guessTeam: 'teamB', drawIdx: 1 },
      { authorTeam: 'teamA', guessTeam: 'teamB', drawIdx: 2 },
      { authorTeam: 'teamB', guessTeam: 'teamA', drawIdx: 0 },
      { authorTeam: 'teamB', guessTeam: 'teamA', drawIdx: 1 },
      { authorTeam: 'teamB', guessTeam: 'teamA', drawIdx: 2 }
    ];

    startTeamGuessStep(0);
  }

  function startTeamGuessStep(stepIdx) {
    if (timerInterval) clearInterval(timerInterval);
    if (teamReplayTimer) clearInterval(teamReplayTimer);

    const ts = State.teamModeState;
    if (stepIdx >= ts.guessSteps.length) {
      showTeamFinalResults();
      return;
    }

    ts.currentGuessStep = stepIdx;
    const stepInfo = ts.guessSteps[stepIdx];
    const authorTeamData = ts.teams[stepInfo.authorTeam];
    const guessTeamData = ts.teams[stepInfo.guessTeam];
    const drawData = authorTeamData.drawings[stepInfo.drawIdx];
    const targetWord = authorTeamData.words[stepInfo.drawIdx]?.word || '사과';

    Scene3D.clearCanvas();
    Scene3D.setActiveDrawingBoardTexture('MAIN');

    updateRoundBadge();

    const isMyTeamGuessing = (ts.myTeam === stepInfo.guessTeam);
    const promptTextEl = document.getElementById('prompt-text');
    if (promptTextEl) {
      if (ts.isKkaktugi) {
        promptTextEl.innerHTML = `👀 [깍두기 관전] 정답: <span class="text-amber-300 font-bold">${targetWord}</span> (${guessTeamData.name} 차례)`;
      } else if (isMyTeamGuessing) {
        const masked = '❓'.repeat(targetWord.length);
        promptTextEl.innerHTML = `🎯 [우리 팀 정답 맞추기] ${masked} <span class="text-xs text-yellow-300">(${targetWord.length}글자)</span>`;
      } else {
        promptTextEl.innerHTML = `🎨 [우리 팀이 출제한 그림] 정답: <span class="text-pink-300 font-black">${targetWord}</span>`;
      }
    }

    addChatMessage('', `🎯 [퀴즈 ${stepIdx + 1}/6] ${authorTeamData.name}가 그렸던 그림이 리플레이 재생됩니다! 👉 [${guessTeamData.name}]가 정답을 맞혀주세요!`, 'system');

    // 🎬 이동 입력 리플레이 재생 (저장된 actions를 시간차를 두고 순차 실행)
    const actions = (drawData && drawData.actions) ? drawData.actions : [];
    let actionIdx = 0;
    if (actions.length > 0) {
      teamReplayTimer = setInterval(() => {
        if (actionIdx < actions.length) {
          Scene3D.playReplayAction(actions[actionIdx], 'MAIN');
          actionIdx++;
        } else {
          clearInterval(teamReplayTimer);
        }
      }, 50);
    }

    State.timeLeft = ts.guessDuration || 40;
    updateTimerDisplay(`${State.timeLeft}s`);

    timerInterval = setInterval(() => {
      State.timeLeft--;
      updateTimerDisplay(`${State.timeLeft}s`);
      if (State.timeLeft <= 0) {
        clearInterval(timerInterval);
        clearInterval(teamReplayTimer);
        addChatMessage('', `⏰ 시간 초과! 아쉽게도 정답 [${targetWord}]을 맞히지 못했습니다!`, 'system');
        setTimeout(() => {
          startTeamGuessStep(stepIdx + 1);
        }, 3000);
      }
    }, 1000);
  }

  function handleTeamGuessInput(senderName, rawText) {
    const ts = State.teamModeState;
    if (ts.phase !== 'GUESSING') return;

    const stepInfo = ts.guessSteps[ts.currentGuessStep];
    if (!stepInfo) return;

    const authorTeamData = ts.teams[stepInfo.authorTeam];
    const guessTeamData = ts.teams[stepInfo.guessTeam];
    const targetWord = authorTeamData.words[stepInfo.drawIdx]?.word || '';

    // 1) 깍두기 체크
    if (ts.isKkaktugi) {
      addChatMessage('', '👀 깍두기는 관전 전용 모드이므로 정답을 제출할 수 없습니다! (채팅만 가능)', 'system');
      Network.sendNetworkPacket({ type: 'CHAT', sender: senderName, text: rawText, timeLeft: State.timeLeft });
      addChatMessage(senderName, rawText);
      return;
    }

    // 2) 출제 팀원 체크
    if (ts.myTeam === stepInfo.authorTeam) {
      addChatMessage('', '⚠️ 본인 팀이 출제한 문제는 정답을 직접 채팅으로 맞힐 수 없습니다!', 'system');
      Network.sendNetworkPacket({ type: 'CHAT', sender: senderName, text: rawText, timeLeft: State.timeLeft });
      addChatMessage(senderName, rawText);
      return;
    }

    // 3) 맞추는 팀 정답 판정
    if (normalizeAnswer(rawText) === normalizeAnswer(targetWord)) {
      if (timerInterval) clearInterval(timerInterval);
      if (teamReplayTimer) clearInterval(teamReplayTimer);

      const earned = 100 + State.timeLeft * 2;
      guessTeamData.score += earned;

      addChatMessage('', `🎊 [${senderName}]님이 상대 팀의 움직임 리플레이를 보고 정답 [${targetWord}]을 맞혔습니다! (+${earned}점)`, 'correct');
      Scene3D.spawnConfettiExplosion();
      if (Sound) Sound.playWin();

      Network.sendNetworkPacket({
        type: 'TEAM_ROUND_WIN',
        winnerName: senderName,
        targetWord,
        earned,
        guessTeam: stepInfo.guessTeam,
        stepIdx: ts.currentGuessStep
      });

      setTimeout(() => {
        startTeamGuessStep(ts.currentGuessStep + 1);
      }, 3500);
    } else {
      Network.sendNetworkPacket({ type: 'CHAT', sender: senderName, text: rawText, timeLeft: State.timeLeft });
      addChatMessage(senderName, rawText);
    }
  }

  function handleRemoteTeamRoundWin(data) {
    const ts = State.teamModeState;
    if (timerInterval) clearInterval(timerInterval);
    if (teamReplayTimer) clearInterval(teamReplayTimer);

    if (data.guessTeam && ts.teams[data.guessTeam]) {
      ts.teams[data.guessTeam].score += (data.earned || 100);
    }
    addChatMessage('', `🎊 [${data.winnerName}]님이 정답 [${data.targetWord}]을 맞혔습니다! (+${data.earned}점)`, 'correct');
    Scene3D.spawnConfettiExplosion();
    if (Sound) Sound.playWin();

    setTimeout(() => {
      startTeamGuessStep((data.stepIdx ?? ts.currentGuessStep) + 1);
    }, 3500);
  }

  function showTeamFinalResults() {
    if (timerInterval) clearInterval(timerInterval);
    if (teamReplayTimer) clearInterval(teamReplayTimer);

    const ts = State.teamModeState;
    ts.phase = 'FINAL_RESULT';
    State.gameState = 'ROUND_END';

    const scoreA = ts.teams.teamA.score;
    const scoreB = ts.teams.teamB.score;

    const winnerTitle = document.getElementById('team-winner-title');
    const winnerSub = document.getElementById('team-winner-sub');
    const scoreAEl = document.getElementById('team-a-final-score');
    const scoreBEl = document.getElementById('team-b-final-score');
    const membersAEl = document.getElementById('team-a-members-list');
    const membersBEl = document.getElementById('team-b-members-list');
    const kkaktugiNotice = document.getElementById('kkaktugi-notice');

    if (scoreAEl) scoreAEl.textContent = `${scoreA}점`;
    if (scoreBEl) scoreBEl.textContent = `${scoreB}점`;
    if (membersAEl) membersAEl.textContent = ts.teams.teamA.members.map(m=>m.nickname).join(', ');
    if (membersBEl) membersBEl.textContent = ts.teams.teamB.members.map(m=>m.nickname).join(', ');

    if (ts.kkaktugiMember && kkaktugiNotice) {
      kkaktugiNotice.classList.remove('hidden');
      kkaktugiNotice.textContent = `✨ 깍두기 [${ts.kkaktugiMember.nickname}]님이 두 방을 자유롭게 둘러보며 열렬히 응원해주었습니다!`;
    }

    if (scoreA > scoreB) {
      if (winnerTitle) winnerTitle.textContent = `🏆 A팀 (체리 핑크) 대승리!`;
      if (winnerSub) winnerSub.textContent = `A팀이 ${scoreA}점 vs ${scoreB}점으로 B팀을 꺾고 우승을 차지했습니다!`;
    } else if (scoreB > scoreA) {
      if (winnerTitle) winnerTitle.textContent = `🏆 B팀 (소다 시안) 대승리!`;
      if (winnerSub) winnerSub.textContent = `B팀이 ${scoreB}점 vs ${scoreA}점으로 A팀을 꺾고 우승을 차지했습니다!`;
    } else {
      if (winnerTitle) winnerTitle.textContent = `🤝 멋진 명승부! 무승부!`;
      if (winnerSub) winnerSub.textContent = `양 팀 모두 ${scoreA}점으로 팽팽한 호각의 승부를 펼쳤습니다!`;
    }

    Scene3D.spawnConfettiExplosion();
    if (Sound) Sound.playWin();

    const modalEl = document.getElementById('team-result-modal');
    if (modalEl) {
      modalEl.classList.remove('hidden');
      modalEl.classList.add('flex');
    }
  }

  // 6. 네트워크/대기방 & 커스터마이징 UI 초기화
  initCustomizerUI();
  initTeamModeUI();
  Network.initNetworkAndLobby({
    onAddChatMessage: addChatMessage,
    onEndRound: endRound,
    onStartWordSelection: startWordSelectionPhase,
    onWordSelected: startPlayingRound,
    onPauseForWaitingRoom: pauseForWaitingRoom,
    onOpenCustomizer: openCustomizerModal,
    onSetMode: setMode,
    onGameOver: showFinalLeaderboard,
    onUpdateRoundDisplay: updateRoundBadge,
    onSetGameMode: (mode) => setGameMode(mode, true),
    onStartTeamGame: startTeamGame,
    onTeamSetup: applyTeamSetup,
    onTeamStartDraw: (data) => startTeamDrawingStep(data.stepIdx),
    onTeamStepFinish: (data) => finishTeamDrawingStep(data.stepIdx),
    onTeamStartGuess: (data) => startTeamGuessStep(data.stepIdx),
    onTeamRoundWin: handleRemoteTeamRoundWin,
    normalizeAnswer
  });

  // 최초 접속 시 대기화면(LOBBY) 상태 세팅
  if (p1Obj?.group) p1Obj.group.position.set(0, 0, 2.2);
  if (p2Obj?.group) p2Obj.group.position.set(0.0, 0, -8.6);
  updateRoundBadge();
  updateTimerDisplay('대기중');
  updatePromptVisibility();
  updateBrushSizeUI();
  initCoopEmoteButtons();
  addChatMessage('', '✨ 반반 무마니 3D에 오신 것을 환영합니다! 대기화면에서 내 캐릭터를 꾸미고 시작해 보세요.', 'system');

  // 1P ↔ 2P 비밀 협동 이모티콘 버튼 초기화
  function initCoopEmoteButtons() {
    const container = document.getElementById('coop-emote-buttons');
    if (!container) return;
    container.innerHTML = '';

    (Config.COOP_EMOTES || []).forEach(e => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'flex items-center gap-1 bg-white/10 hover:bg-pink-500/30 text-white px-2 py-1 rounded-xl text-xs font-bold border border-white/15 transition active:scale-95 shadow-sm';
      btn.title = `[단축키 ${e.key}] ${e.text}`;
      btn.innerHTML = `<span class="text-[10px] bg-black/40 text-pink-300 font-extrabold px-1 rounded">${e.key}</span><span>${e.icon}</span><span class="hidden sm:inline text-[11px] font-semibold text-slate-200">${e.shortLabel || e.label}</span>`;
      btn.addEventListener('click', (evt) => {
        evt.stopPropagation();
        Network.sendCoopEmote(e.id);
      });
      container.appendChild(btn);
    });
  }

  // 7. 키보드 및 마우스/터치 입력
  window.addEventListener('keydown', (e) => {
    // ⌨️ Enter 키로 채팅 모드 전환 (채팅 모드일 땐 이동 정지, 아닐 땐 이동)
    if (e.code === 'Enter') {
      if (!State.isTypingChat) {
        e.preventDefault();
        chatInputEl?.focus();
        State.isTypingChat = true;
        clearAllKeys();
        updateChatFocusIndicator(true);
        return;
      }
    }

    if (e.code === 'Escape' && State.isTypingChat) {
      chatInputEl?.blur();
      State.isTypingChat = false;
      updateChatFocusIndicator(false);
      return;
    }

    if (State.isTypingChat) return;

    if (e.code === 'Space') {
      e.preventDefault();
    }
    keys[e.code] = true;

    // 1P ↔ 2P 비밀 협동 이모티콘 단축키: 숫자키 1~6
    if (State.gameState === 'PLAYING') {
      const isCoop = State.controlMode === 'P1' || State.controlMode === 'P2' || State.controlMode === 'BOTH';
      if (isCoop) {
        const match = e.code.match(/^(?:Digit|Numpad)([1-6])$/);
        if (match) {
          const num = parseInt(match[1], 10);
          const emote = (Config.COOP_EMOTES || [])[num - 1];
          if (emote) {
            e.preventDefault();
            Network.sendCoopEmote(emote.id);
          }
        }
      }
    }
  });
  window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
  });

  let pointerTarget = null;
  const raycaster = new THREE.Raycaster();
  const pointerNDC = new THREE.Vector2();

  // 핑 찍기 헬퍼 함수 (발판 or 도화지 좌표 감지)
  let lastPingTime = 0;
  function handleTriggerPing(clientX, clientY) {
    const isCoop = State.controlMode === 'P1' || State.controlMode === 'P2' || State.controlMode === 'BOTH';
    if (!isCoop || State.gameState !== 'PLAYING') return;

    const now = performance.now();
    if (now - lastPingTime < 380) return; // 0.38초 쿨타임
    lastPingTime = now;

    const rect = renderer.domElement.getBoundingClientRect();
    pointerNDC.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointerNDC.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointerNDC, camera);

    const { padMeshes } = Scene3D.getSceneObjects();

    // 1) 2P 발판 타겟 체크 (어떤 발판을 밟아달라고 하는지)
    if (padMeshes && padMeshes.length > 0) {
      const meshesOnly = padMeshes.map(p => p.mesh).filter(Boolean);
      const padHits = raycaster.intersectObjects(meshesOnly, true);
      if (padHits.length > 0) {
        let hitObj = padHits[0].object;
        while (hitObj && !hitObj.userData?.padData && hitObj.parent) {
          hitObj = hitObj.parent;
        }
        const padData = hitObj?.userData?.padData;
        if (padData) {
          const label = `${padData.icon || '🎨'} ${padData.fullName || padData.label} 밟아줘!`;
          Network.sendCoopPing(padData.x, padData.z, label, true);
          return;
        }
      }
    }

    // 2) 도화지 보드 체크 (도화지 특정 위치에 핑)
    const boardHits = raycaster.intersectObject(drawingBoard);
    if (boardHits.length > 0) {
      const pt = boardHits[0].point;
      Network.sendCoopPing(pt.x, pt.z, '📍 여기에 그려봐!', false);
      return;
    }

    // 3) 도화지 주변 지면 또는 데크 바닥
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const targetPt = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(plane, targetPt)) {
      Network.sendCoopPing(targetPt.x, targetPt.z, '📍 여기!', false);
    }
  }

  // 모바일/터치용 핑 모드 토글 버튼
  let isPingModeActive = false;
  const btnPingMode = document.getElementById('btn-coop-ping-mode');
  if (btnPingMode) {
    btnPingMode.addEventListener('click', (e) => {
      e.stopPropagation();
      isPingModeActive = !isPingModeActive;
      if (isPingModeActive) {
        btnPingMode.classList.add('ping-mode-active');
        btnPingMode.innerHTML = '<span>📍 찍을 곳 터치!</span>';
      } else {
        btnPingMode.classList.remove('ping-mode-active');
        btnPingMode.innerHTML = '<span>📍 핑 찍기</span>';
      }
    });
  }

  // 마우스 우클릭으로 즉시 핑 찍기
  renderer?.domElement?.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    handleTriggerPing(e.clientX, e.clientY);
  });

  renderer?.domElement?.addEventListener('pointerdown', (e) => {
    if (State.gameState !== 'PLAYING') return;

    // 마우스 우클릭(button === 2) 또는 터치 핑 모드 활성화 시
    if (e.button === 2 || isPingModeActive) {
      handleTriggerPing(e.clientX, e.clientY);
      if (isPingModeActive) {
        isPingModeActive = false;
        btnPingMode?.classList.remove('ping-mode-active');
        if (btnPingMode) btnPingMode.innerHTML = '<span>📍 핑 찍기</span>';
      }
      return;
    }

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

  // 8. 메인 애니메이션 루프 (60FPS 기준 deltaTime 정규화)
  const clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);
    const rawDelta = clock.getDelta();
    const elapsedTime = clock.elapsedTime;
    const dtScale = Math.min(rawDelta, 0.1) * 60;

    // --- ☕ 하단 대기 라운지 관전자 / 대기자 자유 이동 및 점프 (WASD + Space) ---
    const myId = State.isP2PConnected ? State.myPeerId : 'local-1';
    const myEntry = State.playerRoster.find(p => p.id === myId);
    const myRole = myEntry?.role || 'P1';

    const isControllingBoard = (State.gameState === 'PLAYING') &&
      ((State.controlMode === 'P1' && myRole === 'P1') ||
       (State.controlMode === 'P2' && myRole === 'P2') ||
       (State.controlMode === 'BOTH'));
    const isSpectatorOrWaiting = !isControllingBoard || State.gameState === 'WAITING' || State.gameState === 'LOBBY';

    if (isSpectatorOrWaiting && !State.isTypingChat) {
      let sx = 0, sz = 0;
      if (keys['KeyW'] || keys['ArrowUp']) sz -= 1;
      if (keys['KeyS'] || keys['ArrowDown']) sz += 1;
      if (keys['KeyA'] || keys['ArrowLeft']) sx -= 1;
      if (keys['KeyD'] || keys['ArrowRight']) sx += 1;

      if (sx !== 0 || sz !== 0) {
        const len = Math.hypot(sx, sz);
        State.spectatorState.vx += (sx / len) * State.spectatorState.accel * dtScale;
        State.spectatorState.vz += (sz / len) * State.spectatorState.accel * dtScale;
      }

      if (keys['Space'] && State.spectatorState.y <= 0.001 && State.spectatorState.vy <= 0) {
        State.spectatorState.vy = State.spectatorState.jumpForce;
        if (Sound) Sound.playJump(false);
      }
    }

    // 관전자 중력 및 마찰력 계산
    if (State.spectatorState.y > 0 || State.spectatorState.vy !== 0) {
      State.spectatorState.y += State.spectatorState.vy * dtScale;
      State.spectatorState.vy -= State.spectatorState.gravity * dtScale;
      if (State.spectatorState.y <= 0) {
        State.spectatorState.y = 0;
        State.spectatorState.vy = 0;
      }
    }
    const fs = Math.pow(State.spectatorState.friction, dtScale);
    State.spectatorState.vx *= fs;
    State.spectatorState.vz *= fs;

    State.mySpectatorPos.x += State.spectatorState.vx * dtScale;
    State.mySpectatorPos.z += State.spectatorState.vz * dtScale;
    State.mySpectatorPos.y = State.spectatorState.y;

    // 대기 라운지 바운더리 클램핑 (x: -9.4 ~ 9.4, z: 9.4 ~ 12.6)
    State.mySpectatorPos.x = Math.max(-9.4, Math.min(9.4, State.mySpectatorPos.x));
    State.mySpectatorPos.z = Math.max(9.4, Math.min(12.6, State.mySpectatorPos.z));

    if (Scene3D.updateSpectatorPosition) {
      Scene3D.updateSpectatorPosition(
        myId,
        State.mySpectatorPos.x,
        State.mySpectatorPos.z,
        State.mySpectatorPos.y,
        State.spectatorState.vx,
        State.spectatorState.vz,
        State.spectatorState.vy
      );
    }

    if (Math.hypot(State.spectatorState.vx, State.spectatorState.vz) > 0.001 || State.spectatorState.y > 0.001) {
      Network.sendNetworkPacket({
        type: 'MOVE_SPECTATOR',
        id: myId,
        x: State.mySpectatorPos.x,
        z: State.mySpectatorPos.z,
        y: State.mySpectatorPos.y,
        vx: State.spectatorState.vx,
        vz: State.spectatorState.vz,
        vy: State.spectatorState.vy
      });
    }

    if (State.gameState === 'PLAYING') {
      const { p1State, p2State } = State;

      // --- 1P & 2P 조작키 WASD 통일 (Enter 채팅 중일 땐 이동 정지!) ---
      const isWasdHeld = !State.isTypingChat && Boolean(keys['KeyW'] || keys['KeyS'] || keys['KeyA'] || keys['KeyD']);
      const isArrowHeld = !State.isTypingChat && Boolean(keys['ArrowUp'] || keys['ArrowDown'] || keys['ArrowLeft'] || keys['ArrowRight']);

      const p1UsesWasd = State.controlMode === 'P1' || (State.controlMode === 'BOTH' && myAssignedRole !== 'P2');
      const p1UsesArrows = State.controlMode === 'P1' || (State.controlMode === 'BOTH' && myAssignedRole === 'P2');

      const p2UsesWasd = State.controlMode === 'P2' || (State.controlMode === 'BOTH' && myAssignedRole === 'P2');
      const p2UsesArrows = State.controlMode === 'P2' || (State.controlMode === 'BOTH' && myAssignedRole !== 'P2');

      if ((State.controlMode === 'BOTH' || State.controlMode === 'P1') && !State.isTypingChat) {
        let ix1 = 0;
        let iz1 = 0;
        const p1Up = (p1UsesWasd && keys['KeyW']) || (p1UsesArrows && keys['ArrowUp']);
        const p1Down = (p1UsesWasd && keys['KeyS']) || (p1UsesArrows && keys['ArrowDown']);
        const p1Left = (p1UsesWasd && keys['KeyA']) || (p1UsesArrows && keys['ArrowLeft']);
        const p1Right = (p1UsesWasd && keys['KeyD']) || (p1UsesArrows && keys['ArrowRight']);

        if (p1Up)    { iz1 -= 1; pointerTarget = null; }
        if (p1Down)  { iz1 += 1; pointerTarget = null; }
        if (p1Left)  { ix1 -= 1; pointerTarget = null; }
        if (p1Right) { ix1 += 1; pointerTarget = null; }

        if (ix1 !== 0 || iz1 !== 0) {
          const len = Math.hypot(ix1, iz1);
          p1State.vx += (ix1 / len) * p1State.accel * dtScale;
          p1State.vz += (iz1 / len) * p1State.accel * dtScale;
        } else if (pointerTarget) {
          const dx = pointerTarget.x - p1Obj.group.position.x;
          const dz = pointerTarget.z - p1Obj.group.position.z;
          const dist = Math.hypot(dx, dz);
          if (dist > 0.25) {
            p1State.vx += (dx / dist) * p1State.accel * 0.85 * dtScale;
            p1State.vz += (dz / dist) * p1State.accel * 0.85 * dtScale;
          } else {
            pointerTarget = null;
          }
        }

        // 스페이스바 점프: 내 주 조작 캐릭터(WASD 대상) 우선 점프
        const shouldP1Jump = State.controlMode === 'P1' || (State.controlMode === 'BOTH' && ((p1UsesWasd && (isWasdHeld || !isArrowHeld)) || (p1UsesArrows && isArrowHeld && !isWasdHeld)));
        if (keys['Space'] && shouldP1Jump && p1State.y <= 0.001 && p1State.vy <= 0) {
          p1State.vy = p1State.jumpForce;
          if (Sound) Sound.playJump(false);
        }

        if (p1State.y > 0 || p1State.vy !== 0) {
          p1State.y += p1State.vy * dtScale;
          p1State.vy -= p1State.gravity * dtScale;
          if (p1State.y <= 0) {
            p1State.y = 0;
            p1State.vy = 0;
          }
        }

        const f1 = Math.pow(p1State.friction, dtScale);
        p1State.vx *= f1;
        p1State.vz *= f1;
        p1Obj.group.position.x += p1State.vx * dtScale;
        p1Obj.group.position.z += p1State.vz * dtScale;

        const halfBoard = Config.CANVAS_SIZE / 2 - 0.45;
        p1Obj.group.position.x = Math.max(-halfBoard, Math.min(halfBoard, p1Obj.group.position.x));
        p1Obj.group.position.z = Math.max(2.2 - halfBoard, Math.min(2.2 + halfBoard, p1Obj.group.position.z));

        if (Math.hypot(p1State.vx, p1State.vz) > 0.001 || p1State.y > 0.001 || Math.abs(p1State.vy) > 0.001) {
          Network.sendNetworkPacket({
            type: 'MOVE_P1',
            x: p1Obj.group.position.x,
            y: p1State.y,
            z: p1Obj.group.position.z,
            vx: p1State.vx,
            vy: p1State.vy,
            vz: p1State.vz
          });
        }
      } else if (p1State.y > 0 || p1State.vy !== 0) {
        // 원격 1P 점프 중력 보간
        p1State.y += p1State.vy * dtScale;
        p1State.vy -= p1State.gravity * dtScale;
        if (p1State.y <= 0) {
          p1State.y = 0;
          p1State.vy = 0;
        }
      }

      // --- 2P 팔레트 엔지니어 이동 및 점프 (WASD로 통일 + Enter 채팅 중엔 이동 정지) ---
      if ((State.controlMode === 'BOTH' || State.controlMode === 'P2') && !State.isTypingChat) {
        let ix2 = 0;
        let iz2 = 0;
        const p2Up = (p2UsesWasd && keys['KeyW']) || (p2UsesArrows && keys['ArrowUp']);
        const p2Down = (p2UsesWasd && keys['KeyS']) || (p2UsesArrows && keys['ArrowDown']);
        const p2Left = (p2UsesWasd && keys['KeyA']) || (p2UsesArrows && keys['ArrowLeft']);
        const p2Right = (p2UsesWasd && keys['KeyD']) || (p2UsesArrows && keys['ArrowRight']);

        if (p2Up)    iz2 -= 1;
        if (p2Down)  iz2 += 1;
        if (p2Left)  ix2 -= 1;
        if (p2Right) ix2 += 1;

        if (ix2 !== 0 || iz2 !== 0) {
          const len2 = Math.hypot(ix2, iz2);
          p2State.vx += (ix2 / len2) * p2State.accel * dtScale;
          p2State.vz += (iz2 / len2) * p2State.accel * dtScale;
        }

        // 스페이스바 점프: 내 주 조작 캐릭터(WASD 대상) 우선 점프
        const shouldP2Jump = State.controlMode === 'P2' || (State.controlMode === 'BOTH' && ((p2UsesWasd && (isWasdHeld || !isArrowHeld)) || (p2UsesArrows && isArrowHeld && !isWasdHeld)));
        if (keys['Space'] && shouldP2Jump && p2State.y <= 0.001 && p2State.vy <= 0) {
          p2State.vy = p2State.jumpForce;
          if (Sound) Sound.playJump(true);
        }

        if (p2State.y > 0 || p2State.vy !== 0) {
          p2State.y += p2State.vy * dtScale;
          p2State.vy -= p2State.gravity * dtScale;
          if (p2State.y <= 0) {
            p2State.y = 0;
            p2State.vy = 0;
          }
        }

        const f2 = Math.pow(p2State.friction, dtScale);
        p2State.vx *= f2;
        p2State.vz *= f2;
        p2Obj.group.position.x += p2State.vx * dtScale;
        p2Obj.group.position.z += p2State.vz * dtScale;
      } else if (p2State.y > 0 || p2State.vy !== 0) {
        // 원격 2P 점프 중력 보간
        p2State.y += p2State.vy * dtScale;
        p2State.vy -= p2State.gravity * dtScale;
        if (p2State.y <= 0) {
          p2State.y = 0;
          p2State.vy = 0;
        }
      }

      p2Obj.group.position.x = Math.max(-9.2, Math.min(9.2, p2Obj.group.position.x));
      p2Obj.group.position.z = Math.max(-8.9, Math.min(-4.8, p2Obj.group.position.z));

      // --- 2P 발판 충돌 판정 (점프 중에는 발판 밟기 판정 무시!) ---
      const isP2Airborne = (p2State.y || 0) > 0.04;
      let steppedColorHex = null;
      let steppedColorName = '발판 대기 (OFF)';
      let steppedPadData = null;
      let steppedSizePad = null;
      let currentlyOnClear = false;
      let currentlyOnSize = false;
      const padLerpDown = 1 - Math.pow(0.65, dtScale);
      const padLerpUp = 1 - Math.pow(0.75, dtScale);

      padMeshes.forEach((padItem) => {
        const { mesh, mat, ringMat, labelSprite, baseScaleW, baseScaleH, defaultRingColor, data } = padItem;
        const dist = Math.hypot(p2Obj.group.position.x - data.x, p2Obj.group.position.z - data.z);
        const isSizePad = data.type === 'size';
        const isClearPad = data.type === 'clear';
        const collisionRadius = isSizePad ? 0.52 : isClearPad ? 0.85 : 0.58;
        const isStepped = !isP2Airborne && dist < collisionRadius;
        const isActiveSize = isSizePad && (State.brushSizeIdx === data.sizeIdx);

        if (isStepped) {
          steppedPadData = data;
          mesh.position.y += (0.04 - mesh.position.y) * padLerpDown;
          mat.emissiveIntensity = 0.65;
          if (ringMat) {
            ringMat.color.setHex(0xfde047);
            ringMat.emissive.setHex(0xfde047);
            ringMat.emissiveIntensity = 0.7;
          }
          if (labelSprite) {
            labelSprite.position.y += (0.94 - labelSprite.position.y) * padLerpDown;
            const targetW = (baseScaleW || 1.3) * 1.32;
            const targetH = (baseScaleH || 0.44) * 1.32;
            labelSprite.scale.x += (targetW - labelSprite.scale.x) * padLerpDown;
            labelSprite.scale.y += (targetH - labelSprite.scale.y) * padLerpDown;
          }
          if (!padItem.wasStepped) {
            Scene3D.spawnPadRipple(data.x, data.z, isSizePad ? 0x10b981 : data.color);
            if (data.type === 'color' && Sound) {
              Sound.playColorPad(data.note);
            }
          }
          if (data.type === 'color') {
            steppedColorHex = data.hex;
            steppedColorName = data.fullName || data.label;
          } else if (isSizePad) {
            currentlyOnSize = true;
            steppedSizePad = data;
          } else if (isClearPad) {
            currentlyOnClear = true;
          }
        } else {
          mesh.position.y += (0.15 - mesh.position.y) * padLerpUp;
          if (isSizePad) {
            // 현재 활성화된 크기 발판은 눈에 띄는 초록색 버튼으로 점등!
            if (isActiveSize) {
              mat.color.setHex(0x10b981);
              mat.emissive.setHex(0x10b981);
              mat.emissiveIntensity = 0.45;
              if (ringMat) {
                ringMat.color.setHex(0x34d399);
                ringMat.emissive.setHex(0x10b981);
                ringMat.emissiveIntensity = 0.35;
              }
            } else {
              mat.color.setHex(0x334155);
              mat.emissive.setHex(0x1e293b);
              mat.emissiveIntensity = 0.12;
              if (ringMat) {
                ringMat.color.setHex(0x475569);
                ringMat.emissive.setHex(0x000000);
                ringMat.emissiveIntensity = 0.10;
              }
            }
          } else {
            mat.emissiveIntensity = isClearPad ? 0.32 : 0.16;
            if (ringMat) {
              ringMat.color.setHex(defaultRingColor || 0xffffff);
              ringMat.emissive.setHex(isClearPad ? 0xfbbf24 : 0x000000);
              ringMat.emissiveIntensity = 0.15;
            }
          }
          if (labelSprite) {
            labelSprite.position.y += (0.50 - labelSprite.position.y) * padLerpUp;
            const targetW = baseScaleW || 1.3;
            const targetH = baseScaleH || 0.44;
            labelSprite.scale.x += (targetW - labelSprite.scale.x) * padLerpUp;
            labelSprite.scale.y += (targetH - labelSprite.scale.y) * padLerpUp;
          }
        }
        padItem.wasStepped = isStepped;
      });

      const isControllingP2 = State.controlMode === 'BOTH' || State.controlMode === 'P2';
      if (isControllingP2) {
        const prevPenDown = State.isPenDown;
        const prevColorHex = State.activeColorHex;

        State.activeColorHex = steppedColorHex;
        State.activeColorName = steppedColorName;
        State.isPenDown = Boolean(steppedColorHex);

        // [세분화된 붓 크기 발판]: 밟는 순간 해당 크기로 즉시 전환!
        if (currentlyOnSize && steppedSizePad && !State.wasOnSizePad) {
          if (typeof steppedSizePad.sizeIdx === 'number' && State.brushSizeIdx !== steppedSizePad.sizeIdx) {
            setBrushSize(steppedSizePad.sizeIdx, false);
          }
        }
        State.wasOnSizePad = currentlyOnSize;

        // [💥도화지 지우기] 발판
        if (currentlyOnClear && !State.wasOnClearPad) {
          Scene3D.clearCanvas();
          if (Sound) Sound.playClearCanvas();
          addChatMessage('', '💥 2P 팔레트 요정이 [전체 지우기] 버튼을 밟아 도화지를 초기화했습니다!', 'system');
          Network.sendNetworkPacket({ type: 'CLEAR', by: '2P 팔레트 요정' });
        }
        State.wasOnClearPad = currentlyOnClear;

        if (Math.hypot(p2State.vx, p2State.vz) > 0.001 || p2State.y > 0.001 || Math.abs(p2State.vy) > 0.001 || prevPenDown !== State.isPenDown || prevColorHex !== State.activeColorHex) {
          Network.sendNetworkPacket({
            type: 'MOVE_P2',
            x: p2Obj.group.position.x,
            y: p2State.y,
            z: p2Obj.group.position.z,
            vx: p2State.vx,
            vy: p2State.vy,
            vz: p2State.vz,
            isPenDown: State.isPenDown,
            activeColorHex: State.activeColorHex,
            activeColorName: State.activeColorName,
            brushSizeIdx: State.brushSizeIdx
          });
        }
      } else {
        State.activeColorHex = steppedColorHex;
        State.activeColorName = steppedColorName;
        State.isPenDown = Boolean(steppedColorHex);
      }

      // 현재 밟고 있는 버튼 이름 3D 말풍선 + 상단 빅 배너 실시간 표시
      updatePadStepHUD(steppedPadData, isP2Airborne);

      const isP1Airborne = (p1State.y || 0) > 0.04;
      if (isP1Airborne) {
        uiPenStatus.textContent = '🦘 1P 점프 중 (붓 들림)';
        uiPenStatus.className = 'text-amber-300 font-extrabold';
      } else {
        uiPenStatus.textContent = State.isPenDown ? `ON (${State.activeColorName} 공급중)` : 'OFF (발판 떨어짐)';
        uiPenStatus.className = State.isPenDown ? 'text-emerald-400 font-extrabold' : 'text-rose-400 font-extrabold';
      }
      uiColorPreview.style.background = State.activeColorHex || 'transparent';
      uiColorName.textContent = State.activeColorName;
      updateBrushSizeUI();
      if (uiBrushSizeName) {
        const curSize = Config.BRUSH_SIZES[State.brushSizeIdx] || Config.BRUSH_SIZES[1];
        uiBrushSizeName.textContent = curSize.badge;
      }
      p1Obj.tipMat.color.set(State.activeColorHex || '#ffffff');
      p2Obj.tipMat.color.set(State.activeColorHex || '#63666f');

      Scene3D.paintStrokeOnBoard();
    } else {
      updatePadStepHUD(null, false);
    }

    const isP1DrawingNow = State.isPenDown && (State.p1State.y || 0) <= 0.04;
    Scene3D.updateCharacterVisuals(p1Obj, State.p1State.vx, State.p1State.vz, elapsedTime, isP1DrawingNow, dtScale, State.p1State.y || 0, State.p1State.vy || 0);
    Scene3D.updateCharacterVisuals(p2Obj, State.p2State.vx, State.p2State.vz, elapsedTime, false, dtScale, State.p2State.y || 0, State.p2State.vy || 0);
    Scene3D.updateParticles(dtScale);
    Scene3D.renderFrame(elapsedTime, dtScale);
  }

  animate();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initGameApp);
} else {
  initGameApp();
}
window.addEventListener('load', initGameApp);
