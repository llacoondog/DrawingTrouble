// ==========================================
// 반반 무마니 3D - 설정 상수 및 전역 게임 상태 (config.js)
// ==========================================
window.BanBan = window.BanBan || {};

// 한글 초성 자동 추출 헬퍼 함수
function extractChosung(str) {
  const CHOSUNG_LIST = [
    'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ',
    'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'
  ];
  let result = '';
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i) - 0xAC00;
    if (code >= 0 && code <= 11171) {
      const chosungIdx = Math.floor(code / 588);
      result += CHOSUNG_LIST[chosungIdx];
    } else {
      result += str[i];
    }
  }
  return result;
}

const RAW_WORDS = [
  '선글라스 낀 파인애플',
  '자전거 타는 문어',
  '근육질 피카츄',
  '화염방사기 쏘는 눈사람',
  '우주복 입은 고양이',
  '스케이트보드 타는 펭귄',
  '노래방에서 열창하는 사자',
  '붕어빵 굽는 외계인',
  '정장 입은 바나나',
  '번지점프하는 햄스터',
  '마라탕 먹는 공룡',
  '하늘을 나는 코끼리',
  '기타 치는 선인장',
  '런닝머신 뛰는 거북이',
  '왕관 쓴 개구리',
  '서핑하는 북극곰',
  '라떼아트 하는 로봇',
  '모자에서 나오는 토끼',
  '짜장면 먹는 유령',
  '낙하산 탄 강아지',
  '권투하는 캥거루',
  '셀카 찍는 모나리자',
  '훌라후프 돌리는 기린',
  '목욕탕 간 악어'
];

window.BanBan.Config = {
  PEER_PREFIX: 'banban3d-room-',
  CANVAS_SIZE: 12,
  VIEW_SIZE: 11.2,
  COOP_BONUS_SCORE: 80,

  extractChosung,

  // 제시어 단어장 (초성 자동 생성)
  WORD_POOL: RAW_WORDS.map(word => ({
    word,
    hint: extractChosung(word)
  })),

  // 봇 구경꾼 이름 및 추리 대사
  BOT_NAMES: ['세훈', '지나언니', '길가는똥손', '화실스파이'],
  BOT_FUNNY_GUESSES: [
    '이거 완전 현대미술인데??',
    '야 2P 빨리 다른 색깔 발판 밟아ㅋㅋㅋ',
    '계란프라이 아님?',
    '선 안 끄고 지나가서 가로질렀네ㅋㅋ',
    '외계인 고문하는 그림인가요',
    '바나나?',
    '정체불명의 생명체 탄생ㅋㅋ'
  ],

  // 컨트롤 데크 압력 발판(Pressure Pads) 정의
  PADS_DATA: [
    { id: 'TOGGLE_PEN', label: '펜 ON/OFF', x: -6.2, z: -6.8, color: 0x6366f1, hex: null, type: 'toggle' },
    { id: 'RED',    label: '빨강', x: -3.5, z: -6.8, color: 0xef4444, hex: '#ef4444', type: 'color' },
    { id: 'YELLOW', label: '노랑', x: -1.5, z: -6.8, color: 0xf59e0b, hex: '#f59e0b', type: 'color' },
    { id: 'GREEN',  label: '초록', x:  0.5, z: -6.8, color: 0x10b981, hex: '#10b981', type: 'color' },
    { id: 'BLUE',   label: '파랑', x:  2.5, z: -6.8, color: 0x3b82f6, hex: '#3b82f6', type: 'color' },
    { id: 'BLACK',  label: '검정', x:  4.5, z: -6.8, color: 0x1f2937, hex: '#111827', type: 'color' },
    { id: 'ERASER', label: '지우개', x: 6.5, z: -6.8, color: 0xf3f4f6, hex: '#ffffff', type: 'color' }
  ],

  // 폭죽 파티클 색상
  CONFETTI_COLORS: [0xffbe0b, 0xfb5607, 0xff006e, 0x8338ec, 0x3a86ff, 0x10b981]
};

window.BanBan.State = {
  controlMode: 'BOTH', // 'BOTH' | 'P1' | 'P2' | 'SPECTATOR'
  aiHelperEnabled: true,
  currentRound: 1,
  totalScore: 0,
  timeLeft: 60,
  currentPromptIndex: 0,
  currentPrompt: window.BanBan.Config.WORD_POOL[0],
  gameState: 'PLAYING', // 'PLAYING' | 'ROUND_END'
  isTypingChat: false,

  // 1P / 2P 물리 상태
  p1State: { vx: 0, vz: 0, prevX: null, prevZ: null, accel: 0.019, friction: 0.88 },
  p2State: { vx: 0, vz: 0, accel: 0.025, friction: 0.80 },

  // 2P AI 및 펜/색상 상태
  aiTargetX: -6.2,
  aiColorIdx: 4, // 검정색 발판부터 시작
  aiTimer: 0,
  isPenDown: false,
  wasOnTogglePad: false,
  activeColorHex: null,
  activeColorName: '발판 대기',

  // 멀티플레이 상태
  myPeerId: 'local-1',
  isP2PConnected: false,
  isP2PHost: false,
  myNickname: '열정화가',
  currentRoomCode: 'PARTY7',
  playerRoster: [
    { id: 'local-1', nickname: '1P 브러시', role: 'P1', score: 0 },
    { id: 'local-2', nickname: '2P 도우미', role: 'P2', score: 0 }
  ]
};
