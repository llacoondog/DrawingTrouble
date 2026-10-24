// ==========================================
// 반반 무마니 3D - 설정 상수, 커스터마이징 프리셋 및 전역 게임 상태 (config.js)
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

// 사람이 보고 맞히기 쉬운 직관적인 일반 명사 단어장 (120종)
const RAW_WORDS = [
  // 과일 & 채소
  '파인애플', '딸기', '수박', '바나나', '사과', '포도', '복숭아', '체리',
  '당근', '버섯', '옥수수', '고구마', '호박', '토마토', '레몬', '아보카도',

  // 음식 & 간식
  '피자', '햄버거', '붕어빵', '계란프라이', '아이스크림', '도넛', '케이크', '라면',
  '김밥', '치킨', '핫도그', '초밥', '떡볶이', '팝콘', '막대사탕', '초콜릿',
  '주먹밥', '만두', '샌드위치', '크루아상', '와플', '프레즐', '치즈', '식빵',

  // 동물 & 바다생물 & 곤충
  '고양이', '강아지', '코끼리', '기린', '펭귄', '문어', '상어', '고래',
  '거북이', '토끼', '사자', '호랑이', '판다', '여우', '원숭이', '개구리',
  '악어', '오리', '병아리', '부엉이', '공룡', '플라밍고', '고슴도치', '다람쥐',
  '낙타', '캥거루', '돼지', '젖소', '양', '말', '유니콘', '뱀',
  '달팽이', '나비', '무당벌레', '꿀벌', '꽃게', '불가사리', '해파리', '새우',

  // 사물 & 생활용품 & 악기
  '선글라스', '우산', '안경', '손목시계', '가위', '열쇠', '자물쇠', '전구',
  '망치', '돋보기', '왕관', '마법모자', '운동화', '양말', '배낭', '카메라',
  '텔레비전', '스마트폰', '노트북', '헤드폰', '마이크', '기타', '피아노', '주사위',
  '축구공', '농구공', '눈사람', '선물상자', '풍선', '촛불', '다이아몬드', '트로피',
  '프라이팬', '주전자', '머그컵', '칫솔', '거울', '선풍기', '신호등', '소화기',

  // 탈것 & 자연 & 건축물
  '자전거', '자동차', '버스', '기차', '비행기', '헬리콥터', '로켓', 'UFO',
  '잠수함', '소방차', '열기구', '낙하산', '돛단배', '무지개', '태양', '초승달',
  '번개', '화산', '야자수', '선인장', '해바라기', '장미', '피라미드', '이글루'
];

// 캐릭터 커스터마이징 프리셋 정의
const CUSTOM_COLORS = [
  { id: 'pink',   name: '체리 핑크',   hex: '#ec4899', num: 0xec4899 },
  { id: 'cyan',   name: '소다 시안',   hex: '#06b6d4', num: 0x06b6d4 },
  { id: 'violet', name: '포도 퍼플',   hex: '#8b5cf6', num: 0x8b5cf6 },
  { id: 'mint',   name: '민트 그린',   hex: '#10b981', num: 0x10b981 },
  { id: 'amber',  name: '망고 옐로',   hex: '#f59e0b', num: 0xf59e0b },
  { id: 'coral',  name: '코랄 레드',   hex: '#ef4444', num: 0xef4444 },
  { id: 'blue',   name: '오션 블루',   hex: '#3b82f6', num: 0x3b82f6 },
  { id: 'lime',   name: '애플 라임',   hex: '#84cc16', num: 0x84cc16 }
];

const CUSTOM_HATS = [
  { id: 'BERET',     name: '화가 베레모', icon: '🎨' },
  { id: 'HELMET',    name: '안전모 전구', icon: '⛑️' },
  { id: 'CROWN',     name: '황금 왕관',   icon: '👑' },
  { id: 'CAT_EARS',  name: '고양이 귀',   icon: '🐱' },
  { id: 'HALO',      name: '천사 헤일로', icon: '😇' },
  { id: 'PROPELLER', name: '프로펠러 캡', icon: '🚁' },
  { id: 'NONE',      name: '모자 없음',   icon: '✨' }
];

const CUSTOM_FACES = [
  { id: 'NORMAL', name: '초롱초롱', icon: '👀' },
  { id: 'COOL',   name: '선글라스', icon: '😎' },
  { id: 'HAPPY',  name: '눈웃음',   icon: '😊' },
  { id: 'STAR',   name: '반짝별눈', icon: '🤩' }
];

// 로컬 스토리지에 저장된 커스터마이징 불러오기
function loadSavedProfile() {
  const defaults = {
    nickname: '열정화가',
    custom: {
      color: '#ec4899',
      hat: 'BERET',
      face: 'NORMAL'
    }
  };
  try {
    const raw = localStorage.getItem('banban_profile_v1');
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    return {
      nickname: (parsed.nickname || defaults.nickname).slice(0, 10),
      custom: {
        color: parsed.custom?.color || defaults.custom.color,
        hat: parsed.custom?.hat || defaults.custom.hat,
        face: parsed.custom?.face || defaults.custom.face
      }
    };
  } catch (e) {
    return defaults;
  }
}

function saveProfile(nickname, custom) {
  try {
    localStorage.setItem('banban_profile_v1', JSON.stringify({ nickname, custom }));
  } catch (e) {}
}

const initialProfile = loadSavedProfile();

// 전체 단어장에서 중복 없이 무작위 3개의 인덱스 추출
function pickThreeRandomPromptIndices(excludeIndex = -1) {
  const total = RAW_WORDS.length;
  const pool = [];
  for (let i = 0; i < total; i++) {
    if (i !== excludeIndex) pool.push(i);
  }
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = pool[i];
    pool[i] = pool[j];
    pool[j] = temp;
  }
  return pool.slice(0, 3);
}

