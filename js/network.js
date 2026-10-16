// ==========================================
// 반반 무마니 3D - 하이브리드 멀티플레이 네트워크 (network.js)
// 1) 무설치/서버비 0원: PeerJS(WebRTC) P2P 모드 + BroadcastChannel 탭 연동
// 2) 선택 구동 서버: Node.js + Socket.io(server.js) 감지 시 자동 전환
// ==========================================
window.BanBan = window.BanBan || {};

window.BanBan.Network = (function () {
  const { Config, State, Scene3D } = window.BanBan;

  let netChannel = null;
  let peer = null;
  let hostConnection = null;
  const guestConnections = [];

  // Socket.io 서버 연결 상태 (server.js 구동 시 자동 활성화)
  let socketIoClient = null;
  let isSocketServerAvailable = false;

  let callbacks = {
    onAddChatMessage: () => {},
    onEndRound: () => {},
    onStartRound: () => {},
    onSetMode: () => {},
    onUpdateAiButtonUI: () => {},
    normalizeAnswer: (s) => s.replace(/\s+/g, '').toLowerCase()
  };

  function renderPlayerRoster() {
    const listEl = document.getElementById('player-list');
    if (!listEl) return;
    listEl.innerHTML = '';
    State.playerRoster.forEach(p => {
      const span = document.createElement('span');
      const isMe = State.isP2PConnected && p.id === State.myPeerId;
      const meTag = isMe ? ' (나)' : '';
      if (p.role === 'P1') {
        span.className = 'text-[11px] px-2.5 py-1 rounded-lg bg-pink-500/20 border border-pink-500/40 text-pink-200 font-bold';
        span.textContent = `🎨 1P ${p.nickname}${meTag} (${p.score}점)`;
      } else if (p.role === 'P2') {
        span.className = 'text-[11px] px-2.5 py-1 rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-200 font-bold';
        span.textContent = `🕹️ 2P ${p.nickname}${meTag} (${p.score}점)`;
      } else {
        span.className = 'text-[11px] px-2.5 py-1 rounded-lg bg-slate-700/60 border border-white/10 text-slate-300 font-semibold';
        span.textContent = `👀 ${p.nickname}${meTag} (${p.score}점)`;
      }
      listEl.appendChild(span);
    });

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

  // 라운드마다 플레이어 역할(P1 -> P2 -> SPECTATOR) 순환 로테이션
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

  // 로스터 기준으로 내 조작 모드(P1 / P2 / SPECTATOR) 및 상태 배지 자동 적용
  function applyMyRoleFromRoster() {
    const p2pStatusText = document.getElementById('p2p-status-text');

    if (State.isP2PConnected) {
      const me = State.playerRoster.find(p => p.id === State.myPeerId);
      if (!me) return;

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
    // 1) 같은 브라우저 다른 탭으로 전송
    if (netChannel) {
      try { netChannel.postMessage(payload); } catch (e) {}
    }

    // 2) Socket.io 서버 모드가 활성화된 경우
    if (State.isP2PConnected && isSocketServerAvailable && socketIoClient) {
      socketIoClient.emit('PACKET', payload);
      return;
    }

    // 3) PeerJS 무서버 P2P 원격 친구들에게 전송
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

  function handleIncomingPacket(data, sourceConn = null) {
    if (!data) return;

    // PeerJS P2P 호스트인 경우 게스트가 보낸 패킷을 다른 게스트들에게도 릴레이
    if (!isSocketServerAvailable && State.isP2PHost && sourceConn) {
      guestConnections.forEach(c => {
        if (c !== sourceConn && c.open) {
          try { c.send(data); } catch (e) {}
        }
      });
    }

    const { p1Obj, p2Obj, drawCanvas } = Scene3D.getSceneObjects();

    if (data.type === 'MOVE_P1' && State.controlMode !== 'P1') {
      const prevX = p1Obj.group.position.x;
      const prevZ = p1Obj.group.position.z;
      p1Obj.group.position.set(data.x, 0, data.z);
      State.p1State.vx = data.x - prevX;
      State.p1State.vz = data.z - prevZ;
    } else if (data.type === 'MOVE_P2' && State.controlMode !== 'P2') {
      const prevX = p2Obj.group.position.x;
      const prevZ = p2Obj.group.position.z;
      p2Obj.group.position.set(data.x, 0, data.z);
      State.p2State.vx = data.x - prevX;
      State.p2State.vz = data.z - prevZ;
      State.isPenDown = data.isPenDown;
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
      callbacks.onStartRound(true);
    } else if (data.type === 'CLEAR') {
      Scene3D.clearCanvas();
    } else if (data.type === 'ROSTER_SYNC') {
      State.playerRoster = data.roster || State.playerRoster;
      const hasHumanP2 = State.playerRoster.some(p => p.role === 'P2' && p.id !== 'local-2');
      if (hasHumanP2 && State.aiHelperEnabled) {
        State.aiHelperEnabled = false;
        callbacks.onUpdateAiButtonUI();
      }
      applyMyRoleFromRoster();
      renderPlayerRoster();
      if (data.joinNotice) callbacks.onAddChatMessage('', data.joinNotice, 'system');
      if (data.leaveNotice) callbacks.onAddChatMessage('', data.leaveNotice, 'system');
    } else if (data.type === 'REQUEST_CANVAS_SYNC') {
      // 서버가 중도 입장자를 위해 현재 캔버스 스냅샷을 요청한 경우
      sendNetworkPacket({
        type: 'CANVAS_SYNC',
        targetPeerId: data.targetPeerId,
        dataUrl: drawCanvas.toDataURL('image/png')
      });
    } else if (data.type === 'CANVAS_SYNC' && data.dataUrl) {
      Scene3D.loadCanvasFromDataURL(data.dataUrl);
    }
  }

  // server.js(Socket.io)가 실행 중인지 자동으로 감지하여 로드
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

  function connectViaSocketServer(isHostIntent, showMpFeedback, multiModal, p2pBadge) {
    if (!socketIoClient) {
      socketIoClient = window.io();
      socketIoClient.on('PACKET', (data) => {
        if (data.type === 'WELCOME') {
          State.myPeerId = data.peerId;
          State.isP2PConnected = true;
          State.isP2PHost = isHostIntent;
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
          multiModal.classList.add('hidden');
          multiModal.classList.remove('flex');
        } else {
          handleIncomingPacket(data, null);
        }
      });
    }

    showMpFeedback(`⏳ 서버 방 [${State.currentRoomCode}]에 접속 중...`);
    socketIoClient.emit('JOIN_ROOM', {
      roomCode: State.currentRoomCode,
      nickname: State.myNickname,
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

    const multiModal = document.getElementById('multi-modal');
    const mpFeedback = document.getElementById('mp-feedback');
    const p2pBadge = document.getElementById('p2p-status-badge');
    const p2pStatusText = document.getElementById('p2p-status-text');
    const modeBadge = document.getElementById('mp-mode-badge');

    // Socket.io 서버 구동 여부 자동 감지
    tryDetectSocketServer(() => {
      if (modeBadge) {
        modeBadge.textContent = '⚡ Socket.io 서버 연동됨';
        modeBadge.className = 'bg-emerald-600 text-white text-xs font-extrabold px-2.5 py-1 rounded-lg';
      }
    });

    function showMpFeedback(msg, isError = false) {
      mpFeedback.textContent = msg;
      mpFeedback.className = isError
        ? 'text-xs font-semibold text-rose-300 bg-rose-500/15 border border-rose-500/30 rounded-xl px-3 py-2 mb-4 block'
        : 'text-xs font-semibold text-sky-300 bg-sky-500/15 border border-sky-500/30 rounded-xl px-3 py-2 mb-4 block';
    }

    // URL 쿼리 파라미터(?room=PARTY7) 감지 시 자동으로 방 코드 입력 및 로비 모달 오픈
    const urlParams = new URLSearchParams(window.location.search);
    const invitedRoom = urlParams.get('room');
    if (invitedRoom) {
      const cleanInvited = invitedRoom.trim().toUpperCase().slice(0, 10);
      const roomInput = document.getElementById('mp-roomcode');
      if (roomInput) roomInput.value = cleanInvited;
      State.currentRoomCode = cleanInvited;
      multiModal.classList.remove('hidden');
      multiModal.classList.add('flex');
      showMpFeedback(`💌 초대 링크로 접속하셨습니다! 닉네임을 확인하고 [🚀 친구 방 입장하기]를 눌러주세요.`);
    }

    document.getElementById('btn-open-multi').addEventListener('click', () => {
      multiModal.classList.remove('hidden');
      multiModal.classList.add('flex');
    });

    document.getElementById('btn-close-multi').addEventListener('click', () => {
      multiModal.classList.add('hidden');
      multiModal.classList.remove('flex');
    });

    document.getElementById('btn-copy-code').addEventListener('click', () => {
      const codeInput = document.getElementById('mp-roomcode');
      const codeVal = (codeInput.value || 'PARTY7').trim().toUpperCase();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(codeVal);
      } else {
        codeInput.select();
        document.execCommand('copy');
      }
      showMpFeedback(`📋 방 코드 [${codeVal}]가 복사되었습니다! 친구에게 알려주세요.`);
    });

    // 초대 링크(?room=코드) 원클릭 복사
    const btnCopyLink = document.getElementById('btn-copy-link');
    if (btnCopyLink) {
      btnCopyLink.addEventListener('click', () => {
        const codeInput = document.getElementById('mp-roomcode');
        const codeVal = (codeInput.value || 'PARTY7').trim().toUpperCase();
        const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(codeVal)}`;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(inviteUrl);
        }
        showMpFeedback(`🔗 초대 링크가 복사되었습니다! 카톡이나 디스코드에 붙여넣어 친구를 바로 초대하세요.`);
      });
    }

    // [방 만들기 - 1P 호스트]
    document.getElementById('btn-host-room').addEventListener('click', () => {
      State.myNickname = (document.getElementById('mp-nickname').value || '방장화가').trim();
      State.currentRoomCode = (document.getElementById('mp-roomcode').value || 'PARTY7').trim().toUpperCase();

      // Socket.io 서버가 켜져 있으면 Socket.io 방 생성으로 처리
      if (isSocketServerAvailable && typeof window.io === 'function') {
        connectViaSocketServer(true, showMpFeedback, multiModal, p2pBadge);
        return;
      }

      if (typeof Peer === 'undefined') {
        showMpFeedback('PeerJS 라이브러리를 불러오지 못했습니다.', true);
        return;
      }
      const hostPeerId = Config.PEER_PREFIX + State.currentRoomCode;

      if (peer) peer.destroy();
      showMpFeedback(`⏳ 무서버 P2P 방 [${State.currentRoomCode}] 생성 중...`);

      peer = new Peer(hostPeerId);
      peer.on('open', (id) => {
        State.myPeerId = id;
        State.isP2PConnected = true;
        State.isP2PHost = true;
        callbacks.onSetMode('P1', 'mode-p1');

        State.playerRoster = [{ id: State.myPeerId, nickname: State.myNickname, role: 'P1', score: 0 }];
        renderPlayerRoster();

        p2pBadge.classList.remove('hidden');
        p2pBadge.classList.add('flex');
        p2pStatusText.textContent = `P2P방: ${State.currentRoomCode} (🎨 1P 브러시)`;

        showMpFeedback(`✅ 방 [${State.currentRoomCode}] 개설 완료! 코드나 초대 링크를 친구에게 공유하세요.`);
        callbacks.onAddChatMessage('', `🌐 무서버 P2P 방 [${State.currentRoomCode}]이 개설되었습니다!`, 'system');
      });

      peer.on('connection', (conn) => {
        guestConnections.push(conn);
        conn.on('open', () => {
          const hasP2 = State.playerRoster.some(p => p.role === 'P2');
          const assignedRole = hasP2 ? 'SPECTATOR' : 'P2';
          const guestName = conn.metadata?.nickname || `친구${guestConnections.length}`;

          if (assignedRole === 'P2') {
            State.aiHelperEnabled = false;
            callbacks.onUpdateAiButtonUI();
          }

          State.playerRoster.push({ id: conn.peer, nickname: guestName, role: assignedRole, score: 0 });
          renderPlayerRoster();

          const { drawCanvas } = Scene3D.getSceneObjects();
          conn.send({
            type: 'WELCOME',
            peerId: conn.peer,
            assignedRole,
            round: State.currentRound,
            promptIndex: State.currentPromptIndex,
            roster: State.playerRoster,
            canvasDataUrl: drawCanvas.toDataURL('image/png')
          });
          sendNetworkPacket({ type: 'ROSTER_SYNC', roster: State.playerRoster });
          callbacks.onAddChatMessage('', `👋 [${guestName}]님이 입장하여 [${assignedRole === 'P2' ? '🕹️ 2P 팔레트' : '👀 구경꾼'}] 역할을 맡았습니다!`, 'system');
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

    // [친구 방 입장하기 - 2P 또는 구경꾼]
    document.getElementById('btn-join-room').addEventListener('click', () => {
      State.myNickname = (document.getElementById('mp-nickname').value || '팔레트장인').trim();
      State.currentRoomCode = (document.getElementById('mp-roomcode').value || 'PARTY7').trim().toUpperCase();

      // Socket.io 서버가 켜져 있으면 Socket.io 방 입장으로 처리
      if (isSocketServerAvailable && typeof window.io === 'function') {
        connectViaSocketServer(false, showMpFeedback, multiModal, p2pBadge);
        return;
      }

      if (typeof Peer === 'undefined') {
        showMpFeedback('PeerJS 라이브러리를 불러오지 못했습니다.', true);
        return;
      }
      const targetHostId = Config.PEER_PREFIX + State.currentRoomCode;

      if (peer) peer.destroy();
      showMpFeedback(`⏳ 무서버 P2P 방 [${State.currentRoomCode}]에 연결 중...`);

      peer = new Peer();
      peer.on('open', (id) => {
        State.myPeerId = id;
        const conn = peer.connect(targetHostId, { metadata: { nickname: State.myNickname } });
        hostConnection = conn;

        conn.on('open', () => {
          State.isP2PConnected = true;
          State.isP2PHost = false;
          showMpFeedback(`✅ 방 [${State.currentRoomCode}] 입장 성공! 잠시 후 역할이 배정됩니다.`);
        });

        conn.on('data', (data) => {
          if (data.type === 'WELCOME') {
            if (data.peerId) State.myPeerId = data.peerId;
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
            multiModal.classList.add('hidden');
            multiModal.classList.remove('flex');
            callbacks.onAddChatMessage('', `🚀 방 [${State.currentRoomCode}]에 접속했습니다! 내 역할: ${data.assignedRole}`, 'system');
          } else {
            handleIncomingPacket(data, null);
          }
        });

        conn.on('error', () => {
          showMpFeedback('⚠️ 호스트와 연결 중 오류가 발생했습니다.', true);
        });
      });

      peer.on('error', (err) => {
        showMpFeedback(`⚠️ 방 [${State.currentRoomCode}]을 찾을 수 없습니다. 방 코드를 확인하세요! (${err.type})`, true);
      });
    });

    renderPlayerRoster();
  }

  return {
    initNetworkAndLobby,
    sendNetworkPacket,
    renderPlayerRoster,
    rotatePlayerRoles,
    applyMyRoleFromRoster
  };
})();
