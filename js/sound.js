// ==========================================
// 반반 무마니 3D - Web Audio API 프로시저럴 신디사이저 효과음 모듈 (sound.js)
// - 외부 오디오 파일 없이 100% 브라우저 내장 신디사이저로 경쾌한 파티 효과음 생성
// ==========================================
window.BanBan = window.BanBan || {};

window.BanBan.Sound = (function () {
  const { State } = window.BanBan;
  let audioCtx = null;

  function getContext() {
    if (!State.soundEnabled) return null;
    try {
      if (!audioCtx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          audioCtx = new AudioCtx();
        }
      }
      if (audioCtx && audioCtx.state === 'suspended' && typeof audioCtx.resume === 'function') {
        audioCtx.resume().catch(() => {});
      }
    } catch (e) {
      return null;
    }
    return audioCtx;
  }

  // 최초 사용자 입력 시 오디오 컨텍스트 잠금 해제
  function unlockAudio() {
    try {
      if (!audioCtx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) audioCtx = new AudioCtx();
      }
      if (audioCtx && audioCtx.state === 'suspended' && typeof audioCtx.resume === 'function') {
        audioCtx.resume().catch(() => {});
      }
    } catch (e) {
      // ignore audio context unlock errors
    }
  }
  window.addEventListener('pointerdown', unlockAudio, { once: true });
  window.addEventListener('keydown', unlockAudio, { once: true });

  // 기본 단일 톤 재생 헬퍼
  function playTone(freq, type = 'sine', duration = 0.12, volume = 0.14, slideToFreq = null, delay = 0) {
    try {
      const ctx = getContext();
      if (!ctx || typeof ctx.createOscillator !== 'function') return;

      const startTime = (ctx.currentTime || 0) + delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, startTime);
      if (slideToFreq) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideToFreq), startTime + duration);
      }

      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.linearRampToValueAtTime(volume, startTime + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + duration + 0.02);
    } catch (e) {
      // ignore audio playback errors
    }
  }

  // 1) 색상 발판 밟을 때: 펜타토닉 마림바/물방울 팝 사운드
  function playColorPad(noteFreq = 523.25) {
    playTone(noteFreq, 'triangle', 0.14, 0.16, noteFreq * 1.06, 0);
    playTone(noteFreq * 2, 'sine', 0.08, 0.06, null, 0.01);
  }

  // 2) 붓 굵기 발판 밟을 때: 굵기 단계(0:소, 1:중, 2:대, 3:특대)별 특색 있는 효과음
  function playBrushSize(sizeIdx = 1) {
    if (sizeIdx === 0) {
      // 가는붓 (소): 얇고 산뜻한 고음 핑!
      playTone(880, 'sine', 0.08, 0.14, 1318, 0);
      playTone(1318, 'triangle', 0.10, 0.12, 1760, 0.05);
    } else if (sizeIdx === 1) {
      // 보통붓 (중): 경쾌한 중간 톤 투스텝 팝!
      playTone(523.25, 'triangle', 0.10, 0.15, 659.25, 0);
      playTone(783.99, 'triangle', 0.12, 0.15, 880, 0.06);
    } else if (sizeIdx === 2) {
      // 굵은붓 (대): 묵직하고 탄력 있는 중저음 바운스!
      playTone(392.00, 'sawtooth', 0.12, 0.14, 261.63, 0);
      playTone(329.63, 'triangle', 0.15, 0.18, 440, 0.06);
    } else {
      // 왕붓 (특대): 웅장하고 깊은 베이스 붐!
      playTone(220, 'sawtooth', 0.14, 0.16, 146.83, 0);
      playTone(174.61, 'triangle', 0.22, 0.24, 261.63, 0.06);
    }
  }

  // 3) 도화지 전체 지우기 발판: 시원한 스윕 폭발음
  function playClearCanvas() {
    playTone(480, 'sawtooth', 0.28, 0.16, 95, 0);
    playTone(320, 'square', 0.22, 0.10, 65, 0.04);
  }

  // 4) UI 버튼/커스터마이징 클릭음
  function playClick() {
    playTone(660, 'sine', 0.055, 0.09, 880, 0);
  }

  // 4-2) 마리오 스타일 통통 점프 효과음 (피융~!)
  function playJump(isP2 = false) {
    const startFreq = isP2 ? 310 : 350;
    const endFreq = isP2 ? 720 : 820;
    playTone(startFreq, 'square', 0.14, 0.08, endFreq, 0);
    playTone(startFreq * 1.25, 'sine', 0.16, 0.12, endFreq * 1.2, 0.01);
  }

  // 5) 제시어 확정 & 라운드 출발 벨
  function playRoundStart() {
    playTone(523.25, 'triangle', 0.12, 0.15, null, 0.00); // 도
    playTone(659.25, 'triangle', 0.12, 0.15, null, 0.09); // 미
    playTone(783.99, 'triangle', 0.14, 0.16, null, 0.18); // 솔
    playTone(1046.50, 'sine',    0.26, 0.18, null, 0.27); // 높은 도
  }

  // 6) 20초 글자수 힌트 등장 알림음
  function playHint() {
    playTone(880, 'sine', 0.12, 0.14, null, 0);
    playTone(1318.5, 'sine', 0.22, 0.16, null, 0.10);
  }

  // 7) 10초 이하 타이머 카운트다운 틱
  function playTick(isVeryUrgent = false) {
    playTone(isVeryUrgent ? 980 : 740, 'sine', 0.045, 0.10, isVeryUrgent ? 600 : 500, 0);
  }

  // 8) 정답 맞혔을 때 팡파레!
  function playWin() {
    const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51];
    notes.forEach((n, idx) => {
      playTone(n, 'triangle', 0.22, 0.16, null, idx * 0.075);
    });
  }

  // 9) 시간 초과 아쉬움 효과음
  function playTimeUp() {
    playTone(392.00, 'sawtooth', 0.20, 0.11, 370.00, 0.00);
    playTone(349.23, 'sawtooth', 0.20, 0.11, 330.00, 0.18);
    playTone(311.13, 'sawtooth', 0.38, 0.13, 246.94, 0.36);
  }

  // 10) 1P ↔ 2P 비밀 협동 핑 알림음 (맑고 통통 튀는 레이더/벨 사운드)
  function playCoopPing(isPad = false) {
    if (isPad) {
      // 발판 타겟 핑: 높은 2단 스타카토 핑!
      playTone(1046.50, 'sine', 0.08, 0.16, 1318.51, 0.00);
      playTone(1567.98, 'sine', 0.12, 0.18, 1760.00, 0.06);
    } else {
      // 바닥 위치 핑: 청량한 드롭 사운드
      playTone(880.00, 'sine', 0.09, 0.15, 1174.66, 0.00);
      playTone(1318.51, 'triangle', 0.14, 0.16, 880.00, 0.05);
    }
  }

  // 11) 1P ↔ 2P 비밀 이모티콘 팝업음 (통통 튀는 젤리 말풍선 뾱!)
  function playCoopEmote(emoteId = '') {
    if (emoteId === 'STOP' || emoteId === 'SWEAT') {
      // 멈춤/당황: 살짝 통통 튀는 경고/의문음
      playTone(659.25, 'triangle', 0.09, 0.14, 493.88, 0.00);
      playTone(440.00, 'sine', 0.12, 0.16, 349.23, 0.07);
    } else if (emoteId === 'CHEER' || emoteId === 'IDEA') {
      // 칭찬/아이디어: 밝게 솟아오르는 멜로디
      playTone(783.99, 'sine', 0.08, 0.15, 1046.50, 0.00);
      playTone(1318.51, 'triangle', 0.12, 0.18, 1567.98, 0.06);
    } else {
      // 기본: 귀여운 버블 팝!
      playTone(523.25, 'sine', 0.08, 0.15, 880.00, 0.00);
      playTone(880.00, 'triangle', 0.10, 0.14, null, 0.05);
    }
  }

  return {
    playColorPad,
    playBrushSize,
    playClearCanvas,
    playClick,
    playJump,
    playRoundStart,
    playHint,
    playTick,
    playWin,
    playTimeUp,
    playCoopPing,
    playCoopEmote
  };
})();
