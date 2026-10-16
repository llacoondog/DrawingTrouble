// ==========================================
// 반반 무마니 3D - 경량 멀티플레이 서버 (server.js)
// - 내 PC(로컬/무료 터널) 또는 무료 클라우드(Render.com Free 등) 구동용
// - 정적 호스팅(GitHub Pages 등)에서는 이 서버 없이도 PeerJS P2P로 100% 무료 작동합니다.
// ==========================================
const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// 현재 폴더의 정적 파일(index.html, css/, js/) 서빙
app.use(express.static(path.join(__dirname)));

// 방별 상태 관리 메모리 스토어
const rooms = new Map();

function getOrCreateRoom(roomCode) {
  if (!rooms.has(roomCode)) {
    rooms.set(roomCode, {
      code: roomCode,
      round: 1,
      promptIndex: 0,
      roster: []
    });
  }
  return rooms.get(roomCode);
}

io.on('connection', (socket) => {
  let currentRoom = null;

  socket.on('JOIN_ROOM', ({ roomCode, nickname, isHostIntent }) => {
    const code = (roomCode || 'PARTY7').trim().toUpperCase();
    const cleanName = (nickname || '익명화가').trim().slice(0, 10);

    if (currentRoom) {
      socket.leave(currentRoom);
    }
    currentRoom = code;
    socket.join(code);

    const room = getOrCreateRoom(code);

    // 역할 배정: 방에 P1이 없으면 P1, P2가 없으면 P2, 둘 다 있으면 SPECTATOR
    const hasP1 = room.roster.some(p => p.role === 'P1');
    const hasP2 = room.roster.some(p => p.role === 'P2');
    let assignedRole = 'SPECTATOR';
    if (!hasP1) assignedRole = 'P1';
    else if (!hasP2) assignedRole = 'P2';

    const existingIdx = room.roster.findIndex(p => p.id === socket.id);
    if (existingIdx >= 0) {
      room.roster[existingIdx].nickname = cleanName;
      assignedRole = room.roster[existingIdx].role;
    } else {
      room.roster.push({
        id: socket.id,
        nickname: cleanName,
        role: assignedRole,
        score: 0
      });
    }

    // 입장한 본인에게 환영 패킷 전송
    socket.emit('PACKET', {
      type: 'WELCOME',
      peerId: socket.id,
      assignedRole,
      round: room.round,
      promptIndex: room.promptIndex,
      roster: room.roster
    });

    // 방 전체에 로스터 동기화 및 입장 알림
    io.to(code).emit('PACKET', {
      type: 'ROSTER_SYNC',
      roster: room.roster,
      joinNotice: `👋 [${cleanName}]님이 입장하여 [${assignedRole === 'P1' ? '🎨 1P 브러시' : assignedRole === 'P2' ? '🕹️ 2P 팔레트' : '👀 구경꾼'}] 역할을 맡았습니다!`
    });

    // 기존 방 인원 중 첫 번째 플레이어에게 현재 도화지 스냅샷 요청
    const otherPlayer = room.roster.find(p => p.id !== socket.id);
    if (otherPlayer) {
      io.to(otherPlayer.id).emit('PACKET', {
        type: 'REQUEST_CANVAS_SYNC',
        targetPeerId: socket.id
      });
    }
  });

  // 인게임 패킷 릴레이 (MOVE_P1, MOVE_P2, CHAT, ROUND_WIN, NEXT_ROUND, CLEAR, CANVAS_SYNC)
  socket.on('PACKET', (data) => {
    if (!currentRoom || !data) return;
    const room = rooms.get(currentRoom);

    if (room) {
      if (data.type === 'ROUND_WIN' && Array.isArray(data.roster)) {
        room.roster = data.roster;
      } else if (data.type === 'NEXT_ROUND') {
        if (typeof data.round === 'number') room.round = data.round;
        if (typeof data.promptIndex === 'number') room.promptIndex = data.promptIndex;
        if (Array.isArray(data.roster)) room.roster = data.roster;
      }
    }

    // 특정 대상에게만 보내는 캔버스 동기화 패킷인 경우
    if (data.type === 'CANVAS_SYNC' && data.targetPeerId) {
      io.to(data.targetPeerId).emit('PACKET', data);
      return;
    }

    // 나를 제외한 같은 방의 모든 플레이어에게 브로드캐스트
    socket.to(currentRoom).emit('PACKET', data);
  });

  socket.on('disconnect', () => {
    if (!currentRoom || !rooms.has(currentRoom)) return;
    const room = rooms.get(currentRoom);
    const leaver = room.roster.find(p => p.id === socket.id);
    room.roster = room.roster.filter(p => p.id !== socket.id);

    if (room.roster.length === 0) {
      rooms.delete(currentRoom);
    } else {
      // 만약 P1이나 P2가 나갔다면 남은 구경꾼을 승격
      const hasP1 = room.roster.some(p => p.role === 'P1');
      if (!hasP1 && room.roster[0]) room.roster[0].role = 'P1';
      const hasP2 = room.roster.some(p => p.role === 'P2');
      if (!hasP2) {
        const candidate = room.roster.find(p => p.role !== 'P1');
        if (candidate) candidate.role = 'P2';
      }

      io.to(currentRoom).emit('PACKET', {
        type: 'ROSTER_SYNC',
        roster: room.roster,
        leaveNotice: leaver ? `💨 [${leaver.nickname}]님이 퇴장했습니다.` : null
      });
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🎨 반반 무마니 3D 멀티플레이 서버 구동 완료!`);
  console.log(`👉 로컬 접속: http://localhost:${PORT}`);
  console.log(`💡 서버 비용 없이 외부 친구 초대하기:`);
  console.log(`   1) GitHub Pages/Vercel에 올리면 서버 없이도 P2P 모드로 무료 작동!`);
  console.log(`   2) 또는 새 터미널에: npx cloudflared tunnel --url http://localhost:${PORT}`);
  console.log(`====================================================`);
});
