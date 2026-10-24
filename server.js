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

app.use(express.static(path.join(__dirname)));

const rooms = new Map();

function getOrCreateRoom(roomCode) {
  if (!rooms.has(roomCode)) {
    rooms.set(roomCode, {
      code: roomCode,
      status: 'WAITING', // 'WAITING' | 'PLAYING'
      round: 1,
      promptIndex: 0,
      roster: []
    });
  }
  return rooms.get(roomCode);
}

io.on('connection', (socket) => {
  let currentRoom = null;

  socket.on('JOIN_ROOM', ({ roomCode, nickname, custom }) => {
    const code = (roomCode || 'PARTY7').trim().toUpperCase();
    const cleanName = (nickname || '익명화가').trim().slice(0, 10);
    const safeCustom = custom || { color: '#ec4899', hat: 'BERET', face: 'NORMAL' };

    if (currentRoom) {
      socket.leave(currentRoom);
    }
    currentRoom = code;
    socket.join(code);

    const room = getOrCreateRoom(code);

    const hasP1 = room.roster.some(p => p.role === 'P1');
    const hasP2 = room.roster.some(p => p.role === 'P2');
    let assignedRole = 'SPECTATOR';
    if (!hasP1) assignedRole = 'P1';
    else if (!hasP2) assignedRole = 'P2';

    const existingIdx = room.roster.findIndex(p => p.id === socket.id);
    if (existingIdx >= 0) {
      room.roster[existingIdx].nickname = cleanName;
      room.roster[existingIdx].custom = safeCustom;
      assignedRole = room.roster[existingIdx].role;
    } else {
      room.roster.push({
        id: socket.id,
        nickname: cleanName,
        role: assignedRole,
        score: 0,
        custom: safeCustom
      });
    }

    const isRoomHost = room.roster[0] && room.roster[0].id === socket.id;

    socket.emit('PACKET', {
      type: 'WELCOME',
      peerId: socket.id,
      isHost: isRoomHost,
      roomStatus: room.status,
      assignedRole,
      round: room.round,
      promptIndex: room.promptIndex,
      roster: room.roster
    });

    io.to(code).emit('PACKET', {
      type: 'ROSTER_SYNC',
      roster: room.roster,
      roomStatus: room.status,
      joinNotice: `👋 [${cleanName}]님이 대기방에 입장하여 [${assignedRole === 'P1' ? '🎨 1P 브러시' : assignedRole === 'P2' ? '🕹️ 2P 팔레트' : '👀 구경꾼'}] 역할을 맡았습니다!`
    });

    const otherPlayer = room.roster.find(p => p.id !== socket.id);
    if (otherPlayer && room.status === 'PLAYING') {
      io.to(otherPlayer.id).emit('PACKET', {
        type: 'REQUEST_CANVAS_SYNC',
        targetPeerId: socket.id
      });
    }
  });

  socket.on('PACKET', (data) => {
    if (!currentRoom || !data) return;
    const room = rooms.get(currentRoom);

    if (room) {
      if (data.type === 'START_GAME') {
        room.status = 'PLAYING';
        room.round = data.round || 1;
        room.promptIndex = data.promptIndex || 0;
        if (Array.isArray(data.roster)) room.roster = data.roster;
      } else if (data.type === 'ROUND_WIN' && Array.isArray(data.roster)) {
        room.roster = data.roster;
      } else if (data.type === 'NEXT_ROUND') {
        room.status = 'PLAYING';
        if (typeof data.round === 'number') room.round = data.round;
        if (typeof data.promptIndex === 'number') room.promptIndex = data.promptIndex;
        if (Array.isArray(data.roster)) room.roster = data.roster;
      } else if (data.type === 'ROSTER_SYNC' && Array.isArray(data.roster)) {
        room.roster = data.roster;
      } else if (data.type === 'CUSTOM_UPDATE' && data.peerId && data.custom) {
        const target = room.roster.find(p => p.id === data.peerId);
        if (target) {
          target.custom = data.custom;
          if (data.nickname) target.nickname = data.nickname;
        }
      }
    }

    if (data.type === 'CANVAS_SYNC' && data.targetPeerId) {
      io.to(data.targetPeerId).emit('PACKET', data);
      return;
    }

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
        roomStatus: room.status,
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
  console.log(`====================================================`);
});