window.BanBan.Config = {
  PEER_PREFIX: 'banban3d-room-',
  CANVAS_SIZE: 12,
  VIEW_SIZE: 11.2,
  COOP_BONUS_SCORE: 80,

  extractChosung,
  saveProfile,
  pickThreeRandomPromptIndices,
  CUSTOM_COLORS,
  CUSTOM_HATS,
  CUSTOM_FACES,

  // 제시어 단어장 (초성 자동 생성)
  WORD_POOL: RAW_WORDS.map(word => ({
    word,
    hint: extractChosung(word)
  })),

  // 3단계 붓 굵기 설정 (가는붓 / 기본붓 / 왕붓)
  BRUSH_SIZES: [
    { id: 'THIN',   name: '가는붓', radius: 12, scale: 0.68, badge: '가는붓 (소)' },
    { id: 'MEDIUM', name: '기본붓', radius: 26, scale: 1.00, badge: '기본붓 (중)' },
    { id: 'THICK',  name: '왕붓',   radius: 48, scale: 1.45, badge: '왕붓 (대)' }
  ],

  // 2P 컨트롤 데크 발판 정의 (색상 6종 + 붓 굵기 전환 + 도화지 지우기)
  PADS_DATA: [
    { id: 'RED',        label: '🍓빨강',         fullName: '딸기 빨강',     icon: '🍓', x: -6.9, z: -6.8, color: 0xef4444, hex: '#ef4444', type: 'color', note: 523.25 },
    { id: 'YELLOW',     label: '🍋노랑',         fullName: '레몬 노랑',     icon: '🍋', x: -5.1, z: -6.8, color: 0xf59e0b, hex: '#f59e0b', type: 'color', note: 587.33 },
    { id: 'GREEN',      label: '🍏초록',         fullName: '멜론 초록',     icon: '🍏', x: -3.3, z: -6.8, color: 0x10b981, hex: '#10b981', type: 'color', note: 659.25 },
    { id: 'BLUE',       label: '💧파랑',         fullName: '소다 파랑',     icon: '💧', x: -1.5, z: -6.8, color: 0x3b82f6, hex: '#3b82f6', type: 'color', note: 783.99 },
    { id: 'BLACK',      label: '🍙검정',         fullName: '먹물 검정',     icon: '🍙', x:  0.3, z: -6.8, color: 0x1f2937, hex: '#111827', type: 'color', note: 880.00 },
    { id: 'ERASER',     label: '🧼지우개',       fullName: '말랑 지우개',   icon: '🧼', x:  2.1, z: -6.8, color: 0xf3f4f6, hex: '#ffffff', type: 'color', note: 1046.50 },
    { id: 'BRUSH_SIZE', label: '🖌️붓굵기',       fullName: '붓 굵기 변신',  icon: '🖌️', x:  4.0, z: -6.8, color: 0xa855f7, hex: '#a855f7', type: 'size',  note: 698.46 },
    { id: 'CLEAR_ALL',  label: '💥전체지우기',   fullName: '도화지 초기화', icon: '💥', x:  7.1, z: -6.8, color: 0xe11d48, hex: '#e11d48', type: 'clear', note: 220.00 }
  ],

  // 폭죽 파티클 색상
  CONFETTI_COLORS: [0xffbe0b, 0xfb5607, 0xff006e, 0x8338ec, 0x3a86ff, 0x10b981]
};

window.BanBan.State = {
  controlMode: 'BOTH', // 'BOTH' | 'P1' | 'P2' | 'SPECTATOR'
  currentRound: 1,
  totalScore: 0,
  timeLeft: 60,
  candidatePromptIndices: [0, 1, 2],
  currentPromptIndex: 0,
  currentPrompt: window.BanBan.Config.WORD_POOL[0],
  gameState: 'LOBBY', // 'LOBBY' | 'WAITING' | 'CHOOSING_WORD' | 'PLAYING' | 'ROUND_END'
  isTypingChat: false,

  // 내 캐릭터 커스터마이징 상태
  myNickname: initialProfile.nickname,
  myCustom: { ...initialProfile.custom },
  p2DefaultCustom: {
    color: '#06b6d4',
    hat: 'HELMET',
    face: 'NORMAL'
  },

  // 1P / 2P 물리 및 점프 상태 (60FPS 기준 deltaTime 정규화 속도)
  p1State: { vx: 0, vz: 0, y: 0, vy: 0, prevX: null, prevZ: null, accel: 0.020, friction: 0.86, jumpForce: 0.27, gravity: 0.015 },
  p2State: { vx: 0, vz: 0, y: 0, vy: 0, accel: 0.024, friction: 0.82, jumpForce: 0.27, gravity: 0.015 },

  // 펜/색상/굵기/사운드 상태
  isPenDown: false,
  wasOnClearPad: false,
  wasOnSizePad: false,
  brushSizeIdx: 1, // 0: 가는붓, 1: 기본붓, 2: 왕붓
  soundEnabled: true,
  activeColorHex: null,
  activeColorName: '발판 대기 (OFF)',

  // 멀티플레이 상태
  myPeerId: 'local-1',
  isP2PConnected: false,
  isP2PHost: false,
  currentRoomCode: 'PARTY7',
  playerRoster: [
    {
      id: 'local-1',
      nickname: initialProfile.nickname,
      role: 'P1',
      score: 0,
      custom: { ...initialProfile.custom }
    },
    {
      id: 'local-2',
      nickname: '2P 플레이어',
      role: 'P2',
      score: 0,
      custom: { color: '#06b6d4', hat: 'HELMET', face: 'NORMAL' }
    }
  ]
};
