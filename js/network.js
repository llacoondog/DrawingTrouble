// ==========================================
// 반반 무마니 3D - BroadcastChannel 및 PeerJS P2P 네트워크 (network.js)
// ==========================================
window.BanBan = window.BanBan || {};

window.BanBan.Network = (function () {
  const { Config, State, Scene3D } = window.BanBan;

  let netChannel = null;
  let peer = null;
  let hostConnection = null;
  const guestConnections = [];
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
      if (p.role === 'P1') {
        span.className = 'text-[11px] px-2.5 py-1 rounded-lg bg-pink-500/20 border border-pink-500/40 text-pink-200 font-bold';
        span.textContent = `🎨 1P ${p.nickname} (${p.score}점)`;
      } else if (p.role === 'P2') {
        span.className = 'text-[11px] px-2.5 py-1 rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-200 font-bold';
        span.textContent = `🕹️ 2P ${p.nickname} (${p.score}점)`;
      } else {
        span.className = 'text-[11px] px-2.5 py-1 rounded-lg bg-slate-700/60 border border-white/10 text-slate-300 font-semibold';
        span.textContent = `👀 ${p.nickname} (${p.score}점)`;
      }
      listEl.appendChild(span);
    });
  }

  function sendNetworkPacket(payload) {
    // 1) 같은 브라우저 다른 탭으로 전송
    if (netChannel) {
      try { netChannel.postMessage(payload); } catch (e) {}
    }
    // 2) PeerJS P2P 원격 친구들에게 전송
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

    // 호스트인 경우 게스트가 보낸 패킷을 다른 게스트들에게도 릴레이
    if (State.isP2PHost && sourceConn) {
      guestConnections.forEach(c => {
        if (c !== sourceConn && c.open) {
          try { c.send(data); } catch (e) {}
        }
      });
    }

    const { p1Obj, p2Obj } = Scene3D.getSceneObjects();

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
        callbacks.onEndRound(true, data.sender);
      } else {
        callbacks.onAddChatMessage(data.sender, data.text);
      }
    } else if (data.type === 'ROUND_WIN') {
      if (State.gameState === 'PLAYING') {
        callbacks.onAddChatMessage('', `🎊 [${data.winnerName}]님이 정답 [${State.currentPrompt.word}]을 맞혔습니다!`, 'correct');
        callbacks.onEndRound(true, data.winnerName);
      }
    } else if (data.type === 'NEXT_ROUND') {
      State.currentRound = data.round || (State.currentRound + 1);
      callbacks.onStartRound();
    } else if (data.type === 'CLEAR') {
      Scene3D.clearCanvas();
    } else if (data.type === 'ROSTER_SYNC') {
      State.playerRoster = data.roster || State.playerRoster;
      renderPlayerRoster();
    }
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

    function showMpFeedback(msg, isError = false) {
      mpFeedback.textContent = msg;
      mpFeedback.className = isError
        ? 'text-xs font-semibold text-rose-300 bg-rose-500/15 border border-rose-500/30 rounded-xl px-3 py-2 mb-4 block'
        : 'text-xs font-semibold text-sky-300 bg-sky-500/15 border border-sky-500/30 rounded-xl px-3 py-2 mb-4 block';
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
      codeInput.select();
      document.execCommand('copy');
      showMpFeedback(`📋 방 코드 [${codeInput.value.toUpperCase()}]가 복사되었습니다! 친구에게 알려주세요.`);
    });

    // [방 만들기 - 1P 호스트]
    document.getElementById('btn-host-room').addEventListener('click', () => {
      if (typeof Peer === 'undefined') {
        showMpFeedback('PeerJS 라이브러리를 불러오지 못했습니다.', true);
        return;
      }
      State.myNickname = (document.getElementById('mp-nickname').value || '방장화가').trim();
      State.currentRoomCode = (document.getElementById('mp-roomcode').value || 'PARTY7').trim().toUpperCase();
      const hostPeerId = Config.PEER_PREFIX + State.currentRoomCode;

      if (peer) peer.destroy();
      showMpFeedback(`⏳ 방 [${State.currentRoomCode}] 생성 중...`);

      peer = new Peer(hostPeerId);
      peer.on('open', () => {
        State.isP2PConnected = true;
        State.isP2PHost = true;
        callbacks.onSetMode('P1', 'mode-p1'); // 방장은 1P 브러시 러너 담당

        State.playerRoster = [{ id: 'host', nickname: State.myNickname, role: 'P1', score: 0 }];
        renderPlayerRoster();

        p2pBadge.classList.remove('hidden');
        p2pBadge.classList.add('flex');
        p2pStatusText.textContent = `방 코드: ${State.currentRoomCode} (1P 호스트)`;

        showMpFeedback(`✅ 방 [${State.currentRoomCode}] 개설 완료! 친구가 입장하면 자동으로 2P/구경꾼이 배정됩니다.`);
        callbacks.onAddChatMessage('', `🌐 멀티플레이 방 [${State.currentRoomCode}]이 개설되었습니다! 친구에게 방 코드를 공유하세요.`, 'system');
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

          conn.send({
            type: 'WELCOME',
            assignedRole,
            round: State.currentRound,
            roster: State.playerRoster
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
      if (typeof Peer === 'undefined') {
        showMpFeedback('PeerJS 라이브러리를 불러오지 못했습니다.', true);
        return;
      }
      State.myNickname = (document.getElementById('mp-nickname').value || '팔레트장인').trim();
      State.currentRoomCode = (document.getElementById('mp-roomcode').value || 'PARTY7').trim().toUpperCase();
      const targetHostId = Config.PEER_PREFIX + State.currentRoomCode;

      if (peer) peer.destroy();
      showMpFeedback(`⏳ 방 [${State.currentRoomCode}]에 연결 중...`);

      peer = new Peer();
      peer.on('open', () => {
        const conn = peer.connect(targetHostId, { metadata: { nickname: State.myNickname } });
        hostConnection = conn;

        conn.on('open', () => {
          State.isP2PConnected = true;
          State.isP2PHost = false;
          showMpFeedback(`✅ 방 [${State.currentRoomCode}] 입장 성공! 잠시 후 역할이 배정됩니다.`);
        });

        conn.on('data', (data) => {
          if (data.type === 'WELCOME') {
            State.currentRound = data.round || 1;
            State.playerRoster = data.roster || State.playerRoster;
            renderPlayerRoster();

            if (data.assignedRole === 'P2') {
              State.aiHelperEnabled = false;
              callbacks.onUpdateAiButtonUI();
              callbacks.onSetMode('P2', 'mode-p2');
              p2pStatusText.textContent = `방: ${State.currentRoomCode} (2P 팔레트)`;
            } else {
              callbacks.onSetMode('SPECTATOR', 'mode-spec');
              p2pStatusText.textContent = `방: ${State.currentRoomCode} (구경꾼)`;
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
  }

  return {
    initNetworkAndLobby,
    sendNetworkPacket,
    renderPlayerRoster
  };
})();
