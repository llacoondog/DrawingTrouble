// ==========================================
// 반반 무마니 3D - 대기방(Waiting Room), 커스텀 동기화 & 하이브리드 네트워크 (network.js)
// ==========================================
window.BanBan = window.BanBan || {};

window.BanBan.Network = (function () {
  const { Config, State, Scene3D } = window.BanBan;

  let netChannel = null;
  let peer = null;
  let hostConnection = null;
  const guestConnections = [];

  let socketIoClient = null;
  let isSocketServerAvailable = false;

  let callbacks = {
    onAddChatMessage: () => {},
    onEndRound: () => {},
    onStartRound: () => {},
    onPauseForWaitingRoom: () => {},
    onOpenCustomizer: () => {},
    onSetMode: () => {},
    onUpdateAiButtonUI: () => {},
    normalizeAnswer: (s) => s.replace(/\s+/g, '').toLowerCase()
  };

  function getHatIcon(hatId) {
    const found = Config.CUSTOM_HATS.find(h => h.id === hatId);
    return found ? found.icon : '🎨';
  }

  function renderPlayerRoster() {
    // 3D 캐릭터(1P, 2P)에 로스터의 커스터마이징 외형 동기화
    Scene3D.syncRosterCustomizations();

    // 1) 우측 사이드바 플레이어 칩 렌더링
    const listEl = document.getElementById('player-list');
    if (listEl) {
      listEl.innerHTML = '';
      State.playerRoster.forEach(p => {
        const span = document.createElement('span');
        const isMe = (!State.isP2PConnected && p.id === 'local-1') || (State.isP2PConnected && p.id === State.myPeerId);
        const meTag = isMe ? ' (나)' : '';
        const hatEmoji = getHatIcon(p.custom?.hat);
        const dotColor = p.custom?.color || '#ec4899';

        if (p.role === 'P1') {
          span.className = 'text-[11px] px-2.5 py-1 rounded-lg bg-pink-500/20 border border-pink-500/40 text-pink-200 font-bold flex items-center gap-1';
          span.innerHTML = `<span class="w-2.5 h-2.5 rounded-full inline-block border border-white/60" style="background:${dotColor}"></span><span>${hatEmoji} 1P ${p.nickname}${meTag} (${p.score}점)</span>`;
        } else if (p.role === 'P2') {
          span.className = 'text-[11px] px-2.5 py-1 rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-200 font-bold flex items-center gap-1';
          span.innerHTML = `<span class="w-2.5 h-2.5 rounded-full inline-block border border-white/60" style="background:${dotColor}"></span><span>${hatEmoji} 2P ${p.nickname}${meTag} (${p.score}점)</span>`;
        } else {
          span.className = 'text-[11px] px-2.5 py-1 rounded-lg bg-slate-700/60 border border-white/10 text-slate-300 font-semibold flex items-center gap-1';
          span.innerHTML = `<span class="w-2.5 h-2.5 rounded-full inline-block border border-white/60" style="background:${dotColor}"></span><span>${hatEmoji} ${p.nickname}${meTag} (${p.score}점)</span>`;
        }
        listEl.appendChild(span);
      });
    }

    // 2) 대기방(Waiting Room) 모달 내부 참가자 목록 렌더링
    const waitingListEl = document.getElementById('waiting-player-list');
    if (waitingListEl) {
      waitingListEl.innerHTML = '';
      State.playerRoster.forEach((p, idx) => {
        const row = document.createElement('div');
        const isMe = State.isP2PConnected && p.id === State.myPeerId;
        row.className = `flex items-center justify-between px-3 py-2 rounded-xl border ${
          isMe ? 'bg-white/10 border-purple-400/50' : 'bg-white/5 border-white/5'
        }`;

        let roleBadge = '';
        if (p.role === 'P1') {
          roleBadge = '<span class="text-xs font-extrabold px-2 py-0.5 rounded-lg bg-pink-500/25 text-pink-300 border border-pink-500/40">🎨 1P 브러시 러너</span>';
        } else if (p.role === 'P2') {
          roleBadge = '<span class="text-xs font-extrabold px-2 py-0.5 rounded-lg bg-cyan-500/25 text-cyan-300 border border-cyan-500/40">🕹️ 2P 팔레트 엔지니어</span>';
        } else {
          roleBadge = '<span class="text-xs font-semibold px-2 py-0.5 rounded-lg bg-slate-700 text-slate-300">👀 구경꾼 (정답자)</span>';
        }

        const hostCrown = idx === 0 ? '👑 ' : '';
        const meBadge = isMe ? ' <span class="text-amber-300 font-extrabold">(나)</span>' : '';
        const hatEmoji = getHatIcon(p.custom?.hat);
        const dotColor = p.custom?.color || '#ec4899';

        row.innerHTML = `
          <div class="text-xs font-bold text-white flex items-center gap-1.5">
            <span class="w-3 h-3 rounded-full inline-block border border-white" style="background:${dotColor}"></span>
            <span>${hatEmoji} ${hostCrown}${p.nickname}${meBadge}</span>
          </div>
          <div>${roleBadge}</div>
        `;
        waitingListEl.appendChild(row);
      });
    }

    // 대기방 방장/게스트 전용 버튼 토글
    const btnStartGame = document.getElementById('btn-start-mp-game');
    const btnSwapRoles = document.getElementById('btn-swap-roles');
    const guestNotice = document.getElementById('waiting-guest-notice');
    if (btnStartGame && guestNotice) {
      if (State.isP2PHost) {
        btnStartGame.classList.remove('hidden');
        if (btnSwapRoles) btnSwapRoles.classList.remove('hidden');
        guestNotice.classList.add('hidden');
      } else {
        btnStartGame.classList.add('hidden');
        if (btnSwapRoles) btnSwapRoles.classList.add('hidden');
        guestNotice.classList.remove('hidden');
      }
    }

    // 우측 상단 내 점수 배지 동기화
    const scoreEl = document.getElementById('score-text');
    if (scoreEl) {
      if (State.isP2PConnected) {
        const me = State.playerRoster.find(p => p.id === State.myPeerId);
        if (me) {
          State.totalScore = me.score;
        }
      }
      scoreEl.textContent = `${State.totalScore}점`;
    }
  }

  // 내 커스터마이징/닉네임 변경 시 로컬 로스터 및 멀티플레이 방에 즉시 동기화
  function broadcastMyCustomization() {
    const myEntry = State.playerRoster.find(p =>
      State.isP2PConnected ? p.id === State.myPeerId : p.id === 'local-1'
    );
    if (myEntry) {
      myEntry.nickname = State.myNickname;
      myEntry.custom = { ...State.myCustom };
    }
    renderPlayerRoster();

    if (State.isP2PConnected) {
      sendNetworkPacket({
        type: 'CUSTOM_UPDATE',
        peerId: State.myPeerId,
        nickname: State.myNickname,
        custom: { ...State.myCustom }
      });
    }
  }

  // 라운드마다 또는 대기방에서 플레이어 역할(P1 -> P2 -> SPECTATOR) 순환 로테이션
  function rotatePlayerRoles() {
    const roster = State.playerRoster;
    if (roster.length < 2) return;

    const currentRoles = roster.map(p => p.role);
    const lastRole = currentRoles.pop();
    currentRoles.unshift(lastRole);

    if (!currentRoles.includes('P1')) currentRoles[0] = 'P1';
    if (!currentRoles.includes('P2')) currentRoles[1 % currentRoles.length] = 'P2';

    roster.forEach((p, idx) => {
      p.role = currentRoles[idx];
    });

    applyMyRoleFromRoster();
    renderPlayerRoster();
  }

  function applyMyRoleFromRoster() {
    const p2pStatusText = document.getElementById('p2p-status-text');

    if (State.isP2PConnected) {
      const me = State.playerRoster.find(p => p.id === State.myPeerId);
      if (!me) return;

      const hasHumanP2 = State.playerRoster.some(p => p.role === 'P2' && p.id !== 'local-2');
      if (hasHumanP2) {
        State.aiHelperEnabled = false;
        callbacks.onUpdateAiButtonUI();
      }

      const modePrefix = isSocketServerAvailable ? '서버방' : 'P2P방';
      if (me.role === 'P1') {
        callbacks.onSetMode('P1', 'mode-p1');
        if (p2pStatusText) p2pStatusText.textContent = `${modePrefix}: ${State.currentRoomCode} (🎨 1P 브러시)`;
      } else if (me.role === 'P2') {
        State.aiHelperEnabled = false;
        callbacks.onUpdateAiButtonUI();
        callbacks.onSetMode('P2', 'mode-p2');
        if (p2pStatusText) p2pStatusText.textContent = `${modePrefix}: ${State.currentRoomCode} (🕹️ 2P 팔레트)`;
      } else {
        callbacks.onSetMode('SPECTATOR', 'mode-spec');
        if (p2pStatusText) p2pStatusText.textContent = `${modePrefix}: ${State.currentRoomCode} (👀 구경꾼)`;
      }
    } else {
      if (State.controlMode === 'P1') {
        State.aiHelperEnabled = false;
        callbacks.onUpdateAiButtonUI();
        callbacks.onSetMode('P2', 'mode-p2');
      } else if (State.controlMode === 'P2') {
        State.aiHelperEnabled = true;
        callbacks.onUpdateAiButtonUI();
        callbacks.onSetMode('P1', 'mode-p1');
      }
    }
  }

  function sendNetworkPacket(payload) {
    if (netChannel) {
      try { netChannel.postMessage(payload); } catch (e) {}
    }

    if (State.isP2PConnected && isSocketServerAvailable && socketIoClient) {
      socketIoClient.emit('PACKET', payload);
      return;
    }

    if (State.isP2PConnected) {
      if (State.isP2PHost) {
        guestConnections.forEach(conn => {
          if (conn && conn.open) {
            try { conn.send(payload); } catch (e) {}
          }
        });
      } else if (hostConnection && hostConnection.open) {
        try { hostConnection.send(payload); } catch (e) {}
      }
    }
  }

  function switchModalToWaitingView() {
    const connectView = document.getElementById('mp-connect-view');
    const waitingView = document.getElementById('mp-waiting-view');
    const waitingRoomCode = document.getElementById('waiting-room-code');
    if (connectView) connectView.classList.add('hidden');
    if (waitingView) waitingView.classList.remove('hidden');
    if (waitingRoomCode) waitingRoomCode.textContent = State.currentRoomCode;
    renderPlayerRoster();
  }

  function closeMultiModal() {
    const multiModal = document.getElementById('multi-modal');
    if (multiModal) {
      multiModal.classList.add('hidden');
      multiModal.classList.remove('flex');
    }
  }

  function openMultiModal() {
    const mpNickInput = document.getElementById('mp-nickname');
    if (mpNickInput) mpNickInput.value = State.myNickname;

    const multiModal = document.getElementById('multi-modal');
    if (multiModal) {
      multiModal.classList.remove('hidden');
      multiModal.classList.add('flex');
    }
    if (State.isP2PConnected) {
      switchModalToWaitingView();
    }
  }

  function handleIncomingPacket(data, sourceConn = null) {
    if (!data) return;

    if (!isSocketServerAvailable && State.isP2PHost && sourceConn) {
      guestConnections.forEach(c => {
        if (c !== sourceConn && c.open) {
          try { c.send(data); } catch (e) {}
        }
      });
    }

    const { p1Obj, p2Obj, drawCanvas } = Scene3D.getSceneObjects();

    if (data.type === 'MOVE_P1' && State.controlMode !== 'P1') {
      p1Obj.group.position.set(data.x, 0, data.z);
      State.p1State.vx = typeof data.vx === 'number' ? data.vx : 0;
      State.p1State.vz = typeof data.vz === 'number' ? data.vz : 0;
    } else if (data.type === 'MOVE_P2' && State.controlMode !== 'P2') {
      p2Obj.group.position.set(data.x, 0, data.z);
      State.p2State.vx = typeof data.vx === 'number' ? data.vx : 0;
      State.p2State.vz = typeof data.vz === 'number' ? data.vz : 0;
      State.isPenDown = Boolean(data.isPenDown);
      if (data.activeColorHex !== undefined) State.activeColorHex = data.activeColorHex;
      if (data.activeColorName !== undefined) State.activeColorName = data.activeColorName;
    } else if (data.type === 'CUSTOM_UPDATE' && data.peerId && data.custom) {
      const target = State.playerRoster.find(p => p.id === data.peerId);
      if (target) {
        target.custom = data.custom;
        if (data.nickname) target.nickname = data.nickname;
        renderPlayerRoster();
      }
    } else if (data.type === 'START_GAME') {
      State.currentRound = data.round || 1;
      if (typeof data.promptIndex === 'number') {
        State.currentPromptIndex = data.promptIndex;
      }
      if (data.roster) {
        State.playerRoster = data.roster;
      }
      applyMyRoleFromRoster();
      renderPlayerRoster();
      closeMultiModal();
      const entryScreen = document.getElementById('entry-screen');
      if (entryScreen) entryScreen.classList.add('hidden');
      callbacks.onAddChatMessage('', `🚀 방장이 게임을 시작했습니다! ROUND ${State.currentRound} 출발!`, 'system');
      callbacks.onStartRound(true);
    } else if (data.type === 'CHAT') {
      if (State.gameState === 'PLAYING' && callbacks.normalizeAnswer(data.text) === callbacks.normalizeAnswer(State.currentPrompt.word)) {
        callbacks.onAddChatMessage('', `🎊 [${data.sender}]님이 정답 [${State.currentPrompt.word}]을 맞혔습니다!`, 'correct');
        callbacks.onEndRound(true, data.sender, data.timeLeft);
      } else {
        callbacks.onAddChatMessage(data.sender, data.text);
      }
    } else if (data.type === 'ROUND_WIN') {
      if (State.gameState === 'PLAYING') {
        if (data.roster) {
          State.playerRoster = data.roster;
          renderPlayerRoster();
        }
        callbacks.onAddChatMessage('', `🎊 [${data.winnerName}]님이 정답 [${State.currentPrompt.word}]을 맞혔습니다!`, 'correct');
        callbacks.onEndRound(true, data.winnerName, data.timeLeft, true);
      }
    } else if (data.type === 'NEXT_ROUND') {
      State.currentRound = data.round || (State.currentRound + 1);
      if (typeof data.promptIndex === 'number') {
        State.currentPromptIndex = data.promptIndex;
      }
      if (data.roster) {
        State.playerRoster = data.roster;
        applyMyRoleFromRoster();
        renderPlayerRoster();
      } else {
        rotatePlayerRoles();
      }
      closeMultiModal();
      callbacks.onStartRound(true);
    } else if (data.type === 'CLEAR') {
      Scene3D.clearCanvas();
      if (data.by) {
        callbacks.onAddChatMessage('', `💥 ${data.by}가 [도화지 지우기] 발판을 밟아 도화지를 초기화했습니다!`, 'system');
      }
    } else if (data.type === 'ROSTER_SYNC') {
      State.playerRoster = data.roster || State.playerRoster;
      if (Array.isArray(State.playerRoster) && State.playerRoster[0]) {
        State.isP2PHost = State.playerRoster[0].id === State.myPeerId;
      }
      applyMyRoleFromRoster();
      renderPlayerRoster();
      if (data.joinNotice) callbacks.onAddChatMessage('', data.joinNotice, 'system');
      if (data.leaveNotice) callbacks.onAddChatMessage('', data.leaveNotice, 'system');
    } else if (data.type === 'REQUEST_CANVAS_SYNC') {
      sendNetworkPacket({
        type: 'CANVAS_SYNC',
        targetPeerId: data.targetPeerId,
        dataUrl: drawCanvas.toDataURL('image/png')
      });
    } else if (data.type === 'CANVAS_SYNC' && data.dataUrl) {
      Scene3D.loadCanvasFromDataURL(data.dataUrl);
    }
  }

  function tryDetectSocketServer(onDetected) {
    if (window.location.protocol === 'file:') return;
    const script = document.createElement('script');
    script.src = '/socket.io/socket.io.js';
    script.async = true;
    script.onload = () => {
      if (typeof window.io === 'function') {
        isSocketServerAvailable = true;
        onDetected();
      }
    };
    script.onerror = () => {
      isSocketServerAvailable = false;
    };
    document.head.appendChild(script);
  }

  function connectViaSocketServer(isHostIntent, showMpFeedback, p2pBadge) {
    if (!socketIoClient) {
      socketIoClient = window.io();
      socketIoClient.on('PACKET', (data) => {
        if (data.type === 'WELCOME') {
          State.myPeerId = data.peerId;
          State.isP2PConnected = true;
          State.isP2PHost = Boolean(data.isHost);
          State.currentRound = data.round || 1;
          if (typeof data.promptIndex === 'number') {
            State.currentPromptIndex = data.promptIndex;
            State.currentPrompt = Config.WORD_POOL[State.currentPromptIndex % Config.WORD_POOL.length];
          }
          State.playerRoster = data.roster || State.playerRoster;
          applyMyRoleFromRoster();
          renderPlayerRoster();

          p2pBadge.classList.remove('hidden');
          p2pBadge.classList.add('flex');

          if (data.roomStatus === 'PLAYING') {
            closeMultiModal();
            callbacks.onStartRound(true);
          } else {
            callbacks.onPauseForWaitingRoom();
            switchModalToWaitingView();
            showMpFeedback(`✅ 대기방 [${State.currentRoomCode}] 입장 완료! 인원이 모이면 게임을 시작하세요.`);
          }
        } else {
          handleIncomingPacket(data, null);
        }
      });
    }

    showMpFeedback(`⏳ 서버 대기방 [${State.currentRoomCode}]에 접속 중...`);
    socketIoClient.emit('JOIN_ROOM', {
      roomCode: State.currentRoomCode,
      nickname: State.myNickname,
      custom: { ...State.myCustom },
      isHostIntent
    });
  }

  function initNetworkAndLobby(cb) {
    callbacks = { ...callbacks, ...cb };

    try {
      netChannel = new BroadcastChannel('banban_moomani_3d_sync');
      netChannel.onmessage = (e) => handleIncomingPacket(e.data, null);
    } catch (err) {
      console.warn('BroadcastChannel not supported in this context.');
    }

    const mpFeedback = document.getElementById('mp-feedback');
    const p2pBadge = document.getElementById('p2p-status-badge');
    const modeBadge = document.getElementById('mp-mode-badge');

    tryDetectSocketServer(() => {
      if (modeBadge) {
        modeBadge.textContent = '⚡ Socket.io 서버 연동됨';
        modeBadge.className = 'bg-emerald-600 text-white text-xs font-extrabold px-2.5 py-1 rounded-lg';
      }
    });

    function showMpFeedback(msg, isError = false) {
      mpFeedback.textContent = msg;
      mpFeedback.className = isError
        ? 'text-xs font-semibold text-rose-300 bg-rose-500/15 border border-rose-500/30 rounded-xl px-3 py-2 mt-2 block'
        : 'text-xs font-semibold text-sky-300 bg-sky-500/15 border border-sky-500/30 rounded-xl px-3 py-2 mt-2 block';
    }

    function copyRoomCode() {
      const codeInput = document.getElementById('mp-roomcode');
      const codeVal = (State.currentRoomCode || codeInput.value || 'PARTY7').trim().toUpperCase();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(codeVal);
      }
      showMpFeedback(`📋 방 코드 [${codeVal}]가 복사되었습니다! 친구에게 알려주세요.`);
    }

    function copyInviteLink() {
      const codeInput = document.getElementById('mp-roomcode');
      const codeVal = (State.currentRoomCode || codeInput.value || 'PARTY7').trim().toUpperCase();
      const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(codeVal)}`;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(inviteUrl);
      }
      showMpFeedback(`🔗 초대 링크가 복사되었습니다! 카톡이나 디스코드에 붙여넣어 친구를 초대하세요.`);
    }

    // URL 쿼리 파라미터(?room=PARTY7) 감지 시 방 코드 자동 세팅
    const urlParams = new URLSearchParams(window.location.search);
    const invitedRoom = urlParams.get('room');
    if (invitedRoom) {
      const cleanInvited = invitedRoom.trim().toUpperCase().slice(0, 10);
      const roomInput = document.getElementById('mp-roomcode');
      if (roomInput) roomInput.value = cleanInvited;
      State.currentRoomCode = cleanInvited;
    }

    document.getElementById('btn-open-multi').addEventListener('click', openMultiModal);
    p2pBadge.addEventListener('click', openMultiModal);
    document.getElementById('btn-close-multi').addEventListener('click', closeMultiModal);

    // 멀티 모달 안에서 [👕 캐릭터 변경 / 꾸미기] 클릭 시 대기화면 커스터마이저 오픈
    const btnMpBackCustom = document.getElementById('btn-mp-back-custom');
    if (btnMpBackCustom) {
      btnMpBackCustom.addEventListener('click', () => {
        closeMultiModal();
        callbacks.onOpenCustomizer();
      });
    }
    const btnWaitingCustom = document.getElementById('btn-waiting-custom');
    if (btnWaitingCustom) {
      btnWaitingCustom.addEventListener('click', () => {
        closeMultiModal();
        callbacks.onOpenCustomizer();
      });
    }

    document.getElementById('btn-copy-code').addEventListener('click', copyRoomCode);
    document.getElementById('btn-waiting-copy-code').addEventListener('click', copyRoomCode);
    document.getElementById('btn-copy-link').addEventListener('click', copyInviteLink);
    document.getElementById('btn-waiting-copy-link').addEventListener('click', copyInviteLink);

    // 대기방 내 [🔄 역할 로테이션] 버튼 (방장 전용)
    const btnSwapRoles = document.getElementById('btn-swap-roles');
    if (btnSwapRoles) {
      btnSwapRoles.addEventListener('click', () => {
        if (!State.isP2PHost) return;
        rotatePlayerRoles();
        sendNetworkPacket({ type: 'ROSTER_SYNC', roster: State.playerRoster });
        showMpFeedback('🔄 참가자들의 역할(1P/2P/구경꾼)을 순환 교체했습니다!');
      });
    }

    // 대기방 내 [🎮 게임 시작!] 버튼 (방장 전용)
    const btnStartMpGame = document.getElementById('btn-start-mp-game');
    if (btnStartMpGame) {
      btnStartMpGame.addEventListener('click', () => {
        if (!State.isP2PHost) return;
        State.currentRound = 1;
        State.currentPromptIndex = 0;
        applyMyRoleFromRoster();
        renderPlayerRoster();
        closeMultiModal();

        sendNetworkPacket({
          type: 'START_GAME',
          round: State.currentRound,
          promptIndex: State.currentPromptIndex,
          roster: State.playerRoster
        });

        callbacks.onAddChatMessage('', `🎮 대기방 인원 준비 완료! ROUND 1 게임을 시작합니다!`, 'system');
        callbacks.onStartRound(false);
      });
    }

    // [대기방 만들기 - 방장]
    document.getElementById('btn-host-room').addEventListener('click', () => {
      State.myNickname = (document.getElementById('mp-nickname').value || State.myNickname || '방장화가').trim();
      State.currentRoomCode = (document.getElementById('mp-roomcode').value || 'PARTY7').trim().toUpperCase();
      Config.saveProfile(State.myNickname, State.myCustom);

      if (isSocketServerAvailable && typeof window.io === 'function') {
        connectViaSocketServer(true, showMpFeedback, p2pBadge);
        return;
      }

      if (typeof Peer === 'undefined') {
        showMpFeedback('PeerJS 라이브러리를 불러오지 못했습니다.', true);
        return;
      }
      const hostPeerId = Config.PEER_PREFIX + State.currentRoomCode;

      if (peer) peer.destroy();
      showMpFeedback(`⏳ 무서버 P2P 대기방 [${State.currentRoomCode}] 생성 중...`);

      peer = new Peer(hostPeerId);
      peer.on('open', (id) => {
        State.myPeerId = id;
        State.isP2PConnected = true;
        State.isP2PHost = true;

        State.playerRoster = [{
          id: State.myPeerId,
          nickname: State.myNickname,
          role: 'P1',
          score: 0,
          custom: { ...State.myCustom }
        }];
        applyMyRoleFromRoster();
        renderPlayerRoster();

        p2pBadge.classList.remove('hidden');
        p2pBadge.classList.add('flex');

        callbacks.onPauseForWaitingRoom();
        switchModalToWaitingView();
        showMpFeedback(`✅ 대기방 [${State.currentRoomCode}] 개설 완료! 친구가 들어오면 [🎮 게임 시작!]을 눌러주세요.`);
        callbacks.onAddChatMessage('', `🌐 대기방 [${State.currentRoomCode}]이 개설되었습니다! 친구들을 기다리는 중...`, 'system');
      });

      peer.on('connection', (conn) => {
        guestConnections.push(conn);
        conn.on('open', () => {
          const hasP1 = State.playerRoster.some(p => p.role === 'P1');
          const hasP2 = State.playerRoster.some(p => p.role === 'P2');
          let assignedRole = 'SPECTATOR';
          if (!hasP1) assignedRole = 'P1';
          else if (!hasP2) assignedRole = 'P2';

          const guestName = conn.metadata?.nickname || `친구${guestConnections.length}`;
          const guestCustom = conn.metadata?.custom || { color: '#06b6d4', hat: 'HELMET', face: 'NORMAL' };

          if (assignedRole === 'P2') {
            State.aiHelperEnabled = false;
            callbacks.onUpdateAiButtonUI();
          }

          State.playerRoster.push({
            id: conn.peer,
            nickname: guestName,
            role: assignedRole,
            score: 0,
            custom: guestCustom
          });
          renderPlayerRoster();

          const { drawCanvas } = Scene3D.getSceneObjects();
          conn.send({
            type: 'WELCOME',
            peerId: conn.peer,
            isHost: false,
            roomStatus: State.gameState,
            assignedRole,
            round: State.currentRound,
            promptIndex: State.currentPromptIndex,
            roster: State.playerRoster,
            canvasDataUrl: State.gameState === 'PLAYING' ? drawCanvas.toDataURL('image/png') : null
          });

          const joinNotice = `👋 [${guestName}]님이 대기방에 입장하여 [${assignedRole === 'P2' ? '🕹️ 2P 팔레트' : '👀 구경꾼'}] 역할을 맡았습니다!`;
          sendNetworkPacket({ type: 'ROSTER_SYNC', roster: State.playerRoster, joinNotice });
          callbacks.onAddChatMessage('', joinNotice, 'system');
          showMpFeedback(`👋 [${guestName}]님이 대기방에 입장했습니다!`);
        });

        conn.on('data', (data) => handleIncomingPacket(data, conn));
        conn.on('close', () => {
          State.playerRoster = State.playerRoster.filter(p => p.id !== conn.peer);
          renderPlayerRoster();
          sendNetworkPacket({ type: 'ROSTER_SYNC', roster: State.playerRoster });
        });
      });

      peer.on('error', (err) => {
        showMpFeedback(`⚠️ 오류: 이미 사용 중인 방 코드이거나 연결할 수 없습니다 (${err.type})`, true);
      });
    });

    // [친구 대기방 입장하기 - 2P 또는 구경꾼]
    document.getElementById('btn-join-room').addEventListener('click', () => {
      State.myNickname = (document.getElementById('mp-nickname').value || State.myNickname || '팔레트장인').trim();
      State.currentRoomCode = (document.getElementById('mp-roomcode').value || 'PARTY7').trim().toUpperCase();
      Config.saveProfile(State.myNickname, State.myCustom);

      if (isSocketServerAvailable && typeof window.io === 'function') {
        connectViaSocketServer(false, showMpFeedback, p2pBadge);
        return;
      }

      if (typeof Peer === 'undefined') {
        showMpFeedback('PeerJS 라이브러리를 불러오지 못했습니다.', true);
        return;
      }
      const targetHostId = Config.PEER_PREFIX + State.currentRoomCode;

      if (peer) peer.destroy();
      showMpFeedback(`⏳ 대기방 [${State.currentRoomCode}]에 연결 중...`);

      peer = new Peer();
      peer.on('open', (id) => {
        State.myPeerId = id;
        const conn = peer.connect(targetHostId, {
          metadata: {
            nickname: State.myNickname,
            custom: { ...State.myCustom }
          }
        });
        hostConnection = conn;

        conn.on('open', () => {
          State.isP2PConnected = true;
          State.isP2PHost = false;
          showMpFeedback(`✅ 대기방 [${State.currentRoomCode}] 연결 성공! 역할 정보를 불러오는 중...`);
        });

        conn.on('data', (data) => {
          if (data.type === 'WELCOME') {
            if (data.peerId) State.myPeerId = data.peerId;
            State.isP2PHost = Boolean(data.isHost);
            State.currentRound = data.round || 1;
            if (typeof data.promptIndex === 'number') {
              State.currentPromptIndex = data.promptIndex;
              State.currentPrompt = Config.WORD_POOL[State.currentPromptIndex % Config.WORD_POOL.length];
            }
            State.playerRoster = data.roster || State.playerRoster;
            applyMyRoleFromRoster();
            renderPlayerRoster();

            if (data.canvasDataUrl) {
              Scene3D.loadCanvasFromDataURL(data.canvasDataUrl);
            }

            p2pBadge.classList.remove('hidden');
            p2pBadge.classList.add('flex');

            if (data.roomStatus === 'PLAYING') {
              closeMultiModal();
              callbacks.onAddChatMessage('', `🚀 진행 중인 방 [${State.currentRoomCode}]에 합류했습니다!`, 'system');
            } else {
              callbacks.onPauseForWaitingRoom();
              switchModalToWaitingView();
              showMpFeedback(`✅ 대기방 입장 완료! 내 역할: ${data.assignedRole === 'P2' ? '🕹️ 2P 팔레트 엔지니어' : '👀 구경꾼'}`);
            }
          } else {
            handleIncomingPacket(data, null);
          }
        });

        conn.on('error', () => {
          showMpFeedback('⚠️ 호스트와 연결 중 오류가 발생했습니다.', true);
        });
      });

      peer.on('error', (err) => {
        showMpFeedback(`⚠️ 대기방 [${State.currentRoomCode}]을 찾을 수 없습니다. 방 코드를 확인하세요! (${err.type})`, true);
      });
    });

    renderPlayerRoster();
  }

  return {
    initNetworkAndLobby,
    sendNetworkPacket,
    renderPlayerRoster,
    rotatePlayerRoles,
    applyMyRoleFromRoster,
    broadcastMyCustomization,
    openMultiModal
  };
})();
