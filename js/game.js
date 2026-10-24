// ==========================================
// 반반 무마니 3D - 접속 대기화면(커스터마이징), 게임 루프 & 물리 제어 (game.js)
// ==========================================
window.BanBan = window.BanBan || {};

window.onload = function () {
  const { Config, State, Scene3D, Network } = window.BanBan;

  // 1. 3D 씬 및 프리뷰 캔버스 초기화
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
  const entryScreenEl = document.getElementById('entry-screen');
  const entryNicknameEl = document.getElementById('entry-nickname');

  // 3. 접속 대기화면 & 캐릭터 커스터마이징 UI 초기화
  function initCustomizerUI() {
    if (entryNicknameEl) {
      entryNicknameEl.value = State.myNickname;
      entryNicknameEl.addEventListener('focus', () => { State.isTypingChat = true; });
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

  // 4. 모드 스위처, 'YOU' 화살표 표시 & 2P 자동 도우미 제어
  function updatePromptVisibility() {
    const promptEl = document.getElementById('prompt-text');
    if (State.gameState === 'WAITING' || State.gameState === 'LOBBY') {
      promptEl.textContent = '제시어: (대기실 준비 중...)';
    } else if (State.gameState === 'CHOOSING_WORD') {
      promptEl.textContent = '제시어: (🎨 1P가 3개 중 선택 중...)';
    } else if (State.controlMode === 'SPECTATOR') {
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
    Scene3D.updateYouMarkersVisibility();
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
  });

  // 5. 실시간 채팅 & 라운드 진행 제어
  chatInputEl.addEventListener('focus', () => { State.isTypingChat = true; });
  chatInputEl.addEventListener('blur', () => { State.isTypingChat = false; });

  const mpNicknameEl = document.getElementById('mp-nickname');
  const mpRoomcodeEl = document.getElementById('mp-roomcode');
  [mpNicknameEl, mpRoomcodeEl].forEach(el => {
    if (el) {
      el.addEventListener('focus', () => { State.isTypingChat = true; });
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
      div.innerHTML = `<span class="font-bold text-slate-400 mr-1.5">${sender}:</span><span class="text-slate-100">${text}</span>`;
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
    if (!rawText) return;
    chatInputEl.value = '';

    const senderName = State.myNickname || '나';

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
  let wordChoiceInterval = null;

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
    closeWordSelectModal();
    timerTextEl.textContent = '대기중';
    timerTextEl.classList.remove('urgent-timer');
    updatePromptVisibility();
    Scene3D.clearCanvas();
    Scene3D.clearConfetti();
  }

  // [1단계] 라운드 시작 전 무작위 3개 제시어 후보 중 1P가 1개를 고르는 단계
  function startWordSelectionPhase(isFromNetwork = false, providedCandidates = null) {
    State.gameState = 'CHOOSING_WORD';
    if (timerInterval) clearInterval(timerInterval);
    if (wordChoiceInterval) clearInterval(wordChoiceInterval);

    if (Array.isArray(providedCandidates) && providedCandidates.length === 3) {
      State.candidatePromptIndices = providedCandidates;
    } else if (!isFromNetwork) {
      State.candidatePromptIndices = Config.pickThreeRandomPromptIndices(State.currentPromptIndex);
    }

    document.getElementById('round-text').textContent = `ROUND ${State.currentRound}`;
    timerTextEl.textContent = '선택중';
    timerTextEl.classList.remove('urgent-timer');
    document.getElementById('result-modal').classList.add('hidden');
    document.getElementById('result-modal').classList.remove('flex');
    if (entryScreenEl) entryScreenEl.classList.add('hidden');

    updatePromptVisibility();
    Scene3D.updateYouMarkersVisibility();
    Scene3D.syncRosterCustomizations();
    Scene3D.clearCanvas();
    Scene3D.clearConfetti();

    p1Obj.group.position.set(0, 0, 2.2);
    p2Obj.group.position.set(1.1, 0, -6.8);
    State.p1State.vx = State.p1State.vz = State.p2State.vx = State.p2State.vz = 0;
    State.isPenDown = false;
    State.wasOnClearPad = false;
    State.aiColorIdx = 4;
    State.aiTargetX = 1.1;

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
            <div class="text-[11px] text-slate-400 mt-0.5">초성 힌트: ${item.hint}</div>
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
    if (selectTimerEl) selectTimerEl.textContent = `${choiceTimeLeft}s`;

    wordChoiceInterval = setInterval(() => {
      if (State.gameState !== 'CHOOSING_WORD') {
        clearInterval(wordChoiceInterval);
        return;
      }
      choiceTimeLeft--;
      if (selectTimerEl) selectTimerEl.textContent = `${choiceTimeLeft}s`;

      if (choiceTimeLeft <= 0) {
        clearInterval(wordChoiceInterval);
        if (canIPick) {
          confirmWordSelection(State.candidatePromptIndices[0]);
        }
      }
    }, 1000);
  }

  function confirmWordSelection(chosenPromptIndex) {
    closeWordSelectModal();
    Network.sendNetworkPacket({
      type: 'WORD_SELECTED',
      round: State.currentRound,
      promptIndex: chosenPromptIndex
    });
    startPlayingRound(chosenPromptIndex, false);
  }

  // [2단계] 1P가 제시어를 확정하면 60초 드로잉 라운드 본격 시작
  function startPlayingRound(chosenPromptIndex, isFromNetwork = false) {
    closeWordSelectModal();
    State.gameState = 'PLAYING';
    State.timeLeft = 60;
    if (typeof chosenPromptIndex === 'number') {
      State.currentPromptIndex = chosenPromptIndex;
    }
    State.currentPrompt = Config.WORD_POOL[State.currentPromptIndex % Config.WORD_POOL.length];

    document.getElementById('round-text').textContent = `ROUND ${State.currentRound}`;
    timerTextEl.textContent = `${State.timeLeft}s`;
    timerTextEl.classList.remove('urgent-timer');
    document.getElementById('result-modal').classList.add('hidden');
    document.getElementById('result-modal').classList.remove('flex');
    if (entryScreenEl) entryScreenEl.classList.add('hidden');

    updatePromptVisibility();
    Scene3D.updateYouMarkersVisibility();
    Scene3D.syncRosterCustomizations();

    Scene3D.clearCanvas();
    Scene3D.clearConfetti();

    p1Obj.group.position.set(0, 0, 2.2);
    p2Obj.group.position.set(1.1, 0, -6.8);
    State.p1State.vx = State.p1State.vz = State.p2State.vx = State.p2State.vz = 0;
    State.isPenDown = false;
    State.wasOnClearPad = false;
    State.aiColorIdx = 4;
    State.aiTargetX = 1.1;

    const p1Player = State.playerRoster.find(p => p.role === 'P1');
    const p2Player = State.playerRoster.find(p => p.role === 'P2');
    const roleSummary = (p1Player && p2Player)
      ? ` (🎨 1P: ${p1Player.nickname} / 🕹️ 2P: ${p2Player.nickname})`
      : '';

    addChatMessage('', `🎨 제시어 선택 완료! ROUND ${State.currentRound} 드로잉 시작!${roleSummary}`, 'system');

    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      if (State.gameState !== 'PLAYING') return;
      State.timeLeft--;
      timerTextEl.textContent = `${State.timeLeft}s`;

      if (State.timeLeft <= 10) timerTextEl.classList.add('urgent-timer');

      if (State.timeLeft === 30) {
        const hintText = State.currentPrompt.hint || Config.extractChosung(State.currentPrompt.word);
        addChatMessage('', `💡 [초성 힌트] ${hintText}`, 'hint');
      }

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
    State.candidatePromptIndices = Config.pickThreeRandomPromptIndices(State.currentPromptIndex);

    Network.rotatePlayerRoles();
    startWordSelectionPhase(false, State.candidatePromptIndices);

    Network.sendNetworkPacket({
      type: 'NEXT_ROUND',
      round: State.currentRound,
      candidateIndices: State.candidatePromptIndices,
      roster: State.playerRoster
    });
  });

  document.getElementById('btn-save').addEventListener('click', () => {
    const link = document.createElement('a');
    link.download = `banban-round-${State.currentRound}.png`;
    link.href = drawCanvas.toDataURL('image/png');
    link.click();
  });

  // 6. 네트워크/대기방 & 커스터마이징 UI 초기화
  initCustomizerUI();
  Network.initNetworkAndLobby({
    onAddChatMessage: addChatMessage,
    onEndRound: endRound,
    onStartWordSelection: startWordSelectionPhase,
    onWordSelected: startPlayingRound,
    onPauseForWaitingRoom: pauseForWaitingRoom,
    onOpenCustomizer: openCustomizerModal,
    onSetMode: setMode,
    onUpdateAiButtonUI: updateAiButtonUI,
    normalizeAnswer
  });

  // 최초 접속 시 대기화면(LOBBY) 상태 세팅
  p1Obj.group.position.set(0, 0, 2.2);
  p2Obj.group.position.set(1.1, 0, -6.8);
  timerTextEl.textContent = '대기중';
  updatePromptVisibility();
  addChatMessage('', '✨ 반반 무마니 3D에 오신 것을 환영합니다! 대기화면에서 내 캐릭터를 꾸미고 시작해 보세요.', 'system');

  // 7. 키보드 및 마우스/터치 입력
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

  // 8. 메인 애니메이션 루프 (60FPS 기준 deltaTime 정규화)
  const clock = new THREE.Clock();
  const colorPadXList = [-6.5, -4.6, -2.7, -0.8, 1.1];

  function animate() {
    requestAnimationFrame(animate);
    const rawDelta = clock.getDelta();
    const elapsedTime = clock.elapsedTime;
    const dtScale = Math.min(rawDelta, 0.1) * 60;

    if (State.gameState === 'PLAYING') {
      const { p1State, p2State } = State;

      // --- 1P 브러시 러너 이동 ---
      if (State.controlMode === 'BOTH' || State.controlMode === 'P1') {
        let ix1 = 0;
        let iz1 = 0;
        if (keys['KeyW']) { iz1 -= 1; pointerTarget = null; }
        if (keys['KeyS']) { iz1 += 1; pointerTarget = null; }
        if (keys['KeyA']) { ix1 -= 1; pointerTarget = null; }
        if (keys['KeyD']) { ix1 += 1; pointerTarget = null; }

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

        const f1 = Math.pow(p1State.friction, dtScale);
        p1State.vx *= f1;
        p1State.vz *= f1;
        p1Obj.group.position.x += p1State.vx * dtScale;
        p1Obj.group.position.z += p1State.vz * dtScale;

        const halfBoard = Config.CANVAS_SIZE / 2 - 0.45;
        p1Obj.group.position.x = Math.max(-halfBoard, Math.min(halfBoard, p1Obj.group.position.x));
        p1Obj.group.position.z = Math.max(2.2 - halfBoard, Math.min(2.2 + halfBoard, p1Obj.group.position.z));

        if (Math.hypot(p1State.vx, p1State.vz) > 0.001) {
          Network.sendNetworkPacket({
            type: 'MOVE_P1',
            x: p1Obj.group.position.x,
            z: p1Obj.group.position.z,
            vx: p1State.vx,
            vz: p1State.vz
          });
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
        let ix2 = 0;
        let iz2 = 0;
        if (keys['ArrowUp'])    iz2 -= 1;
        if (keys['ArrowDown'])  iz2 += 1;
        if (keys['ArrowLeft'])  ix2 -= 1;
        if (keys['ArrowRight']) ix2 += 1;

        if (ix2 !== 0 || iz2 !== 0) {
          const len2 = Math.hypot(ix2, iz2);
          p2State.vx += (ix2 / len2) * p2State.accel * dtScale;
          p2State.vz += (iz2 / len2) * p2State.accel * dtScale;
        }

        const f2 = Math.pow(p2State.friction, dtScale);
        p2State.vx *= f2;
        p2State.vz *= f2;
        p2Obj.group.position.x += p2State.vx * dtScale;
        p2Obj.group.position.z += p2State.vz * dtScale;
      } else if (State.aiHelperEnabled && (!State.isP2PConnected || State.isP2PHost)) {
        State.aiTimer += dtScale;
        if (State.aiTimer >= 260) {
          State.aiTimer = 0;
          State.aiColorIdx = (State.aiColorIdx + 1) % colorPadXList.length;
          State.aiTargetX = colorPadXList[State.aiColorIdx];
        }
        const aiLerpX = 1 - Math.pow(0.92, dtScale);
        const aiLerpZ = 1 - Math.pow(0.90, dtScale);
        p2Obj.group.position.x += (State.aiTargetX - p2Obj.group.position.x) * aiLerpX;
        p2Obj.group.position.z += (-6.8 - p2Obj.group.position.z) * aiLerpZ;
        p2State.vx = (p2Obj.group.position.x - prevP2X) / Math.max(dtScale, 0.01);
        p2State.vz = (p2Obj.group.position.z - prevP2Z) / Math.max(dtScale, 0.01);
      }

      p2Obj.group.position.x = Math.max(-7.8, Math.min(8.2, p2Obj.group.position.x));
      p2Obj.group.position.z = Math.max(-8.5, Math.min(-5.1, p2Obj.group.position.z));

      // --- 2P 발판 충돌 판정 ---
      let steppedColorHex = null;
      let steppedColorName = '발판 대기 (OFF)';
      let currentlyOnClear = false;
      const padLerpDown = 1 - Math.pow(0.65, dtScale);
      const padLerpUp = 1 - Math.pow(0.75, dtScale);

      padMeshes.forEach((padItem) => {
        const { mesh, mat, data } = padItem;
        const dist = Math.hypot(p2Obj.group.position.x - data.x, p2Obj.group.position.z - data.z);
        const isStepped = dist < 0.88;

        if (isStepped) {
          mesh.position.y += (0.04 - mesh.position.y) * padLerpDown;
          mat.emissiveIntensity = 0.5;
          if (!padItem.wasStepped) {
            Scene3D.spawnPadRipple(data.x, data.z, data.color);
          }
          if (data.type === 'color') {
            steppedColorHex = data.hex;
            steppedColorName = data.label;
          } else if (data.type === 'clear') {
            currentlyOnClear = true;
          }
        } else {
          mesh.position.y += (0.14 - mesh.position.y) * padLerpUp;
          mat.emissiveIntensity = data.type === 'clear' ? 0.28 : 0.12;
        }
        padItem.wasStepped = isStepped;
      });

      const isControllingP2 = State.controlMode === 'BOTH' || State.controlMode === 'P2' || (State.aiHelperEnabled && (!State.isP2PConnected || State.isP2PHost));
      if (isControllingP2) {
        State.activeColorHex = steppedColorHex;
        State.activeColorName = steppedColorName;
        State.isPenDown = Boolean(steppedColorHex);

        if (currentlyOnClear && !State.wasOnClearPad) {
          Scene3D.clearCanvas();
          addChatMessage('', '💥 2P 팔레트 엔지니어가 [도화지 지우기] 발판을 밟아 도화지를 초기화했습니다!', 'system');
          Network.sendNetworkPacket({ type: 'CLEAR', by: '2P 팔레트 엔지니어' });
        }
        State.wasOnClearPad = currentlyOnClear;

        Network.sendNetworkPacket({
          type: 'MOVE_P2',
          x: p2Obj.group.position.x,
          z: p2Obj.group.position.z,
          vx: p2State.vx,
          vz: p2State.vz,
          isPenDown: State.isPenDown,
          activeColorHex: State.activeColorHex,
          activeColorName: State.activeColorName
        });
      }

      uiPenStatus.textContent = State.isPenDown ? `ON (${State.activeColorName} 공급중)` : 'OFF (발판 떨어짐)';
      uiPenStatus.className = State.isPenDown ? 'text-emerald-400 font-extrabold' : 'text-rose-500 font-extrabold';
      uiColorPreview.style.background = State.activeColorHex || 'transparent';
      uiColorName.textContent = State.activeColorName;
      p1Obj.tipMat.color.set(State.activeColorHex || '#ffffff');
      p2Obj.tipMat.color.set(State.activeColorHex || '#63666f');

      Scene3D.paintStrokeOnBoard();
    }

    Scene3D.updateCharacterVisuals(p1Obj, State.p1State.vx, State.p1State.vz, elapsedTime, State.isPenDown, dtScale);
    Scene3D.updateCharacterVisuals(p2Obj, State.p2State.vx, State.p2State.vz, elapsedTime, false, dtScale);
    Scene3D.updateParticles(dtScale);
    Scene3D.renderFrame(elapsedTime, dtScale);
  }

  animate();
};
