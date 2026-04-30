const app = document.getElementById('app');
const pageButtons = Array.from(document.querySelectorAll('nav button[data-page]'));
const skipLink = document.querySelector('.skip-link');

const chrome = {
  title: document.getElementById('workspace-title'),
  subtitle: document.getElementById('workspace-subtitle'),
  kicker: document.getElementById('workspace-kicker'),
  date: document.getElementById('header-date'),
  runtimeCard: document.getElementById('runtime-card'),
  runtimeToggle: document.getElementById('runtime-toggle'),
  runtimeDetails: document.getElementById('runtime-details'),
  runtimeCompact: document.getElementById('runtime-compact'),
  runtimeGenerated: document.getElementById('runtime-generated'),
  runtimeUsable: document.getElementById('runtime-usable'),
  runtimeReport: document.getElementById('runtime-report'),
  runtimeSegments: document.getElementById('runtime-segments'),
  runtimeStatus: document.getElementById('runtime-status'),
  openReport: document.getElementById('header-open-report'),
  runCrawl: document.getElementById('header-run-crawl')
};

const SEOUL_TIME_ZONE = 'Asia/Seoul';
const INBOX_PRESET_STORAGE_KEY = 'dailycomm.inboxPresets.v1';
const INBOX_RECENT_SEARCHES_STORAGE_KEY = 'dailycomm.inboxRecentSearches.v1';
const BUILDER_DRAFT_STORAGE_PREFIX = 'dailycomm.builderDraft.v1';
const ACTIVITY_LOG_STORAGE_KEY = 'dailycomm.activityLog.v1';
const UNDO_TOAST_DURATION = 4200;
const MAX_ACTIVITY_LOG_ITEMS = 12;

function readJsonStorage(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJsonStorage(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
  }
}

function removeStorageItem(key) {
  try {
    window.localStorage.removeItem(key);
  } catch {
  }
}

function loadStoredInboxPresets() {
  return readJsonStorage(INBOX_PRESET_STORAGE_KEY, [])
    .map((preset) => ({
      id: String(preset?.id || ''),
      label: String(preset?.label || '').trim(),
      sectionFilter: String(preset?.sectionFilter || 'all'),
      statusFilter: String(preset?.statusFilter || 'all'),
      aiFilter: String(preset?.aiFilter || 'all'),
      searchQuery: String(preset?.searchQuery || '').trim(),
      keywordFilter: Array.isArray(preset?.keywordFilter)
        ? preset.keywordFilter.map((token) => String(token || '').trim()).filter(Boolean)
        : []
    }))
    .filter((preset) => preset.id && preset.label)
    .slice(0, 4);
}

function loadStoredInboxRecentSearches() {
  return readJsonStorage(INBOX_RECENT_SEARCHES_STORAGE_KEY, [])
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .slice(0, 6);
}

function loadStoredActivityLog() {
  return readJsonStorage(ACTIVITY_LOG_STORAGE_KEY, [])
    .map((item) => ({
      id: String(item?.id || ''),
      title: String(item?.title || '').trim(),
      detail: String(item?.detail || '').trim(),
      tone: String(item?.tone || 'reported').trim() || 'reported',
      page: String(item?.page || '').trim(),
      createdAt: String(item?.createdAt || '').trim()
    }))
    .filter((item) => item.id && item.title)
    .slice(0, MAX_ACTIVITY_LOG_ITEMS);
}

function persistStoredActivityLog() {
  writeJsonStorage(ACTIVITY_LOG_STORAGE_KEY, state.activityLog.slice(0, MAX_ACTIVITY_LOG_ITEMS));
}

function pushActivityLog({ title, detail = '', tone = 'reported', page = state.activePage } = {}) {
  const normalizedTitle = String(title || '').trim();
  if (!normalizedTitle) return;

  state.activityLog = [
    {
      id: `activity-${Date.now()}`,
      title: normalizedTitle,
      detail: String(detail || '').trim(),
      tone: String(tone || 'reported').trim() || 'reported',
      page: String(page || '').trim(),
      createdAt: new Date().toISOString()
    },
    ...state.activityLog
  ].slice(0, MAX_ACTIVITY_LOG_ITEMS);

  persistStoredActivityLog();
}

const pageMeta = {
  dashboard: {
    kicker: '운영 현황',
    title: '대시보드',
    subtitle: '오늘 할 일만 확인합니다.'
  },
  inbox: {
    kicker: '기사 선별',
    title: '기사 인박스',
    subtitle: '필요한 기사만 고릅니다.'
  },
  builder: {
    kicker: '리포트 편집',
    title: '리포트 빌더',
    subtitle: '초안을 다듬습니다.'
  },
  kakao: {
    kicker: '카카오 검수',
    title: '카카오 프리뷰',
    subtitle: '복사 전 최종 확인입니다.'
  },
  settings: {
    kicker: '운영 설정',
    title: '설정',
    subtitle: '키워드와 스케줄을 확인합니다.'
  }
};

const LOADING_STEPS = [
  {
    id: 'source',
    label: '데이터',
    description: '기사 파일 확인'
  },
  {
    id: 'config',
    label: '설정',
    description: '키워드 확인'
  },
  {
    id: 'capabilities',
    label: 'AI',
    description: '필요 시 확인'
  },
  {
    id: 'ready',
    label: '화면',
    description: '인박스 준비'
  }
];

const DEFAULT_INBOX_AI_CURATION_PROMPT = [
  '전체 기사 목록에서 아래 두 그룹을 각각 추천해줘.',
  '1. 카카오 기업 기사: 카카오 및 주요 계열사의 사업 성과, 신규 서비스, AI/인프라/데이터센터/플랫폼 전략, 임원 인터뷰, 주요 MOU/제휴, 투자 관련 기사',
  '2. 업계 기사: 카카오가 아니어도 AI, 플랫폼, 핀테크, 모빌리티, 콘텐츠, 광고, 커머스, 클라우드, 데이터센터, 투자 흐름을 이해하는 데 도움되는 기사',
  '정치, 사건/사고, 생활 정보, 단순 소비 혜택, 결제수단/채널만 스쳐 언급된 기사는 제외해줘.',
  '같은 발표·행사·MOU·실적·투자·서비스 출시처럼 동일한 내용을 다룬 기사가 여러 개 있으면 대표 기사 1건만 추천해줘.',
  '대표 기사는 원문성, 구체성, 최신성, 언론 신뢰도 기준으로 고르고 중복 기사는 추천에서 제외해줘.',
  '업계 보도는 전략 관련성·구체성·최신성·매체 신뢰도를 기준으로 점수화한 뒤 점수가 높은 순서로 최대 10개까지만 추천해줘.',
  '업계 보도 후보가 10개를 넘으면 10위 밖의 기사는 모두 제외하고, 개수를 채우기 위해 점수가 낮은 기사를 넣지 마.',
  '각 기사마다 짧은 추천 이유를 붙여줘.'
].join('\n');

let state = {
  date: currentSeoulDateKey(),
  loading: true,
  loadingPhase: 'source',
  loadingMessage: '오늘 데이터를 확인 중입니다.',
  loadError: '',
  articleMeta: null,
  articles: [],
  report: null,
  reportDraft: null,
  segments: [],
  pageSize: 20,
  selectedPage: 1,
  selectedArticle: null,
  selectedArticleUrls: [],
  previewMode: 'summary',
  config: null,
  activePage: 'dashboard',
  runtimePanelOpen: false,
  kakaoView: 'full',
  selectedSegmentOrder: 1,
  inboxSectionFilter: 'all',
  inboxStatusFilter: 'all',
  inboxAiFilter: 'all',
  inboxAiCurationPrompt: DEFAULT_INBOX_AI_CURATION_PROMPT,
  inboxAiCurationOpen: false,
  inboxAiCurationBusy: false,
  inboxAiCurationModalOpen: false,
  inboxAiCurationResult: null,
  inboxKeywordFilter: [],
  inboxSearchQuery: '',
  inboxSortKey: 'score',
  inboxSortDirection: 'desc',
  inboxFiltersOpen: false,
  inboxPreviewOpen: false,
  inboxSavedPresets: loadStoredInboxPresets(),
  inboxRecentSearches: loadStoredInboxRecentSearches(),
  activityLog: loadStoredActivityLog(),
  builderSideView: 'detail',
  builderFocusKey: '',
  builderImportOpen: false,
  builderImportUrl: '',
  builderImportSection: 'major',
  builderImportBusy: false,
  builderDraftStatus: 'idle',
  builderDraftSavedAt: '',
  builderDraftRestored: false,
  builderDraftTab: 'draft',
  pendingAiReview: null,
  reportTextDraft: '',
  settingsPolicyModalOpen: false,
  settingsAlertTestBusy: false,
  settingsAlertTestResult: null,
  capabilities: {
    aiSummarize: false,
    provider: '',
    model: '',
    requiresToken: false
  },
  aiBusyKey: '',
  aiWorkStatus: null,
  pageScrollPositions: {}
};

let toastId = 0;
const AI_TOKEN_STORAGE_KEY = 'input_ai_token';
const AI_TOKEN_LEGACY_STORAGE_KEY = 'dailycomm.aiToken';
const KAKAO_SEGMENT_CHAR_LIMIT = 500;
let inboxSearchCompositionActive = false;

if (skipLink) {
  skipLink.addEventListener('click', () => {
    window.requestAnimationFrame(() => {
      app?.focus();
    });
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showToast(message, options = {}) {
  const {
    actionLabel = '',
    onAction = null,
    duration = 2200,
    replace = false
  } = options;
  let wrap = document.querySelector('.toast-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'toast-wrap';
    wrap.setAttribute('role', 'status');
    wrap.setAttribute('aria-live', 'polite');
    wrap.setAttribute('aria-atomic', 'true');
    document.body.append(wrap);
  }

  if (replace) {
    wrap.replaceChildren();
  }

  const node = document.createElement('div');
  node.className = 'toast';
  const messageNode = document.createElement('span');
  messageNode.className = 'toast-message';
  messageNode.textContent = message;
  node.append(messageNode);

  if (actionLabel && typeof onAction === 'function') {
    const actionButton = document.createElement('button');
    actionButton.type = 'button';
    actionButton.className = 'toast-action';
    actionButton.textContent = actionLabel;
    actionButton.addEventListener('click', () => {
      node.remove();
      onAction();
    });
    node.append(actionButton);
  }

  const currentId = ++toastId;
  wrap.append(node);

  setTimeout(() => {
    if (currentId <= toastId) node.remove();
  }, duration);
}

function formatDateLabel(value) {
  if (!value) return '-';
  return value.replace(/-/g, '.');
}

function currentSeoulDateKey() {
  const parts = getSeoulDateParts(new Date());
  return parts?.dateKey || '';
}

function getDataFreshnessState(dateKey = state.date) {
  const currentDateKey = currentSeoulDateKey();
  const dataDateIndex = dateKeyToUtcDayIndex(dateKey);
  const currentDateIndex = dateKeyToUtcDayIndex(currentDateKey);
  const lagDays = Number.isFinite(dataDateIndex) && Number.isFinite(currentDateIndex)
    ? Math.max(currentDateIndex - dataDateIndex, 0)
    : 0;

  return {
    currentDateKey,
    lagDays,
    isLagging: lagDays > 0,
    pillLabel: lagDays > 0 ? `기준일 ${formatDateLabel(dateKey)} · ${formatNumber(lagDays)}일 전` : formatDateLabel(dateKey),
    runtimeLabel: lagDays > 0
      ? `오늘(${formatDateLabel(currentDateKey)}) 기준 최신 데이터가 아닙니다. 현재 ${formatDateLabel(dateKey)} 데이터를 보고 있습니다.`
      : `${formatDateLabel(dateKey)} 기준 최신 데이터를 보고 있습니다.`
  };
}

function getSeoulDateParts(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: SEOUL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    hourCycle: 'h23'
  });

  const parts = formatter.formatToParts(date).reduce((acc, part) => {
    if (part.type !== 'literal') {
      acc[part.type] = part.value;
    }
    return acc;
  }, {});

  const year = String(parts.year || '').padStart(4, '0');
  const month = String(parts.month || '').padStart(2, '0');
  const day = String(parts.day || '').padStart(2, '0');
  const hour = String(parts.hour || '').padStart(2, '0');
  const minute = String(parts.minute || '').padStart(2, '0');

  return {
    year,
    month,
    day,
    hour,
    minute,
    dateKey: `${year}-${month}-${day}`
  };
}

async function fetchDateArtifacts(date) {
  const [articlePayload, reportPayload, segmentsPayload] = await Promise.all([
    fetchJson(`../data/articles/${date}.json`, null),
    fetchJson(`../data/reports/${date}.json`, null),
    fetchJson(`../data/reports/${date}.segments.json`, [])
  ]);

  return { articlePayload, reportPayload, segmentsPayload };
}

function formatDateTime(value) {
  if (!value) return '-';
  const parts = getSeoulDateParts(value);
  if (!parts) return value;
  return `${parts.year}.${parts.month}.${parts.day} ${parts.hour}:${parts.minute}`;
}

function formatSavedTime(value) {
  if (!value) return '';
  const parts = getSeoulDateParts(value);
  if (!parts) return '';
  return state.date === parts.dateKey
    ? `${parts.hour}:${parts.minute}`
    : `${parts.month}.${parts.day} ${parts.hour}:${parts.minute}`;
}

function resolveArticlePublishedDate(article) {
  const explicit = String(article?.publishedAt || '').trim();
  if (explicit) {
    const parsed = new Date(explicit);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  const generatedAt = String(state.articleMeta?.generatedAt || state.report?.generatedAt || '').trim();
  const baseDate = generatedAt ? new Date(generatedAt) : null;
  if (baseDate && !Number.isNaN(baseDate.getTime()) && Number.isFinite(article?.recencyScore)) {
    return new Date(baseDate.getTime() - (article.recencyScore * 60 * 1000));
  }

  return null;
}

function articlePublishedEpoch(article) {
  const parsed = resolveArticlePublishedDate(article);
  if (!parsed) return Number.NEGATIVE_INFINITY;
  return parsed.getTime();
}

function formatArticlePublishedTime(article) {
  const publishedDate = resolveArticlePublishedDate(article);
  if (!publishedDate) {
    return String(article?.recencyText || '-');
  }

  const parts = getSeoulDateParts(publishedDate);
  if (!parts) {
    return String(article?.recencyText || '-');
  }

  const sameDay = state.date === parts.dateKey;
  if (sameDay) {
    return `${parts.hour}:${parts.minute}`;
  }

  return `${parts.month}.${parts.day} ${parts.hour}:${parts.minute}`;
}

function compareArticleValues(left, right) {
  if (typeof left === 'number' && typeof right === 'number') {
    return left - right;
  }
  return String(left || '').localeCompare(String(right || ''), 'ko');
}

function getInboxSortValue(article, sortKey) {
  if (sortKey === 'score') return inboxArticleScore(article);
  if (sortKey === 'media') return mediaLabel(article);
  if (sortKey === 'title') return String(article?.title || '');
  if (sortKey === 'keyword') return String(article?.keyword || '');
  return articlePublishedEpoch(article);
}

function toggleInboxSort(sortKey) {
  if (state.inboxSortKey === sortKey) {
    state.inboxSortDirection = state.inboxSortDirection === 'desc' ? 'asc' : 'desc';
    return;
  }
  state.inboxSortKey = sortKey;
  state.inboxSortDirection = sortKey === 'time' || sortKey === 'score' ? 'desc' : 'asc';
}

function renderInboxSortHeader(sortKey, label) {
  const active = state.inboxSortKey === sortKey;
  const directionLabel = active
    ? (state.inboxSortDirection === 'desc' ? '내림차순' : '오름차순')
    : '정렬 안 함';
  const indicator = active ? (state.inboxSortDirection === 'desc' ? '↓' : '↑') : '↕';
  return `
    <button
      class="table-sort-btn table-sort-${sortKey} ${active ? 'active' : ''}"
      data-sort-key="${sortKey}"
      aria-pressed="${active}"
      aria-label="${escapeHtml(`${label} 정렬, 현재 ${directionLabel}`)}"
    >
      <span>${escapeHtml(label)}</span>
      <strong>${indicator}</strong>
    </button>
  `;
}

function renderBuilderAiActionButton(key, options = {}) {
  const {
    mode = 'card',
    id = '',
    extraClass = ''
  } = options;
  const enabled = Boolean(state.capabilities?.aiSummarize);
  const requiresToken = Boolean(state.capabilities?.requiresToken);
  const storedToken = getStoredAiToken();
  const readyToSummarize = enabled && (!requiresToken || Boolean(storedToken));
  const busy = state.aiBusyKey === key;
  const canConnect = hasRemoteAiConfigured();
  const buttonClass = mode === 'detail' ? 'primary-btn' : 'ghost-btn';
  const showTokenInput = mode === 'detail' || mode === 'draft';
  const label = busy
    ? 'AI 정리 중...'
    : readyToSummarize
      ? 'AI 정리'
      : enabled && requiresToken && !storedToken
        ? '토큰 입력 후 정리'
        : canConnect
          ? (storedToken ? '요약 연결 후 정리' : 'AI 요약 연결')
          : '요약 미지원';
  const tokenInput = showTokenInput && (canConnect || enabled || requiresToken)
    ? `
      <label class="ai-token-field">
        <span>AI 접근 토큰</span>
        <input
          type="password"
          name="${AI_TOKEN_STORAGE_KEY}"
          autocomplete="off"
          autocapitalize="none"
          spellcheck="false"
          data-ai-token-input="${escapeHtml(key)}"
          placeholder="AI 접근 토큰 입력"
          value="${escapeHtml(getStoredAiToken())}"
        />
      </label>
    `
    : '';

  return `
    <div class="inline-actions compact ai-actions ${extraClass}">
      ${tokenInput}
      <button
        class="${buttonClass} ${busy ? 'is-busy' : ''}"
        ${id ? `id="${id}"` : ''}
        data-builder-ai="${escapeHtml(key)}"
        data-ai-action-state="${busy ? 'busy' : 'idle'}"
        aria-busy="${busy ? 'true' : 'false'}"
        ${(!enabled && !canConnect) || busy ? 'disabled' : ''}
      >
        ${label}
      </button>
    </div>
  `;
}

function beginAiWorkStatus(id, scope, title, detail = '') {
  state.aiWorkStatus = {
    id,
    scope,
    state: 'busy',
    title,
    detail,
    updatedAt: new Date().toISOString()
  };
}

function completeAiWorkStatus(id, scope, title, detail = '', stateName = 'done') {
  state.aiWorkStatus = {
    id,
    scope,
    state: stateName,
    title,
    detail,
    updatedAt: new Date().toISOString()
  };
}

function renderAiWorkStatus(scope) {
  const status = state.aiWorkStatus;
  if (!status || status.scope !== scope) return '';

  const isBusy = status.state === 'busy';
  const statusLabel = isBusy ? '작업 중' : status.state === 'error' ? '확인 필요' : '완료';
  const updatedLabel = status.updatedAt ? formatSavedTime(status.updatedAt) : '';
  return `
    <div
      class="ai-work-status is-${escapeHtml(status.state)}"
      data-ai-work-status="${escapeHtml(status.id)}"
      role="status"
      aria-live="polite"
      aria-busy="${isBusy ? 'true' : 'false'}"
    >
      <span class="ai-work-status-icon" aria-hidden="true"></span>
      <div>
        <span>${escapeHtml(statusLabel)}${updatedLabel && !isBusy ? ` · ${escapeHtml(updatedLabel)}` : ''}</span>
        <strong>${escapeHtml(status.title || (isBusy ? 'AI가 작업 중입니다.' : 'AI 작업이 완료되었습니다.'))}</strong>
        ${status.detail ? `<p>${escapeHtml(status.detail)}</p>` : ''}
      </div>
    </div>
  `;
}

function renderBuilderAiBusyOverlay() {
  const status = state.aiWorkStatus;
  if (!state.aiBusyKey || !status || status.scope !== 'builder-ai' || status.state !== 'busy') {
    return '';
  }

  return `
    <div class="builder-ai-busy-backdrop" data-builder-ai-busy-overlay role="presentation">
      <section
        class="builder-ai-busy-dialog"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <span class="builder-ai-busy-spinner" aria-hidden="true"></span>
        <div>
          <span>AI 작업 중</span>
          <strong>${escapeHtml(status.title || 'AI가 문구를 정리하고 있습니다.')}</strong>
          ${status.detail ? `<p>${escapeHtml(status.detail)}</p>` : ''}
        </div>
      </section>
    </div>
  `;
}

function renderInboxAiBusyOverlay() {
  const status = state.aiWorkStatus;
  if (!state.inboxAiCurationBusy || !status || status.scope !== 'inbox-ai' || status.state !== 'busy') {
    return '';
  }

  return `
    <div class="inbox-ai-busy-backdrop" data-inbox-ai-busy-overlay role="presentation">
      <section
        class="inbox-ai-busy-dialog"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <span class="inbox-ai-busy-spinner" aria-hidden="true"></span>
        <div>
          <span>AI 추천 중</span>
          <strong>${escapeHtml(status.title || 'AI가 추천 기사를 정리하고 있습니다.')}</strong>
          ${status.detail ? `<p>${escapeHtml(status.detail)}</p>` : ''}
        </div>
      </section>
    </div>
  `;
}

function formatNumber(value) {
  return new Intl.NumberFormat('ko-KR').format(Number(value || 0));
}

function statusLabel(status) {
  return {
    pending: '대기',
    selected: '주요',
    reported: '업계',
    failed: '오류'
  }[status] || status;
}

function priorityLabel(priority) {
  return {
    high: '우선',
    normal: '기본',
    watch: '관심'
  }[priority] || priority || '기본';
}

function sectionLabel(sectionName) {
  if (sectionName === 'major') return '주요 보도';
  if (sectionName === 'industry') return '업계 보도';
  return '미분류';
}

function builderSectionHeading(sectionName) {
  if (sectionName === 'major') return '1. 주요 보도';
  if (sectionName === 'industry') return '2. 업계 보도';
  return sectionLabel(sectionName);
}

function sectionBadgeClass(sectionName) {
  if (sectionName === 'major') return 'section-major';
  if (sectionName === 'industry') return 'section-industry';
  return 'section-neutral';
}

function inboxKeywordToken(sectionName, keyword) {
  const safeSection = String(sectionName || '').trim();
  const safeKeyword = String(keyword || '').trim();
  return safeSection && safeKeyword ? `${safeSection}::${safeKeyword}` : '';
}

function parseInboxKeywordToken(token) {
  const [sectionName, ...keywordParts] = String(token || '').split('::');
  return {
    sectionName: String(sectionName || '').trim(),
    keyword: keywordParts.join('::').trim()
  };
}

function inboxKeywordFilterTokens() {
  const source = Array.isArray(state.inboxKeywordFilter)
    ? state.inboxKeywordFilter
    : String(state.inboxKeywordFilter || '').trim()
      ? [String(state.inboxKeywordFilter).trim()]
      : [];

  return [...new Set(
    source
      .map((value) => String(value || '').trim())
      .filter(Boolean)
  )].sort((left, right) => left.localeCompare(right, 'ko'));
}

function setInboxKeywordFilterTokens(tokens) {
  const values = Array.isArray(tokens) ? tokens : [tokens];
  state.inboxKeywordFilter = [...new Set(
    values
      .map((value) => String(value || '').trim())
      .filter(Boolean)
  )].sort((left, right) => left.localeCompare(right, 'ko'));
}

function inboxKeywordFiltersForSection(sectionName) {
  return inboxKeywordFilterTokens().filter((token) => parseInboxKeywordToken(token).sectionName === sectionName);
}

function hasInboxKeywordFilter(sectionName, keyword) {
  return inboxKeywordFilterTokens().includes(inboxKeywordToken(sectionName, keyword));
}

function clearInboxKeywordFiltersForSection(sectionName) {
  setInboxKeywordFilterTokens(
    inboxKeywordFilterTokens().filter((token) => parseInboxKeywordToken(token).sectionName !== sectionName)
  );
}

function toggleInboxKeywordFilter(sectionName, keyword) {
  const token = inboxKeywordToken(sectionName, keyword);
  if (!token) return;

  const next = new Set(inboxKeywordFilterTokens());
  if (next.has(token)) next.delete(token);
  else next.add(token);
  setInboxKeywordFilterTokens([...next]);
}

function formatClassificationValue(value) {
  const normalized = String(value || '').trim();
  if (normalized === 'major' || normalized === 'industry') {
    return sectionLabel(normalized);
  }
  return normalized || '-';
}

function formatSettingsVisibility(value) {
  const normalized = String(value || '').trim();
  if (normalized === 'private-internal') return '내부 전용';
  if (normalized === 'public') return '공개';
  return normalized || '기본';
}

function formatApiHostLabel(value) {
  const raw = String(value || '').trim();
  if (!raw) return '기본 경로';
  try {
    const parsed = new URL(raw);
    return parsed.host || raw;
  } catch (error) {
    return raw.replace(/^https?:\/\//u, '').replace(/\/+$/u, '');
  }
}

function fetchJson(url, fallback, options = {}) {
  const finalUrl = options.cacheBust
    ? `${url}${url.includes('?') ? '&' : '?'}ts=${Date.now()}`
    : url;

  return fetch(finalUrl, {
    cache: options.noStore ? 'no-store' : 'default'
  })
    .then((response) => (response.ok ? response.json() : fallback))
    .catch(() => fallback);
}

function deploymentConfig(config = state.config) {
  return config?.deployment && typeof config.deployment === 'object' ? config.deployment : {};
}

function canImportCustomBuilderArticles(config = state.config) {
  return isLocalUiRuntime() || hasRemoteAiConfigured(config);
}

function getAiApiBase(config = state.config) {
  const configured = String(deploymentConfig(config).aiApiBase || '').trim();
  return configured ? configured.replace(/\/+$/u, '') : '../api';
}

function hasRemoteAiConfigured(config = state.config) {
  const configured = String(deploymentConfig(config).aiApiBase || '').trim();
  return Boolean(configured);
}

function shouldAutoFetchAiCapabilities(config = state.config) {
  const deployment = deploymentConfig(config);
  return deployment.visibility !== 'public-readonly';
}

function getStoredAiToken() {
  try {
    return String(
      window.localStorage.getItem(AI_TOKEN_STORAGE_KEY)
        || window.localStorage.getItem(AI_TOKEN_LEGACY_STORAGE_KEY)
        || ''
    ).trim();
  } catch {
    return '';
  }
}

function setStoredAiToken(value) {
  try {
    if (value) {
      window.localStorage.setItem(AI_TOKEN_STORAGE_KEY, value);
      window.localStorage.removeItem(AI_TOKEN_LEGACY_STORAGE_KEY);
      return;
    }
    window.localStorage.removeItem(AI_TOKEN_STORAGE_KEY);
    window.localStorage.removeItem(AI_TOKEN_LEGACY_STORAGE_KEY);
  } catch {
    // ignore storage failures
  }
}

function isLocalUiRuntime() {
  try {
    const host = String(window.location.hostname || '').trim().toLowerCase();
    return host === 'localhost' || host === '127.0.0.1';
  } catch {
    return false;
  }
}

function buildLocalAiApiUrl(pathname) {
  return `../api${pathname}`;
}

function buildLocalOperatorApiUrl(pathname) {
  return `../api${pathname}`;
}

function buildOperatorApiUrls(pathname) {
  const candidateUrls = [];
  if (isLocalUiRuntime()) {
    candidateUrls.push(buildLocalOperatorApiUrl(pathname));
  }
  return [...new Set(candidateUrls)];
}

function buildAiApiUrl(pathname, config = state.config) {
  return `${getAiApiBase(config)}${pathname}`;
}

function buildArticleImportApiUrls(config = state.config) {
  const candidateUrls = [];
  const preferRemote = deploymentConfig(config).visibility === 'public-readonly' && hasRemoteAiConfigured(config);
  if (preferRemote) {
    candidateUrls.push(buildAiApiUrl('/articles/import', config));
  }
  if (isLocalUiRuntime()) {
    candidateUrls.push(buildLocalOperatorApiUrl('/articles/import'));
  }
  if (!preferRemote && hasRemoteAiConfigured(config)) {
    candidateUrls.push(buildAiApiUrl('/articles/import', config));
  }
  return [...new Set(candidateUrls)];
}

function buildApiJsonHeaders() {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8'
  };
  const token = getStoredAiToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

function normalizeAiRequestError(error, fallback = 'AI 연결을 확인해주세요.') {
  const message = String(error?.message || '').trim();
  if (!message) return fallback;
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return '원격 AI API에 연결하지 못했습니다. 네트워크 또는 접근 허용 설정을 확인해주세요.';
  }
  return message;
}

function normalizeArticleImportError(error, fallback = '\uAE30\uC0AC \uB9C1\uD06C\uB97C \uAC00\uC838\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.') {
  const message = String(error?.message || '').trim();
  if (!message) return fallback;
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return '\uAE30\uC0AC \uCD94\uAC00 API\uC5D0 \uC5F0\uACB0\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uB124\uD2B8\uC6CC\uD06C \uB610\uB294 \uC6D0\uACA9 API \uC811\uADFC \uD5C8\uC6A9 \uC124\uC815\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.';
  }
  return message;
}

async function fetchAiCapabilities(config = state.config, options = {}) {
  const { throwOnError = false } = options;
  const token = getStoredAiToken();
  const headers = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const candidateUrls = [];
  if (isLocalUiRuntime()) {
    candidateUrls.push(buildLocalAiApiUrl('/capabilities'));
  }
  candidateUrls.push(buildAiApiUrl('/capabilities', config));

  let lastError = null;

  for (const [index, apiUrl] of [...new Set(candidateUrls)].entries()) {
    try {
      const response = await fetch(apiUrl, {
        cache: 'no-store',
        headers
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        lastError = new Error(payload?.error || 'AI 연결을 확인해주세요.');
        if (throwOnError && index >= candidateUrls.length - 1) {
          throw lastError;
        }
        continue;
      }

      return await response.json();
    } catch (error) {
      lastError = error;
      if (throwOnError && index >= candidateUrls.length - 1) {
        throw error;
      }
    }
  }

  if (throwOnError && lastError) throw lastError;
  return {
    aiSummarize: false,
    requiresToken: false
  };
}

async function connectRemoteAiAccess() {
  if (!hasRemoteAiConfigured()) {
    showToast('AI API 주소가 설정되지 않았습니다.');
    return false;
  }

  if (window.location.protocol === 'https:' && /^http:\/\//i.test(getAiApiBase())) {
    showToast('공개 페이지에서는 HTTPS AI API 주소가 필요합니다.');
    return false;
  }

  let capabilitiesPayload;
  try {
    capabilitiesPayload = await fetchAiCapabilities(state.config, { throwOnError: true });
  } catch (error) {
    showToast(normalizeAiRequestError(error));
    return false;
  }
  state.capabilities = {
    aiSummarize: Boolean(capabilitiesPayload?.aiSummarize),
    provider: String(capabilitiesPayload?.provider || ''),
    model: String(capabilitiesPayload?.model || ''),
    requiresToken: Boolean(capabilitiesPayload?.requiresToken)
  };

  if (!state.capabilities.aiSummarize) {
    showToast('AI 연결을 확인해주세요.');
    return false;
  }

  showToast('AI 연결이 완료되었습니다.');
  return true;
}

async function requestAiSummary(article) {
  const token = getStoredAiToken();
  const headers = {
    'Content-Type': 'application/json; charset=utf-8'
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const candidateUrls = [];
  if (isLocalUiRuntime()) {
    candidateUrls.push(buildLocalAiApiUrl('/ai/summarize'));
  }
  candidateUrls.push(buildAiApiUrl('/ai/summarize'));

  const apiUrls = [...new Set(candidateUrls)];
  let lastError = null;

  for (const [index, apiUrl] of apiUrls.entries()) {
    let response;
    try {
      response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          article: {
            title: article?.title || '',
            summary: article?.summary || '',
            publisher: mediaLabel(article),
            keyword: article?.keyword || '',
            section: article?.section || '',
            url: article?.url || '',
            currentSummaryLead: articleSummaryLead(article),
            currentKeyPoint: articleKeyPoint(article)
          }
        })
      });
    } catch (error) {
      lastError = new Error(normalizeAiRequestError(error, 'AI 정리에 실패했습니다.'));
      if (index < apiUrls.length - 1) {
        continue;
      }
      throw lastError;
    }

    const payload = await response.json().catch(() => null);
    if (response.status === 401) {
      setStoredAiToken('');
      throw new Error(payload?.error || 'AI 접근 토큰을 다시 입력해주세요.');
    }

    if (!response.ok) {
      lastError = new Error(payload?.error || 'AI 정리에 실패했습니다.');
      if (index < apiUrls.length - 1 && [404, 405, 500, 502, 503].includes(response.status)) {
        continue;
      }
      throw lastError;
    }

    return payload || {};
  }

  throw lastError || new Error('AI 정리에 실패했습니다.');
}

function buildAiSummaryBatchPayload(entries) {
  return (Array.isArray(entries) ? entries : [])
    .map((entry) => {
      const article = entry?.article || {};
      const key = String(entry?.key || '').trim();
      if (!key) return null;
      return {
        key,
        title: article?.title || '',
        summary: article?.summary || '',
        publisher: mediaLabel(article),
        keyword: article?.keyword || '',
        section: article?.section || '',
        url: article?.url || '',
        currentSummaryLead: articleSummaryLead(article),
        currentKeyPoint: articleKeyPoint(article)
      };
    })
    .filter(Boolean);
}

async function requestAiSummaryBatch(entries) {
  const token = getStoredAiToken();
  const headers = {
    'Content-Type': 'application/json; charset=utf-8'
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const articles = buildAiSummaryBatchPayload(entries);
  if (!articles.length) {
    throw new Error('AI에 보낼 기사가 없습니다.');
  }

  const candidateUrls = [];
  if (isLocalUiRuntime()) {
    candidateUrls.push(buildLocalAiApiUrl('/ai/summarize-batch'));
  }
  candidateUrls.push(buildAiApiUrl('/ai/summarize-batch'));

  const apiUrls = [...new Set(candidateUrls)];
  let lastError = null;

  for (const [index, apiUrl] of apiUrls.entries()) {
    let response;
    try {
      response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ articles })
      });
    } catch (error) {
      lastError = new Error(normalizeAiRequestError(error, 'AI 일괄 정리에 실패했습니다.'));
      if (index < apiUrls.length - 1) {
        continue;
      }
      throw lastError;
    }

    const payload = await response.json().catch(() => null);
    if (response.status === 401) {
      setStoredAiToken('');
      throw new Error(payload?.error || 'AI 접근 토큰을 다시 입력해주세요.');
    }

    if (!response.ok) {
      const fallbackMessage = response.status === 404 || response.status === 405
        ? '배치 AI 정리 API가 아직 서버에 반영되지 않았습니다. 서버 업데이트 후 다시 실행해주세요.'
        : 'AI 일괄 정리에 실패했습니다.';
      lastError = new Error(payload?.error || fallbackMessage);
      if (index < apiUrls.length - 1 && [404, 405, 500, 502, 503].includes(response.status)) {
        continue;
      }
      throw lastError;
    }

    const items = Array.isArray(payload?.items) ? payload.items : [];
    if (!items.length) {
      throw new Error('AI 일괄 정리 결과가 비어 있습니다.');
    }

    return {
      ...payload,
      items
    };
  }

  throw lastError || new Error('AI 일괄 정리에 실패했습니다.');
}

async function requestAiDraftPolish(reportText) {
  const token = getStoredAiToken();
  const headers = {
    'Content-Type': 'application/json; charset=utf-8'
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const candidateUrls = [];
  if (isLocalUiRuntime()) {
    candidateUrls.push(buildLocalAiApiUrl('/ai/report-draft'));
  }
  candidateUrls.push(buildAiApiUrl('/ai/report-draft'));

  const apiUrls = [...new Set(candidateUrls)];
  let lastError = null;

  for (const [index, apiUrl] of apiUrls.entries()) {
    let response;
    try {
      response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          reportText: String(reportText || '')
        })
      });
    } catch (error) {
      lastError = new Error(normalizeAiRequestError(error, 'AI 정리에 실패했습니다.'));
      if (index < apiUrls.length - 1) {
        continue;
      }
      throw lastError;
    }

    const payload = await response.json().catch(() => null);
    if (response.status === 401) {
      setStoredAiToken('');
      throw new Error(payload?.error || 'AI 접근 토큰을 다시 입력해주세요.');
    }

    if (!response.ok) {
      lastError = new Error(payload?.error || 'AI 정리에 실패했습니다.');
      if (index < apiUrls.length - 1 && [404, 405, 500, 502, 503].includes(response.status)) {
        continue;
      }
      throw lastError;
    }

    return payload || {};
  }

  throw lastError || new Error('AI 정리에 실패했습니다.');
}

function buildAiCurationArticlePayload(articles) {
  return (Array.isArray(articles) ? articles : []).slice(0, 220).map((article, index) => ({
    articleId: `A${String(index + 1).padStart(3, '0')}`,
    title: String(article?.title || '').trim(),
    summary: truncateText(String(article?.summary || '').trim(), 220),
    publisher: mediaLabel(article),
    keyword: String(article?.keyword || '').trim(),
    section: String(article?.section || '').trim(),
    url: String(article?.url || '').trim(),
    publishedAt: String(article?.publishedAt || '').trim()
  }));
}

async function requestAiArticleCuration(articles, prompt) {
  const token = getStoredAiToken();
  const headers = {
    'Content-Type': 'application/json; charset=utf-8'
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const payloadArticles = buildAiCurationArticlePayload(articles);
  if (!payloadArticles.length) {
    throw new Error('AI에 보낼 기사가 없습니다.');
  }

  const candidateUrls = [];
  if (isLocalUiRuntime()) {
    candidateUrls.push(buildLocalAiApiUrl('/ai/article-curation'));
  }
  candidateUrls.push(buildAiApiUrl('/ai/article-curation'));

  const apiUrls = [...new Set(candidateUrls)];
  let lastError = null;

  for (const [index, apiUrl] of apiUrls.entries()) {
    let response;
    try {
      response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          prompt: String(prompt || '').trim(),
          articles: payloadArticles
        })
      });
    } catch (error) {
      lastError = new Error(normalizeAiRequestError(error, 'AI 기사 추천에 실패했습니다.'));
      if (index < apiUrls.length - 1) {
        continue;
      }
      throw lastError;
    }

    const payload = await response.json().catch(() => null);
    if (response.status === 401) {
      setStoredAiToken('');
      throw new Error(payload?.error || 'AI 접근 토큰을 다시 입력해주세요.');
    }

    if (!response.ok) {
      lastError = new Error(payload?.error || 'AI 기사 추천에 실패했습니다.');
      if (index < apiUrls.length - 1 && [404, 405, 500, 502, 503].includes(response.status)) {
        continue;
      }
      throw lastError;
    }

    return payload || {};
  }

  throw lastError || new Error('AI 기사 추천에 실패했습니다.');
}

async function requestAlertTest(alertPolicy) {
  const apiUrls = buildOperatorApiUrls('/alerts/test');
  const buildFallbackPayload = (description = '서버 점검 경로에 연결하지 못해 브라우저에서 테스트 알림 payload를 검증했습니다.') => {
    const enabled = Boolean(alertPolicy?.enabled);
    const channel = String(alertPolicy?.channel || 'email').trim() || 'email';
    const recipient = String(alertPolicy?.recipient || '').trim();
    const consecutiveFailures = Number(alertPolicy?.consecutiveFailures || 0);

    if (!enabled) {
      throw new Error('장애 알림이 비활성 상태입니다.');
    }
    if (channel.toLowerCase() !== 'email') {
      throw new Error('현재 테스트 알림 점검은 EMAIL 채널만 지원합니다.');
    }
    if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
      throw new Error('유효한 장애 알림 이메일 주소가 필요합니다.');
    }

    return {
      mode: 'preview',
      recipient,
      subject: `[DailyComm] 크롤링 장애 테스트 ${state.date || 'no-date'}`,
      description,
      body: [
        '이 메시지는 DailyComm 운영 화면의 테스트 알림 점검입니다.',
        `- 수신처: ${recipient}`,
        `- 채널: ${channel.toUpperCase()}`,
        `- 조건: ${formatNumber(consecutiveFailures)}회 연속 실패`,
        state.date ? `- 데이터 기준일: ${state.date}` : '',
        state.articleMeta?.generatedAt || state.report?.generatedAt
          ? `- 마지막 생성 시각: ${state.articleMeta?.generatedAt || state.report?.generatedAt}`
          : ''
      ].filter(Boolean).join('\n')
    };
  };

  if (!apiUrls.length) {
    return buildFallbackPayload();
  }

  let lastError = null;
  for (const apiUrl of apiUrls) {
    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: buildApiJsonHeaders(),
        body: JSON.stringify({
          alertPolicy: {
            enabled: Boolean(alertPolicy?.enabled),
            channel: String(alertPolicy?.channel || 'email').trim(),
            consecutiveFailures: Number(alertPolicy?.consecutiveFailures || 0),
            recipient: String(alertPolicy?.recipient || '').trim()
          },
          dataDate: state.date,
          generatedAt: state.articleMeta?.generatedAt || state.report?.generatedAt || new Date().toISOString()
        })
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || '테스트 알림 점검에 실패했습니다.');
      }

      return payload || {};
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('테스트 알림 점검에 실패했습니다.');
    }
  }

  if (lastError) {
    return buildFallbackPayload();
  }

  throw new Error('테스트 알림 점검에 실패했습니다.');
}

function normalizeArticles(payload) {
  const items = Array.isArray(payload)
    ? payload
    : (!payload || typeof payload !== 'object' || !Array.isArray(payload.articles) ? [] : payload.articles);

  return [...items].sort((a, b) => {
    const left = Number.isFinite(a?.recencyScore) ? a.recencyScore : Number.POSITIVE_INFINITY;
    const right = Number.isFinite(b?.recencyScore) ? b.recencyScore : Number.POSITIVE_INFINITY;
    if (left !== right) return left - right;
    return String(a?.title || '').localeCompare(String(b?.title || ''), 'ko');
  });
}

function getReportSections() {
  const sections = state.reportDraft || state.report?.sections || state.report || {};
  return {
    major: Array.isArray(sections.major) ? sections.major : [],
    industry: Array.isArray(sections.industry) ? sections.industry : []
  };
}

function builderDraftStorageKey(dateKey = state.date) {
  const normalizedDate = String(dateKey || currentSeoulDateKey()).trim() || currentSeoulDateKey();
  return `${BUILDER_DRAFT_STORAGE_PREFIX}.${normalizedDate}`;
}

function loadStoredBuilderDraft(dateKey = state.date) {
  const payload = readJsonStorage(builderDraftStorageKey(dateKey), null);
  if (!payload || typeof payload !== 'object') return null;

  const major = Array.isArray(payload?.reportDraft?.major)
    ? payload.reportDraft.major.map((item) => createDraftItem(item, 'major'))
    : [];
  const industry = Array.isArray(payload?.reportDraft?.industry)
    ? payload.reportDraft.industry.map((item) => createDraftItem(item, 'industry'))
    : [];
  const reportTextDraft = String(payload?.reportTextDraft || '');
  const hasItems = major.length > 0 || industry.length > 0;
  const hasText = Boolean(reportTextDraft.trim());

  if (!hasItems && !hasText) return null;

  return {
    reportDraft: {
      major,
      industry
    },
    reportTextDraft,
    builderFocusKey: String(payload?.builderFocusKey || ''),
    savedAt: String(payload?.savedAt || '')
  };
}

function getStats() {
  return state.articleMeta?.stats || {};
}

function keywordList() {
  return Array.isArray(state.config?.keywords) ? state.config.keywords.filter(Boolean) : [];
}

function configuredKeywordSection(keyword, config = state.config || {}) {
  const target = String(keyword || '').trim();
  if (!target) return '';

  const dictionary = config.classificationDictionary && typeof config.classificationDictionary === 'object'
    ? config.classificationDictionary
    : {};

  const direct = String(dictionary[target] || '').trim();
  if (direct === 'major' || direct === 'industry') return direct;

  const normalizedTarget = normalizeArticleMatchValue(target);
  const matchedEntry = Object.entries(dictionary).find(([entryKeyword]) =>
    normalizeArticleMatchValue(entryKeyword) === normalizedTarget
  );
  const matchedSection = String(matchedEntry?.[1] || '').trim();
  if (matchedSection === 'major' || matchedSection === 'industry') return matchedSection;

  return /(카카오|kakao|김범수|정신아|멜론)/i.test(target) ? 'major' : 'industry';
}

function keywordBelongsToSection(keyword, sectionName, config = state.config || {}) {
  return configuredKeywordSection(keyword, config) === sectionName;
}

function keywordGroupDisplayLabel(sectionName) {
  return sectionName === 'major' ? '카카오 키워드' : '업계 키워드';
}

function keywordGroupSubLabel(sectionName) {
  return sectionName === 'major' ? '주요 보도 기준' : '업계 보도 기준';
}

function groupedConfiguredKeywords(config = state.config || {}) {
  const dictionary = config.classificationDictionary && typeof config.classificationDictionary === 'object'
    ? config.classificationDictionary
    : {};
  const keywords = [...new Set([
    ...(Array.isArray(config.keywords) ? config.keywords : []),
    ...Object.keys(dictionary)
  ].map((keyword) => String(keyword || '').trim()).filter(Boolean))];

  return ['major', 'industry'].map((sectionName) => ({
    key: sectionName,
    label: keywordGroupDisplayLabel(sectionName),
    subLabel: keywordGroupSubLabel(sectionName),
    items: keywords
      .filter((keyword) => keywordBelongsToSection(keyword, sectionName, config))
      .sort((left, right) => left.localeCompare(right, 'ko'))
  }));
}

function mediaWhitelist() {
  return Array.isArray(state.config?.mediaWhitelistLabels)
    ? state.config.mediaWhitelistLabels.filter(Boolean)
    : [];
}

function inferConfiguredKeyword(article) {
  const keywords = Array.isArray(state.config?.keywords) ? state.config.keywords.filter(Boolean) : [];
  if (!keywords.length) return '';

  const haystack = `${article?.title || ''} ${article?.summary || ''} ${article?.publisher || ''}`.toLowerCase();
  const matched = keywords.find((keyword) => haystack.includes(String(keyword || '').trim().toLowerCase()));
  return matched ? String(matched).trim() : '';
}

async function importBuilderArticleByUrl(rawUrl) {
  const apiUrls = buildArticleImportApiUrls();
  if (!apiUrls.length) {
    throw new Error('\uAE30\uC0AC \uCD94\uAC00 API \uC8FC\uC18C\uAC00 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.');
  }

  let lastError = null;

  for (const [index, apiUrl] of apiUrls.entries()) {
    let response;
    try {
      response = await fetch(apiUrl, {
        method: 'POST',
        headers: buildApiJsonHeaders(),
        body: JSON.stringify({
          url: String(rawUrl || '').trim()
        })
      });
    } catch (error) {
      lastError = new Error(normalizeArticleImportError(error));
      if (index < apiUrls.length - 1) {
        continue;
      }
      throw lastError;
    }

    const payload = await response.json().catch(() => null);
    if (response.status === 401) {
      setStoredAiToken('');
      throw new Error(payload?.error || 'AI \uC811\uADFC \uD1A0\uD070\uC744 \uB2E4\uC2DC \uC785\uB825\uD574\uC8FC\uC138\uC694.');
    }

    if (!response.ok) {
      lastError = new Error(payload?.error || '\uAE30\uC0AC \uB9C1\uD06C\uB97C \uAC00\uC838\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.');
      if (index < apiUrls.length - 1 && [404, 405, 500, 502, 503].includes(response.status)) {
        continue;
      }
      throw lastError;
    }

    if (!payload?.article || typeof payload.article !== 'object') {
      lastError = new Error('\uAE30\uC0AC \uC815\uBCF4\uB97C \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.');
      if (index < apiUrls.length - 1) {
        continue;
      }
      throw lastError;
    }

    return {
      ...payload.article,
      keyword: payload.article.keyword || inferConfiguredKeyword(payload.article)
    };
  }

  throw lastError || new Error('\uAE30\uC0AC \uB9C1\uD06C\uB97C \uAC00\uC838\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.');
}

function mediaLabel(article) {
  return article?.publisher || article?.media || article?.source || '-';
}

function articleKey(article) {
  if (!article) return '';
  if (article.url) return String(article.url);
  return `${article.keyword || ''}:${article.title || ''}:${mediaLabel(article)}`;
}

function normalizeArticleMatchValue(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function articleComparisonSignature(article) {
  const title = normalizeArticleMatchValue(article?.title);
  const media = normalizeArticleMatchValue(mediaLabel(article));
  if (!title || !media) return '';
  return `${title}::${media}`;
}

function articlesMatch(left, right) {
  if (!left || !right) return false;
  const leftUrl = String(left.url || '').trim();
  const rightUrl = String(right.url || '').trim();
  if (leftUrl && rightUrl && leftUrl === rightUrl) return true;
  const leftSignature = articleComparisonSignature(left);
  return Boolean(leftSignature) && leftSignature === articleComparisonSignature(right);
}

function draftEntryKey(sectionName, article) {
  return `${sectionName}::${articleKey(article)}`;
}

function cloneArticle(article) {
  return article ? JSON.parse(JSON.stringify(article)) : null;
}

function cloneValue(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function captureWorkspaceSnapshot() {
  return {
    activePage: state.activePage,
    report: cloneValue(state.report),
    reportDraft: cloneValue(state.reportDraft),
    reportTextDraft: String(state.reportTextDraft || ''),
    builderFocusKey: String(state.builderFocusKey || ''),
    builderSideView: String(state.builderSideView || 'draft'),
    selectedArticle: cloneArticle(state.selectedArticle),
    selectedArticleUrls: [...state.selectedArticleUrls],
    selectedPage: state.selectedPage,
    inboxPreviewOpen: Boolean(state.inboxPreviewOpen),
    inboxSectionFilter: String(state.inboxSectionFilter || 'all'),
    inboxStatusFilter: String(state.inboxStatusFilter || 'all'),
    inboxAiFilter: String(state.inboxAiFilter || 'all'),
    inboxKeywordFilter: [...inboxKeywordFilterTokens()],
    inboxSearchQuery: String(state.inboxSearchQuery || ''),
    inboxSortKey: String(state.inboxSortKey || 'score'),
    inboxSortDirection: String(state.inboxSortDirection || 'desc'),
    builderImportOpen: Boolean(state.builderImportOpen),
    builderImportUrl: String(state.builderImportUrl || ''),
    builderImportSection: String(state.builderImportSection || 'major')
  };
}

function restoreWorkspaceSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return;

  state.report = cloneValue(snapshot.report) || state.report;
  state.reportDraft = cloneValue(snapshot.reportDraft) || { major: [], industry: [] };
  state.reportTextDraft = String(snapshot.reportTextDraft || '');
  state.builderFocusKey = String(snapshot.builderFocusKey || '');
  state.builderSideView = String(snapshot.builderSideView || 'draft');
  state.selectedArticle = cloneArticle(snapshot.selectedArticle);
  state.selectedArticleUrls = Array.isArray(snapshot.selectedArticleUrls) ? [...snapshot.selectedArticleUrls] : [];
  state.selectedPage = Number(snapshot.selectedPage || 1);
  state.inboxPreviewOpen = Boolean(snapshot.inboxPreviewOpen);
  state.inboxSectionFilter = String(snapshot.inboxSectionFilter || 'all');
  state.inboxStatusFilter = String(snapshot.inboxStatusFilter || 'all');
  state.inboxAiFilter = String(snapshot.inboxAiFilter || 'all');
  state.inboxKeywordFilter = Array.isArray(snapshot.inboxKeywordFilter) ? [...snapshot.inboxKeywordFilter] : [];
  state.inboxSearchQuery = String(snapshot.inboxSearchQuery || '');
  state.inboxSortKey = String(snapshot.inboxSortKey || 'score');
  state.inboxSortDirection = String(snapshot.inboxSortDirection || 'desc');
  state.builderImportOpen = Boolean(snapshot.builderImportOpen);
  state.builderImportUrl = String(snapshot.builderImportUrl || '');
  state.builderImportSection = String(snapshot.builderImportSection || 'major');
  persistStoredBuilderDraft();
  render(snapshot.activePage || state.activePage || 'dashboard');
}

function registerUndoAction(message, snapshot) {
  if (!snapshot) return;
  showToast(message, {
    actionLabel: '실행 취소',
    duration: UNDO_TOAST_DURATION,
    replace: true,
    onAction: () => {
      restoreWorkspaceSnapshot(snapshot);
      showToast('방금 작업을 되돌렸습니다.');
    }
  });
}

function findArticleRecord(seed) {
  const key = typeof seed === 'string' ? seed : articleKey(seed);
  if (!key) return null;

  return (
    state.articles.find((article) => articleKey(article) === key || article.url === key) ||
    getReportSections().major.find((article) => articleKey(article) === key || article.url === key) ||
    getReportSections().industry.find((article) => articleKey(article) === key || article.url === key) ||
    null
  );
}

function findExistingArticleLocation(article) {
  const sections = getReportSections();
  for (const sectionName of ['major', 'industry']) {
    const existing = sections[sectionName].find((item) => articlesMatch(item, article));
    if (existing) {
      return {
        scope: 'report',
        page: 'builder',
        sectionName,
        article: existing,
        key: draftEntryKey(sectionName, existing)
      };
    }
  }

  const inboxArticle = state.articles.find((item) => articlesMatch(item, article));
  if (inboxArticle) {
    return {
      scope: 'inbox',
      page: 'inbox',
      article: inboxArticle,
      key: articleKey(inboxArticle)
    };
  }

  return null;
}

function focusExistingArticleLocation(location) {
  if (!location) return;

  if (location.page === 'builder') {
    state.builderSideView = 'draft';
    setBuilderFocus(location.key || '');
    render('builder');
    requestAnimationFrame(() => {
      const target = app.querySelector(`[data-builder-focus="${CSS.escape(location.key || '')}"]`);
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    return;
  }

  if (location.page === 'inbox') {
    state.selectedArticle = findArticleRecord(location.key || '') || location.article || null;
    state.inboxPreviewOpen = false;
    render('inbox');
    requestAnimationFrame(() => {
      const selector = `.table-row[data-article-key="${CSS.escape(location.key || '')}"]`;
      app.querySelector(selector)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }
}

function createDraftItem(article, fallbackSection = 'industry') {
  const seed = cloneArticle(article) || {};
  const section = fallbackSection || (seed.section === 'major' || seed.section === 'industry' ? seed.section : 'industry');
  const groundedDraft = buildGroundedDraftForArticle(seed);
  let summaryLead = String(seed.summaryLead || seed.conclusion || seed.oneLine || seed.summary || seed.title || '').trim();
  let keyPoint = String(seed.keyPoint || seed.oneLine || seed.angle || seed.summary || seed.title || '').trim();
  let oneLine = String(seed.oneLine || seed.summary || seed.title || '').trim();
  let conclusion = String(seed.conclusion || '').trim();

  if (isUnsupportedKakaoDraftLine(summaryLead, seed)) {
    summaryLead = groundedDraft.summaryLead;
  }
  if (isUnsupportedKakaoDraftLine(keyPoint, seed)) {
    keyPoint = groundedDraft.keyPoint;
  }
  if (isUnsupportedKakaoDraftLine(oneLine, seed)) {
    oneLine = groundedDraft.keyPoint;
  }
  if (isUnsupportedKakaoDraftLine(conclusion, seed)) {
    conclusion = groundedDraft.summaryLead;
  }

  return {
    ...seed,
    section,
    summaryLead,
    keyPoint,
    oneLine,
    angle: String(seed.angle || '').trim(),
    conclusion,
    includeInKakao: seed.includeInKakao !== false,
    priority: String(seed.priority || (section === 'major' ? 'high' : 'normal'))
  };
}

function createSuggestedDraftSeed(article) {
  const seed = cloneArticle(article) || {};
  if (seed.summaryLead || seed.keyPoint || seed.conclusion) {
    return seed;
  }

  const insight = buildArticleAiInsight(seed);
  return {
    ...seed,
    summaryLead: insight.draft.summaryLead,
    keyPoint: insight.draft.keyPoint,
    conclusion: insight.draft.summaryLead,
    oneLine: insight.draft.keyPoint,
    angle: insight.draft.title
  };
}

function articleSummaryLead(article) {
  return String(article?.summaryLead || article?.conclusion || article?.oneLine || article?.summary || article?.title || '').trim();
}

function articleKeyPoint(article) {
  return String(article?.keyPoint || article?.oneLine || article?.angle || article?.summary || article?.title || '').trim();
}

function articleBuilderSummary(article) {
  return articleSummaryLead(article) || String(article?.summary || article?.title || '').trim();
}

function articleBuilderOneLine(article) {
  return articleKeyPoint(article) || String(article?.oneLine || article?.summary || article?.title || '').trim();
}

function renderBuilderItemMeta(article) {
  const rows = [
    { label: '키워드', value: article?.keyword || '-' },
    { label: '매체', value: mediaLabel(article) }
  ];

  return `
    <div class="builder-item-meta" aria-label="기사 메타 정보">
      <div class="builder-item-meta-main">
        ${rows.map((row) => `
          <span class="builder-item-meta-chip">
            <strong>${escapeHtml(row.label)}</strong>
            <span>${escapeHtml(row.value || '-')}</span>
          </span>
        `).join('')}
      </div>
      <span class="builder-item-meta-time">${escapeHtml(formatArticlePublishedTime(article))}</span>
    </div>
  `;
}

function renderBuilderItemSummaryRows(article) {
  const rows = [
    {
      label: '기사 요약 및 결론',
      value: articleBuilderSummary(article) || '요약을 아직 입력하지 않았습니다.'
    },
    {
      label: '주요 내용 한줄 요약',
      value: articleBuilderOneLine(article) || '한줄 요약을 아직 입력하지 않았습니다.'
    }
  ];

  return `
    <div class="builder-item-report-lines">
      ${rows.map((row) => `
        <div class="builder-item-report-line">
          <span class="builder-item-report-label">${escapeHtml(row.label)}</span>
          <strong class="builder-item-report-value" ${row.label === '기사 요약 및 결론' ? 'data-builder-summary-value' : 'data-builder-oneline-value'}>${escapeHtml(row.value)}</strong>
        </div>
      `).join('')}
    </div>
  `;
}

function reportMembership(article) {
  const key = articleKey(article);
  const sections = getReportSections();
  return {
    isMainReport: sections.major.some((item) => articleKey(item) === key),
    isIndustryReport: sections.industry.some((item) => articleKey(item) === key)
  };
}

function canAddMajorReport(article) {
  const { isMainReport, isIndustryReport } = reportMembership(article);
  return article?.section !== 'industry' && !isMainReport && !isIndustryReport;
}

function canAddIndustryReport(article) {
  return !reportMembership(article).isIndustryReport;
}

function inboxTargetSection(article) {
  return article?.section === 'industry' ? 'industry' : 'major';
}

function canAddInboxReport(article) {
  const membership = reportMembership(article);
  return !membership.isMainReport && !membership.isIndustryReport;
}

function summarizeInboxAssignableArticles(articles) {
  const summary = {
    available: [],
    blocked: [],
    majorCount: 0,
    industryCount: 0
  };

  (Array.isArray(articles) ? articles : []).forEach((article) => {
    if (!article) return;
    if (!canAddInboxReport(article)) {
      summary.blocked.push(article);
      return;
    }

    summary.available.push(article);
    if (inboxTargetSection(article) === 'industry') {
      summary.industryCount += 1;
      return;
    }

    summary.majorCount += 1;
  });

  return summary;
}

function renderReportPills(article) {
  const membership = reportMembership(article);
  const pills = [];
  if (membership.isMainReport) {
    pills.push('<span class="panel-pill tone-main section-major">주요 보도</span>');
  }
  if (membership.isIndustryReport) {
    pills.push('<span class="panel-pill tone-industry section-industry">업계 보도</span>');
  }
  if (!pills.length) {
    pills.push('<span class="panel-pill tone-neutral">미반영</span>');
  }
  return pills.join('');
}

function renderArticleSourcePill() {
  return '';
}

function renderInboxActionIcon(actionName) {
  const icons = {
    open: `
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M6.5 5.5h8.2l3.8 3.8v8.2a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2z" />
        <path d="M14.7 5.7v3.6h3.6" />
        <path d="M8.4 9.4h3.8" />
        <path d="M8.4 12.2h4.8" />
        <path d="M8.4 15h3.6" />
        <path d="M12.9 15.4l4.1-4.1" />
        <path d="M14.3 11.3H17v2.7" />
      </svg>
    `,
    add: `
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M5.8 6.2h8.8l3.2 3.2v8a2 2 0 0 1-2 2H7.8a2 2 0 0 1-2-2z" />
        <path d="M14.6 6.3v3.1h3.1" />
        <path d="M8 9.5h4.2" />
        <path d="M8 12.2h2.8" />
        <path d="M8 14.9h3.8" />
        <circle class="icon-accent-fill" cx="13.9" cy="14.1" r="4.7" />
        <path class="icon-accent-contrast" d="M13.9 11.9v4.4" />
        <path class="icon-accent-contrast" d="M11.7 14.1h4.4" />
      </svg>
    `
  };

  return icons[actionName] || '';
}

function renderInboxActionButton({ actionName, dataAttribute, index, disabled = false, label, tooltip, buttonText = '', extraClass = '' }) {
  const disabledAttr = disabled ? 'disabled' : '';
  const safeLabel = escapeHtml(label);
  const safeTooltip = escapeHtml(tooltip || label);
  const safeButtonText = escapeHtml(buttonText || tooltip || label);
  const classes = ['icon-action-btn', extraClass].filter(Boolean).join(' ');
  return `
    <button
      class="${classes}"
      ${dataAttribute}="${index}"
      ${disabledAttr}
      aria-label="${safeLabel}"
      title="${safeTooltip}"
      data-tooltip="${safeTooltip}"
      type="button"
    >
      <span class="icon-action-icon">${renderInboxActionIcon(actionName)}</span>
      <span class="icon-action-label" aria-hidden="true">${safeButtonText}</span>
      <span class="sr-only">${safeLabel}</span>
    </button>
  `;
}

function renderPolicyNote(article) {
  const membership = reportMembership(article);
  if ((article?.section === 'industry' || membership.isIndustryReport) && !membership.isMainReport) {
    return '<p class="policy-note is-locked"><strong>잠금</strong><span>업계 보도 기사는 주요 보도로 올릴 수 없습니다.</span></p>';
  }
  if (membership.isMainReport && !membership.isIndustryReport) {
    return '<p class="policy-note is-open"><strong>가능</strong><span>주요 보도는 업계 보도에 함께 추가할 수 있습니다.</span></p>';
  }
  if (membership.isMainReport && membership.isIndustryReport) {
    return '<p class="policy-note is-complete"><strong>완료</strong><span>주요 보도와 업계 보도에 모두 반영되었습니다.</span></p>';
  }
  return '<p class="policy-note"><strong>안내</strong><span>선택한 기사만 리포트에 반영할 수 있습니다.</span></p>';
}

function industryKeywordOptions() {
  return [...new Set(
    state.articles
      .filter((article) => article.section === 'industry')
      .map((article) => String(article.keyword || '').trim())
      .filter(Boolean)
  )].sort((left, right) => left.localeCompare(right, 'ko'));
}

function keywordOptionsForSection(sectionName) {
  const source = state.articles.filter((article) => article.section === sectionName);
  const configuredKeywords = keywordList().filter((keyword) => keywordBelongsToSection(keyword, sectionName));
  const articleKeywords = source
    .map((article) => String(article.keyword || '').trim())
    .filter((keyword) => keywordBelongsToSection(keyword, sectionName))
    .filter((keyword) => keyword && source.some((article) => articleHasKeywordInDisplayText(article, keyword)));
  const textKeywords = configuredKeywords
    .filter((keyword) => source.some((article) => articleHasKeywordInDisplayText(article, keyword)));

  return [...new Set([...articleKeywords, ...textKeywords])]
    .sort((left, right) => left.localeCompare(right, 'ko'));
}

function inboxKeywordGroups() {
  const majorOptions = keywordOptionsForSection('major');
  const industryOptions = keywordOptionsForSection('industry');

  if (state.inboxSectionFilter === 'major') {
    return majorOptions.length ? [{ key: 'major', label: keywordGroupDisplayLabel('major'), subLabel: keywordGroupSubLabel('major'), options: majorOptions }] : [];
  }

  if (state.inboxSectionFilter === 'industry') {
    return industryOptions.length ? [{ key: 'industry', label: keywordGroupDisplayLabel('industry'), subLabel: keywordGroupSubLabel('industry'), options: industryOptions }] : [];
  }

  return [
    { key: 'major', label: keywordGroupDisplayLabel('major'), subLabel: keywordGroupSubLabel('major'), options: majorOptions },
    { key: 'industry', label: keywordGroupDisplayLabel('industry'), subLabel: keywordGroupSubLabel('industry'), options: industryOptions }
  ].filter((group) => group.options.length);
}

function normalizeInboxKeywordFilter() {
  const allowed = new Set(
    inboxKeywordGroups().flatMap((group) => group.options.map((keyword) => inboxKeywordToken(group.key, keyword)))
  );
  setInboxKeywordFilterTokens(inboxKeywordFilterTokens().filter((token) => allowed.has(token)));
}

function normalizedInboxSearchQuery() {
  return String(state.inboxSearchQuery || '').trim().toLowerCase();
}

function articleMatchesInboxSearch(article, query = normalizedInboxSearchQuery()) {
  const normalizedQuery = String(query || '').trim().toLowerCase();
  if (!normalizedQuery) return true;

  const haystack = [
    article?.title,
    article?.summary,
    mediaLabel(article),
    article?.keyword,
    article?.publisher,
    article?.source
  ]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean)
    .join(' ');

  return haystack.includes(normalizedQuery);
}

function setInboxSearchQuery(nextQuery) {
  const normalized = String(nextQuery || '').trim();
  if (state.inboxSearchQuery === normalized) {
    return false;
  }

  state.inboxSearchQuery = normalized;
  clearSelectedArticles();
  state.selectedPage = 1;
  state.inboxPreviewOpen = false;
  syncSelectedArticleToVisibleArticles();
  return true;
}

function restoreInboxSearchField(selection = null, { focus = true } = {}) {
  const input = document.getElementById('inbox-search');
  if (!input) return;

  if (focus) {
    input.focus({ preventScroll: true });
  }

  if (!selection || typeof input.setSelectionRange !== 'function') {
    return;
  }

  const valueLength = input.value.length;
  const start = Math.max(0, Math.min(selection.start ?? valueLength, valueLength));
  const end = Math.max(start, Math.min(selection.end ?? valueLength, valueLength));
  input.setSelectionRange(start, end);
}

function syncSelectedArticleToVisibleArticles() {
  const visibleArticles = filteredArticles();
  const hasVisibleSelection = visibleArticles.some((article) => articleKey(article) === articleKey(state.selectedArticle));

  if (!visibleArticles.length) {
    state.selectedArticle = null;
    return;
  }

  if (!hasVisibleSelection) {
    state.selectedArticle = visibleArticles[0] || null;
  }
}

function handleInboxFilterChange(mutate) {
  const before = [
    state.inboxSectionFilter,
    state.inboxStatusFilter,
    state.inboxAiFilter,
    normalizedInboxSearchQuery(),
    inboxKeywordFilterTokens().join('|')
  ].join('::');
  mutate();
  normalizeInboxKeywordFilter();
  const after = [
    state.inboxSectionFilter,
    state.inboxStatusFilter,
    state.inboxAiFilter,
    normalizedInboxSearchQuery(),
    inboxKeywordFilterTokens().join('|')
  ].join('::');

  if (before === after) {
    return false;
  }

  const hadSelection = selectedArticleCount() > 0;
  clearSelectedArticles();
  state.selectedPage = 1;
  state.inboxPreviewOpen = false;
  syncSelectedArticleToVisibleArticles();

  if (hadSelection) {
    showToast('필터가 변경되어 선택을 초기화했습니다.');
  }

  return true;
}

function activeInboxFilterCount() {
  let count = 0;
  if (state.inboxSectionFilter !== 'all') count += 1;
  if (state.inboxStatusFilter !== 'all') count += 1;
  if (state.inboxAiFilter !== 'all') count += 1;
  if (normalizedInboxSearchQuery()) count += 1;
  count += inboxKeywordFilterTokens().length;
  return count;
}

function activeInboxFilterLabels() {
  const labels = [];
  if (state.inboxSectionFilter !== 'all') labels.push(sectionLabel(state.inboxSectionFilter));
  if (state.inboxStatusFilter === 'unreported') labels.push('미반영만');
  if (state.inboxStatusFilter === 'reported') labels.push('리포트 반영');
  if (state.inboxAiFilter === 'recommended') labels.push('카카오 추천만');
  const searchQuery = normalizedInboxSearchQuery();
  if (searchQuery) labels.push(`검색: ${searchQuery}`);
  inboxKeywordFilterTokens().forEach((token) => {
    const { keyword } = parseInboxKeywordToken(token);
    if (keyword) labels.push(`키워드: ${keyword}`);
  });
  return labels;
}

function snapshotCurrentInboxPreset() {
  return {
    sectionFilter: state.inboxSectionFilter,
    statusFilter: state.inboxStatusFilter,
    aiFilter: state.inboxAiFilter,
    searchQuery: normalizedInboxSearchQuery(),
    keywordFilter: [...inboxKeywordFilterTokens()]
  };
}

function buildInboxPresetLabel(preset = snapshotCurrentInboxPreset()) {
  const parts = [];
  if (preset.sectionFilter === 'major') parts.push('주요 보도');
  if (preset.sectionFilter === 'industry') parts.push('업계 보도');
  if (preset.statusFilter === 'unreported') parts.push('미반영만');
  if (preset.statusFilter === 'reported') parts.push('리포트 반영');
  if (preset.aiFilter === 'recommended') parts.push('카카오 추천');
  if (Array.isArray(preset.keywordFilter) && preset.keywordFilter.length) {
    const keywordPart = preset.keywordFilter
      .map((token) => parseInboxKeywordToken(token).keyword)
      .filter(Boolean)
      .slice(0, 2)
      .join(', ');
    if (keywordPart) parts.push(keywordPart);
  }
  if (preset.searchQuery) parts.push(preset.searchQuery);
  return parts.slice(0, 3).join(' · ') || '현재 필터';
}

function persistInboxPreferences() {
  writeJsonStorage(INBOX_PRESET_STORAGE_KEY, state.inboxSavedPresets);
  writeJsonStorage(INBOX_RECENT_SEARCHES_STORAGE_KEY, state.inboxRecentSearches);
}

function persistStoredBuilderDraft() {
  const sections = getReportSections();
  const baselineText = buildKakaoPreviewText();
  const nextText = String(state.reportTextDraft || '');
  const hasItems = sections.major.length > 0 || sections.industry.length > 0;
  const hasCustomText = hasReportDraftChanged(baselineText, nextText);

  if (!hasItems && !hasCustomText) {
    removeStorageItem(builderDraftStorageKey());
    state.builderDraftStatus = 'idle';
    state.builderDraftSavedAt = '';
    state.builderDraftRestored = false;
    return;
  }

  const savedAt = new Date().toISOString();
  writeJsonStorage(builderDraftStorageKey(), {
    date: state.date,
    savedAt,
    reportDraft: {
      major: sections.major.map((article) => cloneArticle(article)),
      industry: sections.industry.map((article) => cloneArticle(article))
    },
    reportTextDraft: nextText,
    builderFocusKey: String(state.builderFocusKey || '')
  });
  state.builderDraftStatus = 'saved';
  state.builderDraftSavedAt = savedAt;
}

function saveCurrentInboxPreset() {
  if (!activeInboxFilterCount()) {
    showToast('저장할 활성 필터가 없습니다.');
    return;
  }

  const snapshot = snapshotCurrentInboxPreset();
  const duplicate = state.inboxSavedPresets.find((preset) =>
    preset.sectionFilter === snapshot.sectionFilter
    && preset.statusFilter === snapshot.statusFilter
    && preset.aiFilter === snapshot.aiFilter
    && preset.searchQuery === snapshot.searchQuery
    && JSON.stringify(preset.keywordFilter) === JSON.stringify(snapshot.keywordFilter)
  );

  if (duplicate) {
    showToast('같은 필터 프리셋이 이미 저장되어 있습니다.', {
      actionLabel: '적용',
      onAction: () => applyInboxPreset(duplicate.id),
      duration: UNDO_TOAST_DURATION
    });
    return;
  }

  state.inboxSavedPresets = [
    {
      id: `preset-${Date.now()}`,
      label: buildInboxPresetLabel(snapshot),
      ...snapshot
    },
    ...state.inboxSavedPresets
  ].slice(0, 4);
  persistInboxPreferences();
  showToast('현재 필터를 저장했습니다.');
}

function removeInboxPreset(presetId) {
  state.inboxSavedPresets = state.inboxSavedPresets.filter((preset) => preset.id !== presetId);
  persistInboxPreferences();
}

function applyInboxPreset(presetId) {
  const preset = state.inboxSavedPresets.find((item) => item.id === presetId);
  if (!preset) return;
  const changed = handleInboxFilterChange(() => {
    state.inboxSectionFilter = preset.sectionFilter || 'all';
    state.inboxStatusFilter = preset.statusFilter || 'all';
    state.inboxAiFilter = preset.aiFilter || 'all';
    state.inboxSearchQuery = preset.searchQuery || '';
    setInboxKeywordFilterTokens(Array.isArray(preset.keywordFilter) ? preset.keywordFilter : []);
  });
  if (!changed) return;
  renderInbox();
}

function commitInboxRecentSearch(query) {
  const normalized = String(query || '').trim();
  if (normalized.length < 2) return;
  state.inboxRecentSearches = [
    normalized,
    ...state.inboxRecentSearches.filter((item) => item !== normalized)
  ].slice(0, 6);
  persistInboxPreferences();
}

function summarizeAssignableArticles(sectionName, articles) {
  return articles.reduce(
    (acc, article) => {
      const membership = reportMembership(article);
      if (sectionName === 'major') {
        if (membership.isMainReport) acc.alreadyAssigned.push(article);
        else if (article?.section === 'industry' || membership.isIndustryReport) acc.blocked.push(article);
        else acc.available.push(article);
        return acc;
      }

      if (membership.isIndustryReport) acc.alreadyAssigned.push(article);
      else acc.available.push(article);
      return acc;
    },
    { available: [], blocked: [], alreadyAssigned: [] }
  );
}

function syncReportFromDraft() {
  const sections = getReportSections();
  state.report = {
    ...(state.report || {}),
    generatedAt: state.report?.generatedAt || state.articleMeta?.generatedAt || new Date().toISOString(),
    tone: state.report?.tone || 'declarative',
    recommendedLength: state.report?.recommendedLength || '600-1200 chars',
    sections: {
      major: sections.major.map((article) => cloneArticle(article)),
      industry: sections.industry.map((article) => cloneArticle(article))
    }
  };
}

function initializeReportDraft() {
  const restoredDraft = loadStoredBuilderDraft(state.date);
  if (restoredDraft) {
    const hasRestoredItems = restoredDraft.reportDraft.major.length > 0 || restoredDraft.reportDraft.industry.length > 0;
    const emptyDraftText = `${formatDateLabel(state.date)} Daily Comm Report\n\n리포트 빌더 결과가 아직 없습니다.`;
    if (!hasRestoredItems && !hasReportDraftChanged(emptyDraftText, restoredDraft.reportTextDraft || '')) {
      removeStorageItem(builderDraftStorageKey(state.date));
    } else {
    state.reportDraft = {
      major: restoredDraft.reportDraft.major,
      industry: restoredDraft.reportDraft.industry
    };
    syncReportFromDraft();
    state.reportTextDraft = restoredDraft.reportTextDraft || generateReportText();
    state.builderFocusKey = restoredDraft.builderFocusKey || '';
    state.builderDraftStatus = 'saved';
    state.builderDraftSavedAt = restoredDraft.savedAt || '';
    state.builderDraftRestored = true;
    return true;
    }
  }

  state.reportDraft = {
    major: [],
    industry: []
  };
  syncReportFromDraft();
  state.builderDraftStatus = 'idle';
  state.builderDraftSavedAt = '';
  state.builderDraftRestored = false;
  return false;
}

function selectedArticleCount() {
  return state.selectedArticleUrls.length;
}

function isArticleSelected(article) {
  const key = articleKey(article);
  return key ? state.selectedArticleUrls.includes(key) : false;
}

function getSelectedArticles() {
  return state.selectedArticleUrls
    .map((key) => findArticleRecord(key))
    .filter(Boolean);
}

function draftContainsArticle(sectionName, article) {
  const key = articleKey(article);
  return getReportSections()[sectionName].some((item) => articleKey(item) === key);
}

function findDraftLocation(entryKey) {
  const sections = getReportSections();
  for (const sectionName of ['major', 'industry']) {
    const index = sections[sectionName].findIndex((item) => draftEntryKey(sectionName, item) === entryKey);
    if (index >= 0) {
      return { sectionName, index, item: sections[sectionName][index] };
    }
  }
  return null;
}

function setBuilderFocus(key) {
  state.builderFocusKey = key || '';
}

function ensureBuilderFocus() {
  const sections = getReportSections();
  const allItems = [
    ...sections.major.map((item) => ({ item, sectionName: 'major' })),
    ...sections.industry.map((item) => ({ item, sectionName: 'industry' }))
  ];
  if (!allItems.length) {
    state.builderFocusKey = '';
    return;
  }

  const active = allItems.find(({ item, sectionName }) => draftEntryKey(sectionName, item) === state.builderFocusKey);
  if (!active) {
    state.builderFocusKey = draftEntryKey(allItems[0].sectionName, allItems[0].item);
  }
}

function normalizeBuilderSideView() {
  const hasFocus = Boolean(findDraftLocation(state.builderFocusKey));
  if (!hasFocus) {
    state.builderSideView = 'draft';
    return;
  }

  if (state.builderSideView !== 'draft' && state.builderSideView !== 'detail') {
    state.builderSideView = 'detail';
  }
}

function toggleArticleSelection(article, forceValue) {
  const key = articleKey(article);
  if (!key || isArticleAssigned(article)) return;

  const selected = new Set(state.selectedArticleUrls);
  const nextValue = typeof forceValue === 'boolean' ? forceValue : !selected.has(key);
  if (nextValue) {
    selected.add(key);
  } else {
    selected.delete(key);
  }
  state.selectedArticleUrls = [...selected];
}

function toggleVisibleArticleSelection(articles, forceValue) {
  const selected = new Set(state.selectedArticleUrls);
  for (const article of articles) {
    const key = articleKey(article);
    if (!key || isArticleAssigned(article)) continue;
    if (forceValue) selected.add(key);
    else selected.delete(key);
  }
  state.selectedArticleUrls = [...selected];
}

function clearSelectedArticles() {
  state.selectedArticleUrls = [];
}

function deselectArticles(articles) {
  if (!Array.isArray(articles) || !articles.length) return;
  const removeKeys = new Set(articles.map((article) => articleKey(article)).filter(Boolean));
  state.selectedArticleUrls = state.selectedArticleUrls.filter((key) => !removeKeys.has(key));
}

function removeDraftItem(key) {
  const location = findDraftLocation(key);
  if (!location) return;
  state.reportDraft[location.sectionName].splice(location.index, 1);
  syncReportFromDraft();
  state.reportTextDraft = generateReportText();
  ensureBuilderFocus();
  state.builderDraftRestored = false;
  persistStoredBuilderDraft();
}

function addArticleToReportSection(sectionName, article) {
  if (!article) return { added: false, reason: 'missing_article' };

  if (sectionName === 'major') {
    if (!canAddMajorReport(article)) {
      const membership = reportMembership(article);
      return {
        added: false,
        reason: article?.section === 'industry' || membership.isIndustryReport ? 'industry_to_main_blocked' : 'already_main'
      };
    }
  }

  if (sectionName === 'industry' && !canAddIndustryReport(article)) {
    return { added: false, reason: 'already_industry' };
  }

  const item = createDraftItem(createSuggestedDraftSeed(article), sectionName);
  state.reportDraft[sectionName].unshift(item);
  syncReportFromDraft();
  state.reportTextDraft = generateReportText();
  setBuilderFocus(draftEntryKey(sectionName, item));
  state.builderDraftRestored = false;
  persistStoredBuilderDraft();
  return { added: true, reason: 'added' };
}

function moveDraftItemToSection(key, targetSection) {
  const location = findDraftLocation(key);
  if (!location || location.sectionName === targetSection) {
    return { moved: false, reason: 'invalid_move' };
  }

  if (location.sectionName === 'industry' && targetSection === 'major') {
    return { moved: false, reason: 'industry_to_main_blocked' };
  }

  const existingIndex = state.reportDraft[targetSection].findIndex(
    (item) => articleKey(item) === articleKey(location.item)
  );

  const movedItem = {
    ...location.item,
    section: targetSection
  };

  state.reportDraft[location.sectionName].splice(location.index, 1);

  if (existingIndex >= 0) {
    state.reportDraft[targetSection][existingIndex] = movedItem;
  } else {
    state.reportDraft[targetSection].unshift(movedItem);
  }

  syncReportFromDraft();
  state.reportTextDraft = generateReportText();
  setBuilderFocus(draftEntryKey(targetSection, movedItem));
  state.builderDraftRestored = false;
  persistStoredBuilderDraft();
  return { moved: true, reason: 'moved' };
}

async function submitBuilderImportedArticle() {
  const normalizedUrl = String(state.builderImportUrl || '').trim();
  if (!normalizedUrl) {
    showToast('추가할 기사 링크를 입력해주세요.');
    return;
  }

  if (!canImportCustomBuilderArticles()) {
    showToast('이 배포에서는 직접 기사 추가를 사용할 수 없습니다.');
    return;
  }

  state.builderImportBusy = true;
  renderReportBuilder();

  try {
    const snapshot = captureWorkspaceSnapshot();
    const importedArticle = await importBuilderArticleByUrl(normalizedUrl);
    const existingLocation = findExistingArticleLocation(importedArticle);
    if (existingLocation) {
      showToast(
        existingLocation.scope === 'report'
          ? '이미 리포트 빌더에 있는 기사입니다.'
          : '기사 인박스에 이미 있는 기사입니다.',
        {
          actionLabel: existingLocation.scope === 'report' ? '기존 카드 보기' : '인박스에서 보기',
          onAction: () => focusExistingArticleLocation(existingLocation),
          duration: UNDO_TOAST_DURATION
        }
      );
      return;
    }

    const sectionName = state.builderImportSection === 'industry' ? 'industry' : 'major';
    const result = addArticleToReportSection(sectionName, {
      ...importedArticle,
      section: sectionName
    });

    if (!result.added) {
      if (result.reason === 'industry_to_main_blocked') {
        showToast('이미 업계 보도에 있는 기사는 주요 보도로 올릴 수 없습니다.');
      } else if (result.reason === 'already_main' || result.reason === 'already_industry') {
        showToast('이미 리포트 빌더에 추가된 기사입니다.');
      } else {
        showToast('기사 추가에 실패했습니다.');
      }
      return;
    }

    state.builderImportUrl = '';
    state.builderImportOpen = false;
    pushActivityLog({
      title: '링크 기사 추가',
      detail: `${sectionLabel(sectionName)}에 ${String(importedArticle?.title || '기사').trim()} 링크를 추가했습니다.`,
      tone: 'reported',
      page: 'builder'
    });
    registerUndoAction(`링크 기사를 ${sectionLabel(sectionName)}에 추가했습니다.`, snapshot);
  } catch (error) {
    showToast(normalizeArticleImportError(error));
  } finally {
    state.builderImportBusy = false;
    renderReportBuilder();
  }
}

function assignSelectedArticlesToSection(sectionName) {
  const selectedArticles = getSelectedArticles();
  if (!selectedArticles.length) {
    showToast('먼저 기사 인박스에서 기사를 선택해 주세요.');
    return;
  }

  const summary = summarizeAssignableArticles(sectionName, selectedArticles);
  if (summary.available.length === 0) {
    showToast(
      sectionName === 'major'
        ? '업계 보도에만 포함된 기사는 주요 보도로 추가할 수 없습니다.'
        : '선택한 기사들은 이미 업계 보도에 반영되어 있습니다.'
    );
    return;
  }

  const snapshot = captureWorkspaceSnapshot();
  summary.available.forEach((article) => {
    addArticleToReportSection(sectionName, article);
  });
  clearSelectedArticles();

  const blockedSuffix =
    sectionName === 'major' && summary.blocked.length
      ? ` ${summary.blocked.length}건은 업계→주요 정책상 제외되었습니다.`
      : '';
  showToast(
    `${summary.available.length}건을 ${sectionName === 'major' ? '주요 보도' : '업계 보도'}에 반영했습니다.${blockedSuffix}`
  );
  pushActivityLog({
    title: sectionName === 'major' ? '주요 보도 일괄 반영' : '업계 보도 일괄 반영',
    detail: `${formatNumber(summary.available.length)}건을 리포트에 반영했습니다.`,
    tone: 'reported',
    page: 'inbox'
  });
  registerUndoAction('방금 일괄 반영을 되돌릴 수 있습니다.', snapshot);
}

function assignSelectedArticlesToInboxReport() {
  const selectedArticles = getSelectedArticles();
  if (!selectedArticles.length) {
    showToast('먼저 기사 인박스에서 기사를 선택해 주세요.');
    return;
  }

  const summary = summarizeInboxAssignableArticles(selectedArticles);
  if (!summary.available.length) {
    showToast('선택한 기사는 이미 보도에 반영되어 있습니다.');
    return;
  }

  const snapshot = captureWorkspaceSnapshot();
  summary.available.forEach((article) => {
    addArticleToReportSection(inboxTargetSection(article), article);
  });
  clearSelectedArticles();

  const details = [];
  if (summary.majorCount) details.push(`주요 보도 ${formatNumber(summary.majorCount)}건`);
  if (summary.industryCount) details.push(`업계 보도 ${formatNumber(summary.industryCount)}건`);
  const suffix = details.length ? ` (${details.join(', ')})` : '';
  showToast(`${formatNumber(summary.available.length)}건을 보도에 추가했습니다.${suffix}`);
  pushActivityLog({
    title: '기사 인박스 반영',
    detail: `${formatNumber(summary.available.length)}건을 기본 경로로 추가했습니다.${suffix}`,
    tone: 'reported',
    page: 'inbox'
  });
  registerUndoAction('추천 경로 반영을 되돌릴 수 있습니다.', snapshot);
}

function updateDraftItem(key, updates) {
  const location = findDraftLocation(key);
  if (!location) return;

  const nextItem = {
    ...location.item,
    ...updates,
    section: location.sectionName
  };

  state.reportDraft[location.sectionName][location.index] = nextItem;
  clearPendingAiReview();
  syncReportFromDraft();
  state.reportTextDraft = generateReportText();
  setBuilderFocus(draftEntryKey(location.sectionName, nextItem));
  state.builderDraftRestored = false;
  persistStoredBuilderDraft();
}

function syncBuilderReportTextArea() {
  const reportText = document.getElementById('report-text');
  const nextText = state.reportTextDraft || generateReportText();
  if (reportText) {
    reportText.value = nextText;
    reportText.textContent = nextText;
    resizeReportTextArea(reportText);
  }
  const charCount = document.getElementById('builder-draft-char-count');
  if (charCount) {
    charCount.textContent = formatNumber(characterLength(nextText));
  }
}

function resizeReportTextArea(reportTextField) {
  if (!reportTextField) return;
  reportTextField.style.height = 'auto';
  const styles = window.getComputedStyle(reportTextField);
  const minHeight = Number.parseFloat(styles.minHeight) || 0;
  reportTextField.style.height = `${Math.ceil(Math.max(reportTextField.scrollHeight, minHeight)) + 4}px`;
}

function syncBuilderCardPreview(key) {
  const location = findDraftLocation(key);
  if (!location) return;

  const nextSummary = articleBuilderSummary(location.item) || '요약을 아직 입력하지 않았습니다.';
  const nextOneLine = articleBuilderOneLine(location.item) || '한줄 요약을 아직 입력하지 않았습니다.';
  document.querySelectorAll('[data-builder-focus]').forEach((node) => {
    if (node.dataset.builderFocus !== key) return;
    const summaryValue = node.querySelector('[data-builder-summary-value]');
    if (summaryValue) {
      summaryValue.textContent = nextSummary;
    }
    const oneLineValue = node.querySelector('[data-builder-oneline-value]');
    if (oneLineValue) {
      oneLineValue.textContent = nextOneLine;
    }
  });
}

function getBuilderImportFeedback(rawUrl, sectionName) {
  const normalized = String(rawUrl || '').trim();
  if (!normalized) {
    return {
      state: 'idle',
      title: '기사 링크를 붙여 넣어 주세요.',
      description: '입력하는 순간 중복 여부와 추가 위치를 바로 확인합니다.'
    };
  }

  try {
    const parsed = new URL(normalized);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('invalid_protocol');
    }
    const host = String(parsed.host || '').replace(/^www\./i, '');
    return {
      state: 'ready',
      title: `${host || '기사'} 링크를 확인했습니다.`,
      description: `${sectionLabel(sectionName === 'industry' ? 'industry' : 'major')}에 추가할 준비가 됐습니다.`
    };
  } catch {
    return {
      state: 'invalid',
      title: '올바른 기사 URL 형식이 아닙니다.',
      description: 'https://로 시작하는 기사 링크를 입력해 주세요.'
    };
  }
}

function syncBuilderImportInlineFeedback() {
  const feedback = getBuilderImportFeedback(state.builderImportUrl, state.builderImportSection);
  const existingLocation = state.builderImportUrl
    ? findExistingArticleLocation({ url: state.builderImportUrl, title: '', publisher: '' })
    : null;
  const statusCard = document.querySelector('.builder-import-status');
  if (statusCard) {
    statusCard.className = `builder-import-status is-${feedback.state}`;
    const title = statusCard.querySelector('strong');
    const description = statusCard.querySelector('p');
    if (title) title.textContent = feedback.title;
    if (description) description.textContent = feedback.description;
  }

  const submitButton = document.getElementById('builder-import-submit');
  if (submitButton) {
    submitButton.disabled = Boolean(
      state.builderImportBusy
      || existingLocation
      || feedback.state === 'invalid'
      || feedback.state === 'idle'
    );
  }
}

function buildDashboardFlowState({ total, reported }) {
  const steps = [
    {
      title: '인박스',
      detail: total
        ? `${formatNumber(total)}건 수집`
        : '수집 전',
      status: reported === 0 ? 'current' : 'done'
    },
    {
      title: '빌더',
      detail: reported
        ? `${formatNumber(reported)}건 반영`
        : '초안 전',
      status: reported > 0 ? 'current' : 'upcoming'
    },
    {
      title: '카카오',
      detail: reported
        ? '복사 준비'
        : '검수 전',
      status: reported > 0 ? 'upcoming' : 'upcoming'
    }
  ];

  if (!total) {
    return {
      eyebrow: '오늘 할 일',
      title: '수집 확인부터 시작',
      description: '인박스에서 오늘 기사만 고르세요.',
      primary: { label: '기사 선택', page: 'inbox' },
      secondary: { label: '설정 확인', page: 'settings' },
      steps
    };
  }

  if (!reported) {
    return {
      eyebrow: '오늘 할 일',
      title: `미반영 ${formatNumber(total)}건`,
      description: '필요한 기사만 체크하세요.',
      primary: { label: '기사 선택', page: 'inbox' },
      secondary: { label: '실행 기록', scrollTarget: 'dashboard-log-panel' },
      steps
    };
  }

  return {
    eyebrow: '오늘 할 일',
    title: `초안 검수 ${formatNumber(reported)}건`,
    description: '초안 확인 후 복사하세요.',
    primary: { label: '초안 보기', page: 'builder', builderFocus: 'draft' },
    secondary: { label: '카카오 검수', page: 'kakao' },
    steps
  };
}

function renderDashboardFlowCard(flow) {
  return `
    <article class="card dashboard-flow-card">
      <div class="dashboard-flow-grid">
        <div class="dashboard-flow-copy">
          <p class="panel-kicker">${escapeHtml(flow.eyebrow)}</p>
          <h3>${escapeHtml(flow.title)}</h3>
          <div class="inline-actions compact dashboard-flow-actions">
            <button
              class="primary-btn"
              id="dashboard-flow-primary"
              data-dashboard-page="${escapeHtml(flow.primary.page)}"
              ${flow.primary.builderFocus ? `data-dashboard-builder-focus="${escapeHtml(flow.primary.builderFocus)}"` : ''}
            >
              ${escapeHtml(flow.primary.label)}
            </button>
            <button
              class="ghost-btn"
              id="dashboard-flow-secondary"
              ${flow.secondary.page ? `data-dashboard-page="${escapeHtml(flow.secondary.page)}"` : ''}
              ${flow.secondary.scrollTarget ? `data-dashboard-scroll="${escapeHtml(flow.secondary.scrollTarget)}"` : ''}
            >
              ${escapeHtml(flow.secondary.label)}
            </button>
          </div>
        </div>
        <div class="dashboard-step-list" aria-label="operator-flow">
          ${flow.steps.map((step, index) => `
            <div class="dashboard-step is-${escapeHtml(step.status)}">
              <span class="dashboard-step-index">${index + 1}</span>
              <div class="dashboard-step-copy">
                <strong>${escapeHtml(step.title)}</strong>
                <p>${escapeHtml(step.detail)}</p>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </article>
  `;
}

function renderDashboardPriorityStrip({ total, pending, reported, failed, coverageRatio }) {
  const items = [
    {
      kicker: '지금 할 일',
      title: pending ? `미반영 ${formatNumber(pending)}건` : '초안 반영 완료',
      detail: pending
        ? '먼저 고를 기사입니다.'
        : '다음은 검수입니다.',
      actionLabel: pending ? '기사 선택' : '초안 보기',
      actionPage: pending ? 'inbox' : 'builder'
    },
    {
      kicker: '주의',
      title: failed ? `점검 ${formatNumber(failed)}건` : '이슈 없음',
      detail: failed
        ? '실패 원인을 확인하세요.'
        : '정상 흐름입니다.',
      actionLabel: failed ? '설정' : '실행 기록',
      actionPage: failed ? 'settings' : '',
      actionScroll: failed ? '' : 'dashboard-log-panel'
    },
    {
      kicker: '검수',
      title: reported ? `카카오 ${formatNumber(reported)}건` : `반영률 ${formatNumber(coverageRatio)}%`,
      detail: reported
        ? '복사 전 확인하세요.'
        : '초안을 먼저 만드세요.',
      actionLabel: reported ? '카카오 검수' : '초안 보기',
      actionPage: reported ? 'kakao' : 'builder'
    }
  ];

  return `
    <div class="dashboard-priority-strip">
      ${items.map((item, index) => `
        <article class="card dashboard-priority-card">
          <p class="panel-kicker">${escapeHtml(item.kicker)}</p>
          <strong>${escapeHtml(item.title)}</strong>
          <p>${escapeHtml(item.detail)}</p>
          <button
            class="ghost-btn"
            type="button"
            data-dashboard-priority-page="${escapeHtml(item.actionPage || '')}"
            ${item.actionScroll ? `data-dashboard-priority-scroll="${escapeHtml(item.actionScroll)}"` : ''}
            data-dashboard-priority-index="${index}"
          >
            ${escapeHtml(item.actionLabel)}
          </button>
        </article>
      `).join('')}
    </div>
  `;
}

function buildWorkflowProgressItems(currentPage = state.activePage) {
  const sections = getReportSections();
  const reported = sections.major.length + sections.industry.length;
  const total = state.articles.length;
  const pending = Math.max(total - reported, 0);
  const segmentCount = buildKakaoPreviewSegments().length;

  return [
    {
      page: 'inbox',
      title: '기사 인박스',
      caption: pending ? `미반영 ${formatNumber(pending)}건` : '후보 확인 완료',
      state: currentPage === 'inbox' ? 'active' : (reported || !pending ? 'complete' : 'pending')
    },
    {
      page: 'builder',
      title: '리포트 빌더',
      caption: reported ? `반영 ${formatNumber(reported)}건` : '초안 시작 전',
      state: currentPage === 'builder' ? 'active' : (reported ? 'complete' : 'pending')
    },
    {
      page: 'kakao',
      title: '카카오 프리뷰',
      caption: segmentCount ? `메시지 ${formatNumber(segmentCount)}개` : '검수 전',
      state: currentPage === 'kakao' ? 'active' : (segmentCount ? 'complete' : 'pending')
    }
  ];
}

function renderWorkflowProgress(currentPage = state.activePage) {
  const items = buildWorkflowProgressItems(currentPage);
  return `
    <article class="card workflow-progress-card">
      <div class="workflow-progress-head">
        <div>
          <p class="panel-kicker">진행</p>
          <h3>현재 진행 상태</h3>
        </div>
        <span class="panel-pill tone-neutral">${items.filter((item) => item.state === 'complete').length}단계 완료</span>
      </div>
      <div class="workflow-progress-list">
        ${items.map((item, index) => `
          <button
            class="workflow-progress-step is-${escapeHtml(item.state)}"
            type="button"
            data-progress-page="${escapeHtml(item.page)}"
            aria-current="${currentPage === item.page ? 'step' : 'false'}"
          >
            <span class="workflow-progress-index">${index + 1}</span>
            <span class="workflow-progress-copy">
              <strong>${escapeHtml(item.title)}</strong>
              <small>${escapeHtml(item.caption)}</small>
            </span>
          </button>
        `).join('')}
      </div>
    </article>
  `;
}

function bindWorkflowProgressActions(root = app) {
  root.querySelectorAll('[data-progress-page]').forEach((button) => {
    button.addEventListener('click', () => {
      const page = button.dataset.progressPage || '';
      if (page && page !== state.activePage) {
        render(page);
      }
    });
  });
}

function renderInboxPreviewContent(article, { prefix = 'preview', compact = false } = {}) {
  const selected = isArticleSelected(article);
  const membership = reportMembership(article);
  const assigned = membership.isMainReport || membership.isIndustryReport;
  const targetSection = inboxTargetSection(article);
  const canAdd = canAddInboxReport(article);
  const addLabel = canAdd ? `${sectionLabel(targetSection)} 추가` : '리포트에 이미 반영됨';
  const summary = String(article.summary || article.title || '').trim();
  const renderedSummary = compact ? truncateText(summary, 120) : summary;
  const compactMeta = `${mediaLabel(article)} · ${article.keyword || '-'} · ${formatArticlePublishedTime(article)} · ${assigned ? '반영됨' : sectionLabel(targetSection)}`;

  return `
      <div class="panel-heading">
        <div>
          <p class="panel-kicker">${compact ? 'Quick' : 'Selected Article'}</p>
          <h3>${compact ? '빠른 확인' : '현재 기사'}</h3>
        </div>
        <span class="panel-pill tone-neutral">${selected ? '체크됨' : '단건 액션'}</span>
      </div>
      <div class="preview-title-block">
        <div class="builder-chip-row preview-pill-row">
          ${renderReportPills(article)}
          <span class="panel-pill tone-neutral">${escapeHtml(formatArticlePublishedTime(article))}</span>
        </div>
        <strong class="preview-inline-title">${escapeHtml(article.title || '')}</strong>
        <p class="preview-summary">${escapeHtml(renderedSummary)}</p>
      </div>
      ${compact
        ? `<p class="preview-compact-meta">${escapeHtml(compactMeta)}</p>`
        : `<dl class="meta-list preview-meta-list">
            <div>
              <dt>매체</dt>
              <dd>${escapeHtml(mediaLabel(article))}</dd>
            </div>
            <div>
              <dt>키워드</dt>
              <dd>${escapeHtml(article.keyword || '-')}</dd>
            </div>
            <div>
              <dt>상태</dt>
              <dd>${assigned ? '리포트 반영' : '대기'}</dd>
            </div>
            <div>
              <dt>추천 섹션</dt>
              <dd>${escapeHtml(sectionLabel(targetSection))}</dd>
            </div>
          </dl>`}
      <div class="inline-actions compact stack-mobile preview-actions">
        <button class="ghost-btn" type="button" id="${escapeHtml(prefix)}-open-article" ${article.url ? '' : 'disabled'}>기사 열기</button>
        ${canAdd
          ? `<button class="primary-btn" type="button" id="${escapeHtml(prefix)}-add-report">${escapeHtml(addLabel)}</button>`
          : `<button class="primary-btn" type="button" id="${escapeHtml(prefix)}-open-builder">리포트 빌더 보기</button>`}
      </div>
  `;
}

function renderInboxPreviewPanel(article) {
  if (!article) {
    return `
      <article class="card preview-panel">
        <div class="panel-heading">
          <div>
            <p class="panel-kicker">Selected Article</p>
            <h3>현재 기사</h3>
          </div>
        </div>
        ${renderDataEmpty('inbox-preview-empty', '기사를 선택하세요', '요약과 버튼이 여기에 표시됩니다.')}
      </article>
    `;
  }

  return `
    <article class="card preview-panel inbox-preview-card" id="article-preview">
      ${renderInboxPreviewContent(article)}
    </article>
  `;
}

function renderMobilePreviewDock(article, { selectedCount = 0 } = {}) {
  if (!article || selectedCount > 0) return '';

  const open = Boolean(state.inboxPreviewOpen);

  return `
    <div class="mobile-preview-region ${open ? 'is-open' : ''}">
      <button class="mobile-preview-bar" id="mobile-preview-toggle" type="button" aria-expanded="${open}" aria-controls="mobile-preview-sheet">
        <div class="mobile-preview-bar-copy">
          <span class="mobile-preview-bar-kicker">현재 기사</span>
          <strong>${escapeHtml(article.title || '')}</strong>
          <span>${escapeHtml(mediaLabel(article))} · ${escapeHtml(article.keyword || '-')} · ${escapeHtml(formatArticlePublishedTime(article))}</span>
        </div>
        <span class="panel-pill tone-neutral">열기</span>
      </button>
      <button class="mobile-preview-backdrop ${open ? 'is-open' : ''}" id="mobile-preview-close" type="button" aria-label="현재 기사 미리보기 닫기"></button>
      <div class="mobile-preview-sheet ${open ? 'is-open' : ''}" id="mobile-preview-sheet" role="dialog" aria-modal="false" aria-label="현재 기사 미리보기">
        <div class="mobile-preview-sheet-head">
          <div>
            <p class="panel-kicker">Quick</p>
            <strong>빠른 확인</strong>
          </div>
          <button class="ghost-btn" id="mobile-preview-dismiss" type="button">닫기</button>
        </div>
        <article class="card preview-panel mobile-preview-panel">
          ${renderInboxPreviewContent(article, { prefix: 'mobile-preview', compact: true })}
        </article>
      </div>
    </div>
  `;
}

function renderInboxPaginationControls({ maxPage, mode = 'bottom' }) {
  const isTop = mode === 'top';
  const prevId = isTop ? 'prev-page-top' : 'prev-page';
  const nextId = isTop ? 'next-page-top' : 'next-page';
  const pageSizeMarkup = isTop
    ? ''
    : `
      <label class="page-size-control" for="page-size">
        <span>페이지 크기</span>
        <select id="page-size">
          ${[10, 20, 50, 100, 200].map((size) => `
            <option value="${size}" ${state.pageSize === size ? 'selected' : ''}>${size}</option>
          `).join('')}
        </select>
      </label>
    `;

  return `
    <div class="pagination-row ${isTop ? 'pagination-row-top' : 'pagination-row-bottom'}">
      <div class="pagination-meta">
        <span>${state.selectedPage} / ${maxPage} 페이지</span>
        ${pageSizeMarkup}
      </div>
      <div class="inline-actions compact">
        <button class="ghost-btn" id="${prevId}" ${state.selectedPage <= 1 ? 'disabled' : ''}>이전</button>
        <button class="ghost-btn" id="${nextId}" ${state.selectedPage >= maxPage ? 'disabled' : ''}>다음</button>
      </div>
    </div>
  `;
}

function renderBuilderInlineEditor(sectionName, article, entryKey) {
  return `
    <div class="builder-inline-editor" data-builder-inline-editor="${escapeHtml(entryKey)}">
      <div class="detail-guide">
        <strong>바로 편집</strong>
      </div>
      <div class="builder-inline-fields">
        <label class="detail-field">
          <span>기사 요약 및 결론 (30자 내외)</span>
          <input
            type="text"
            data-builder-summary-input="${escapeHtml(entryKey)}"
            value="${escapeHtml(articleSummaryLead(article))}"
          />
        </label>
        <label class="detail-field">
          <span>주요 내용 한줄 요약 (40자 내외)</span>
          <input
            type="text"
            data-builder-keypoint-input="${escapeHtml(entryKey)}"
            value="${escapeHtml(articleKeyPoint(article))}"
          />
        </label>
      </div>
      ${renderBuilderAiActionButton(entryKey, { mode: 'detail', extraClass: 'detail-ai-actions' })}
      <div class="inline-actions compact builder-inline-actions">
        <button class="ghost-btn" type="button" data-builder-open="${escapeHtml(article.url || '')}">기사 열기</button>
        ${sectionName === 'major'
          ? `<button class="ghost-btn" type="button" data-builder-move-industry="${escapeHtml(entryKey)}">업계 보도로 이동</button>`
          : ''}
        <button class="ghost-btn" type="button" data-builder-remove="${escapeHtml(entryKey)}">제거</button>
      </div>
    </div>
  `;
}

function renderBuilderDraftPanel({ reportText, reportItemCount, totalDraftChars, sections, canImportArticles }) {
  const savedLabel = state.builderDraftSavedAt ? `자동 저장 ${formatSavedTime(state.builderDraftSavedAt)}` : '브라우저 자동 저장';
  const savedDescription = state.builderDraftRestored ? '복구됨' : '';
  const segmentCount = reportItemCount ? buildKakaoPreviewSegments().length : 0;
  const draftEdited = reportItemCount ? hasReportDraftChanged(buildKakaoPreviewText(), reportText) : false;
  const readinessItems = reportItemCount
    ? [
        {
          state: sections.major.length ? 'complete' : 'pending',
          title: '주요 보도 확보',
          detail: sections.major.length
            ? `주요 보도 ${formatNumber(sections.major.length)}건이 포함되어 있습니다.`
            : '최소 1건은 넣어야 메시지 중심이 또렷해집니다.'
        },
        {
          state: sections.industry.length ? 'complete' : 'pending',
          title: '업계 보도 균형',
          detail: sections.industry.length
            ? `업계 보도 ${formatNumber(sections.industry.length)}건이 포함되어 있습니다.`
            : '업계 보도 1건 이상이 있으면 리포트 균형이 좋아집니다.'
        },
        {
          state: reportItemCount >= 2 ? 'complete' : 'pending',
          title: '전송 분량',
          detail: reportItemCount >= 2
            ? `기사 ${formatNumber(reportItemCount)}건, 초안 ${formatNumber(totalDraftChars)}자입니다.`
            : '기사 2건 이상이면 카카오 메시지 뼈대가 더 안정적입니다.'
        },
        {
          state: segmentCount > 0 ? (segmentCount <= 3 ? 'complete' : 'watch') : 'pending',
          title: '카카오 파트 수',
          detail: segmentCount
            ? `현재 ${formatNumber(segmentCount)}개 파트로 나뉩니다.`
            : '초안을 만들면 예상 파트 수를 바로 계산합니다.'
        },
        {
          state: draftEdited ? 'complete' : 'watch',
          title: '최종 문구 다듬기',
          detail: draftEdited
            ? '자동 생성 문구에서 한 번 더 다듬은 상태입니다.'
            : '카드 문구나 보고서 초안을 한 번 더 다듬으면 전달력이 좋아집니다.'
        }
      ]
    : [];
  const suggestionAvailable = Boolean(findDraftLocation(state.builderFocusKey));
  const activeDraftTab = state.builderDraftTab === 'suggestion' && suggestionAvailable ? 'suggestion' : 'draft';
  if (state.builderDraftTab !== activeDraftTab) {
    state.builderDraftTab = activeDraftTab;
  }
  const readyCount = readinessItems.filter((item) => item.state === 'complete').length;
  const renderDraftTabButton = (tab, label, disabled = false) => `
    <button
      class="${activeDraftTab === tab ? 'active' : ''}"
      type="button"
      data-builder-draft-tab="${escapeHtml(tab)}"
      aria-pressed="${activeDraftTab === tab}"
      ${disabled ? 'disabled' : ''}
    >${escapeHtml(label)}</button>
  `;

  if (!reportItemCount) {
    return `
      <article class="card draft-panel builder-draft-panel" id="builder-draft-panel">
        ${renderAnnotation('SCR-BUILD-DRAFT-001')}
        <div class="panel-heading">
          <div>
            <p class="panel-kicker">리포트 초안</p>
            <h3>보고서 초안</h3>
          </div>
          <span class="panel-pill tone-neutral">0건 반영</span>
        </div>
        <div class="builder-draft-status ${state.builderDraftRestored ? 'is-restored' : ''}">
          <strong>${escapeHtml(savedLabel)}</strong>
          ${savedDescription ? `<p>${escapeHtml(savedDescription)}</p>` : ''}
        </div>
        <div class="builder-empty-metrics">
          <span class="panel-pill tone-neutral">오늘 수집 ${formatNumber(state.articles.length)}건</span>
          <span class="panel-pill tone-neutral">주요 ${formatNumber(state.articles.filter((article) => article.section === 'major').length)}건</span>
          <span class="panel-pill tone-neutral">업계 ${formatNumber(state.articles.filter((article) => article.section === 'industry').length)}건</span>
        </div>
        ${renderDataEmpty('builder-draft-empty', '초안이 비어 있습니다', canImportArticles ? '기사 선택 또는 링크 추가로 시작하세요.' : '기사 선택으로 시작하세요.')}
        <div class="inline-actions compact stack-mobile builder-empty-actions">
          <button class="primary-btn" type="button" data-builder-empty-nav="inbox">기사 선택하기</button>
          ${canImportArticles ? '<button class="ghost-btn" type="button" id="builder-empty-import">직접 링크 추가</button>' : ''}
        </div>
      </article>
    `;
  }

  return `
    <article class="card draft-panel builder-draft-panel" id="builder-draft-panel">
      ${renderAnnotation('SCR-BUILD-DRAFT-001')}
      <div class="panel-heading">
        <div>
          <p class="panel-kicker">리포트 초안</p>
          <h3>보고서 초안</h3>
        </div>
        <span class="panel-pill tone-neutral">${formatNumber(reportItemCount)}건 반영</span>
      </div>
      <div class="builder-draft-status ${state.builderDraftRestored ? 'is-restored' : ''}">
        <strong>${escapeHtml(savedLabel)}</strong>
        ${savedDescription ? `<p>${escapeHtml(savedDescription)}</p>` : ''}
      </div>
      ${renderAiWorkStatus('builder-ai')}
      <div class="builder-draft-tabs" role="tablist" aria-label="보고서 초안 패널">
        ${renderDraftTabButton('draft', '보고서 초안')}
        ${renderDraftTabButton('suggestion', '추천 관점', !suggestionAvailable)}
      </div>
      ${activeDraftTab === 'draft'
        ? `
          <textarea id="report-text">${escapeHtml(reportText)}</textarea>
          <div class="draft-summary">
            <div>
              <span>전체 글자 수</span>
              <strong id="builder-draft-char-count">${formatNumber(totalDraftChars)}</strong>
            </div>
            <div>
              <span>주요 보도</span>
              <strong>${formatNumber(sections.major.length)}</strong>
            </div>
            <div>
              <span>업계 보도</span>
              <strong>${formatNumber(sections.industry.length)}</strong>
            </div>
            <div>
              <span>리포트 기사</span>
              <strong>${formatNumber(reportItemCount)}</strong>
            </div>
          </div>
          <div class="builder-readiness-card builder-readiness-card-compact">
            <div class="builder-readiness-head">
              <div>
                <p class="panel-kicker">Publish Check</p>
                <h3>전송 전 체크</h3>
              </div>
              <span class="panel-pill tone-neutral">${formatNumber(readyCount)}개 준비</span>
            </div>
            <div class="builder-readiness-chip-row">
              ${readinessItems.map((item) => `
                <div class="builder-readiness-chip is-${escapeHtml(item.state)}">
                  <span class="builder-readiness-state">${item.state === 'complete' ? 'OK' : item.state === 'watch' ? 'CHECK' : 'TODO'}</span>
                  <strong>${escapeHtml(item.title)}</strong>
                </div>
              `).join('')}
            </div>
          </div>
          ${renderBuilderAiActionButton('report-draft', {
            mode: 'draft',
            id: 'builder-draft-ai',
            extraClass: 'draft-ai-actions'
          })}
          <div class="inline-actions stack-mobile draft-primary-actions">
            <button class="primary-btn" id="draft-to-kakao">카카오 프리뷰 보기</button>
          </div>
        `
        : renderBuilderSuggestionContent()}
    </article>
  `;
}

function renderMobileSelectionBar({ selectedCount, inboxAssignment, canOpenSelected }) {
  if (!selectedCount) return '';

  return `
    <div class="mobile-selection-bar" role="region" aria-label="선택 기사 일괄 처리">
      <div class="mobile-selection-head">
        <strong>선택 기사 ${formatNumber(selectedCount)}건</strong>
      </div>
      <div class="mobile-selection-actions">
        <button class="primary-btn" id="mobile-add-selected" ${inboxAssignment.available.length ? '' : 'disabled'}>추천 경로 추가</button>
        <button class="ghost-btn" id="mobile-open-selected" ${canOpenSelected ? '' : 'disabled'}>기사 열기</button>
        <button class="ghost-btn" id="mobile-clear-selection" ${selectedCount ? '' : 'disabled'}>선택 해제</button>
      </div>
    </div>
  `;
}

function openArticleUrls(urls) {
  const uniqueUrls = [...new Set(
    (Array.isArray(urls) ? urls : [urls])
      .map((url) => String(url || '').trim())
      .filter(Boolean)
  )];

  let openedCount = 0;
  uniqueUrls.forEach((url) => {
    const popup = window.open(url, '_blank', 'noopener,noreferrer');
    if (popup) openedCount += 1;
  });

  return {
    total: uniqueUrls.length,
    openedCount
  };
}

function openArticleUrl(url) {
  if (!url) return;
  openArticleUrls([url]);
}

function openSelectedArticles() {
  const selectedUrls = getSelectedArticles()
    .map((article) => article?.url)
    .filter(Boolean);

  if (!selectedUrls.length) {
    showToast('체크한 기사를 먼저 선택해 주세요.');
    return;
  }

  const { total, openedCount } = openArticleUrls(selectedUrls);
  if (!total) {
    showToast('열 수 있는 기사 링크가 없습니다.');
    return;
  }

  if (total === 1) {
    return;
  }

  if (openedCount === total) {
    showToast(`기사 ${openedCount}건을 새 탭으로 열었습니다.`);
    return;
  }

  showToast(`기사 ${openedCount}/${total}건을 열었습니다. 팝업 차단이 켜져 있으면 일부 탭이 막힐 수 있습니다.`);
}

function normalizeAiComparableText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/["'`“”‘’.,;:!?()[\]{}<>/\-|_~+=*&^%$#@·]/g, '')
    .trim();
}

function commonPrefixLength(left, right) {
  const sourceLeft = String(left || '');
  const sourceRight = String(right || '');
  const maxLength = Math.min(sourceLeft.length, sourceRight.length);
  let index = 0;
  while (index < maxLength && sourceLeft[index] === sourceRight[index]) {
    index += 1;
  }
  return index;
}

function hasMeaningfulDistinctSuffix(left, right, prefixLength, minSuffixLength = 2) {
  const leftRemainder = String(left || '').slice(prefixLength);
  const rightRemainder = String(right || '').slice(prefixLength);
  if (!leftRemainder && !rightRemainder) return false;

  if (leftRemainder && rightRemainder) {
    return leftRemainder !== rightRemainder
      && leftRemainder.length >= minSuffixLength
      && rightRemainder.length >= minSuffixLength;
  }

  const remainder = leftRemainder || rightRemainder;
  return remainder.length >= Math.max(3, minSuffixLength + 1);
}

function areAiLinesTooSimilar(summaryLead, keyPoint) {
  const left = normalizeAiComparableText(summaryLead);
  const right = normalizeAiComparableText(keyPoint);
  if (!left || !right) return false;
  if (left === right) return true;

  const minLength = Math.min(left.length, right.length);
  if (minLength >= 8 && (left.includes(right) || right.includes(left))) {
    const shorter = left.length <= right.length ? left : right;
    const longer = shorter === left ? right : left;
    if (longer.startsWith(shorter) && hasMeaningfulDistinctSuffix(shorter, longer, shorter.length, 2)) {
      return false;
    }
    return true;
  }

  const prefixLength = commonPrefixLength(left, right);
  const similarityThreshold = Math.min(12, Math.max(6, Math.floor(minLength * 0.72)));
  if (prefixLength < similarityThreshold) {
    return false;
  }
  if (hasMeaningfulDistinctSuffix(left, right, prefixLength, 2)) {
    return false;
  }
  return true;
}

function buildAiComparableBigrams(value) {
  const normalized = normalizeAiComparableText(value);
  if (!normalized) return [];
  if (normalized.length === 1) return [normalized];
  const bigrams = [];
  for (let index = 0; index < normalized.length - 1; index += 1) {
    bigrams.push(normalized.slice(index, index + 2));
  }
  return bigrams;
}

function aiTextSimilarityRatio(left, right) {
  const normalizedLeft = normalizeAiComparableText(left);
  const normalizedRight = normalizeAiComparableText(right);
  if (!normalizedLeft || !normalizedRight) return 0;
  if (normalizedLeft === normalizedRight) return 1;

  const leftBigrams = buildAiComparableBigrams(normalizedLeft);
  const rightBigrams = buildAiComparableBigrams(normalizedRight);
  if (!leftBigrams.length || !rightBigrams.length) return 0;

  const rightCounts = new Map();
  rightBigrams.forEach((bigram) => {
    rightCounts.set(bigram, (rightCounts.get(bigram) || 0) + 1);
  });

  let intersection = 0;
  leftBigrams.forEach((bigram) => {
    const count = rightCounts.get(bigram) || 0;
    if (count > 0) {
      intersection += 1;
      rightCounts.set(bigram, count - 1);
    }
  });

  return (2 * intersection) / (leftBigrams.length + rightBigrams.length);
}

function isAiLineTooCloseToSourceText(line, source, threshold = 0.8) {
  const normalizedLine = normalizeAiComparableText(line);
  const normalizedSource = normalizeAiComparableText(source);
  if (!normalizedLine || !normalizedSource) return false;
  if (normalizedLine === normalizedSource) return true;

  const minLength = Math.min(normalizedLine.length, normalizedSource.length);
  const maxLength = Math.max(normalizedLine.length, normalizedSource.length);
  if (minLength >= 10 && (normalizedLine.includes(normalizedSource) || normalizedSource.includes(normalizedLine))) {
    const containmentRatio = minLength / maxLength;
    if (containmentRatio >= Math.min(threshold, 0.72) || minLength >= 14) return true;
  }

  const similarity = aiTextSimilarityRatio(normalizedLine, normalizedSource);
  if (similarity >= threshold) return true;

  if (minLength >= 10 && (normalizedLine.includes(normalizedSource) || normalizedSource.includes(normalizedLine))) {
    return minLength / maxLength >= threshold;
  }

  return false;
}

function articleAiSourceTexts(article) {
  return [
    article?.title,
    article?.summary
  ].filter((value) => String(value || '').trim());
}

function isAiLineTooCloseToArticleSource(line, article, threshold = 0.8) {
  return articleAiSourceTexts(article).some((source) => isAiLineTooCloseToSourceText(line, source, threshold));
}

function articleSourceText(article) {
  return articleAiSourceTexts(article).join(' ').trim();
}

function articleHasDirectKakaoMention(article) {
  return /(카카오|kakao|카카오톡|카카오페이|카카오뱅크|카카오모빌리티|카카오엔터|카카오게임즈|멜론)/i
    .test(articleSourceText(article));
}

function lineHasKakaoReference(line) {
  return /(카카오|kakao|카카오톡|카카오페이|카카오뱅크|카카오모빌리티|카카오엔터|카카오게임즈|멜론)/i
    .test(String(line || ''));
}

function isUnsupportedKakaoDraftLine(line, article) {
  return lineHasKakaoReference(line) && !articleHasDirectKakaoMention(article);
}

function stripReportEllipsis(value) {
  return String(value || '')
    .replace(/(?:\s*\.\s*){2,}/g, ' ')
    .replace(/[…⋯]+/gu, ' ')
    .replace(/(?:\s*ㆍ\s*){2,}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateReportLine(value, maxLength = 80) {
  const source = stripReportEllipsis(value).replace(/[,\s]+$/u, '').trim();
  if (!source || source.length <= maxLength) return source;
  return stripReportEllipsis(source.slice(0, Math.max(maxLength, 1)).replace(/[,\s]+$/u, ''));
}

function cleanPrDraftLine(value, maxLength = 80) {
  const cleaned = stripReportEllipsis(String(value || '')
    .replace(/보고서\s*초안에\s*나오는\s*내용을\s*포함하여/gu, '')
    .replace(/초안에\s*나오는\s*내용을\s*포함하여/gu, '')
    .replace(/내용을\s*포함하여/gu, '')
    .replace(/관련\s*내용\s*포함/gu, '')
    .replace(/전망\s*포함/gu, '')
    .replace(/\s+/g, ' ')
    .replace(/[,\s]+$/u, '')
    .trim());
  return truncateReportLine(cleaned, maxLength);
}

function cleanGroundedArticleLine(value, maxLength = 80) {
  const cleaned = stripReportEllipsis(String(value || '')
    .replace(/["'“”‘’]/gu, '')
    .replace(/\s*[.。]\s*/gu, ' ')
    .replace(/\s*[:：]\s*/gu, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[,\s]+$/u, '')
    .trim());
  return truncateReportLine(cleaned, maxLength);
}

function firstGroundedSummarySentence(article, maxLength = 80) {
  const summary = String(article?.summary || '').replace(/\s+/g, ' ').trim();
  if (!summary) return '';
  const [firstSentence = summary] = summary.split(/(?<=[.!?。！？])\s+|[;；]/u);
  return cleanGroundedArticleLine(firstSentence || summary, maxLength);
}

function buildGroundedSummaryLeadForArticle(article) {
  const title = String(article?.title || '').trim();
  const summary = firstGroundedSummarySentence(article, 78);
  const headlineSource = title
    .split(/(?:\.{2,}|…|⋯|ㆍ{2,}| - |\|)/u)
    .map((part) => part.trim())
    .find(Boolean) || title;
  const headline = cleanGroundedArticleLine(headlineSource, 78);
  return headline || summary || cleanGroundedArticleLine(article?.publisher || '기사 주요 내용 확인', 78);
}

function buildGroundedKeyPointForArticle(article, summaryLead = '') {
  const candidates = [
    firstGroundedSummarySentence(article, 64),
    cleanGroundedArticleLine(article?.summary || '', 64),
    cleanGroundedArticleLine(article?.title || '', 64)
  ].filter(Boolean);

  const distinct = candidates.find((candidate) => !areAiLinesTooSimilar(summaryLead, candidate));
  return distinct || candidates[0] || '';
}

function buildGroundedDraftForArticle(article) {
  const summaryLead = buildGroundedSummaryLeadForArticle(article);
  const keyPoint = buildGroundedKeyPointForArticle(article, summaryLead);
  return {
    summaryLead,
    keyPoint,
    title: summaryLead,
    intro: keyPoint || summaryLead
  };
}

function prAngleContext(article) {
  const title = String(article?.title || '').trim();
  const summary = String(article?.summary || '').trim();
  const keyword = String(article?.keyword || '').trim();
  const text = `${title} ${summary}`;
  const metadataText = `${text} ${keyword}`;
  const themeKeys = collectArticleAiThemes(text).map((theme) => theme.key);
  const directKakao = articleHasDirectKakaoMention(article);
  return {
    text,
    metadataText,
    themeKeys,
    directKakao,
    hasResearchAchievement: /(논문|학회|채택|ACL|CVPR|NeurIPS|ICLR|ICML|연구성과|기술성과)/i.test(text),
    hasDataCenterPowerDemand: /(AI|인공지능).{0,16}데이터센터|데이터센터/i.test(text)
      && /(공급|수주|전력|전력기기|변압기|배전|전기|일렉트릭|목표가|증권)/i.test(text),
    hasAiEducation: /(AI|인공지능|생성형|LLM).{0,24}(교육|대학|인재|양성|교육부|대교협)|(교육|대학|인재|양성|교육부|대교협).{0,24}(AI|인공지능|생성형|LLM)/i.test(text),
    hasPartnership: /(MOU|업무협약|협약|제휴|파트너십|맞손|공동개발|협력|계약 체결)/i.test(text)
  };
}

function firstSafePrLine(candidates, article, maxLength = 80) {
  const fallbackCandidates = candidates.filter(Boolean);
  const fallback = cleanPrDraftLine(fallbackCandidates[fallbackCandidates.length - 1] || '', maxLength);
  for (const candidate of candidates) {
    const line = cleanPrDraftLine(candidate, maxLength);
    if (line && !isAiLineTooCloseToArticleSource(line, article, 0.8)) {
      return line;
    }
  }
  return fallback;
}

function buildPrAngleLeadForArticle(article) {
  const context = prAngleContext(article);
  const groundedDraft = buildGroundedDraftForArticle(article);
  if (groundedDraft.summaryLead && !isAiLineTooCloseToArticleSource(groundedDraft.summaryLead, article, 0.72)) {
    return groundedDraft.summaryLead;
  }

  const candidates = [];
  if (context.hasResearchAchievement) {
    candidates.push(context.directKakao ? '카카오 AI 연구성과 대외 인정' : 'AI 기술 연구성과 대외 인정');
  }
  if (context.hasDataCenterPowerDemand) {
    candidates.unshift('AI 인프라 전력수요 성장성 부각');
  }
  if (context.hasAiEducation && context.hasPartnership) {
    candidates.push('AI 인재 교육 민관학 협력체계 구축');
  }
  if (context.themeKeys.includes('aiInfra') && context.themeKeys.includes('partnership')) {
    candidates.push(context.directKakao ? '카카오 AI 협력 생태계 확대' : 'AI 협력 생태계 확대');
  }
  if (context.themeKeys.includes('partnership')) {
    candidates.push(context.directKakao ? '카카오 사업 협력망 확장' : '플랫폼 협력망 확장');
  }
  if (context.themeKeys.includes('investment')) {
    candidates.push(context.directKakao ? '카카오 미래 성장 투자 행보 부각' : '미래 성장 투자 행보 부각');
  }
  if (context.themeKeys.includes('performance')) {
    candidates.push(context.directKakao ? '카카오 핵심 사업 성장성 부각' : '플랫폼 사업 성장성 부각');
  }
  if (context.themeKeys.includes('service')) {
    candidates.push(context.directKakao ? '카카오 신규 서비스 접점 확대' : '신규 서비스 시장 접점 확대');
  }
  if (context.themeKeys.includes('aiInfra')) {
    candidates.push(context.directKakao ? '카카오 AI 인프라 경쟁력 강화' : 'AI 인프라 경쟁력 강화');
  }
  if (context.themeKeys.includes('platformStrategy')) {
    candidates.push(context.directKakao ? '카카오 플랫폼 전략 고도화' : '플랫폼 전략 변화 신호 포착');
  }
  if (context.themeKeys.includes('executive')) {
    candidates.push(context.directKakao ? '카카오 경영 메시지 주목도 확대' : '플랫폼 리더십 메시지 부각');
  }

  candidates.push(context.directKakao ? '카카오그룹 사업 확장성 부각' : '플랫폼 산업 변화 신호 포착');
  return firstSafePrLine(candidates, article, 78);
}

function buildPrAngleKeyPointForArticle(article, summaryLead) {
  const context = prAngleContext(article);
  const groundedKeyPoint = buildGroundedKeyPointForArticle(article, summaryLead);
  if (groundedKeyPoint && !isAiLineTooCloseToArticleSource(groundedKeyPoint, article, 0.72)) {
    return groundedKeyPoint;
  }

  const candidates = [];
  const practicalPrefix = /실전형/i.test(context.text) ? '실전형 ' : '';

  if (context.hasResearchAchievement) {
    candidates.push(/ACL\s*2026/i.test(context.text) ? 'ACL 2026 논문 채택 성과 부각' : '주요 학회 논문 채택 성과 부각');
  }
  if (context.hasDataCenterPowerDemand) {
    candidates.push('데이터센터 공급 확대·목표가 상향 반영');
  }
  if (context.hasAiEducation && context.hasPartnership) {
    candidates.push(`${practicalPrefix}AI 인재 양성 프로그램 공동 개발·확산`);
  }
  if (context.themeKeys.includes('partnership')) {
    candidates.push('협력 파트너와 공동 사업 추진 기반 마련');
  }
  if (context.themeKeys.includes('investment')) {
    candidates.push('투자·인수 행보를 통한 성장 옵션 확대');
  }
  if (context.themeKeys.includes('performance')) {
    candidates.push('실적 지표와 성장 동력 중심으로 시장 메시지 강화');
  }
  if (context.themeKeys.includes('service')) {
    candidates.push('신규 기능·서비스 접점 확대로 이용자 경험 강화');
  }
  if (context.themeKeys.includes('aiInfra')) {
    candidates.push('AI·데이터 인프라 기반 기술 경쟁력 부각');
  }
  if (context.themeKeys.includes('platformStrategy')) {
    candidates.push('이용자 기반과 플랫폼 전략 고도화 흐름 확인');
  }
  if (context.themeKeys.includes('executive')) {
    candidates.push('대표·임원 발언 기반 공식 메시지 정리');
  }

  candidates.push(`${mediaLabel(article)} 보도 기준 사업 메시지화 가능`);

  for (const candidate of candidates) {
    const line = cleanPrDraftLine(candidate, 64);
    if (
      line
      && !areAiLinesTooSimilar(summaryLead, line)
      && !isAiLineTooCloseToArticleSource(line, article, 0.8)
    ) {
      return line;
    }
  }

  return cleanPrDraftLine(candidates[candidates.length - 1], 64);
}

function buildFallbackAiKeyPoint(article, summaryLead) {
  const rawCandidates = [
    article?.currentKeyPoint,
    article?.keyPoint,
    article?.oneLine,
    article?.summary,
    article?.title
  ];

  for (const source of rawCandidates) {
    const parts = String(source || '')
      .split(/(?<=[.!?])\s+|[;·]/u)
      .map((part) => trimKakaoLine(part, 40))
      .filter(Boolean);

    const candidate = parts.find((part) => (
      !areAiLinesTooSimilar(summaryLead, part)
      && !isUnsupportedKakaoDraftLine(part, article)
      && !isAiLineTooCloseToArticleSource(part, article, 0.8)
    ));
    if (candidate) {
      return cleanPrDraftLine(candidate, 40);
    }
  }

  return '';
}

function buildAiSummaryUpdates(article, result) {
  const groundedDraft = buildGroundedDraftForArticle(article);
  let nextSummaryLead = cleanPrDraftLine(result?.summaryLead || articleSummaryLead(article), 78);
  let sanitizedSummaryLead = false;
  if (
    isUnsupportedKakaoDraftLine(nextSummaryLead, article)
    || isAiLineTooCloseToArticleSource(nextSummaryLead, article, 0.8)
  ) {
    nextSummaryLead = buildPrAngleLeadForArticle(article) || groundedDraft.summaryLead;
    sanitizedSummaryLead = true;
  }

  let nextKeyPoint = cleanPrDraftLine(result?.keyPoint || articleKeyPoint(article), 64);
  if (
    sanitizedSummaryLead
    || isUnsupportedKakaoDraftLine(nextKeyPoint, article)
    || isUnsupportedKakaoDraftLine(nextSummaryLead, article)
    || areAiLinesTooSimilar(nextSummaryLead, nextKeyPoint)
    || isAiLineTooCloseToArticleSource(nextKeyPoint, article, 0.8)
  ) {
    const groundedKeyPoint = !isAiLineTooCloseToArticleSource(groundedDraft.keyPoint, article, 0.72)
      ? groundedDraft.keyPoint
      : '';
    nextKeyPoint = buildPrAngleKeyPointForArticle(article, nextSummaryLead)
      || groundedKeyPoint
      || buildFallbackAiKeyPoint(article, nextSummaryLead)
      || nextKeyPoint;
  }
  return {
    summaryLead: nextSummaryLead,
    keyPoint: nextKeyPoint,
    conclusion: nextSummaryLead,
    oneLine: nextKeyPoint
  };
}

function buildAiReviewProposal(key, article, updates) {
  const sectionName = String(key || '').split('::')[0] === 'major' ? 'major' : 'industry';
  const previousSummaryLead = articleSummaryLead(article);
  const previousKeyPoint = articleKeyPoint(article);
  const nextSummaryLead = String(updates?.summaryLead || previousSummaryLead).trim();
  const nextKeyPoint = String(updates?.keyPoint || previousKeyPoint).trim();

  return {
    key,
    sectionName,
    articleTitle: String(article?.title || '').trim(),
    media: mediaLabel(article),
    before: {
      summaryLead: previousSummaryLead,
      keyPoint: previousKeyPoint
    },
    after: {
      summaryLead: nextSummaryLead,
      keyPoint: nextKeyPoint
    },
    changed: previousSummaryLead !== nextSummaryLead || previousKeyPoint !== nextKeyPoint
  };
}

function renderAiReviewCard() {
  const review = state.pendingAiReview;
  if (!review?.proposals?.length) return '';

  return `
    <div class="ai-review-modal-backdrop" id="ai-review-modal-backdrop" role="presentation">
      <article
        class="card ai-review-card ai-review-modal"
        id="builder-ai-review-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-review-modal-title"
        tabindex="-1"
      >
        <div class="panel-heading ai-review-modal-head">
          <div>
            <p class="panel-kicker">AI Review</p>
            <h3 id="ai-review-modal-title">${escapeHtml(review.title || 'AI 제안 비교')}</h3>
          </div>
          <span class="panel-pill tone-neutral">${formatNumber(review.proposals.length)}건 검토</span>
        </div>
        <p class="panel-note">${escapeHtml(review.description || '적용 전에 기존 문구와 AI 제안 문구를 비교해 보세요.')}</p>
        ${review.failedCount
          ? `<p class="policy-note"><strong>안내</strong><span>일부 기사 ${formatNumber(review.failedCount)}건은 AI 응답이 실패해 이번 제안에서 제외했습니다.</span></p>`
          : ''}
        <div class="ai-review-list">
          ${review.proposals.map((proposal) => `
            <div class="ai-review-item ${proposal.changed ? 'is-changed' : 'is-same'}">
              <div class="ai-review-head">
                <div>
                  <strong>${escapeHtml(proposal.articleTitle || '기사')}</strong>
                  <span>${escapeHtml(sectionLabel(proposal.sectionName))} / ${escapeHtml(proposal.media || '-')}</span>
                </div>
                <span class="status-badge status-${proposal.changed ? 'warning' : 'reported'}">${proposal.changed ? '변경' : '유지'}</span>
              </div>
              <div class="ai-review-grid">
                <div class="ai-review-column">
                  <span class="ai-review-label">기존</span>
                  <strong>${escapeHtml(proposal.before.summaryLead || '-')}</strong>
                  <p>${escapeHtml(proposal.before.keyPoint || '-')}</p>
                </div>
                <div class="ai-review-column">
                  <span class="ai-review-label">AI 제안</span>
                  <strong>${escapeHtml(proposal.after.summaryLead || '-')}</strong>
                  <p>${escapeHtml(proposal.after.keyPoint || '-')}</p>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
        <div class="inline-actions stack-mobile ai-review-modal-actions">
          <button class="primary-btn" id="ai-review-apply">AI 제안 적용</button>
          <button class="ghost-btn" id="ai-review-cancel">기존 문구 유지</button>
        </div>
      </article>
    </div>
  `;
}

function setPendingAiReview(review) {
  state.pendingAiReview = review ? cloneValue(review) : null;
}

function clearPendingAiReview() {
  state.pendingAiReview = null;
}

function applyPendingAiReview() {
  const review = state.pendingAiReview;
  if (!review?.proposals?.length) return false;

  review.proposals.forEach((proposal) => {
    if (!proposal.changed) return;
    updateDraftItem(proposal.key, {
      summaryLead: proposal.after.summaryLead,
      keyPoint: proposal.after.keyPoint,
      conclusion: proposal.after.summaryLead,
      oneLine: proposal.after.keyPoint
    });
  });

  state.reportTextDraft = generateReportText();
  persistStoredBuilderDraft();
  pushActivityLog({
    title: review.mode === 'batch' ? 'AI 제안 일괄 적용' : 'AI 제안 적용',
    detail: `${formatNumber(review.changedCount || 0)}건 문구를 반영했습니다.`,
    tone: 'warning',
    page: 'builder'
  });
  completeAiWorkStatus(
    review.mode === 'batch' ? 'builder-report-draft' : 'builder-single-summary',
    'builder-ai',
    'AI 제안 적용 완료',
    `${formatNumber(review.changedCount || 0)}건 문구를 리포트 초안에 반영했습니다.`
  );
  clearPendingAiReview();
  return true;
}

async function buildAiSummaryProposalForDraftItem(key) {
  const location = findDraftLocation(key);
  if (!location) {
    return {
      updated: false,
      proposal: null
    };
  }

  const result = await requestAiSummary(location.item);
  return buildAiSummaryProposalFromResult(key, location.item, result);
}

function buildAiSummaryProposalFromResult(key, article, result) {
  const updates = buildAiSummaryUpdates(article, result);
  return {
    updated: true,
    proposal: buildAiReviewProposal(key, article, updates)
  };
}

function generateReportText() {
  return buildKakaoPreviewText();
}

async function summarizeDraftItemWithAi(key) {
  if (state.aiBusyKey) return;

  state.aiBusyKey = key;
  beginAiWorkStatus(
    'builder-single-summary',
    'builder-ai',
    '선택한 기사 AI 정리 중',
    '기존 문구와 AI 제안을 비교할 준비를 하고 있습니다.'
  );
  renderReportBuilder();

  try {
    const outcome = await buildAiSummaryProposalForDraftItem(key);
    if (!outcome?.updated || !outcome?.proposal) {
      completeAiWorkStatus(
        'builder-single-summary',
        'builder-ai',
        'AI 정리를 적용할 기사가 없습니다',
        '리포트 빌더에 반영된 기사에서 다시 실행해 주세요.',
        'error'
      );
      showToast('리포트에 반영된 기사만 AI 정리를 사용할 수 있습니다.');
      return;
    }
    if (!outcome.proposal.changed) {
      completeAiWorkStatus(
        'builder-single-summary',
        'builder-ai',
        'AI 정리 완료',
        '현재 문구와 AI 제안이 같아 적용할 변경점은 없습니다.'
      );
      showToast('AI 제안이 현재 문구와 같아서 적용할 변경점이 없습니다.');
      return;
    }
    setPendingAiReview({
      mode: 'single',
      title: 'AI 문구 비교',
      description: '선택한 기사 1건의 기존 문구와 AI 제안을 먼저 비교할 수 있습니다.',
      proposals: [outcome.proposal],
      changedCount: 1,
      failedCount: 0
    });
    completeAiWorkStatus(
      'builder-single-summary',
      'builder-ai',
      'AI 정리 완료',
      '비교 화면에서 기존 문구와 AI 제안을 확인할 수 있습니다.'
    );
    showToast('AI 제안을 비교 화면에 준비했습니다.');
    return;
  } catch (error) {
    completeAiWorkStatus(
      'builder-single-summary',
      'builder-ai',
      'AI 정리 실패',
      error instanceof Error ? error.message : 'AI 정리에 실패했습니다.',
      'error'
    );
    showToast(error instanceof Error ? error.message : 'AI 정리에 실패했습니다.');
  } finally {
    state.aiBusyKey = '';
    renderReportBuilder();
  }
}

async function summarizeReportDraftWithAi() {
  if (state.aiBusyKey) return;

  const sections = getReportSections();
  const entryKeys = [
    ...sections.major.map((article) => draftEntryKey('major', article)),
    ...sections.industry.map((article) => draftEntryKey('industry', article))
  ];
  const entries = entryKeys
    .map((key) => {
      const location = findDraftLocation(key);
      return location ? { key, article: location.item } : null;
    })
    .filter(Boolean);
  if (!entries.length) {
    showToast('리포트에 반영된 기사가 있을 때 사용할 수 있습니다.');
    return;
  }

  state.aiBusyKey = 'report-draft';
  state.builderSideView = 'draft';
  beginAiWorkStatus(
    'builder-report-draft',
    'builder-ai',
    '리포트 전체 AI 정리 중',
    `기사 ${formatNumber(entries.length)}건의 문구를 한 번의 AI 요청으로 정리하고 있습니다.`
  );
  renderReportBuilder();

  let successCount = 0;
  let changedCount = 0;
  let failedCount = 0;
  const proposals = [];

  try {
    const batchResult = await requestAiSummaryBatch(entries);
    const resultByKey = new Map(
      (Array.isArray(batchResult?.items) ? batchResult.items : [])
        .map((item) => [String(item?.key || '').trim(), item])
        .filter(([key]) => Boolean(key))
    );

    for (const entry of entries) {
      const result = resultByKey.get(entry.key);
      if (!result?.summaryLead || !result?.keyPoint) {
        failedCount += 1;
        continue;
      }

      const outcome = buildAiSummaryProposalFromResult(entry.key, entry.article, result);
      if (!outcome?.updated || !outcome?.proposal) {
        failedCount += 1;
        continue;
      }

      successCount += 1;
      proposals.push(outcome.proposal);
      if (outcome.proposal.changed) {
        changedCount += 1;
      }
    }

    if (!successCount && failedCount) {
      throw new Error('AI 일괄 정리 결과에서 적용 가능한 기사 문구를 찾지 못했습니다.');
    }

    if (!changedCount) {
      if (failedCount > 0) {
        completeAiWorkStatus(
          'builder-report-draft',
          'builder-ai',
          'AI 정리 완료',
          `변경점은 없었고 ${formatNumber(failedCount)}건은 응답에 실패했습니다.`,
          'error'
        );
        showToast(`AI가 기사 ${successCount}건을 확인했지만 변경 없이 ${failedCount}건은 실패했습니다.`);
        return;
      }
      completeAiWorkStatus(
        'builder-report-draft',
        'builder-ai',
        'AI 정리 완료',
        `기사 ${formatNumber(successCount)}건을 검토했지만 적용할 변경점은 없습니다.`
      );
      showToast(`AI가 기사 ${successCount}건을 검토했지만 적용할 변경점은 없었습니다.`);
      return;
    }

    setPendingAiReview({
      mode: 'batch',
      title: 'AI 일괄 제안 비교',
      description: `기사 ${formatNumber(changedCount)}건의 문구를 AI가 다시 정리했습니다. 적용 전에 변경 내용을 확인해 보세요.`,
      proposals: proposals.filter((proposal) => proposal.changed),
      changedCount,
      failedCount
    });
    completeAiWorkStatus(
      'builder-report-draft',
      'builder-ai',
      'AI 일괄 정리 완료',
      `변경 후보 ${formatNumber(changedCount)}건을 비교 화면에 준비했습니다.`
    );
    showToast(`AI 제안 ${changedCount}건을 비교 화면에 준비했습니다.`);
    return;
  } catch (error) {
    completeAiWorkStatus(
      'builder-report-draft',
      'builder-ai',
      'AI 일괄 정리 실패',
      error instanceof Error ? error.message : 'AI 정리에 실패했습니다.',
      'error'
    );
    showToast(error instanceof Error ? error.message : 'AI 정리에 실패했습니다.');
  } finally {
    state.aiBusyKey = '';
    state.builderSideView = 'draft';
    renderReportBuilder();
  }
}

function characterLength(text) {
  return String(text || '').length;
}

function truncateText(text, maxLength = 120) {
  const source = String(text || '').trim();
  if (source.length <= maxLength) return source;
  return `${source.slice(0, Math.max(maxLength - 1, 0)).trim()}…`;
}

function clampNumber(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function articleAiPriorityMeta(band) {
  const table = {
    urgent: {
      label: '핵심',
      description: '카카오 사업 관점에서 바로 검토',
      actionLabel: '1차 추천'
    },
    important: {
      label: '우선',
      description: '오늘 안에 반영 검토',
      actionLabel: '검토 추천'
    },
    watch: {
      label: '업계',
      description: '업계 흐름 참고',
      actionLabel: '업계 참고'
    },
    skip: {
      label: '제외',
      description: '카카오 사업 기준과 거리 있음',
      actionLabel: '비추천'
    }
  };

  return table[band] || table.watch;
}

function articleAiBandFromScore(score) {
  if (score >= 78) return 'urgent';
  if (score >= 62) return 'important';
  if (score >= 44) return 'watch';
  return 'skip';
}

function articleMatchesAnyPattern(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function collectArticleAiThemes(text) {
  const themeEntries = [
    {
      key: 'performance',
      label: '사업 성과',
      patterns: [/(실적|매출|영업이익|영업손실|흑자|적자|성장|수익성|거래액|이용자|가입자|점유율|분기)/i]
    },
    {
      key: 'service',
      label: '신규 서비스',
      patterns: [/(출시|론칭|오픈|공개|업데이트|개편|신규 서비스|신기능|정식 출시|베타|고도화|적용)/i]
    },
    {
      key: 'aiInfra',
      label: 'AI·인프라',
      patterns: [/(AI|인공지능|생성형 AI|LLM|초거대|데이터센터|데이터 센터|클라우드|인프라|GPU|반도체|서버|모델|에이전트)/i]
    },
    {
      key: 'platformStrategy',
      label: '플랫폼 전략',
      patterns: [/(플랫폼 전략|사업 전략|전략 고도화|서비스 전략|광고 플랫폼|커머스 플랫폼|톡비즈|카카오톡|메신저|생태계|트래픽|이용자 기반)/i]
    },
    {
      key: 'executive',
      label: '임원 인터뷰',
      patterns: [/(인터뷰|간담회|기자간담회|설명회|대표|CEO|총괄|사장|부사장|임원)/i]
    },
    {
      key: 'partnership',
      label: 'MOU·제휴',
      patterns: [/(MOU|업무협약|협약|제휴|파트너십|동맹|공동개발|협력|계약 체결|맞손)/i]
    },
    {
      key: 'investment',
      label: '투자',
      patterns: [/(투자|출자|지분 투자|인수|펀딩|자금 조달|투자 유치|증자)/i]
    }
  ];

  return themeEntries.filter((theme) => articleMatchesAnyPattern(text, theme.patterns));
}

function articleAiFormatLabel(article, band) {
  const text = `${article?.title || ''} ${article?.summary || ''}`;
  const themes = collectArticleAiThemes(text).map((theme) => theme.key);
  if (themes.includes('performance') || themes.includes('investment')) return '보고서형';
  if (themes.includes('aiInfra') || themes.includes('platformStrategy')) return '전략형';
  if (themes.includes('partnership') || themes.includes('executive')) return '브리핑형';
  if (themes.includes('service')) return '서비스형';
  if (band === 'watch') return '모니터링형';
  return '보고서형';
}

function articleAiToneLabel(article) {
  const text = `${article?.title || ''} ${article?.summary || ''}`;
  if (/(실적|매출|영업이익|투자|지분|MOU|업무협약|계약)/i.test(text)) {
    return '분석형';
  }
  if (/(AI|인공지능|데이터센터|데이터 센터|클라우드|인프라|플랫폼 전략|사업 전략|톡비즈)/i.test(text)) {
    return '전략형';
  }
  if (/(인터뷰|간담회|대표|CEO|총괄|임원)/i.test(text)) {
    return '공식적';
  }
  if (/(출시|오픈|업데이트|신규 서비스|신기능)/i.test(text)) {
    return '서비스형';
  }
  return '중립적';
}

function buildArticleAiInsight(article) {
  const keyword = String(article?.keyword || '').trim();
  const title = String(article?.title || '').trim();
  const summary = String(article?.summary || '').trim();
  const publisher = mediaLabel(article);
  const text = `${title} ${summary} ${keyword} ${publisher}`;
  const titleText = title;
  const summaryText = summary;
  const reasons = [];
  let score = 8;

  const kakaoCorePatterns = [
    /카카오/i,
    /kakao/i,
    /카카오톡/i,
    /카카오페이/i,
    /카카오뱅크/i,
    /카카오모빌리티/i,
    /카카오엔터/i,
    /카카오엔터프라이즈/i,
    /카카오게임즈/i,
    /카카오헬스케어/i,
    /카카오스타일/i,
    /카카오브레인/i,
    /멜론/i
  ];
  const kakaoExecutivePatterns = [
    /(카카오.{0,12}(김범수|정신아)|(김범수|정신아).{0,12}카카오)/i,
    /(김범수.{0,18}(창업자|의장|카카오)|정신아.{0,18}(대표|ceo|카카오))/i
  ];
  const kakaoCorporateSubjectPatterns = [
    /(카카오|카카오뱅크|카카오페이|카카오모빌리티|카카오엔터|카카오엔터프라이즈|카카오스타일)(\([^)]*\))?\s*(가|는|이|의|측은|에서)/i,
    /((대표이사|대표|ceo)\s*정신아|카카오\s*(창업자|의장)\s*김범수)/i
  ];
  const industryFocusPatterns = [/(AI|인공지능|핀테크|모빌리티|콘텐츠|플랫폼|광고|커머스|금융|클라우드)/i];
  const politicsOrIncidentPatterns = [
    /(선거|경선|후보|정당|고발|경찰|수사|기소|법원|공직선거법|당원|투표|정치|국회|대선)/i,
    /(사고|화재|사망|범죄|불법|제재|인권|노조|논란|채팅방 악용|오픈채팅 범죄)/i
  ];
  const channelOnlyPatterns = [/(카카오톡 채팅방|오픈채팅|메신저 채팅방|단체 채팅방)/i];

  const matchedThemes = collectArticleAiThemes(text);
  const themeKeys = matchedThemes.map((theme) => theme.key);
  const hasBusinessTheme = matchedThemes.length > 0;
  const titleDirectKakao = articleMatchesAnyPattern(titleText, kakaoCorePatterns)
    || articleMatchesAnyPattern(titleText, kakaoExecutivePatterns);
  const summaryCorporateKakao = articleMatchesAnyPattern(summaryText, kakaoCorporateSubjectPatterns);
  const directKakao = titleDirectKakao || (summaryCorporateKakao && hasBusinessTheme);
  const industryFocus = articleMatchesAnyPattern(text, industryFocusPatterns);
  const negativeIssue = articleMatchesAnyPattern(text, politicsOrIncidentPatterns);
  const channelOnly = articleMatchesAnyPattern(text, channelOnlyPatterns);
  const industryPartnershipOrInvestment = !directKakao
    && industryFocus
    && (themeKeys.includes('partnership') || themeKeys.includes('investment'));

  if (directKakao) {
    score += 42;
    reasons.push('카카오 또는 계열사 직접 기사라 우선 검토 가치가 높습니다.');
  } else if (industryPartnershipOrInvestment) {
    score += 6;
    reasons.push('AI·플랫폼·투자 흐름을 확인할 수 있는 업계 기사입니다.');
  } else {
    score -= 12;
  }

  if (themeKeys.includes('performance')) {
    score += 18;
    reasons.push('사업 성과·실적 관련 기사라 대외 메시지 검토에 적합합니다.');
  }
  if (themeKeys.includes('service')) {
    score += 16;
    reasons.push('신규 서비스·출시 관련 기사라 활용도가 높습니다.');
  }
  if (themeKeys.includes('aiInfra')) {
    score += 16;
    reasons.push('AI·데이터센터·인프라 전략과 연결돼 사업 방향을 설명하기 좋습니다.');
  }
  if (themeKeys.includes('platformStrategy')) {
    score += 14;
    reasons.push('플랫폼 전략 흐름을 보여줘 카카오 사업 메시지로 확장하기 좋습니다.');
  }
  if (themeKeys.includes('executive')) {
    score += 14;
    reasons.push('대표·임원 발언이 포함돼 핵심 메시지화가 쉽습니다.');
  }
  if (themeKeys.includes('partnership')) {
    score += 15;
    reasons.push('MOU·제휴 기사라 사업 확장 흐름을 설명하기 좋습니다.');
  }
  if (themeKeys.includes('investment')) {
    score += 15;
    reasons.push('투자·인수 관련 기사라 시장 커뮤니케이션 포인트가 분명합니다.');
  }

  const recency = Number.isFinite(article?.recencyScore) ? article.recencyScore : Number.POSITIVE_INFINITY;
  if (recency <= 30) {
    score += 12;
    reasons.push('당일 기사라 1차 추천으로 띄우기 좋습니다.');
  } else if (recency <= 180) {
    score += 6;
  }

  if (mediaWhitelist().some((item) => normalizeArticleMatchValue(item) === normalizeArticleMatchValue(publisher))) {
    score += 4;
  }

  if (negativeIssue) {
    score -= 48;
    reasons.unshift('정치·사건성 이슈라 카카오 사업 추천 기준과 맞지 않습니다.');
  }

  if (directKakao && channelOnly && !hasBusinessTheme) {
    score -= 32;
    reasons.unshift('카카오가 서비스 도구로만 언급돼 기업 기사로 보기 어렵습니다.');
  }

  if (directKakao && !hasBusinessTheme) {
    score -= 18;
    reasons.push('카카오 직접 기사지만 사업 성과·서비스·투자 유형이 약합니다.');
  }

  if (!directKakao && !industryPartnershipOrInvestment) {
    score -= 20;
  }

  if (!directKakao) {
    score -= 18;
  }

  if (isArticleAssigned(article)) {
    score -= 10;
    reasons.push('이미 리포트에 반영돼 우선순위는 낮춰도 됩니다.');
  }

  const finalScore = clampNumber(Math.round(score), 0, 98);
  const band = articleAiBandFromScore(finalScore);
  const bandMeta = articleAiPriorityMeta(band);
  const formatLabel = articleAiFormatLabel(article, band);
  const toneLabel = articleAiToneLabel(article);
  const sectionName = article?.section === 'industry' ? 'industry' : 'major';
  const focusLabel = directKakao ? '카카오' : industryPartnershipOrInvestment ? '산업 동향' : (keyword || '비우선 기사');
  const leadLabel = matchedThemes[0]?.label || (directKakao ? '카카오 사업' : '산업 동향');
  const prAngleLead = buildPrAngleLeadForArticle(article);
  const prAngleKeyPoint = buildPrAngleKeyPointForArticle(article, prAngleLead);
  const draftTitle = truncateText(
    `${focusLabel} ${leadLabel} 관점: ${prAngleLead || publisher}`,
    72
  );
  const summaryLead = truncateText(
    prAngleLead || `${focusLabel} ${leadLabel} 흐름`,
    78
  );
  const keyPoint = truncateText(
    prAngleKeyPoint || `${publisher} 보도 기준 ${leadLabel} 흐름 확인`,
    64
  );
  const intro = truncateText(
    `${publisher} 보도를 기준으로 ${leadLabel} 흐름을 먼저 확인합니다. ${reasons[0] || ''}`,
    140
  );

  return {
    score: finalScore,
    band,
    bandLabel: bandMeta.label,
    bandDescription: bandMeta.description,
    actionLabel: bandMeta.actionLabel,
    formatLabel,
    toneLabel,
    sectionName,
    localPreview: true,
    directKakao,
    matchedThemes: matchedThemes.map((theme) => theme.label),
    qualified: directKakao && hasBusinessTheme && !negativeIssue,
    reasons: [...new Set(reasons)].slice(0, 4),
    draft: {
      title: draftTitle,
      summaryLead,
      keyPoint,
      intro
    }
  };
}

function isKakaoAiRecommended(article) {
  const insight = buildArticleAiInsight(article);
  return insight.qualified && insight.band !== 'skip';
}

function articleRecommendationThemeLabels(article, { sectionName = '' } = {}) {
  const text = `${article?.title || ''} ${article?.summary || ''} ${article?.keyword || ''}`;
  const labels = collectArticleAiThemes(text).map((theme) => theme.label);
  const fallback = sectionName === 'industry'
    ? buildIndustryArticleAiInsight(article).reasons[0]
    : buildArticleAiInsight(article).reasons[0];
  const fallbackLabel = fallback
    ? fallback
      .replace(/입니다\.?$/u, '')
      .replace(/하기 좋습니다\.?$/u, '')
      .replace(/확인할 수 있는 /u, '')
      .slice(0, 18)
    : '';

  return [...new Set([...labels, fallbackLabel].filter(Boolean))].slice(0, 3);
}

function buildIndustryArticleAiInsight(article) {
  const keyword = String(article?.keyword || '').trim();
  const title = String(article?.title || '').trim();
  const summary = String(article?.summary || '').trim();
  const publisher = mediaLabel(article);
  const text = `${title} ${summary} ${keyword} ${publisher}`;
  const reasons = [];
  let score = 12;

  const kakaoInsight = buildArticleAiInsight(article);
  const industryCorePatterns = [
    /(AI|인공지능|플랫폼|핀테크|모빌리티|콘텐츠|광고|커머스|클라우드|데이터센터|데이터 센터|인프라|반도체|투자|제휴|MOU|협약|규제|정책)/i
  ];
  const industryNoisePatterns = [
    /(선거|후보|정당|정치|국회|수사|기소|고발|사건|범죄|오픈채팅|채팅방|지원금|편의점|치킨|드라마|예능|프로야구|야구|부동산|생활 정보|전쟁|지정학|원유|호르무즈|파나마 운하|격침|국제유가|트럼프|굿모닝 마켓|투자노트|외신 헤드라인|오늘의 키워드)/i
  ];
  const matchedThemes = collectArticleAiThemes(text);
  const themeKeys = matchedThemes.map((theme) => theme.key);
  const hasIndustryCore = articleMatchesAnyPattern(text, industryCorePatterns);
  const hasNoise = articleMatchesAnyPattern(text, industryNoisePatterns);

  if (article?.section === 'industry') {
    score += 22;
    reasons.push('업계 보도로 분류된 기사입니다.');
  }

  if (hasIndustryCore) {
    score += 18;
    reasons.push('업계 흐름을 이해하는 데 직접 연결되는 주제입니다.');
  }

  if (themeKeys.includes('performance')) {
    score += 12;
    reasons.push('업계 실적 흐름을 파악하는 데 도움이 됩니다.');
  }
  if (themeKeys.includes('service')) {
    score += 10;
    reasons.push('새 서비스나 제품 방향성을 읽을 수 있습니다.');
  }
  if (themeKeys.includes('partnership')) {
    score += 10;
    reasons.push('제휴·협력 흐름을 모니터링하기 좋습니다.');
  }
  if (themeKeys.includes('investment')) {
    score += 10;
    reasons.push('투자 및 시장 자금 흐름과 연결됩니다.');
  }

  const recency = Number.isFinite(article?.recencyScore) ? article.recencyScore : Number.POSITIVE_INFINITY;
  if (recency <= 60) {
    score += 8;
  } else if (recency <= 180) {
    score += 4;
  }

  if (kakaoInsight.directKakao) {
    score -= 24;
    reasons.unshift('카카오 직접 기사라 업계 참고 리스트보다 카카오 리스트에 더 가깝습니다.');
  }

  if (hasNoise) {
    score -= 42;
    reasons.unshift('정치·생활·사건성 기사라 업계 추천 기준과 거리가 있습니다.');
  }

  const finalScore = clampNumber(Math.round(score), 0, 98);
  const band = articleAiBandFromScore(finalScore);
  const strategicIndustrySignal = hasIndustryCore || matchedThemes.length > 0;
  const qualified = !kakaoInsight.directKakao && !hasNoise && strategicIndustrySignal;

  return {
    score: finalScore,
    band,
    qualified,
    reasons: [...new Set(reasons)].slice(0, 4)
  };
}

function normalizeInboxArticleScore(value) {
  const score = Number(value);
  return Number.isFinite(score) ? clampNumber(Math.round(score), 0, 100) : null;
}

function aiCurationScoreForPick(pick, sectionName) {
  const explicitScore = normalizeInboxArticleScore(pick?.score);
  if (explicitScore !== null) return explicitScore;

  const insight = sectionName === 'industry'
    ? buildIndustryArticleAiInsight(pick?.article)
    : buildArticleAiInsight(pick?.article);
  return normalizeInboxArticleScore(insight.score) ?? 0;
}

function aiCurationPriorityRank(band) {
  return {
    urgent: 3,
    important: 2,
    watch: 1,
    skip: 0
  }[band] ?? 0;
}

function limitAiCurationPicksByScore(picks, sectionName, maxCount) {
  return (Array.isArray(picks) ? picks : [])
    .map((pick, index) => ({
      ...pick,
      score: aiCurationScoreForPick(pick, sectionName),
      sourceIndex: index
    }))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      const priorityCompare = aiCurationPriorityRank(right.band) - aiCurationPriorityRank(left.band);
      if (priorityCompare !== 0) return priorityCompare;
      return left.sourceIndex - right.sourceIndex;
    })
    .slice(0, maxCount)
    .map(({ sourceIndex, ...pick }) => pick);
}

function pickInboxArticleInsight(article) {
  const kakaoInsight = buildArticleAiInsight(article);
  if (article?.section !== 'industry') {
    return kakaoInsight;
  }

  const industryInsight = buildIndustryArticleAiInsight(article);
  return normalizeInboxArticleScore(industryInsight.score) > normalizeInboxArticleScore(kakaoInsight.score)
    ? industryInsight
    : kakaoInsight;
}

function inboxArticleInsight(article) {
  const explicitScore = normalizeInboxArticleScore(article?.score ?? article?.aiScore ?? article?.priorityScore);
  const insight = pickInboxArticleInsight(article);
  const score = explicitScore ?? normalizeInboxArticleScore(insight.score) ?? 0;
  const band = explicitScore === null ? insight.band : articleAiBandFromScore(score);
  const bandMeta = articleAiPriorityMeta(band);

  return {
    ...insight,
    score,
    band,
    bandLabel: insight.bandLabel || bandMeta.label,
    bandDescription: insight.bandDescription || bandMeta.description
  };
}

function inboxArticleScore(article) {
  return inboxArticleInsight(article).score;
}

function normalizeAiCurationBand(value, fallback = 'watch') {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'urgent' || normalized === 'high' || normalized === '핵심') return 'urgent';
  if (normalized === 'important' || normalized === 'medium' || normalized === '우선') return 'important';
  if (normalized === 'watch' || normalized === 'low' || normalized === '참고') return 'watch';
  if (normalized === 'skip' || normalized === '제외') return 'skip';
  return fallback;
}

function normalizeAiCurationPicks(rawPicks, articleLookup, fallbackBand = 'watch') {
  const source = Array.isArray(rawPicks) ? rawPicks : [];
  const seen = new Set();

  return source
    .map((pick) => {
      const articleId = String(pick?.articleId || '').trim();
      const article = articleLookup.get(articleId);
      if (!article || seen.has(articleId)) return null;
      seen.add(articleId);
      return {
        articleId,
        article,
        reason: truncateText(String(pick?.reason || '').trim(), 140),
        band: normalizeAiCurationBand(pick?.priority, fallbackBand),
        score: normalizeInboxArticleScore(pick?.score)
      };
    })
    .filter(Boolean);
}

function buildLocalAiArticleCuration(articles, prompt) {
  const articlePayload = buildAiCurationArticlePayload(articles);
  const articleLookup = new Map(articlePayload.map((item, index) => [item.articleId, articles[index]]));
  const kakaoPicks = articlePayload
    .map((item) => {
      const article = articleLookup.get(item.articleId);
      const insight = buildArticleAiInsight(article);
      return {
        articleId: item.articleId,
        article,
        reason: insight.reasons[0] || '카카오 사업 기준으로 우선 검토할 기사입니다.',
        band: insight.band,
        score: insight.score
      };
    })
    .filter((item) => isKakaoAiRecommended(item.article))
    .sort((left, right) => right.score - left.score)
    .slice(0, 5);

  const industryPicks = articlePayload
    .map((item) => {
      const article = articleLookup.get(item.articleId);
      const insight = buildIndustryArticleAiInsight(article);
      return {
        articleId: item.articleId,
        article,
        reason: insight.reasons[0] || '업계 모니터링 관점에서 확인할 기사입니다.',
        band: insight.band,
        score: insight.score
      };
    })
    .filter((item) => item.article && buildIndustryArticleAiInsight(item.article).qualified)
    .sort((left, right) => right.score - left.score)
    .slice(0, 10);

  return {
    mode: 'local-preview',
    summary: 'AI 연결 전 단계라 로컬 기준으로 먼저 카카오/업계 후보를 정리했습니다.',
    prompt: String(prompt || '').trim(),
    generatedAt: new Date().toISOString(),
    totalArticles: articlePayload.length,
    kakaoPicks,
    industryPicks
  };
}

function normalizeAiArticleCurationResult(payload, articles, fallbackPrompt = '') {
  const articlePayload = buildAiCurationArticlePayload(articles);
  const articleLookup = new Map(articlePayload.map((item, index) => [item.articleId, articles[index]]));
  const normalizedKakaoPicks = limitAiCurationPicksByScore(
    normalizeAiCurationPicks(payload?.kakaoPicks, articleLookup, 'important')
      .filter((pick) => isKakaoAiRecommended(pick.article)),
    'major',
    5
  );
  const normalizedIndustryPicks = limitAiCurationPicksByScore(
    normalizeAiCurationPicks(payload?.industryPicks, articleLookup, 'watch')
      .filter((pick) => buildIndustryArticleAiInsight(pick.article).qualified),
    'industry',
    10
  );

  return {
    mode: String(payload?.mode || 'remote').trim() || 'remote',
    provider: String(payload?.provider || '').trim(),
    model: String(payload?.model || '').trim(),
    summary: truncateText(String(payload?.summary || '').trim(), 280),
    prompt: String(payload?.prompt || fallbackPrompt || '').trim(),
    generatedAt: String(payload?.generatedAt || new Date().toISOString()),
    totalArticles: articlePayload.length,
    kakaoPicks: normalizedKakaoPicks,
    industryPicks: normalizedIndustryPicks
  };
}

function ensureInboxArticleVisible(article) {
  let changed = false;

  if (state.inboxAiFilter !== 'all') {
    state.inboxAiFilter = 'all';
    changed = true;
  }
  if (state.inboxSectionFilter !== 'all' && article?.section !== state.inboxSectionFilter) {
    state.inboxSectionFilter = 'all';
    changed = true;
  }
  if (state.inboxStatusFilter === 'reported' && !isArticleAssigned(article)) {
    state.inboxStatusFilter = 'all';
    changed = true;
  }
  if (state.inboxStatusFilter === 'unreported' && isArticleAssigned(article)) {
    state.inboxStatusFilter = 'all';
    changed = true;
  }
  if (normalizedInboxSearchQuery()) {
    state.inboxSearchQuery = '';
    changed = true;
  }
  if (inboxKeywordFilterTokens().length) {
    setInboxKeywordFilterTokens([]);
    changed = true;
  }

  return changed;
}

function focusInboxArticleByKey(key) {
  const article = state.articles.find((candidate) => articleKey(candidate) === key);
  if (!article) return false;

  ensureInboxArticleVisible(article);
  const visibleArticles = filteredArticles();
  const nextIndex = visibleArticles.findIndex((candidate) => articleKey(candidate) === key);
  if (nextIndex < 0) return false;

  state.selectedPage = Math.floor(nextIndex / state.pageSize) + 1;
  state.selectedArticle = visibleArticles[nextIndex];
  state.inboxPreviewOpen = false;
  renderInbox();
  requestAnimationFrame(() => {
    const selector = `.table-row[data-article-key="${CSS.escape(key)}"]`;
    app.querySelector(selector)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  return true;
}

function renderAiPriorityPill(article, { compact = false } = {}) {
  const insight = inboxArticleInsight(article);
  const scoreLabel = compact
    ? `${insight.bandLabel} ${formatNumber(insight.score)}`
    : `${insight.bandLabel} ${formatNumber(insight.score)}점`;

  return `<span class="panel-pill ai-priority-pill ai-priority-${escapeHtml(insight.band)}">${escapeHtml(scoreLabel)}</span>`;
}

function normalizeAiCurationSectionName(value) {
  return value === 'industry' ? 'industry' : 'major';
}

function getAiCurationPicks(sectionName) {
  const normalizedSection = normalizeAiCurationSectionName(sectionName);
  const result = state.inboxAiCurationResult || {};
  return normalizedSection === 'industry'
    ? (Array.isArray(result.industryPicks) ? result.industryPicks : [])
    : (Array.isArray(result.kakaoPicks) ? result.kakaoPicks : []);
}

function buildAiCurationDraftArticle(sectionName, article) {
  return {
    ...(cloneArticle(article) || {}),
    section: normalizeAiCurationSectionName(sectionName)
  };
}

function summarizeAiCurationAssignablePicks(sectionName, picks) {
  const normalizedSection = normalizeAiCurationSectionName(sectionName);
  return (Array.isArray(picks) ? picks : []).reduce((summary, pick) => {
    const article = pick?.article;
    if (!article) return summary;

    if (isArticleAssigned(article)) {
      summary.alreadyAssigned.push(article);
      return summary;
    }

    summary.available.push(buildAiCurationDraftArticle(normalizedSection, article));
    return summary;
  }, {
    available: [],
    alreadyAssigned: []
  });
}

function addAiCurationPickToReport(sectionName, key) {
  const normalizedSection = normalizeAiCurationSectionName(sectionName);
  const pick = getAiCurationPicks(normalizedSection).find((candidate) => articleKey(candidate?.article) === key);
  if (!pick?.article) {
    showToast('추가할 추천 기사를 찾지 못했습니다.');
    return;
  }

  if (isArticleAssigned(pick.article)) {
    showToast('이미 리포트 빌더에 추가된 기사입니다.', {
      actionLabel: '빌더 보기',
      onAction: () => render('builder'),
      duration: UNDO_TOAST_DURATION
    });
    return;
  }

  const snapshot = captureWorkspaceSnapshot();
  const draftArticle = buildAiCurationDraftArticle(normalizedSection, pick.article);
  const result = addArticleToReportSection(normalizedSection, draftArticle);
  if (!result.added) {
    showToast('AI 추천 기사 추가에 실패했습니다.');
    return;
  }

  pushActivityLog({
    title: 'AI 추천 기사 추가',
    detail: `${truncateText(pick.article?.title || '기사', 36)} 기사를 ${sectionLabel(normalizedSection)}에 추가했습니다.`,
    tone: 'reported',
    page: 'inbox'
  });
  registerUndoAction('방금 AI 추천 기사 추가를 되돌릴 수 있습니다.', snapshot);
  showToast(`${sectionLabel(normalizedSection)}에 기사를 추가했습니다.`, {
    actionLabel: '빌더 보기',
    onAction: () => render('builder'),
    duration: UNDO_TOAST_DURATION
  });
  renderInbox();
}

function addAllAiCurationPicksToReport(sectionName) {
  const normalizedSection = normalizeAiCurationSectionName(sectionName);
  const picks = getAiCurationPicks(normalizedSection);
  const summary = summarizeAiCurationAssignablePicks(normalizedSection, picks);

  if (!summary.available.length) {
    showToast(
      summary.alreadyAssigned.length
        ? '추천 기사들이 이미 리포트 빌더에 추가되어 있습니다.'
        : '추가할 추천 기사가 없습니다.'
    );
    return;
  }

  const snapshot = captureWorkspaceSnapshot();
  summary.available.forEach((article) => {
    addArticleToReportSection(normalizedSection, article);
  });

  const excludedText = summary.alreadyAssigned.length
    ? ` 이미 추가된 ${formatNumber(summary.alreadyAssigned.length)}건은 제외했습니다.`
    : '';

  pushActivityLog({
    title: 'AI 추천 기사 일괄 추가',
    detail: `${formatNumber(summary.available.length)}건을 ${sectionLabel(normalizedSection)}에 추가했습니다.`,
    tone: 'reported',
    page: 'inbox'
  });
  registerUndoAction('방금 AI 추천 기사 추가를 되돌릴 수 있습니다.', snapshot);
  showToast(`${formatNumber(summary.available.length)}건을 ${sectionLabel(normalizedSection)}에 추가했습니다.${excludedText}`, {
    actionLabel: '빌더 보기',
    onAction: () => render('builder'),
    duration: UNDO_TOAST_DURATION
  });
  renderInbox();
}

function renderAiCurationPickGroup(sectionName, title, picks, emptyText) {
  const normalizedSection = normalizeAiCurationSectionName(sectionName);
  const addableCount = picks.filter((pick) => pick?.article && !isArticleAssigned(pick.article)).length;
  return `
    <section class="ai-curation-group">
      <div class="ai-curation-group-head">
        <div class="ai-curation-group-copy">
          <strong>${escapeHtml(title)}</strong>
          <span>${formatNumber(picks.length)}건</span>
        </div>
        <div class="inline-actions compact ai-curation-group-actions">
          <button class="ghost-btn" type="button" data-ai-curation-add-all="${escapeHtml(normalizedSection)}" ${addableCount ? '' : 'disabled'}>전체 추가</button>
        </div>
      </div>
      ${picks.length
        ? picks.map((pick) => {
          const key = articleKey(pick.article);
          const assigned = isArticleAssigned(pick.article);
          const themeLabels = articleRecommendationThemeLabels(pick.article, { sectionName: normalizedSection });
          return `
            <article class="ai-curation-pick">
              <div class="ai-curation-pick-head">
                <span class="panel-pill tone-neutral">${escapeHtml(mediaLabel(pick.article))}</span>
                <span class="panel-pill tone-neutral">${escapeHtml(pick.article?.keyword || '기사')}</span>
              </div>
              ${themeLabels.length
                ? `<div class="ai-curation-theme-row">
                    ${themeLabels.map((label) => `<span class="panel-pill tone-neutral">${escapeHtml(label)}</span>`).join('')}
                  </div>`
                : ''}
              <div class="ai-curation-pick-copy">
                <strong>${escapeHtml(pick.article?.title || '')}</strong>
                <p>${escapeHtml(pick.reason || 'AI 추천 이유 없음')}</p>
              </div>
              <div class="inline-actions compact ai-curation-pick-actions">
                <button class="ghost-btn" type="button" data-ai-curation-focus="${escapeHtml(key)}">미리보기</button>
                <button
                  class="${assigned ? 'ghost-btn' : 'primary-btn'}"
                  type="button"
                  ${assigned ? `data-ai-curation-open-builder="${escapeHtml(key)}"` : `data-ai-curation-add="${escapeHtml(key)}" data-ai-curation-section="${escapeHtml(normalizedSection)}"`}
                >${assigned ? '빌더에서 확인' : '바로 추가'}</button>
              </div>
            </article>
          `;
        }).join('')
        : `<p class="small-copy">${escapeHtml(emptyText)}</p>`}
    </section>
  `;
}

function renderInboxAiCurationResultModal() {
  const result = state.inboxAiCurationResult;
  if (!state.inboxAiCurationModalOpen || !result) return '';

  const providerLabel = result?.mode === 'local-preview'
    ? '로컬 미리보기'
    : (result?.provider || state.capabilities?.provider || 'AI');
  const trustText = result?.mode === 'local-preview'
    ? '로컬 규칙 미리보기입니다. 사업 성과·서비스·AI/인프라·MOU·투자 신호를 먼저 추립니다.'
    : 'AI 응답입니다. 추천 이유는 기사 카드에서 확인하고 바로 빌더에 반영할 수 있습니다.';

  return `
    <div class="inbox-ai-curation-modal-backdrop" id="inbox-ai-curation-modal-backdrop" role="presentation">
      <article
        class="card inbox-ai-curation-modal"
        id="inbox-ai-curation-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="inbox-ai-curation-modal-title"
        tabindex="-1"
      >
        <div class="panel-heading inbox-ai-curation-modal-head">
          <div>
            <p class="panel-kicker">AI 추천</p>
            <h3 id="inbox-ai-curation-modal-title">AI 기사 추천 결과</h3>
            <p class="panel-note">주요 보도와 업계 보도 후보를 확인하고 바로 빌더에 추가할 수 있습니다.</p>
          </div>
          <button class="ghost-btn" type="button" id="inbox-ai-curation-modal-close">닫기</button>
        </div>
        <div class="ai-curation-summary">
          <div class="ai-curation-summary-head">
            <strong>${escapeHtml(providerLabel)}</strong>
            <span>${escapeHtml(formatSavedTime(result.generatedAt) || '방금')}</span>
          </div>
          <p>${escapeHtml(result.summary || '추천 결과를 준비했습니다.')}</p>
          <p class="ai-curation-trust">${escapeHtml(trustText)}</p>
        </div>
        <div class="ai-curation-grid inbox-ai-curation-modal-grid">
          ${renderAiCurationPickGroup('major', '주요 보도 추천', result.kakaoPicks || [], '주요 보도 기준에 맞는 추천 기사가 없습니다.')}
          ${renderAiCurationPickGroup('industry', '업계 보도 추천', result.industryPicks || [], '업계 보도 기준에 맞는 추천 기사가 없습니다.')}
        </div>
      </article>
    </div>
  `;
}

function renderInboxAiCurationCard(articles) {
  const totalArticles = Array.isArray(articles) ? articles.length : 0;
  const result = state.inboxAiCurationResult;
  const prompt = String(state.inboxAiCurationPrompt || DEFAULT_INBOX_AI_CURATION_PROMPT).trim() || DEFAULT_INBOX_AI_CURATION_PROMPT;
  const expanded = Boolean(state.inboxAiCurationOpen);
  const showTokenInput = Boolean(state.capabilities?.requiresToken || hasRemoteAiConfigured() || isLocalUiRuntime());
  const providerLabel = result?.mode === 'local-preview'
    ? '로컬 미리보기'
    : (result?.provider || state.capabilities?.provider || 'AI');
  const buttonLabel = state.inboxAiCurationBusy
    ? 'AI 추천 중...'
    : state.capabilities?.aiSummarize
      ? 'AI로 주요/업계 추천'
      : '추천 리스트업 실행';
  const compactRunLabel = state.inboxAiCurationBusy ? '추천 중...' : '추천 실행';
  const summaryText = result
    ? `주요 보도 ${formatNumber((result.kakaoPicks || []).length)}건 · 업계 보도 ${formatNumber((result.industryPicks || []).length)}건`
    : `추천 전 · 주요/업계 후보 자동 분류`;

  return `
    <section class="inbox-ai-curation inbox-ai-recommendation ${expanded ? 'is-expanded' : 'is-collapsed'}">
      <div class="panel-heading">
        <div>
          <p class="panel-kicker">AI 추천</p>
          <h3>AI 기사 추천</h3>
          <p class="panel-note ai-curation-head-note">주요 보도와 업계 보도 후보를 나눠 바로 추가합니다.</p>
        </div>
        <div class="inline-actions compact">
          <span class="panel-pill tone-neutral">${escapeHtml(summaryText)}</span>
          <button class="primary-btn compact-run-btn" type="button" id="inbox-ai-curation-run-compact" ${state.inboxAiCurationBusy || !totalArticles ? 'disabled' : ''}>${escapeHtml(compactRunLabel)}</button>
          <button class="ghost-btn compact-toggle-btn" type="button" id="inbox-ai-curation-toggle" aria-expanded="${expanded}" aria-controls="inbox-ai-curation-body">${expanded ? '접기' : '펼치기'}</button>
        </div>
      </div>
      ${renderAiWorkStatus('inbox-ai')}
      ${expanded
        ? `
          <div class="collapsible-card-body" id="inbox-ai-curation-body">
            <div class="builder-chip-row preview-ai-chip-row">
              ${['주요 보도', '업계 보도', '사업 성과', '신규 서비스', 'AI·인프라', 'MOU·투자'].map((label) => `
                <span class="panel-pill tone-neutral">${escapeHtml(label)}</span>
              `).join('')}
            </div>
            <label class="detail-field ai-curation-field" for="inbox-ai-curation-prompt">
              <span>추천 기준 프롬프트</span>
              <textarea id="inbox-ai-curation-prompt" rows="5" placeholder="AI에 전달할 추천 기준을 입력하세요.">${escapeHtml(prompt)}</textarea>
            </label>
            ${showTokenInput
              ? `
                <label class="ai-token-field ai-curation-token">
                  <span>AI 접근 토큰</span>
                  <input
                    type="password"
                    id="inbox-ai-token"
                    autocomplete="off"
                    autocapitalize="none"
                    spellcheck="false"
                    placeholder="AI 접근 토큰 입력"
                    value="${escapeHtml(getStoredAiToken())}"
                  />
                </label>
              `
              : ''}
            <div class="inline-actions compact stack-mobile">
              <button class="primary-btn" type="button" id="inbox-ai-curation-run" ${state.inboxAiCurationBusy || !totalArticles ? 'disabled' : ''}>${escapeHtml(buttonLabel)}</button>
              <button class="ghost-btn" type="button" id="inbox-ai-curation-open-modal" ${result ? '' : 'disabled'}>추천 결과 보기</button>
              <button class="ghost-btn" type="button" id="inbox-ai-curation-reset" ${state.inboxAiCurationBusy ? 'disabled' : ''}>기본 프롬프트</button>
            </div>
            ${result
              ? `
                <div class="ai-curation-inline-summary">
                  <div class="ai-curation-summary-head">
                    <strong>${escapeHtml(providerLabel)}</strong>
                    <span>${escapeHtml(formatSavedTime(result.generatedAt) || '방금')}</span>
                  </div>
                  <p>${escapeHtml(result.summary || '추천 결과를 준비했습니다.')}</p>
                  <p class="ai-curation-trust">추천 결과는 중앙 모달에서 확인하고 바로 추가할 수 있습니다.</p>
                </div>
              `
              : `
                <div class="ai-curation-empty">
                  <p class="small-copy">추천 실행 후 사업 성과·신규 서비스·AI/인프라·임원 인터뷰·MOU·투자 신호가 있는 후보가 카드로 표시됩니다.</p>
                </div>
              `}
          </div>
        `
        : ''}
    </section>
  `;
}

function findDraftEntryKeyForArticle(article) {
  if (!article) return '';
  const sections = getReportSections();
  for (const sectionName of ['major', 'industry']) {
    const item = sections[sectionName].find((candidate) => articleKey(candidate) === articleKey(article));
    if (item) return draftEntryKey(sectionName, item);
  }
  return '';
}

function sendArticleToBuilderWithAi(article) {
  if (!article) return false;

  const snapshot = captureWorkspaceSnapshot();
  let entryKey = findDraftEntryKeyForArticle(article);
  let added = false;

  if (!entryKey) {
    const targetSection = article?.section === 'industry' ? 'industry' : 'major';
    const result = addArticleToReportSection(targetSection, article);
    if (!result.added) {
      if (result.reason === 'industry_to_main_blocked') {
        showToast('업계 보도 기사는 주요 보도로 올릴 수 없습니다.');
      }
      return false;
    }
    entryKey = state.builderFocusKey;
    added = true;
  } else {
    setBuilderFocus(entryKey);
  }

  if (added) {
    registerUndoAction('제안 문구가 채워진 기사를 빌더에 추가했습니다.', snapshot);
  }
  state.inboxPreviewOpen = false;
  state.builderSideView = 'draft';
  render('builder');
  return true;
}

function renderBuilderSuggestionContent() {
  const location = findDraftLocation(state.builderFocusKey);
  if (!location) {
    return `
      <div class="builder-suggestion-empty">
        ${renderDataEmpty('builder-suggestion-empty', '선택된 카드가 없습니다', '왼쪽에서 기사 카드를 선택하면 추천 관점을 확인할 수 있습니다.')}
      </div>
    `;
  }

  const insight = buildArticleAiInsight(location.item);
  const suggestionReasons = insight.reasons.filter((reason) => !/(직접적인 카카오|카카오 사업과 직접 연결)/u.test(reason));
  return `
    <div class="builder-suggestion-content" id="builder-suggestion-card">
      <div class="builder-suggestion-context">
        <span class="panel-pill tone-neutral">로컬 미리보기</span>
        <strong>${escapeHtml(location.item?.title || '기사')}</strong>
      </div>
      <div class="builder-suggestion-topline">
        ${renderAiPriorityPill(location.item)}
        <span class="panel-pill tone-neutral">${escapeHtml(insight.formatLabel)}</span>
        <span class="panel-pill tone-neutral">${escapeHtml(insight.toneLabel)}</span>
        ${insight.matchedThemes.slice(0, 2).map((theme) => `<span class="panel-pill tone-neutral">${escapeHtml(theme)}</span>`).join('')}
      </div>
      <div class="builder-suggestion-grid">
        <div class="builder-suggestion-block">
          <span>추천 관점</span>
          <strong>${escapeHtml(insight.draft.title)}</strong>
        </div>
        <div class="builder-suggestion-block">
          <span>요약칸 문구 제안</span>
          <p>${escapeHtml(insight.draft.summaryLead)}</p>
        </div>
        <div class="builder-suggestion-block">
          <span>한줄요약 문구 제안</span>
          <p>${escapeHtml(insight.draft.keyPoint)}</p>
        </div>
      </div>
      ${suggestionReasons.length
        ? `
          <ul class="builder-suggestion-reasons">
            ${suggestionReasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join('')}
          </ul>
        `
        : ''}
      <div class="inline-actions stack-mobile">
        <button class="primary-btn" type="button" data-builder-ai="${escapeHtml(state.builderFocusKey)}">기사 AI 정리</button>
        <button class="ghost-btn" id="builder-open-ai-source" ${location.item?.url ? '' : 'disabled'}>원문 보기</button>
      </div>
    </div>
  `;
}

async function curateInboxArticlesWithAi() {
  if (state.inboxAiCurationBusy) return;

  const prompt = String(state.inboxAiCurationPrompt || DEFAULT_INBOX_AI_CURATION_PROMPT).trim() || DEFAULT_INBOX_AI_CURATION_PROMPT;
  state.inboxAiCurationPrompt = prompt;
  state.inboxAiCurationOpen = true;
  state.inboxAiCurationBusy = true;
  state.inboxAiCurationModalOpen = false;
  beginAiWorkStatus(
    'inbox-curation',
    'inbox-ai',
    'AI 추천 기준으로 기사 분류 중',
    '사업 성과, 신규 서비스, AI/인프라, 임원 인터뷰, MOU, 투자 신호를 우선 확인하고 있습니다.'
  );
  renderInbox();

  let usedFallback = false;

  try {
    const capabilitiesPayload = await fetchAiCapabilities(state.config);
    state.capabilities = {
      aiSummarize: Boolean(capabilitiesPayload?.aiSummarize),
      provider: String(capabilitiesPayload?.provider || ''),
      model: String(capabilitiesPayload?.model || ''),
      requiresToken: Boolean(capabilitiesPayload?.requiresToken)
    };

    if (state.capabilities.aiSummarize) {
      if (state.capabilities.requiresToken && !getStoredAiToken()) {
        throw new Error('AI 접근 토큰을 먼저 입력해주세요.');
      }
      const payload = await requestAiArticleCuration(state.articles, prompt);
      state.inboxAiCurationResult = normalizeAiArticleCurationResult(payload, state.articles, prompt);
      state.inboxAiCurationModalOpen = true;
      completeAiWorkStatus(
        'inbox-curation',
        'inbox-ai',
        'AI 추천 완료',
        `주요 보도 ${formatNumber((state.inboxAiCurationResult.kakaoPicks || []).length)}건, 업계 보도 ${formatNumber((state.inboxAiCurationResult.industryPicks || []).length)}건을 준비했습니다.`
      );
      showToast('AI 추천 결과를 준비했습니다.');
      return;
    }

    usedFallback = true;
    state.inboxAiCurationResult = buildLocalAiArticleCuration(state.articles, prompt);
    state.inboxAiCurationModalOpen = true;
    completeAiWorkStatus(
      'inbox-curation',
      'inbox-ai',
      '로컬 기준 추천 완료',
      `주요 보도 ${formatNumber((state.inboxAiCurationResult.kakaoPicks || []).length)}건, 업계 보도 ${formatNumber((state.inboxAiCurationResult.industryPicks || []).length)}건을 준비했습니다.`
    );
    showToast('로컬 기준 추천을 표시합니다.');
  } catch (error) {
    usedFallback = true;
    state.inboxAiCurationResult = buildLocalAiArticleCuration(state.articles, prompt);
    state.inboxAiCurationModalOpen = true;
    completeAiWorkStatus(
      'inbox-curation',
      'inbox-ai',
      '로컬 기준 추천 완료',
      `${error instanceof Error ? error.message : 'AI 추천에 실패했습니다.'} 로컬 기준으로 후보를 표시했습니다.`,
      'error'
    );
    showToast(`${error instanceof Error ? error.message : 'AI 추천에 실패했습니다.'} 로컬 기준으로 표시합니다.`);
  } finally {
    state.inboxAiCurationBusy = false;
    renderInbox();
    if (usedFallback) {
      pushActivityLog({
        title: 'AI 기사 추천 실행',
        detail: '로컬 기준으로 주요/업계 추천 리스트를 준비했습니다.',
        tone: 'reported',
        page: 'inbox'
      });
    } else {
      pushActivityLog({
        title: 'AI 기사 추천 실행',
        detail: 'AI로 주요/업계 추천 리스트를 준비했습니다.',
        tone: 'warning',
        page: 'inbox'
      });
    }
  }
}

function byteLength(text) {
  return new TextEncoder().encode(String(text || '')).length;
}

function splitByBytes(text, maxBytes = 500) {
  const lines = String(text || '').split('\n');
  const segments = [];
  let current = '';

  const pushCurrent = () => {
    if (!current) return;
    segments.push(current);
    current = '';
  };

  for (const line of lines) {
    const candidate = current ? `${current}\n${line}` : line;
    if (byteLength(candidate) <= maxBytes) {
      current = candidate;
      continue;
    }

    pushCurrent();

    if (byteLength(line) <= maxBytes) {
      current = line;
      continue;
    }

    let chunk = '';
    for (const char of line) {
      const next = `${chunk}${char}`;
      if (byteLength(next) > maxBytes) {
        segments.push(chunk);
        chunk = char;
      } else {
        chunk = next;
      }
    }
    current = chunk;
  }

  pushCurrent();

  return segments.map((content, index) => ({
    order: index + 1,
    bytes: byteLength(content),
    content
  }));
}

function trimKakaoLine(text, maxLength = 54) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trim()}…`;
}

function estimateKakaoPreviewLineCount(text, maxLineChars = 18) {
  return String(text || '')
    .split('\n')
    .reduce((total, line) => total + Math.max(1, Math.ceil(Math.max(line.length, 1) / maxLineChars)), 0);
}

function splitLineByChars(line, maxChars) {
  const source = String(line || '');
  if (characterLength(source) <= maxChars) {
    return [source];
  }

  const chunks = [];
  let cursor = 0;
  while (cursor < source.length) {
    chunks.push(source.slice(cursor, cursor + maxChars));
    cursor += maxChars;
  }
  return chunks;
}

function splitKakaoPreviewBlock(block, maxChars) {
  const lines = String(block || '').split('\n');
  const chunks = [];
  let current = '';

  for (const line of lines) {
    if (characterLength(line) > maxChars) {
      if (current) {
        chunks.push(current);
        current = '';
      }
      splitLineByChars(line, maxChars).forEach((piece) => {
        if (piece) {
          chunks.push(piece);
        }
      });
      continue;
    }

    const candidate = current ? `${current}\n${line}` : line;
    if (current && characterLength(candidate) > maxChars) {
      chunks.push(current);
      current = line;
      continue;
    }
    current = candidate;
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

function buildKakaoArticleLines(article) {
  const headline = trimKakaoLine(articleSummaryLead(article), 30) || trimKakaoLine(article.title, 30);
  const point = trimKakaoLine(articleKeyPoint(article), 40);
  const detailLines = point && point !== headline ? [point] : [];

  return [
    `ㅇ ${headline}`,
    ...detailLines.map((line) => `- ${line}`),
    `▶ ${article.title} (${mediaLabel(article)})`,
    article.url || ''
  ].filter(Boolean);
}

function buildKakaoBlocks() {
  const sections = [
    { title: '1. 주요 보도', items: getReportSections().major },
    { title: '2. 업계 보도', items: getReportSections().industry }
  ];

  const blocks = [];
  sections.forEach((section, sectionIndex) => {
    section.items.forEach((article, articleIndex) => {
      const lines = [];
      if (blocks.length === 0) {
        lines.push(`${formatDateLabel(state.date)} Daily Comm Report`);
        lines.push('');
      }
      if (articleIndex === 0) {
        lines.push(section.title);
      }
      lines.push(...buildKakaoArticleLines(article));
      blocks.push(lines.join('\n'));
    });
  });

  if (!blocks.length) {
    return [`${formatDateLabel(state.date)} Daily Comm Report\n\n리포트 빌더 결과가 아직 없습니다.`];
  }

  return blocks;
}

function buildKakaoPreviewText() {
  return buildKakaoBlocks().join('\n\n');
}

function normalizeComparableDraftText(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function hasReportDraftChanged(previousText, nextText) {
  return normalizeComparableDraftText(previousText) !== normalizeComparableDraftText(nextText);
}

function getCurrentReportText() {
  const draftText = String(state.reportTextDraft || '').trim();
  return draftText || buildKakaoPreviewText();
}

function getCurrentReportBlocks() {
  const draftText = String(state.reportTextDraft || '').trim();
  if (!draftText) {
    return buildKakaoBlocks();
  }

  const blocks = draftText
    .split(/\n{2,}/u)
    .map((block) => block.trim())
    .filter(Boolean);

  return blocks.length ? blocks : buildKakaoBlocks();
}

function buildKakaoPreviewSegments(maxChars = KAKAO_SEGMENT_CHAR_LIMIT) {
  const blocks = getCurrentReportBlocks();
  const segments = [];
  let current = '';

  blocks.forEach((block) => {
    const normalizedBlock = String(block || '').trim();
    if (!normalizedBlock) {
      return;
    }

    const blockParts = characterLength(normalizedBlock) > maxChars
      ? splitKakaoPreviewBlock(normalizedBlock, maxChars)
      : [normalizedBlock];

    blockParts.forEach((part) => {
      const candidate = current ? `${current}\n\n${part}` : part;
      if (current && characterLength(candidate) > maxChars) {
        segments.push(current);
        current = part;
        return;
      }
      current = candidate;
    });
  });

  if (current) {
    segments.push(current);
  }

  return segments.map((content, index) => ({
    order: index + 1,
    bytes: byteLength(content),
    chars: content.length,
    lineCount: estimateKakaoPreviewLineCount(content),
    content
  }));
}

function getCurrentKakaoSegmentCount() {
  const sections = getReportSections();
  const reportCount = sections.major.length + sections.industry.length;
  if (!reportCount) return 0;
  return buildKakaoPreviewSegments().length;
}

function renderAlertTestCard(alertPolicy) {
  const result = state.settingsAlertTestResult;
  const deliveryLabel = formatAlertDeliveryLabel(alertPolicy);
  return `
    <article class="card settings-card settings-alert-card">
      <div class="panel-heading">
        <div>
          <p class="panel-kicker">Alert Check</p>
          <h3>장애 알림 점검</h3>
        </div>
        <span class="panel-pill tone-neutral">${escapeHtml(String(alertPolicy?.channel || 'email').toUpperCase())}</span>
      </div>
      <div class="settings-list">
        <div class="settings-row">
          <strong>전달 방식</strong>
          <span>${escapeHtml(deliveryLabel)}</span>
        </div>
        <div class="settings-row">
          <strong>트리거 조건</strong>
          <span>${formatNumber(alertPolicy?.consecutiveFailures || 0)}회 연속 실패</span>
        </div>
      </div>
      <div class="inline-actions compact stack-mobile">
        <button class="primary-btn" id="settings-alert-test" ${state.settingsAlertTestBusy ? 'disabled' : ''}>
          ${state.settingsAlertTestBusy ? '점검 중...' : '테스트 알림 점검'}
        </button>
      </div>
      ${result
        ? `<div class="builder-import-status is-${escapeHtml(result.state || 'ready')}">
            <strong>${escapeHtml(result.title || '점검 결과')}</strong>
            <p>${escapeHtml(result.description || '')}</p>
            ${result.meta ? `<p class="small-copy">${escapeHtml(result.meta)}</p>` : ''}
          </div>`
        : ''}
    </article>
  `;
}

function formatAlertDeliveryLabel(alertPolicy) {
  const enabled = Boolean(alertPolicy?.enabled);
  const channel = String(alertPolicy?.channel || 'email').trim().toLowerCase();
  const hasRecipient = Boolean(String(alertPolicy?.recipient || '').trim());

  if (!enabled) return '비활성';
  if (!hasRecipient) return '수신처 미지정';
  if (channel === 'email') return 'email로 전달됩니다';
  return `${String(alertPolicy?.channel || '알림').toUpperCase()} 채널로 전달됩니다`;
}

function renderSettingsPolicySummaryCard({ settingsPolicyRows, alertPolicy, deployment, compact = false }) {
  return `
    <article class="card settings-card settings-policy-summary-card">
      <div class="panel-heading">
        <div>
          <p class="panel-kicker">Operations Policy</p>
          <h3>운영 정책 요약</h3>
        </div>
        <span class="panel-pill">${formatNumber(settingsPolicyRows.length)}개</span>
      </div>
      <div class="settings-trust-banner">
        <strong>장애 알림은 ${escapeHtml(formatAlertDeliveryLabel(alertPolicy))}.</strong>
        <span>배포 공개 범위 ${escapeHtml(formatSettingsVisibility(deployment.visibility))} · 마지막 데이터 ${escapeHtml(formatDateTime(state.articleMeta?.generatedAt || state.report?.generatedAt))}</span>
      </div>
      <div class="settings-list">
        ${settingsPolicyRows.map((row) => `
          <div class="settings-row">
            <strong>${escapeHtml(row.label)}</strong>
            <div class="settings-row-copy">
              <span>${escapeHtml(row.value)}</span>
              ${!compact && row.impact ? `<small>${escapeHtml(row.impact)}</small>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    </article>
  `;
}

function renderSettingsPolicyModal({ settingsPolicyRows, alertPolicy, deployment }) {
  if (!state.settingsPolicyModalOpen) return '';

  return `
    <div class="settings-modal-backdrop" id="settings-policy-modal-backdrop" role="presentation">
      <section class="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-policy-modal-title">
        <div class="panel-heading settings-modal-head">
          <div>
            <p class="panel-kicker">Operations Policy</p>
            <h3 id="settings-policy-modal-title">운영 정책 보기</h3>
          </div>
          <button class="ghost-btn" id="close-settings-policy-modal">닫기</button>
        </div>
        <div class="settings-modal-body">
          ${renderSettingsPolicySummaryCard({ settingsPolicyRows, alertPolicy, deployment, compact: true })}
          ${renderAlertTestCard(alertPolicy)}
        </div>
      </section>
    </div>
  `;
}

function isKeywordWordChar(char) {
  return Boolean(char && /[\p{L}\p{N}]/u.test(char));
}

function startsWithKoreanPostposition(value) {
  const source = String(value || '');
  return [
    '으로부터',
    '으로써',
    '으로서',
    '에서',
    '에게',
    '까지',
    '부터',
    '처럼',
    '보다',
    '으로',
    '라고',
    '라며',
    '이며',
    '은',
    '는',
    '이',
    '가',
    '을',
    '를',
    '의',
    '에',
    '와',
    '과',
    '도',
    '만',
    '로'
  ].some((postposition) => source.startsWith(postposition));
}

function isExactKeywordBoundary(source, start, end) {
  const before = source[start - 1] || '';
  const after = source[end] || '';
  const beforeOk = !isKeywordWordChar(before);
  const afterOk = !after || !isKeywordWordChar(after) || startsWithKoreanPostposition(source.slice(end));
  return beforeOk && afterOk;
}

function keywordMatchRanges(text, keyword) {
  const source = String(text || '');
  const target = String(keyword || '').trim();
  if (!source || !target) return [];

  const lowerSource = source.toLocaleLowerCase('ko-KR');
  const lowerTarget = target.toLocaleLowerCase('ko-KR');
  const ranges = [];
  let index = 0;

  while (index <= lowerSource.length) {
    const start = lowerSource.indexOf(lowerTarget, index);
    if (start === -1) break;
    const end = start + lowerTarget.length;
    if (isExactKeywordBoundary(source, start, end)) {
      ranges.push({ start, end, keyword: target });
    }
    index = Math.max(end, start + 1);
  }

  return ranges;
}

function articleDisplayKeywordSources(article) {
  return [
    article?.title,
    article?.summary
  ].map((value) => String(value || '').trim()).filter(Boolean);
}

function articleHasKeywordInDisplayText(article, keyword) {
  const target = String(keyword || '').trim();
  if (!target) return false;
  return articleDisplayKeywordSources(article).some((source) => keywordMatchRanges(source, target).length > 0);
}

function articleMatchesInboxKeywordToken(article, token) {
  const { sectionName, keyword } = parseInboxKeywordToken(token);
  if (!sectionName || !keyword) return false;
  if (String(article?.section || '') !== sectionName) return false;
  return articleHasKeywordInDisplayText(article, keyword);
}

function activeInboxKeywordFiltersForArticle(article) {
  return inboxKeywordFilterTokens()
    .map((token) => parseInboxKeywordToken(token))
    .filter(({ sectionName, keyword }) => sectionName === article?.section && keyword)
    .map(({ keyword }) => keyword);
}

function collectKeywordHighlightRanges(text, keywords) {
  const source = String(text || '');
  const candidates = [...new Set(
    keywords.map((keyword) => String(keyword || '').trim()).filter(Boolean)
  )];
  const ranges = candidates.flatMap((keyword) => keywordMatchRanges(source, keyword));

  return ranges
    .sort((left, right) => left.start - right.start || (right.end - right.start) - (left.end - left.start))
    .reduce((acc, range) => {
      const overlaps = acc.some((item) => range.start < item.end && range.end > item.start);
      return overlaps ? acc : [...acc, range];
    }, [])
    .sort((left, right) => left.start - right.start);
}

function highlightKeywordsForText(text, article) {
  const source = String(text || '');
  const activeKeywords = activeInboxKeywordFiltersForArticle(article)
    .filter((keyword) => keywordMatchRanges(source, keyword).length > 0);
  if (activeKeywords.length) {
    return [...new Set(activeKeywords)].sort((a, b) => b.length - a.length);
  }

  const candidates = [
    article?.keyword,
    ...keywordList().filter((keyword) => {
      const candidate = String(keyword || '').trim();
      return candidate ? keywordMatchRanges(source, candidate).length > 0 : false;
    })
  ]
    .map((keyword) => String(keyword || '').trim())
    .filter((keyword) => keyword && keywordMatchRanges(source, keyword).length > 0);

  return [...new Set(candidates)].sort((a, b) => b.length - a.length);
}

function renderKeywordHighlights(text, keywords) {
  const source = String(text || '');
  if (keywords.length === 0) return escapeHtml(source);

  const ranges = collectKeywordHighlightRanges(source, keywords);
  if (!ranges.length) return escapeHtml(source);

  let cursor = 0;
  let html = '';

  for (const range of ranges) {
    const start = range.start;
    const end = range.end;
    html += escapeHtml(source.slice(cursor, start));
    html += `<mark class="keyword-highlight">${escapeHtml(source.slice(start, end))}</mark>`;
    cursor = end;
  }

  html += escapeHtml(source.slice(cursor));
  return html;
}

function highlightTitleKeywords(title, article) {
  const text = String(title || '');
  const keywords = highlightKeywordsForText(text, article);
  return renderKeywordHighlights(text, keywords);
}

function highlightSummaryKeywords(summary, article, maxLength = 120) {
  const text = String(summary || '').trim();
  if (!text) return '';

  const keywords = highlightKeywordsForText(text, article);
  if (keywords.length === 0) {
    return escapeHtml(text.length > maxLength ? `${text.slice(0, Math.max(maxLength - 1, 1)).trimEnd()}…` : text);
  }

  const ranges = collectKeywordHighlightRanges(text, keywords);
  const firstMatch = ranges[0];
  if (!firstMatch) {
    return renderKeywordHighlights(text.length > maxLength ? `${text.slice(0, Math.max(maxLength - 1, 1)).trimEnd()}…` : text, keywords);
  }

  const firstIndex = firstMatch.start;
  const firstLength = firstMatch.end - firstMatch.start;
  const totalLength = text.length;
  let excerptStart = 0;

  if (totalLength > maxLength) {
    const centeredStart = Math.max(0, firstIndex - Math.floor((maxLength - firstLength) / 2));
    excerptStart = Math.min(centeredStart, Math.max(totalLength - maxLength, 0));
  }

  const excerptEnd = Math.min(totalLength, excerptStart + maxLength);
  const excerpt = text.slice(excerptStart, excerptEnd).trim();
  const prefix = excerptStart > 0 ? '…' : '';
  const suffix = excerptEnd < totalLength ? '…' : '';
  return `${prefix}${renderKeywordHighlights(excerpt, keywords)}${suffix}`;
}

function articleStatus(article) {
  if (!article?.url) return 'failed';
  const { isMainReport, isIndustryReport } = reportMembership(article);
  if (isMainReport) return 'selected';
  if (isIndustryReport) return 'reported';
  return 'pending';
}

function isArticleAssigned(article) {
  const { isMainReport, isIndustryReport } = reportMembership(article);
  return isMainReport || isIndustryReport;
}

function updateShellMeta() {
  const meta = pageMeta[state.activePage] || pageMeta.dashboard;
  const freshness = getDataFreshnessState();
  chrome.kicker.textContent = meta.kicker;
  chrome.title.textContent = meta.title;
  chrome.subtitle.textContent = freshness.isLagging
    ? `${meta.subtitle} 현재 ${formatDateLabel(state.date)} 데이터 기준`
    : meta.subtitle;

  const sections = getReportSections();
  const majorCount = sections.major.length;
  const industryCount = sections.industry.length;
  const reportCount = sections.major.length + sections.industry.length;
  const segmentCount = getCurrentKakaoSegmentCount();
  const coverageRatio = state.articles.length ? Math.round((reportCount / state.articles.length) * 100) : 0;

  chrome.date.textContent = freshness.pillLabel;
  chrome.date.classList.toggle('is-warning', freshness.isLagging);
  chrome.date.setAttribute('title', freshness.runtimeLabel);
  chrome.runtimeGenerated.textContent = formatDateTime(state.articleMeta?.generatedAt || state.report?.generatedAt);
  chrome.runtimeUsable.textContent = `${formatNumber(reportCount)}/${formatNumber(state.articles.length)} (${formatNumber(coverageRatio)}%)`;
  if (chrome.runtimeCompact) {
    chrome.runtimeCompact.textContent = `${formatNumber(reportCount)}/${formatNumber(state.articles.length)} (${formatNumber(coverageRatio)}%)`;
  }
  chrome.runtimeReport.textContent = `${formatNumber(majorCount)}/${formatNumber(industryCount)}`;
  chrome.runtimeSegments.textContent = `${formatNumber(segmentCount)}개`;

  if (state.loading) {
    chrome.runtimeStatus.hidden = false;
    chrome.runtimeStatus.textContent = state.loadingMessage || '데이터를 불러오는 중입니다.';
  } else if (state.loadError) {
    chrome.runtimeStatus.hidden = false;
    chrome.runtimeStatus.textContent = '데이터 연결을 확인해 주세요.';
  } else if (freshness.isLagging) {
    chrome.runtimeStatus.hidden = false;
    chrome.runtimeStatus.textContent = freshness.runtimeLabel;
  } else if (!state.articles.length) {
    chrome.runtimeStatus.hidden = false;
    chrome.runtimeStatus.textContent = '기사 데이터가 아직 없습니다.';
  } else {
    chrome.runtimeStatus.textContent = '';
    chrome.runtimeStatus.hidden = true;
  }
  chrome.runtimeStatus.classList.toggle('is-warning', !state.loading && !state.loadError && freshness.isLagging);

  syncRuntimePanel();
  updateWorkspaceActions();
}

function syncRuntimePanel() {
  const runtimeCard = chrome.runtimeCard;
  const runtimeToggle = chrome.runtimeToggle;
  const runtimeDetails = chrome.runtimeDetails;
  if (!runtimeCard || !runtimeToggle || !runtimeDetails) return;

  const collapsible = window.matchMedia('(max-width: 640px)').matches;
  const forceExpanded = state.loading || Boolean(state.loadError);
  const expanded = !collapsible || forceExpanded || state.runtimePanelOpen;

  runtimeCard.classList.toggle('is-collapsible', collapsible);
  runtimeCard.classList.toggle('is-open', expanded);
  runtimeToggle.hidden = !collapsible;
  runtimeToggle.disabled = forceExpanded;
  runtimeToggle.setAttribute('aria-expanded', String(expanded));
  runtimeToggle.textContent = expanded ? '접기' : '펼치기';
  runtimeDetails.hidden = collapsible && !expanded;
}

chrome.runtimeToggle?.addEventListener('click', () => {
  if (state.loading || state.loadError) return;
  state.runtimePanelOpen = !state.runtimePanelOpen;
  syncRuntimePanel();
});

window.addEventListener('resize', () => {
  syncRuntimePanel();
});

function updateWorkspaceActions() {
  if (chrome.runCrawl) {
    chrome.runCrawl.classList.add('hidden');
  }

  if (!chrome.openReport) return;

  const actionByPage = {
    dashboard: { label: '기사 선택하기', targetPage: 'inbox', ariaLabel: 'Select Articles' },
    inbox: { label: '초안 만들기', targetPage: 'builder', ariaLabel: 'Build Report Draft' },
    builder: { label: '카카오 검수하기', targetPage: 'kakao', ariaLabel: 'Review Kakao Preview' },
    kakao: { label: '초안 수정하기', targetPage: 'builder', ariaLabel: 'Edit Report Draft' },
    settings: { label: '초안 만들기', targetPage: 'builder', ariaLabel: 'Build Report Draft' }
  };

  const action = actionByPage[state.activePage] || null;
  if (!action || action.targetPage === state.activePage) {
    chrome.openReport.classList.add('hidden');
    chrome.openReport.disabled = true;
    delete chrome.openReport.dataset.targetPage;
    return;
  }

  chrome.openReport.classList.remove('hidden');
  chrome.openReport.disabled = false;
  chrome.openReport.dataset.targetPage = action.targetPage;
  chrome.openReport.textContent = action.label;
  chrome.openReport.setAttribute('aria-label', action.ariaLabel);
}

function setActiveNav() {
  pageButtons.forEach((button) => {
    const active = button.dataset.page === state.activePage;
    button.classList.toggle('active', active);
    if (active) {
      button.setAttribute('aria-current', 'page');
    } else {
      button.removeAttribute('aria-current');
    }
  });
}

function renderAnnotation(id) {
  return `<span class="annotation">${escapeHtml(id)}</span>`;
}

function currentLoadingStepIndex() {
  const index = LOADING_STEPS.findIndex((step) => step.id === state.loadingPhase);
  return index === -1 ? 0 : index;
}

function renderLoading() {
  const currentStepIndex = currentLoadingStepIndex();
  const currentStepCount = Math.min(currentStepIndex + 1, LOADING_STEPS.length);
  const loadingMessage = state.loadingMessage || '데이터를 확인 중입니다.';
  const loadingStageMarkup = LOADING_STEPS.map((step, index) => {
    const status = index < currentStepIndex ? 'done' : index === currentStepIndex ? 'current' : 'pending';
    const statusLabel = status === 'done' ? '완료' : status === 'current' ? '진행 중' : '대기';

    return `
      <li class="loading-stage" data-state="${status}">
        <div class="loading-stage-head">
          <span class="loading-stage-dot" aria-hidden="true"></span>
          <span class="loading-stage-status">${statusLabel}</span>
        </div>
        <strong>${escapeHtml(step.label)}</strong>
        <small>${escapeHtml(step.description)}</small>
      </li>
    `;
  }).join('');

  app.innerHTML = `
    <section class="page page-state loading-page">
      <article class="card state-card loading-card" role="status" aria-live="polite" aria-busy="true">
        <div class="loading-ambient" aria-hidden="true">
          <span class="loading-orb loading-orb-a"></span>
          <span class="loading-orb loading-orb-b"></span>
          <span class="loading-orb loading-orb-c"></span>
        </div>
        ${renderAnnotation('SCR-STATE-LOADING')}
        <div class="loading-intro">
          <div class="loading-copy">
            <span class="panel-kicker">Workspace Sync</span>
            <div class="loading-title-row">
              <h3>불러오는 중</h3>
              <span class="status-badge loading-progress">${currentStepCount} / ${LOADING_STEPS.length} 단계</span>
            </div>
            <p>${escapeHtml(loadingMessage)}</p>
          </div>
          <div class="loading-radar" aria-hidden="true">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
        <ol class="loading-stage-list" aria-label="로딩 단계">
          ${loadingStageMarkup}
        </ol>
        <div class="loading-skeleton-grid" aria-hidden="true">
          <div class="loading-skeleton-main">
            <section class="loading-skeleton-panel loading-skeleton-hero">
              <span class="loading-skeleton-line loading-skeleton-kicker"></span>
              <span class="loading-skeleton-line loading-skeleton-title"></span>
              <span class="loading-skeleton-line loading-skeleton-copy"></span>
              <div class="loading-skeleton-chip-row">
                <span class="loading-skeleton-chip"></span>
                <span class="loading-skeleton-chip"></span>
                <span class="loading-skeleton-chip"></span>
              </div>
            </section>
            <section class="loading-skeleton-panel loading-skeleton-list">
              <span class="loading-skeleton-line loading-skeleton-section-title"></span>
              <div class="loading-skeleton-list-item">
                <span class="loading-skeleton-avatar"></span>
                <div class="loading-skeleton-stack">
                  <span class="loading-skeleton-line"></span>
                  <span class="loading-skeleton-line loading-skeleton-copy"></span>
                </div>
              </div>
              <div class="loading-skeleton-list-item">
                <span class="loading-skeleton-avatar"></span>
                <div class="loading-skeleton-stack">
                  <span class="loading-skeleton-line"></span>
                  <span class="loading-skeleton-line loading-skeleton-copy"></span>
                </div>
              </div>
            </section>
          </div>
          <aside class="loading-skeleton-panel loading-skeleton-side">
            <span class="loading-skeleton-line loading-skeleton-section-title"></span>
            <span class="loading-skeleton-line loading-skeleton-copy"></span>
            <span class="loading-skeleton-line loading-skeleton-copy"></span>
            <div class="loading-skeleton-stat-grid">
              <span class="loading-skeleton-stat"></span>
              <span class="loading-skeleton-stat"></span>
              <span class="loading-skeleton-stat"></span>
              <span class="loading-skeleton-stat"></span>
            </div>
          </aside>
        </div>
      </article>
    </section>
  `;
}

function renderError() {
  app.innerHTML = `
    <section class="page page-state">
      <article class="card state-card error-card">
        ${renderAnnotation('SCR-STATE-ERROR')}
        <h3>데이터를 표시할 수 없습니다</h3>
        <p>${escapeHtml(state.loadError || '필수 아티팩트 로딩에 실패했습니다.')}</p>
        <div class="inline-actions">
          <button class="ghost-btn" id="retry-load">다시 불러오기</button>
        </div>
      </article>
    </section>
  `;

  document.getElementById('retry-load').addEventListener('click', () => {
    void loadData();
  });
}

function renderDataEmpty(id, title, description) {
  return `
    <div class="empty-state" id="${id}">
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(description)}</p>
    </div>
  `;
}

function renderFreshnessBanner() {
  const freshness = getDataFreshnessState();
  if (!freshness.isLagging) return '';

  return `
    <article class="card freshness-banner">
      <div>
        <p class="panel-kicker">최신성 경고</p>
        <h3>${escapeHtml(formatDateLabel(state.date))} 데이터입니다</h3>
      </div>
      <p>${escapeHtml(freshness.runtimeLabel)}</p>
    </article>
  `;
}

function mountGlobalFreshnessBanner() {
  const freshness = getDataFreshnessState();
  if (!freshness.isLagging || state.loading || state.loadError) return;
  if (app.querySelector('.freshness-banner')) return;

  const page = app.querySelector('.page');
  if (!page) return;
  page.insertAdjacentHTML('afterbegin', renderFreshnessBanner());
}

function buildTrendItems() {
  const keywords = keywordList().slice(0, 6);
  const source = state.articles;
  const fallbackKeywords = Array.from(new Set(source.map((article) => article.keyword).filter(Boolean))).slice(0, 6);
  const items = (keywords.length ? keywords : fallbackKeywords).map((keyword) => ({
    keyword,
    count: source.filter((article) => article.title?.includes(keyword) || article.keyword === keyword).length
  }));
  const max = Math.max(...items.map((item) => item.count), 1);
  return items.map((item) => ({
    ...item,
    percent: Math.max(12, Math.round((item.count / max) * 100))
  }));
}

function buildMediaDistribution() {
  const counts = state.articles.reduce((acc, article) => {
    const key = mediaLabel(article);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const max = Math.max(...Object.values(counts), 1);
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, count]) => ({
      name,
      count,
      percent: Math.max(14, Math.round((count / max) * 100))
    }));
}

function buildRunLogs() {
  const stats = getStats();
  const stamp = state.articleMeta?.generatedAt || state.report?.generatedAt || new Date().toISOString();
  return [
    {
      time: formatDateTime(stamp),
      label: 'Crawl output',
      status: stats.invalidUrlDropped || stats.unusableCandidateDropped || stats.emptyTitleDropped ? 'warning' : 'reported',
      detail: `${formatNumber(stats.totalDeduped || state.articles.length)} usable articles`
    },
    {
      time: formatDateTime(stamp),
      label: 'Validation',
      status: stats.invalidUrlDropped ? 'failed' : 'selected',
      detail: `${formatNumber(stats.invalidUrlDropped || 0)} invalid links`
    },
    {
      time: formatDateTime(stamp),
      label: 'Segmentation',
      status: state.segments.length ? 'reported' : 'pending',
      detail: `${formatNumber(state.segments.length)} Kakao parts`
    }
  ];
}

function renderDashboard() {
  const stats = getStats();
  const sections = getReportSections();
  const reported = sections.major.length + sections.industry.length;
  const total = state.articles.length;
  const pending = Math.max(total - reported, 0);
  const failed = (stats.invalidUrlDropped || 0) + (stats.unusableCandidateDropped || 0);
  const trendItems = buildTrendItems();
  const mediaItems = buildMediaDistribution();
  const runLogs = buildRunLogs();
  const spotlight = state.articles.slice(0, 5);
  const coverageRatio = total ? Math.round((reported / total) * 100) : 0;

  app.innerHTML = `
    <section class="page" id="dashboard-page">
      <article class="hero-panel">
        <div>
          ${renderAnnotation('SCR-DASH-HERO-001')}
          <p class="hero-kicker">Report Overview</p>
          <h3>${formatDateLabel(state.date)} Daily Comm Report</h3>
          <p class="hero-copy">크롤링 결과, 보고서 구성, 카카오 세그먼트를 한 번에 점검할 수 있는 운영형 메인 화면입니다.</p>
        </div>
        <div class="hero-stack">
          <div class="hero-chip">
            <span>Pipeline status: stable</span>
            <strong>${formatNumber(total)} articles</strong>
          </div>
          <div class="hero-chip">
            <span>Coverage ratio</span>
            <strong>${coverageRatio}%</strong>
          </div>
          <div class="hero-chip">
            <span>Segments ready</span>
            <strong>${formatNumber(state.segments.length)}</strong>
          </div>
        </div>
      </article>

      <div class="kpi-grid">
        ${[
          ['Total Articles', '오늘 수집', total],
          ['Pending', '미반영 기사', pending],
          ['Selected', '주요 보도', selected],
          ['Reported', '리포트 반영', reported],
          ['Failed', '실패 / 드롭', failed]
        ].map(([caption, label, value], index) => `
          <article class="card kpi-card">
            ${renderAnnotation(`SCR-DASH-CARD-00${index + 1}`)}
            <p class="metric-caption">${caption}</p>
            <h3>${escapeHtml(label)}</h3>
            <p class="kpi-value">${formatNumber(value)}</p>
          </article>
        `).join('')}
      </div>

      <div class="dashboard-grid">
        <article class="card panel-card">
          ${renderAnnotation('SCR-DASH-LOG-001')}
          <div class="panel-heading">
            <div>
              <p class="panel-kicker">Operations</p>
              <h3>Recent Crawl Log</h3>
            </div>
            <button class="ghost-btn" id="go-inbox">인박스 보기</button>
          </div>
          <div class="dashboard-activity-block">
            <div class="panel-heading">
              <div>
                <p class="panel-kicker">Recent Work</p>
                <h3>최근 작업 로그</h3>
              </div>
              <span class="panel-pill tone-neutral">${formatNumber(state.activityLog.length)}건</span>
            </div>
            ${renderRecentActivityLog()}
          </div>
          <div class="run-log-list">
            ${runLogs.map((row) => `
              <div class="run-log-row">
                <div>
                  <strong>${escapeHtml(row.label)}</strong>
                  <p>${escapeHtml(row.time)}</p>
                </div>
                <span class="status-badge status-${escapeHtml(row.status)}">${escapeHtml(row.status)}</span>
                <p class="run-log-detail">${escapeHtml(row.detail)}</p>
              </div>
            `).join('')}
          </div>
          <div class="spotlight-list">
            ${spotlight.length
              ? spotlight.map((article, index) => `
                <button class="spotlight-item" data-open="${index}">
                  <span class="spotlight-tag ${sectionBadgeClass(article.section)}">${escapeHtml(sectionLabel(article.section))}</span>
                  <strong>${escapeHtml(article.title)}</strong>
                  <p>${escapeHtml(article.summary || '')}</p>
                </button>
              `).join('')
              : renderDataEmpty('dashboard-empty', '표시할 기사가 없습니다', '기사 데이터가 비어 있어 최근 로그를 만들 수 없습니다.')}
          </div>
        </article>

        <article class="card panel-card">
          ${renderAnnotation('SCR-DASH-TREND-001')}
          <div class="panel-heading">
            <div>
              <p class="panel-kicker">Trend</p>
              <h3>Keyword Trends</h3>
            </div>
            <span class="panel-pill">${formatNumber(stats.droppedLowRelevanceCount || 0)} low relevance dropped</span>
          </div>
          <div class="trend-list">
            ${trendItems.length
              ? trendItems.map((item) => `
                <div class="trend-row">
                  <div class="trend-labels">
                    <strong>${escapeHtml(item.keyword)}</strong>
                    <span>${formatNumber(item.count)}</span>
                  </div>
                  <div class="trend-track"><span style="width:${item.percent}%"></span></div>
                </div>
              `).join('')
              : renderDataEmpty('trend-empty', '키워드 데이터가 없습니다', '설정 파일에서 키워드를 읽지 못했습니다.')}
          </div>
        </article>

        <article class="card panel-card">
          ${renderAnnotation('SCR-DASH-MEDIA-001')}
          <div class="panel-heading">
            <div>
              <p class="panel-kicker">Distribution</p>
              <h3>Media Distribution</h3>
            </div>
            <span class="panel-pill">${formatNumber(mediaItems.length)} media</span>
          </div>
          <div class="distribution-list">
            ${mediaItems.length
              ? mediaItems.map((item) => `
                <div class="distribution-row">
                  <div class="distribution-labels">
                    <strong>${escapeHtml(item.name)}</strong>
                    <span>${formatNumber(item.count)}</span>
                  </div>
                  <div class="distribution-track"><span style="width:${item.percent}%"></span></div>
                </div>
              `).join('')
              : renderDataEmpty('media-empty', '매체 분포가 없습니다', '수집된 기사 출처를 집계할 수 없습니다.')}
          </div>
        </article>

        <article class="card panel-card">
          ${renderAnnotation('SCR-DASH-COMP-001')}
          <div class="panel-heading">
            <div>
              <p class="panel-kicker">Report</p>
              <h3>Composition Snapshot</h3>
            </div>
            <span class="panel-pill">${formatNumber(sections.major.length + sections.industry.length)} report items</span>
          </div>
          <div class="snapshot-grid">
            <div class="snapshot-card">
              <span>주요 보도</span>
              <strong>${formatNumber(sections.major.length)}</strong>
            </div>
            <div class="snapshot-card">
              <span>업계 보도</span>
              <strong>${formatNumber(sections.industry.length)}</strong>
            </div>
            <div class="snapshot-card">
              <span>세그먼트</span>
              <strong>${formatNumber(state.segments.length)}</strong>
            </div>
            <div class="snapshot-card">
              <span>미사용 페이지</span>
              <strong>${formatNumber(stats.noUsableCandidatePages || 0)}</strong>
            </div>
          </div>
          <div class="inline-actions compact">
            <button class="ghost-btn" id="dashboard-to-builder">리포트 편집</button>
            <button class="primary-btn" id="dashboard-to-kakao">카카오 보기</button>
          </div>
        </article>
      </div>
    </section>
  `;

  document.getElementById('go-inbox').addEventListener('click', () => render('inbox'));
  document.getElementById('dashboard-to-builder').addEventListener('click', () => render('builder'));
  document.getElementById('dashboard-to-kakao').addEventListener('click', () => render('kakao'));

  app.querySelectorAll('[data-open]').forEach((button) => {
    button.addEventListener('click', () => {
      const article = state.articles[Number(button.dataset.open)];
      if (article?.url) window.open(article.url, '_blank', 'noopener,noreferrer');
    });
  });
}

function filterInboxArticles({ ignoreStatusFilter = false, ignoreSearchQuery = false, ignoreAiFilter = false } = {}) {
  const sectionFiltered =
    state.inboxSectionFilter === 'all'
      ? state.articles
      : state.articles.filter((article) => article.section === state.inboxSectionFilter);
  const activeKeywordTokens = inboxKeywordFilterTokens();
  const keywordFiltered = activeKeywordTokens.length
    ? sectionFiltered.filter((article) => activeKeywordTokens.some((token) => articleMatchesInboxKeywordToken(article, token)))
    : sectionFiltered;

  const searchQuery = ignoreSearchQuery ? '' : normalizedInboxSearchQuery();
  const searchFiltered = searchQuery
    ? keywordFiltered.filter((article) => articleMatchesInboxSearch(article, searchQuery))
    : keywordFiltered;

  const aiFiltered = !ignoreAiFilter && state.inboxAiFilter === 'recommended'
    ? searchFiltered.filter((article) => isKakaoAiRecommended(article))
    : searchFiltered;

  if (ignoreStatusFilter || state.inboxStatusFilter === 'all') {
    return aiFiltered;
  }

  if (state.inboxStatusFilter === 'reported') {
    return aiFiltered.filter((article) => isArticleAssigned(article));
  }

  return aiFiltered.filter((article) => !isArticleAssigned(article));
}

function filteredArticles() {
  const filtered = filterInboxArticles();

  return [...filtered].sort((a, b) => {
    const primaryLeft = getInboxSortValue(a, state.inboxSortKey);
    const primaryRight = getInboxSortValue(b, state.inboxSortKey);
    const primaryCompare = compareArticleValues(primaryLeft, primaryRight);
    if (primaryCompare !== 0) {
      return state.inboxSortDirection === 'desc' ? -primaryCompare : primaryCompare;
    }

    const timeCompare = compareArticleValues(articlePublishedEpoch(a), articlePublishedEpoch(b));
    if (timeCompare !== 0) return -timeCompare;

    return String(a?.title || '').localeCompare(String(b?.title || ''), 'ko');
  });
}

function renderArticlePreview(article) {
  if (!article) {
    return renderDataEmpty('article-preview-empty', '기사를 선택하세요', '목록에서 한 건을 고르면 체크와 리포트 반영 액션이 표시됩니다.');
  }

  const selected = isArticleSelected(article);
  const membership = reportMembership(article);
  const majorDisabled = !canAddMajorReport(article);
  const industryDisabled = !canAddIndustryReport(article);
  const hideMajorAction = state.inboxSectionFilter === 'industry' && article.section === 'industry';
  const majorLabel = membership.isMainReport
    ? '주요 보도 반영됨'
    : membership.isIndustryReport
      ? '주요 보도 추가 불가'
      : '주요 보도 추가';
  const industryLabel = membership.isIndustryReport ? '업계 보도 반영됨' : '업계 보도 추가';

  return `
    <div class="preview-card-body preview-card-body-compact preview-card-body-actions">
      <div class="preview-inline-head">
        <div class="preview-inline-copy">
          <span class="preview-inline-label">선택 기사 액션</span>
          <strong class="preview-inline-title">표에서 확인한 기사 정보를 바로 반영합니다.</strong>
        </div>
        <div class="builder-chip-row preview-pill-row">
          ${renderReportPills(article)}
          <span class="panel-pill tone-neutral">${selected ? '체크됨' : '체크 안 됨'}</span>
        </div>
      </div>
      <div class="inline-actions compact preview-actions">
        <button class="ghost-btn" id="toggle-preview-selection">${selected ? '체크 해제' : '체크 추가'}</button>
        ${hideMajorAction ? '' : `<button class="ghost-btn" id="add-preview-major" ${majorDisabled ? 'disabled' : ''}>${escapeHtml(majorLabel)}</button>`}
        <button class="primary-btn secondary-tone" id="add-preview-industry" ${industryDisabled ? 'disabled' : ''}>${escapeHtml(industryLabel)}</button>
      </div>
      ${renderPolicyNote(article)}
    </div>
  `;
}

function renderInbox() {
  const data = filteredArticles();
  const keywordOptions = industryKeywordOptions();
  const statusCounts = {
    all: state.articles.length,
    major: state.articles.filter((article) => article.section === 'major').length,
    industry: state.articles.filter((article) => article.section === 'industry').length
  };
  const maxPage = Math.max(1, Math.ceil(data.length / state.pageSize));
  state.selectedPage = Math.min(state.selectedPage, maxPage);
  const start = (state.selectedPage - 1) * state.pageSize;
  const visible = data.slice(start, start + state.pageSize);
  if (!visible.some((article) => articleKey(article) === articleKey(state.selectedArticle))) {
    state.selectedArticle = visible[0] || null;
  }
  const selectableVisible = visible.filter((article) => !isArticleAssigned(article));
  const reviewReady = visible.filter((article) => articleStatus(article) !== 'failed').length;
  const selectedCount = selectedArticleCount();
  const visibleSelectedCount = selectableVisible.filter((article) => isArticleSelected(article)).length;
  const allVisibleSelected = selectableVisible.length > 0 && visibleSelectedCount === selectableVisible.length;
  const selectedArticles = getSelectedArticles();
  const majorAssignment = summarizeAssignableArticles('major', selectedArticles);
  const industryAssignment = summarizeAssignableArticles('industry', selectedArticles);
  const inboxAssignment = summarizeInboxAssignableArticles(selectedArticles);
  const assignedCount = getSelectedArticles().filter(
    (article) => articleStatus(article) === 'selected' || articleStatus(article) === 'reported'
  ).length;

  app.innerHTML = `
    <section class="page" id="article-inbox-page">
      <div class="section-banner section-banner-inline">
        <div>
          ${renderAnnotation('SCR-INBOX-HEAD-001')}
          <p class="panel-kicker">Article Inbox</p>
          <h3>기사 인박스</h3>
          <p>테이블에서 선택하고 바로 분류합니다.</p>
        </div>
        <span class="panel-pill tone-neutral">${formatNumber(data.length)}건 표시</span>
      </div>

      <div class="content-stack inbox-stack">
        <article class="card toolbar-card inbox-toolbar-card">
          ${renderAnnotation('SCR-INBOX-FILTER-001')}
          <div class="toolbar-topline">
            <div>
              <p class="panel-kicker">분류 필터</p>
              <h3>기사 목록</h3>
            </div>
            <div class="toolbar-meta">
              <label for="page-size">행 수</label>
              <select id="page-size">
                ${[10, 20, 50, 100, 200].map((size) => `
                  <option value="${size}" ${state.pageSize === size ? 'selected' : ''}>${size}</option>
                `).join('')}
              </select>
            </div>
          </div>
          <div class="table-control-bar">
            <div class="chip-group chip-group-inline">
              ${[
                ['all', '전체', statusCounts.all],
                ['major', '주요 보도', statusCounts.major],
                ['industry', '업계 보도', statusCounts.industry]
              ].map(([value, label, count]) => `
                <button class="filter-chip ${state.inboxSectionFilter === value ? 'active' : ''}" data-filter="${value}" aria-pressed="${state.inboxSectionFilter === value}">
                  <strong>${escapeHtml(label)}</strong>
                  <span>${formatNumber(count)}</span>
                </button>
              `).join('')}
            </div>
            <label class="detail-field keyword-field">
              <span>업계 키워드</span>
              <select id="industry-keyword-filter">
                <option value="">전체 키워드</option>
                ${keywordOptions.map((keyword) => `
                  <option value="${escapeHtml(keyword)}" ${hasInboxKeywordFilter('industry', keyword) ? 'selected' : ''}>${escapeHtml(keyword)}</option>
                `).join('')}
              </select>
            </label>
          </div>
        </article>

        <article class="card toolbar-card">
            ${renderAnnotation('SCR-INBOX-TABLE-001')}
            <div class="selection-toolbar">
              <label class="table-select-all">
                <input type="checkbox" id="select-all-visible" ${allVisibleSelected ? 'checked' : ''} />
                <span>전체 선택</span>
              </label>
              <div class="toolbar-actions">
                <div class="action-cluster">
                  <div class="selection-badge">
                    <span>현재 선택</span>
                    <strong>${formatNumber(selectedCount)}</strong>
                  </div>
                  <button class="ghost-btn" id="clear-selection" ${selectedCount ? '' : 'disabled'}>선택 해제</button>
                </div>
                <div class="action-cluster action-cluster-primary">
                  <button class="primary-btn" id="assign-major" ${majorAssignment.available.length ? '' : 'disabled'}>주요 보도 추가</button>
                  <button class="primary-btn secondary-tone" id="assign-industry" ${industryAssignment.available.length ? '' : 'disabled'}>업계 보도 추가</button>
                </div>
                <div class="action-cluster">
                  <button class="ghost-btn" id="open-selected" aria-label="Open selected" ${state.selectedArticle ? '' : 'disabled'}>기사 열기</button>
                  <button class="ghost-btn" id="preview-selected" aria-label="Preview inline" ${state.selectedArticle ? '' : 'disabled'}>미리보기</button>
                  <button class="ghost-btn" id="open-builder">빌더 열기</button>
                </div>
              </div>
            </div>
            <div class="toolbar-stats">
              <span class="panel-pill tone-neutral">검토 가능 ${formatNumber(reviewReady)}건</span>
              <span class="panel-pill tone-neutral">반영 완료 ${formatNumber(assignedCount)}건</span>
              <span class="panel-pill tone-neutral">현재 페이지 ${formatNumber(visibleSelectedCount)}건 선택</span>
            </div>
            ${(selectedCount || majorAssignment.blocked.length)
              ? `<div class="toolbar-note ${majorAssignment.blocked.length ? 'has-lock' : ''}">
                  ${majorAssignment.blocked.length
                    ? `<strong>잠금</strong><span>${majorAssignment.blocked.length}건은 업계 → 주요 정책으로 주요 보도에 추가할 수 없습니다.</span>`
                    : '<strong>안내</strong><span>선택한 기사만 주요 보도 또는 업계 보도로 분류할 수 있습니다.</span>'}
                </div>`
              : ''}
        </article>

        <article class="card table-card">
            <div class="table table-articles">
              <div class="table-head">
                <span>선택</span>
                <span>상태</span>
                <span>매체</span>
                <span>기사</span>
                <span>키워드</span>
                <span>시간</span>
              </div>
              ${visible.length
                ? visible.map((article, index) => {
                  const globalIndex = start + index;
                  const status = articleStatus(article);
                  const focused = articleKey(state.selectedArticle) === articleKey(article);
                  const picked = isArticleSelected(article);
                  return `
                    <div class="table-row ${focused ? 'selected' : ''} ${picked ? 'picked' : ''}" data-index="${globalIndex}">
                      <div class="selection-cell">
                        <input type="checkbox" data-select-article="${globalIndex}" ${picked ? 'checked' : ''} aria-label="select article ${globalIndex + 1}" />
                      </div>
                      <div><span class="status-badge status-${escapeHtml(status)}">${escapeHtml(statusLabel(status))}</span></div>
                      <div>${escapeHtml(mediaLabel(article))}</div>
                      <div class="title-wrap">
                        <strong>${highlightTitleKeywords(article.title, article)}</strong>
                        <p>${escapeHtml(article.summary || '').slice(0, 120)}</p>
                      </div>
                      <div>${escapeHtml(article.keyword || '-')}</div>
                      <div>${escapeHtml(article.recencyText || '-')}</div>
                    </div>
                  `;
                }).join('')
                : renderDataEmpty('inbox-empty', '조건에 맞는 기사가 없습니다', '필터를 바꾸거나 페이지 크기를 조정해 다시 확인해보세요.')}
            </div>
            <div class="pagination-row">
              <span>${state.selectedPage} / ${maxPage} 페이지</span>
              <div class="inline-actions compact">
                <button class="ghost-btn" id="prev-page" ${state.selectedPage <= 1 ? 'disabled' : ''}>이전</button>
                <button class="ghost-btn" id="next-page" ${state.selectedPage >= maxPage ? 'disabled' : ''}>다음</button>
              </div>
            </div>
        </article>

        <article class="card preview-panel" id="article-preview">
          ${renderAnnotation('SCR-INBOX-PREVIEW-001')}
          <div class="panel-heading">
            <div>
              <p class="panel-kicker">선택 기사</p>
              <h3>기사 요약</h3>
            </div>
            <span class="panel-pill tone-neutral">${state.previewMode === 'summary' ? '요약 보기' : '상세 보기'}</span>
          </div>
          ${renderArticlePreview(state.selectedArticle)}
        </article>
      </div>
    </section>
  `;

  const selectionToolbar = app.querySelector('.selection-toolbar');
  const selectAllLabel = selectionToolbar?.querySelector('.table-select-all');
  const selectionBadge = selectionToolbar?.querySelector('.selection-badge');
  const toolbarActions = selectionToolbar?.querySelector('.toolbar-actions');
  if (selectionToolbar && selectAllLabel && selectionBadge && toolbarActions) {
    let summary = selectionToolbar.querySelector('.selection-toolbar-summary');
    if (!summary) {
      summary = document.createElement('div');
      summary.className = 'selection-toolbar-summary';
      selectionToolbar.insertBefore(summary, toolbarActions);
    }

    summary.append(selectAllLabel, selectionBadge);
    summary.querySelector('.selection-meta')?.remove();
  }

  const clearSelectionButton = document.getElementById('clear-selection');
  if (clearSelectionButton) {
    clearSelectionButton.classList.add('toolbar-btn');
    clearSelectionButton.textContent = '선택 해제';
  }

  const openSelectedButton = document.getElementById('open-selected');
  if (openSelectedButton) {
    openSelectedButton.classList.add('toolbar-btn');
    openSelectedButton.textContent = '선택 기사 열기';
  }

  const bulkAddButtons = [document.getElementById('assign-major'), document.getElementById('assign-industry')].filter(Boolean);
  const bulkAddButton = bulkAddButtons[0] || null;
  if (bulkAddButton) {
    bulkAddButton.id = 'add-selected-to-report';
    bulkAddButton.classList.add('toolbar-btn');
    bulkAddButton.classList.remove('secondary-tone');
    bulkAddButton.disabled = !inboxAssignment.available.length;
    bulkAddButton.textContent = '보도 추가';
    bulkAddButton.setAttribute('aria-label', 'Add selected articles to report');
  }
  bulkAddButtons.slice(1).forEach((button) => button.remove());

  app.querySelectorAll('.table-row[data-index]').forEach((row) => {
    const article = data[Number(row.dataset.index)] || null;
    if (!article) return;

    const targetSection = inboxTargetSection(article);
    const addEnabled = canAddInboxReport(article);
    const majorButton = row.querySelector('[data-add-major-article]');
    const industryButton = row.querySelector('[data-add-industry-article]');
    const rowAddButton = majorButton || industryButton;

    if (!rowAddButton) return;

    rowAddButton.classList.remove('ghost-btn', 'secondary-tone');
    rowAddButton.classList.add('primary-btn', 'row-add-btn');
    rowAddButton.dataset.addReportArticle = row.dataset.index;
    delete rowAddButton.dataset.addMajorArticle;
    delete rowAddButton.dataset.addIndustryArticle;
    rowAddButton.disabled = !addEnabled;
    rowAddButton.textContent = addEnabled ? '보도 추가' : '보도 반영 완료';
    rowAddButton.setAttribute(
      'aria-label',
      escapeHtml(
        addEnabled
          ? `${article.title || '기사'} ${sectionLabel(targetSection)}에 보도 추가`
          : `${article.title || '기사'} 보도 반영 완료`
      )
    );

    if (majorButton && industryButton && majorButton !== rowAddButton) {
      majorButton.remove();
    }
    if (industryButton && industryButton !== rowAddButton) {
      industryButton.remove();
    }
  });

  const toolbarStats = app.querySelector('.toolbar-stats');
  if (toolbarStats) {
    const pills = toolbarStats.querySelectorAll('.panel-pill');
    if (pills[2]) {
      pills[2].textContent = `현재 페이지 선택 가능 ${formatNumber(selectableVisible.length)}건`;
    }
  }

  const toolbarNote = app.querySelector('.toolbar-note');
  if (toolbarNote) {
    toolbarNote.classList.remove('has-lock');
    toolbarNote.innerHTML = '<strong>안내</strong><span>기사 인박스에서는 기본 분류대로만 보도에 추가하고, 주요 보도와 업계 보도 간 변경은 리포트 빌더에서만 지원합니다.</span>';
  }

  document.querySelectorAll('[data-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      state.inboxSectionFilter = button.dataset.filter;
      state.selectedPage = 1;
      renderInbox();
    });
  });

  document.getElementById('industry-keyword-filter').addEventListener('change', (event) => {
    setInboxKeywordFilterTokens(event.target.value ? [inboxKeywordToken('industry', event.target.value)] : []);
    state.selectedPage = 1;
    renderInbox();
  });

  document.getElementById('page-size').addEventListener('change', (event) => {
    state.pageSize = Number(event.target.value);
    state.selectedPage = 1;
    renderInbox();
  });

  document.getElementById('prev-page').addEventListener('click', () => {
    state.selectedPage = Math.max(1, state.selectedPage - 1);
    renderInbox();
  });

  document.getElementById('next-page').addEventListener('click', () => {
    state.selectedPage = Math.min(maxPage, state.selectedPage + 1);
    renderInbox();
  });

  document.querySelectorAll('[data-select-article]').forEach((checkbox) => {
    checkbox.addEventListener('click', (event) => {
      event.stopPropagation();
      const article = data[Number(checkbox.dataset.selectArticle)] || null;
      if (!article) return;
      toggleArticleSelection(article, checkbox.checked);
      renderInbox();
    });
  });

  document.querySelectorAll('[data-open-article]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const article = data[Number(button.dataset.openArticle)] || null;
      if (!article?.url) return;
      openArticleUrl(article.url);
    });
  });

  app.querySelectorAll('.table-row[data-index]').forEach((row) => {
    row.addEventListener('click', () => {
      state.selectedArticle = data[Number(row.dataset.index)] || null;
      renderInbox();
    });
  });

  document.getElementById('select-all-visible').addEventListener('change', (event) => {
    toggleVisibleArticleSelection(visible, event.target.checked);
    renderInbox();
  });

  document.getElementById('clear-selection').addEventListener('click', () => {
    clearSelectedArticles();
    renderInbox();
  });

  document.getElementById('assign-major').addEventListener('click', () => {
    assignSelectedArticlesToSection('major');
    renderInbox();
  });

  document.getElementById('assign-industry').addEventListener('click', () => {
    assignSelectedArticlesToSection('industry');
    renderInbox();
  });

  document.getElementById('open-builder').addEventListener('click', () => {
    render('builder');
  });

  document.getElementById('open-selected').addEventListener('click', () => {
    if (state.selectedArticle?.url) {
      window.open(state.selectedArticle.url, '_blank', 'noopener,noreferrer');
    }
  });

  document.getElementById('preview-selected').addEventListener('click', () => {
    state.previewMode = 'inline';
    renderInbox();
  });

  if (state.selectedArticle) {
    document.getElementById('toggle-preview-selection').addEventListener('click', () => {
      toggleArticleSelection(state.selectedArticle);
      renderInbox();
    });

    const previewMajorButton = document.getElementById('add-preview-major');
    if (previewMajorButton && !previewMajorButton.disabled) {
      previewMajorButton.addEventListener('click', () => {
        const result = addArticleToReportSection('major', state.selectedArticle);
        if (result.added) {
          deselectArticles([state.selectedArticle]);
          showToast('선택 기사를 주요 보도에 반영했습니다.');
        } else if (result.reason === 'industry_to_main_blocked') {
          showToast('업계 보도에 들어간 기사는 주요 보도로 추가할 수 없습니다.');
        }
        renderInbox();
      });
    }

    const previewIndustryButton = document.getElementById('add-preview-industry');
    if (previewIndustryButton && !previewIndustryButton.disabled) {
      previewIndustryButton.addEventListener('click', () => {
        const result = addArticleToReportSection('industry', state.selectedArticle);
        if (result.added) {
          deselectArticles([state.selectedArticle]);
          showToast('선택 기사를 업계 보도에 반영했습니다.');
        }
        renderInbox();
      });
    }
  }
}

function renderBuilderColumn(sectionName, items) {
  const heading = builderSectionHeading(sectionName);
  return `
    <article class="card builder-column" data-drop-zone="${sectionName}">
      ${renderAnnotation(sectionName === 'major' ? 'SCR-BUILD-MAJOR-001' : 'SCR-BUILD-INDUSTRY-001')}
      <div class="panel-heading">
        <div>
          <h3>${heading}</h3>
        </div>
        <span class="panel-pill tone-neutral">${formatNumber(items.length)}건</span>
      </div>
      <div class="builder-card-list">
        ${items.length
          ? items.map((article) => {
            const entryKey = draftEntryKey(sectionName, article);
            return `
            <div class="builder-item ${entryKey === state.builderFocusKey ? 'active' : ''}" data-builder-focus="${escapeHtml(entryKey)}">
              <strong>${escapeHtml(article.title)}</strong>
              ${renderBuilderItemMeta(article)}
              ${renderBuilderItemSummaryRows(article)}
              <div class="inline-actions compact">
                <button class="ghost-btn" data-builder-open="${escapeHtml(article.url || '')}">기사 열기</button>
                ${
                  sectionName === 'major'
                    ? `<button class="ghost-btn" data-builder-move-industry="${escapeHtml(entryKey)}">업계 보도로 이동</button>`
                    : ''
                }
                <button class="ghost-btn" data-builder-remove="${escapeHtml(entryKey)}">제거</button>
              </div>
            </div>
          `;
          }).join('')
          : renderDataEmpty(`builder-empty-${sectionName}`, '아직 카드가 없습니다', '기사 인박스 또는 기사 추가 버튼으로 리포트에 반영하세요.')}
      </div>
    </article>
  `;
}

function renderBuilderDetailPanel() {
  const location = findDraftLocation(state.builderFocusKey);
  if (!location) {
    return `
      <article class="card detail-panel">
        ${renderAnnotation('SCR-BUILD-DETAIL-001')}
        <div class="panel-heading">
          <div>
            <p class="panel-kicker">기사 설정</p>
            <h3>기사 세부 설정</h3>
          </div>
        </div>
        ${renderDataEmpty('builder-detail-empty', '편집할 기사를 선택하세요', '리포트에 반영된 기사를 고르면 요약과 카카오 포함 여부를 수정할 수 있습니다.')}
      </article>
    `;
  }

  const article = location.item;
  const key = draftEntryKey(location.sectionName, article);
  return `
    <article class="card detail-panel" id="builder-detail-panel" role="tabpanel" aria-labelledby="builder-side-view-detail">
      ${renderAnnotation('SCR-BUILD-DETAIL-001')}
      <div class="panel-heading">
        <div>
          <p class="panel-kicker">기사 설정</p>
          <h3>기사 세부 설정</h3>
        </div>
        <span class="panel-pill tone-neutral">${escapeHtml(sectionLabel(location.sectionName))}</span>
      </div>
      <div class="detail-hero">
        <strong>${escapeHtml(article.title)}</strong>
        <p>${escapeHtml(mediaLabel(article))} · ${escapeHtml(article.keyword || '-')}</p>
      </div>
      <div class="builder-chip-row">
        <span class="panel-pill ${location.sectionName === 'major' ? 'tone-main section-major' : 'tone-industry section-industry'}">${sectionLabel(location.sectionName)}</span>
      </div>
      <div class="inline-actions compact">
        <button class="ghost-btn" id="builder-detail-open">기사 열기</button>
      </div>
      ${location.sectionName === 'major'
        ? '<div class="inline-actions compact"><button class="ghost-btn" id="builder-detail-move-industry">업계 보도로 이동</button></div>'
        : ''}
      <label class="detail-field">
        <span>타입</span>
        <input value="${escapeHtml(sectionLabel(location.sectionName))}" readonly />
      </label>
      <label class="detail-field">
        <span>기사 요약 및 결론 (30자 내외)</span>
        <input id="builder-summary-lead" data-detail-key="${escapeHtml(key)}" value="${escapeHtml(articleSummaryLead(article))}" />
      </label>
      <label class="detail-field">
        <span>주요 내용 한줄 요약 (40자 내외)</span>
        <input id="builder-key-point" data-detail-key="${escapeHtml(key)}" value="${escapeHtml(articleKeyPoint(article))}" />
      </label>
      <label class="detail-field">
        <span>기사 제목</span>
        <input value="${escapeHtml(article.title || '')}" readonly />
      </label>
      <label class="detail-field">
        <span>매체</span>
        <input value="${escapeHtml(mediaLabel(article))}" readonly />
      </label>
      <label class="detail-field">
        <span>링크</span>
        <input value="${escapeHtml(article.url || '')}" readonly />
      </label>
      ${renderBuilderAiActionButton(key, { mode: 'detail', id: 'builder-ai-summarize', extraClass: 'detail-ai-actions' })}
    </article>
  `;
}

function renderReportBuilder() {
  updateShellMeta();
  const sections = getReportSections();
  ensureBuilderFocus();
  normalizeBuilderSideView();
  const canImportArticles = canImportCustomBuilderArticles();
  const reportText = state.reportTextDraft || generateReportText();
  const reportItemCount = sections.major.length + sections.industry.length;
  const totalDraftChars = characterLength(reportText);
  const detailAvailable = Boolean(findDraftLocation(state.builderFocusKey));
  const activeBuilderSideView = detailAvailable && state.builderSideView === 'detail' ? 'detail' : 'draft';
  state.builderSideView = activeBuilderSideView;

  app.innerHTML = `
    <section class="page" id="report-builder-page">
      <div class="builder-layout">
        <div class="builder-workspace">
          ${canImportArticles
            ? `
              <article class="card builder-toolbar-card">
                <div class="panel-heading">
                  <div>
                    <h3>기사 추가</h3>
                    <p class="small-copy">리포트 작성 중 필요한 기사 링크를 직접 추가하고, 주요 보도 또는 업계 보도로 바로 분류합니다.</p>
                  </div>
                  <button class="${state.builderImportOpen ? 'ghost-btn' : 'primary-btn'}" id="builder-toggle-import">
                    ${state.builderImportOpen ? '입력 닫기' : '기사 추가'}
                  </button>
                </div>
                ${state.builderImportOpen
                  ? `
                    <form class="builder-import-form" id="builder-import-form">
                      <label class="detail-field builder-import-field">
                        <span>기사 링크</span>
                        <input
                          id="builder-import-url"
                          type="url"
                          inputmode="url"
                          placeholder="https://기사-링크"
                          value="${escapeHtml(state.builderImportUrl)}"
                          ${state.builderImportBusy ? 'disabled' : ''}
                        />
                      </label>
                      <div class="builder-import-section" role="group" aria-label="추가 위치 선택">
                        ${[
                          ['major', '주요 보도'],
                          ['industry', '업계 보도']
                        ].map(([value, label]) => `
                          <button
                            type="button"
                            class="filter-chip ${state.builderImportSection === value ? 'active' : ''}"
                            data-builder-import-section="${value}"
                            aria-pressed="${state.builderImportSection === value}"
                            ${state.builderImportBusy ? 'disabled' : ''}
                          >
                            <strong>${label}</strong>
                          </button>
                        `).join('')}
                      </div>
                      <div class="inline-actions compact builder-import-actions">
                        <button type="button" class="ghost-btn" id="builder-import-cancel" ${state.builderImportBusy ? 'disabled' : ''}>취소</button>
                        <button type="submit" class="primary-btn" id="builder-import-submit" ${state.builderImportBusy ? 'disabled' : ''}>
                          ${state.builderImportBusy ? '기사 가져오는 중...' : '링크 기사 추가'}
                        </button>
                      </div>
                    </form>
                  `
                  : ''
                }
              </article>
            `
            : ''
          }
          <div class="builder-columns">
            ${renderBuilderColumn('major', sections.major)}
            ${renderBuilderColumn('industry', sections.industry)}
          </div>
        </div>

        <aside class="builder-side-stack">
          <div class="toggle builder-side-toggle" role="tablist" aria-label="builder-side-view-toggle">
            <button
              id="builder-side-view-detail"
              role="tab"
              aria-label="Article settings"
              aria-selected="${activeBuilderSideView === 'detail'}"
              aria-controls="builder-detail-panel"
              class="${activeBuilderSideView === 'detail' ? 'active' : ''}"
              data-builder-side-view="detail"
              tabindex="${activeBuilderSideView === 'detail' ? '0' : '-1'}"
              ${detailAvailable ? '' : 'disabled'}
            >
              기사별 설정
            </button>
            <button
              id="builder-side-view-draft"
              role="tab"
              aria-label="Report draft"
              aria-selected="${activeBuilderSideView === 'draft'}"
              aria-controls="builder-draft-panel"
              class="${activeBuilderSideView === 'draft' ? 'active' : ''}"
              data-builder-side-view="draft"
              tabindex="${activeBuilderSideView === 'draft' ? '0' : '-1'}"
            >
              보고서 초안
            </button>
          </div>
          ${activeBuilderSideView === 'draft'
            ? `
              <article class="card draft-panel" id="builder-draft-panel" role="tabpanel" aria-labelledby="builder-side-view-draft">
                ${renderAnnotation('SCR-BUILD-DRAFT-001')}
                <div class="panel-heading">
                  <div>
                    <p class="panel-kicker">리포트 초안</p>
                    <h3>보고서 초안</h3>
                  </div>
                  <span class="panel-pill tone-neutral">${formatNumber(reportItemCount)}건 반영</span>
                </div>
                <textarea id="report-text">${escapeHtml(reportText)}</textarea>
                <div class="draft-summary">
                  <div>
                    <span>전체 글자 수</span>
                    <strong id="builder-draft-char-count">${formatNumber(totalDraftChars)}</strong>
                  </div>
                  <div>
                    <span>주요 보도</span>
                    <strong>${formatNumber(sections.major.length)}</strong>
                  </div>
                  <div>
                    <span>업계 보도</span>
                    <strong>${formatNumber(sections.industry.length)}</strong>
                  </div>
                  <div>
                    <span>리포트 기사</span>
                    <strong>${formatNumber(reportItemCount)}</strong>
                  </div>
                </div>
                ${renderBuilderAiActionButton('report-draft', {
                  mode: 'draft',
                  id: 'builder-draft-ai',
                  extraClass: 'draft-ai-actions'
                })}
                <div class="inline-actions stack-mobile draft-primary-actions">
                  <button class="primary-btn" id="draft-to-kakao">카카오 프리뷰 보기</button>
                </div>
              </article>
            `
            : renderBuilderDetailPanel()}
        </aside>
      </div>
    </section>
  `;

  app.querySelectorAll('[data-builder-focus]').forEach((node) => {
    node.addEventListener('click', () => {
      setBuilderFocus(node.dataset.builderFocus);
      renderReportBuilder();
    });
  });

  app.querySelectorAll('[data-builder-side-view]').forEach((button) => {
    button.addEventListener('click', () => {
      if (button.disabled) return;
      state.builderSideView = button.dataset.builderSideView === 'draft' ? 'draft' : 'detail';
      renderReportBuilder();
    });
  });

  app.querySelectorAll('[data-builder-remove]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      removeDraftItem(button.dataset.builderRemove);
      showToast('리포트 빌더에서 기사를 제거했습니다.');
      renderReportBuilder();
    });
  });

  app.querySelectorAll('[data-builder-open]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      openArticleUrl(button.dataset.builderOpen);
    });
  });

  app.querySelectorAll('[data-builder-ai]').forEach((button) => {
    button.addEventListener('click', async (event) => {
      event.stopPropagation();
      if (!state.capabilities?.aiSummarize) {
        const connected = await connectRemoteAiAccess();
        if (!connected) return;
        renderReportBuilder();
      }

      if (state.capabilities?.requiresToken && !getStoredAiToken()) {
        showToast('AI 접근 토큰을 먼저 입력해주세요.');
        return;
      }

      if (button.dataset.builderAi === 'report-draft') {
        await summarizeReportDraftWithAi();
        return;
      }

      await summarizeDraftItemWithAi(button.dataset.builderAi);
    });
  });

  app.querySelectorAll('[data-ai-token-input]').forEach((input) => {
    input.addEventListener('click', (event) => {
      event.stopPropagation();
    });
    input.addEventListener('input', (event) => {
      setStoredAiToken(String(event.target.value || '').trim());
    });
  });

  app.querySelectorAll('[data-builder-move-industry]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const result = moveDraftItemToSection(button.dataset.builderMoveIndustry, 'industry');
      if (result.moved) {
        showToast('기사를 업계 보도로 이동했습니다.');
      }
      renderReportBuilder();
    });
  });

  const detailSummaryLead = document.getElementById('builder-summary-lead');
  if (detailSummaryLead) {
    detailSummaryLead.addEventListener('input', (event) => {
      updateDraftItem(event.target.dataset.detailKey, {
        summaryLead: event.target.value,
        conclusion: event.target.value
      });
      syncBuilderCardPreview(event.target.dataset.detailKey);
      syncBuilderReportTextArea();
    });
  }

  const detailKeyPoint = document.getElementById('builder-key-point');
  if (detailKeyPoint) {
    detailKeyPoint.addEventListener('input', (event) => {
      updateDraftItem(event.target.dataset.detailKey, {
        keyPoint: event.target.value,
        oneLine: event.target.value
      });
      syncBuilderCardPreview(event.target.dataset.detailKey);
      syncBuilderReportTextArea();
    });
  }

  const detailAiSummarize = document.getElementById('builder-ai-summarize');
  if (detailAiSummarize) {
    detailAiSummarize.addEventListener('click', async () => {
      await summarizeDraftItemWithAi(state.builderFocusKey);
    });
  }

  const detailMoveIndustry = document.getElementById('builder-detail-move-industry');
  if (detailMoveIndustry) {
    detailMoveIndustry.addEventListener('click', () => {
      const result = moveDraftItemToSection(state.builderFocusKey, 'industry');
      if (result.moved) {
        showToast('기사를 업계 보도로 이동했습니다.');
      }
      renderReportBuilder();
    });
  }

  const detailOpen = document.getElementById('builder-detail-open');
  if (detailOpen) {
    detailOpen.addEventListener('click', () => {
      const location = findDraftLocation(state.builderFocusKey);
      openArticleUrl(location?.item?.url || '');
    });
  }

  const reportTextField = document.getElementById('report-text');
  if (reportTextField) {
    resizeReportTextArea(reportTextField);
    reportTextField.addEventListener('input', (event) => {
      state.reportTextDraft = event.target.value;
      resizeReportTextArea(event.target);
    });
  }

  const draftToKakaoButton = document.getElementById('draft-to-kakao');
  if (draftToKakaoButton) {
    draftToKakaoButton.addEventListener('click', () => {
      render('kakao');
    });
  }

  const builderToggleImport = document.getElementById('builder-toggle-import');
  if (builderToggleImport) {
    builderToggleImport.addEventListener('click', () => {
      state.builderImportOpen = !state.builderImportOpen;
      if (!state.builderImportOpen) {
        state.builderImportUrl = '';
        state.builderImportSection = 'major';
      }
      renderReportBuilder();
    });
  }

  const builderImportUrl = document.getElementById('builder-import-url');
  if (builderImportUrl) {
    builderImportUrl.addEventListener('input', (event) => {
      state.builderImportUrl = String(event.target.value || '');
    });
  }

  app.querySelectorAll('[data-builder-import-section]').forEach((button) => {
    button.addEventListener('click', () => {
      state.builderImportSection = button.dataset.builderImportSection === 'industry' ? 'industry' : 'major';
      renderReportBuilder();
    });
  });

  const builderImportCancel = document.getElementById('builder-import-cancel');
  if (builderImportCancel) {
    builderImportCancel.addEventListener('click', () => {
      state.builderImportOpen = false;
      state.builderImportUrl = '';
      state.builderImportSection = 'major';
      renderReportBuilder();
    });
  }

  const builderImportForm = document.getElementById('builder-import-form');
  if (builderImportForm) {
    builderImportForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      await submitBuilderImportedArticle();
    });
  }
}

function renderKakaoPreview() {
  const fullText = buildKakaoPreviewText();
  const derivedSegments = splitByBytes(fullText, 500);
  const activeSegment = derivedSegments.find((segment) => segment.order === state.selectedSegmentOrder) || derivedSegments[0];

  app.innerHTML = `
    <section class="page" id="kakao-preview-page">
      <div class="section-banner">
        ${renderAnnotation('SCR-KAKAO-HEAD-001')}
        <div>
          <p class="panel-kicker">Kakao Preview</p>
          <h3>카카오 프리뷰</h3>
          <p>카카오톡 형태로 확인하고 바로 복사합니다.</p>
        </div>
      </div>

      <div class="kakao-layout">
        <article class="card kakao-device-card">
          ${renderAnnotation('SCR-KAKAO-DEVICE-001')}
          <div class="panel-heading">
            <div>
              <p class="panel-kicker">미리보기</p>
              <h3>카카오톡 화면</h3>
            </div>
            <div class="toggle" role="tablist" aria-label="kakao-view-toggle">
              <button role="tab" aria-label="Full" aria-selected="${state.kakaoView === 'full'}" class="${state.kakaoView === 'full' ? 'active' : ''}" data-kakao-view="full">전체</button>
              <button role="tab" aria-label="Segmented" aria-selected="${state.kakaoView === 'segmented'}" class="${state.kakaoView === 'segmented' ? 'active' : ''}" data-kakao-view="segmented">분할</button>
            </div>
          </div>

          <div class="phone-frame">
            <div class="phone-status-bar">
              <span>9:41</span>
              <span>LTE · 87%</span>
            </div>
            <div class="phone-notch"></div>
            <div class="chat-app-bar">
              <div>
                <strong>Daily Comm Report</strong>
                <span>나에게 보내기</span>
              </div>
            </div>
            <div class="phone-screen ${state.kakaoView === 'full' ? '' : 'hidden'}">
              <p class="bubble-meta">전체 메시지</p>
              <div class="chat-row self">
                <div class="kakao-bubble" id="kakao-full">${escapeHtml(fullText || '리포트 빌더 결과가 아직 없습니다.')}</div>
              </div>
            </div>

            <div class="phone-screen ${state.kakaoView === 'segmented' ? '' : 'hidden'}">
              <p class="bubble-meta">분할 메시지</p>
              ${activeSegment
                ? `
                  <div class="segment-divider">단락 구분</div>
                  <div class="chat-row self">
                    <div class="kakao-bubble" id="segment-content">${escapeHtml(activeSegment.content)}</div>
                  </div>
                `
                : renderDataEmpty('segment-empty', '세그먼트가 없습니다', '리포트 빌더에 반영된 기사로 먼저 메시지를 구성해 주세요.')}
            </div>
            <div class="chat-compose-bar">
              <span>메시지 입력</span>
              <button type="button" class="compose-send" aria-hidden="true">전송</button>
            </div>
          </div>
        </article>

        <aside class="card kakao-side-card">
          ${renderAnnotation('SCR-KAKAO-SIDE-001')}
          <div class="panel-heading">
            <div>
              <p class="panel-kicker">검수</p>
              <h3>분할 메시지</h3>
            </div>
            <span class="panel-pill tone-neutral">${formatNumber(derivedSegments.length)}개</span>
          </div>
          <div class="segment-tabs">
            ${derivedSegments.length
              ? derivedSegments.map((segment) => `
                <button class="${segment.order === state.selectedSegmentOrder ? 'active' : ''}" data-segment-order="${segment.order}">
                  <span>Part ${segment.order}</span>
                  <small>${segment.bytes} bytes</small>
                </button>
              `).join('')
              : renderDataEmpty('kakao-empty', '세그먼트가 없습니다', '리포트 빌더에 반영된 기사가 있어야 카카오 메시지를 만들 수 있습니다.')}
          </div>
          <div class="draft-summary">
            <div>
              <span>선택 파트</span>
              <strong>${activeSegment ? `Part ${activeSegment.order}` : '-'}</strong>
            </div>
            <div>
              <span>바이트</span>
              <strong>${activeSegment ? formatNumber(activeSegment.bytes) : '-'}</strong>
            </div>
          </div>
          <div class="inline-actions stack-mobile kakao-copy-actions">
            <button class="ghost-btn" id="copy-all" aria-label="Copy all">전체 복사</button>
            <button class="primary-btn" id="copy-current" aria-label="Copy current" ${activeSegment ? '' : 'disabled'}>현재 파트 복사</button>
          </div>
        </aside>
      </div>
    </section>
  `;

  const kakaoFullTab = app.querySelector('[data-kakao-view="full"]');
  const kakaoSegmentedTab = app.querySelector('[data-kakao-view="segmented"]');
  const kakaoPanels = app.querySelectorAll('.phone-screen');
  if (kakaoFullTab && kakaoSegmentedTab && kakaoPanels.length >= 2) {
    kakaoFullTab.id = 'kakao-view-full';
    kakaoFullTab.setAttribute('aria-controls', 'kakao-panel-full');
    kakaoFullTab.setAttribute('tabindex', state.kakaoView === 'full' ? '0' : '-1');
    kakaoSegmentedTab.id = 'kakao-view-segmented';
    kakaoSegmentedTab.setAttribute('aria-controls', 'kakao-panel-segmented');
    kakaoSegmentedTab.setAttribute('tabindex', state.kakaoView === 'segmented' ? '0' : '-1');
    kakaoPanels[0].id = 'kakao-panel-full';
    kakaoPanels[0].setAttribute('role', 'tabpanel');
    kakaoPanels[0].setAttribute('aria-labelledby', 'kakao-view-full');
    kakaoPanels[0].setAttribute('aria-hidden', state.kakaoView === 'full' ? 'false' : 'true');
    kakaoPanels[1].id = 'kakao-panel-segmented';
    kakaoPanels[1].setAttribute('role', 'tabpanel');
    kakaoPanels[1].setAttribute('aria-labelledby', 'kakao-view-segmented');
    kakaoPanels[1].setAttribute('aria-hidden', state.kakaoView === 'segmented' ? 'false' : 'true');
  }

  const composeSend = app.querySelector('.compose-send');
  if (composeSend) {
    composeSend.setAttribute('tabindex', '-1');
    composeSend.setAttribute('role', 'presentation');
    composeSend.setAttribute('aria-hidden', 'true');
  }

  app.querySelectorAll('[data-kakao-view]').forEach((button) => {
    button.addEventListener('click', () => {
      state.kakaoView = button.dataset.kakaoView;
      renderKakaoPreview();
    });
  });

  app.querySelectorAll('[data-segment-order]').forEach((button) => {
    const selected = Number(button.dataset.segmentOrder) === state.selectedSegmentOrder;
    button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    button.setAttribute('aria-label', `Part ${button.dataset.segmentOrder} 보기`);
    button.addEventListener('click', () => {
      state.selectedSegmentOrder = Number(button.dataset.segmentOrder);
      state.kakaoView = 'segmented';
      renderKakaoPreview();
    });
  });

  document.getElementById('copy-all').addEventListener('click', async () => {
    await navigator.clipboard.writeText(fullText);
    pushActivityLog({
      title: '카카오 전체 복사',
      detail: `전체 메시지 ${formatNumber(totalChars)}자를 복사했습니다.`,
      tone: 'warning',
      page: 'kakao'
    });
    showToast('전체 메시지를 복사했습니다.');
  });

  document.getElementById('copy-current').addEventListener('click', async () => {
    if (!activeSegment) return;
    await navigator.clipboard.writeText(activeSegment.content);
    pushActivityLog({
      title: '카카오 파트 복사',
      detail: `Part ${formatNumber(activeSegment.order)} ${formatNumber(activeSegmentChars)}자를 복사했습니다.`,
      tone: 'warning',
      page: 'kakao'
    });
    showToast(`Part ${activeSegment.order} 복사 완료`);
  });
}

function renderSettings() {
  const config = state.config || {
    keywords: [],
    mediaWhitelistLabels: [],
    classificationDictionary: {},
    schedule: [],
    retry: { maxRetries: 3, intervalMinutes: 5 }
  };

  const dictionaryEntries = Object.entries(config.classificationDictionary || {});

  app.innerHTML = `
    <section class="page" id="settings-page">
      <div class="section-banner">
        ${renderAnnotation('SCR-SET-HEAD-001')}
        <div>
          <p class="panel-kicker">Operations</p>
          <h3>설정</h3>
          <p>운영 키워드와 화이트리스트, 스케줄, 분류 정책을 카드 단위로 점검합니다.</p>
        </div>
      </div>

      <div class="settings-grid">
        <article class="card settings-card">
          ${renderAnnotation('SCR-SET-KEY-001')}
          <div class="panel-heading">
            <div>
              <p class="panel-kicker">Keywords</p>
              <h3>키워드 관리</h3>
            </div>
            <span class="panel-pill">${formatNumber(keywordList().length)} items</span>
          </div>
          <textarea>${escapeHtml(keywordList().join(', '))}</textarea>
        </article>

        <article class="card settings-card">
          ${renderAnnotation('SCR-SET-SCHED-001')}
          <div class="panel-heading">
            <div>
              <p class="panel-kicker">Schedule</p>
              <h3>크롤링 스케줄</h3>
            </div>
            <span class="panel-pill">${formatNumber((config.schedule || []).length)} slots</span>
          </div>
          <input value="${escapeHtml((config.schedule || []).join(', '))}" />
        </article>

        <article class="card settings-card">
          ${renderAnnotation('SCR-SET-MEDIA-001')}
          <div class="panel-heading">
            <div>
              <p class="panel-kicker">Whitelist</p>
              <h3>매체 라벨</h3>
            </div>
            <span class="panel-pill">${formatNumber(mediaWhitelist().length)} labels</span>
          </div>
          <textarea>${escapeHtml(mediaWhitelist().join(', '))}</textarea>
        </article>

        <article class="card settings-card">
          ${renderAnnotation('SCR-SET-DICT-001')}
          <div class="panel-heading">
            <div>
              <p class="panel-kicker">Dictionary</p>
              <h3>분류 사전</h3>
            </div>
            <span class="panel-pill">${formatNumber(dictionaryEntries.length)} rules</span>
          </div>
          <textarea>${escapeHtml(dictionaryEntries.map(([key, value]) => `${key}: ${value}`).join('\n'))}</textarea>
        </article>

        <article class="card settings-card">
          ${renderAnnotation('SCR-SET-RETRY-001')}
          <div class="panel-heading">
            <div>
              <p class="panel-kicker">Retry Policy</p>
              <h3>실패 재시도 정책</h3>
            </div>
            <span class="panel-pill">strict</span>
          </div>
          <div class="draft-summary">
            <div>
              <span>최대 재시도</span>
              <strong>${formatNumber(config.retry?.maxRetries ?? 3)}</strong>
            </div>
            <div>
              <span>간격(분)</span>
              <strong>${formatNumber(config.retry?.intervalMinutes ?? 5)}</strong>
            </div>
          </div>
        </article>
      </div>

      <article class="card toolbar-card">
        ${renderAnnotation('SCR-SET-ACTION-001')}
        <p class="small-copy">이 MVP에서는 설정 저장이 로컬 UI 상태에만 반영됩니다.</p>
        <div class="inline-actions compact">
          <button class="ghost-btn" id="cancel-settings">취소</button>
          <button class="primary-btn" id="save-settings" aria-label="Save settings">설정 저장</button>
        </div>
      </article>
    </section>
  `;

  document.getElementById('cancel-settings').addEventListener('click', () => {
    renderSettings();
    showToast('변경사항을 취소했습니다.');
  });

  document.getElementById('save-settings').addEventListener('click', () => {
    showToast('설정이 저장되었습니다.');
  });
}

renderInboxPreviewContent = function renderInboxPreviewContentOverride(article, { prefix = 'preview', compact = false } = {}) {
  const selected = isArticleSelected(article);
  const membership = reportMembership(article);
  const assigned = membership.isMainReport || membership.isIndustryReport;
  const targetSection = inboxTargetSection(article);
  const canAdd = canAddInboxReport(article);
  const summary = String(article.summary || article.title || '').trim();
  const renderedSummary = compact ? truncateText(summary, 120) : summary;
  const compactMeta = `${mediaLabel(article)} · ${article.keyword || '-'} · ${formatArticlePublishedTime(article)} · ${assigned ? '리포트 반영' : sectionLabel(targetSection)}`;
  const insight = buildArticleAiInsight(article);
  const addLabel = `${sectionLabel(targetSection)} 추가`;
  const aiButtonLabel = assigned ? '추천 관점 보기' : '제안 문구로 보내기';

  return `
      <div class="panel-heading">
        <div>
          <p class="panel-kicker">${compact ? 'Quick' : 'Selected Article'}</p>
          <h3>${compact ? '빠른 확인' : '현재 기사'}</h3>
        </div>
        <span class="panel-pill tone-neutral">${selected ? '체크됨' : '단건 확인'}</span>
      </div>
      <div class="preview-title-block">
        <div class="builder-chip-row preview-pill-row">
          ${renderReportPills(article)}
          ${renderAiPriorityPill(article, { compact: true })}
          <span class="panel-pill tone-neutral">${escapeHtml(formatArticlePublishedTime(article))}</span>
        </div>
        <strong class="preview-inline-title">${escapeHtml(article.title || '')}</strong>
        <p class="preview-summary">${escapeHtml(renderedSummary)}</p>
      </div>
      ${compact
        ? `<p class="preview-compact-meta">${escapeHtml(compactMeta)}</p>`
        : `<dl class="meta-list preview-meta-list">
            <div>
              <dt>매체</dt>
              <dd>${escapeHtml(mediaLabel(article))}</dd>
            </div>
            <div>
              <dt>키워드</dt>
              <dd>${escapeHtml(article.keyword || '-')}</dd>
            </div>
            <div>
              <dt>상태</dt>
              <dd>${assigned ? '리포트 반영' : '대기'}</dd>
            </div>
            <div>
              <dt>추천 섹션</dt>
              <dd>${escapeHtml(sectionLabel(targetSection))}</dd>
            </div>
          </dl>`}
      <div class="preview-ai-card ${compact ? 'is-compact' : ''}">
        <div class="preview-ai-head">
          <div>
          <p class="panel-kicker">카카오 기준</p>
            <strong class="preview-ai-score">${escapeHtml(insight.bandLabel)} ${formatNumber(insight.score)}점</strong>
          </div>
          <span class="panel-pill tone-neutral">${escapeHtml(insight.actionLabel)}</span>
        </div>
        <div class="builder-chip-row preview-ai-chip-row">
          <span class="panel-pill tone-neutral">${escapeHtml(insight.formatLabel)}</span>
          <span class="panel-pill tone-neutral">${escapeHtml(insight.toneLabel)}</span>
          <span class="panel-pill tone-neutral">${insight.qualified ? '추천 기준 일치' : '추천 기준 미일치'}</span>
          ${insight.matchedThemes.slice(0, compact ? 1 : 2).map((theme) => `<span class="panel-pill tone-neutral">${escapeHtml(theme)}</span>`).join('')}
          ${compact ? '' : '<span class="panel-pill tone-neutral">로컬 미리보기</span>'}
        </div>
        <ul class="preview-ai-reasons">
          ${insight.reasons.slice(0, compact ? 1 : 2).map((reason) => `<li>${escapeHtml(reason)}</li>`).join('')}
        </ul>
        <div class="preview-ai-draft">
          <span class="preview-ai-draft-label">추천 관점</span>
          <strong>${escapeHtml(insight.draft.title)}</strong>
          <p>${escapeHtml(compact ? truncateText(insight.draft.intro, 96) : insight.draft.intro)}</p>
          ${compact ? '' : `<p class="small-copy">한줄요약 제안: ${escapeHtml(insight.draft.keyPoint)}</p>`}
        </div>
      </div>
      <div class="inline-actions compact stack-mobile preview-actions">
        <button class="ghost-btn" type="button" id="${escapeHtml(prefix)}-open-article" ${article.url ? '' : 'disabled'}>기사 열기</button>
        ${canAdd
          ? `<button class="primary-btn" type="button" id="${escapeHtml(prefix)}-add-report">${escapeHtml(addLabel)}</button>`
          : `<button class="ghost-btn" type="button" id="${escapeHtml(prefix)}-open-builder">리포트 빌더 보기</button>`}
        <button class="${canAdd ? 'ghost-btn' : 'primary-btn'}" type="button" id="${escapeHtml(prefix)}-send-ai-draft">${escapeHtml(aiButtonLabel)}</button>
      </div>
  `;
};

function renderInboxEmptyState({ activeFilterCount = 0, aiFilterCounts = {} } = {}) {
  if (state.inboxAiFilter === 'recommended') {
    const hasHiddenRecommendations = Number(aiFilterCounts.recommended || 0) > 0;
    const description = hasHiddenRecommendations
      ? '카카오 추천 후보는 있지만 현재 섹션·상태·검색 조건에서 모두 제외됐습니다. 필터 초기화로 전체 후보를 확인하세요.'
      : '사업 성과·신규 서비스·AI/인프라·임원 인터뷰·MOU·투자 신호가 강한 후보가 보이지 않습니다. 추천 실행으로 후보를 다시 정리할 수 있습니다.';

    return `
      <div class="data-empty inbox-empty-state" id="inbox-empty">
        <strong>카카오 기준 추천 기사가 없습니다</strong>
        <p>${escapeHtml(description)}</p>
        <div class="inline-actions compact stack-mobile inbox-empty-actions">
          ${hasHiddenRecommendations || activeFilterCount
            ? '<button class="ghost-btn" type="button" id="inbox-empty-clear-filters">필터 초기화</button>'
            : ''}
          <button class="primary-btn" type="button" id="inbox-empty-run-ai" ${state.inboxAiCurationBusy || !state.articles.length ? 'disabled' : ''}>추천 다시 실행</button>
          <button class="ghost-btn" type="button" id="inbox-empty-show-all">전체 기사 보기</button>
        </div>
      </div>
    `;
  }

  if (activeFilterCount) {
    return `
      <div class="data-empty inbox-empty-state" id="inbox-empty">
        <strong>조건에 맞는 기사가 없습니다</strong>
        <p>필터나 검색어 때문에 목록이 비었습니다. 현재 조건을 초기화하면 전체 기사를 다시 볼 수 있습니다.</p>
        <div class="inline-actions compact stack-mobile inbox-empty-actions">
          <button class="primary-btn" type="button" id="inbox-empty-clear-filters">필터 초기화</button>
        </div>
      </div>
    `;
  }

  return renderDataEmpty('inbox-empty', '조건에 맞는 기사가 없습니다', '검색어를 바꿔보세요.');
}

renderInbox = function renderInboxOverride() {
  updateShellMeta();
  normalizeInboxKeywordFilter();
  const data = filteredArticles();
  const filterScope = filterInboxArticles({ ignoreStatusFilter: true });
  const aiFilterScope = filterInboxArticles({ ignoreStatusFilter: true, ignoreAiFilter: true });
  if (!data.some((article) => articleKey(article) === articleKey(state.selectedArticle))) {
    state.selectedArticle = data[0] || null;
    state.inboxPreviewOpen = false;
  }

  const sections = getReportSections();
  const keywordGroups = inboxKeywordGroups();
  const statusCounts = {
    all: state.articles.length,
    major: state.articles.filter((article) => article.section === 'major').length,
    industry: state.articles.filter((article) => article.section === 'industry').length
  };
  const aiFilterCounts = {
    all: aiFilterScope.length,
    recommended: aiFilterScope.filter((article) => isKakaoAiRecommended(article)).length
  };
  const statusFilterCounts = {
    all: filterScope.length,
    unreported: filterScope.filter((article) => !isArticleAssigned(article)).length,
    reported: filterScope.filter((article) => isArticleAssigned(article)).length
  };
  const maxPage = Math.max(1, Math.ceil(data.length / state.pageSize));
  state.selectedPage = Math.min(state.selectedPage, maxPage);
  const start = (state.selectedPage - 1) * state.pageSize;
  const visible = data.slice(start, start + state.pageSize);
  if (!visible.some((article) => articleKey(article) === articleKey(state.selectedArticle))) {
    state.selectedArticle = visible[0] || null;
  }

  const selectableVisible = visible.filter((article) => !isArticleAssigned(article));
  const selectedCount = selectedArticleCount();
  const visibleSelectedCount = selectableVisible.filter((article) => isArticleSelected(article)).length;
  const allVisibleSelected = selectableVisible.length > 0 && visibleSelectedCount === selectableVisible.length;
  const selectedArticles = getSelectedArticles();
  const majorAssignment = summarizeAssignableArticles('major', selectedArticles);
  const industryAssignment = summarizeAssignableArticles('industry', selectedArticles);
  const inboxAssignment = summarizeInboxAssignableArticles(selectedArticles);
  const assignedCount = sections.major.length + sections.industry.length;
  const previewArticle = state.selectedArticle;
  const canOpenSelected = selectedArticles.some((article) => Boolean(article?.url));
  const searchQuery = String(state.inboxSearchQuery || '').trim();
  const activeFilterCount = activeInboxFilterCount();
  const activeFilterLabels = activeInboxFilterLabels();
  const advancedFilterCount = activeFilterCount - (searchQuery ? 1 : 0);
  const advancedFiltersOpen = state.inboxFiltersOpen;
  const bulkHelpText = majorAssignment.blocked.length
    ? `업계 보도 ${formatNumber(majorAssignment.blocked.length)}건은 주요 보도로 옮길 수 없습니다.`
    : selectedCount
      ? '선택한 기사만 일괄 처리합니다.'
      : '';

  document.body.classList.toggle('has-mobile-selection-bar', selectedCount > 0);
  document.body.classList.toggle('has-mobile-preview-bar', Boolean(previewArticle) && !selectedCount);
  document.body.classList.toggle('has-mobile-preview-sheet', Boolean(previewArticle) && !selectedCount && state.inboxPreviewOpen);
  const modalOpen = Boolean(state.inboxAiCurationModalOpen || state.inboxAiCurationBusy);
  document.documentElement.classList.toggle('has-modal-open', modalOpen);
  document.body.classList.toggle('has-modal-open', modalOpen);

  app.innerHTML = `
    <section class="page ${selectedCount ? 'has-mobile-selection-bar' : ''}" id="article-inbox-page">
      ${renderWorkflowProgress('inbox')}
      <div class="inbox-layout">
        <div class="content-stack inbox-stack">
          <article class="card table-card inbox-table-card">
            ${renderAnnotation('SCR-INBOX-TABLE-001')}
            <div class="toolbar-topline">
              <div>
                <p class="panel-kicker">기사 목록</p>
                <h3>기사 목록</h3>
              </div>
              <div class="toolbar-meta">
                <span class="panel-pill tone-neutral">${searchQuery ? `검색 결과 ${formatNumber(data.length)}건` : `${formatNumber(data.length)}건 표시`}</span>
              </div>
            </div>

            <div class="table-control-stack">
              <div class="table-control-bar inbox-essential-controls">
                <div class="chip-group chip-group-inline">
                  ${[
                    ['all', '전체', statusCounts.all],
                    ['major', '주요 보도', statusCounts.major],
                    ['industry', '업계 보도', statusCounts.industry]
                  ].map(([value, label, count]) => `
                    <button class="filter-chip ${state.inboxSectionFilter === value ? 'active' : ''}" data-filter="${value}" aria-pressed="${state.inboxSectionFilter === value}">
                      <strong>${escapeHtml(label)}</strong>
                      <span>${formatNumber(count)}</span>
                    </button>
                  `).join('')}
                </div>
                <button
                  class="ghost-btn inbox-advanced-toggle"
                  id="inbox-toggle-advanced"
                  type="button"
                  aria-expanded="${advancedFiltersOpen}"
                  aria-controls="inbox-advanced-panel"
                >
                  ${advancedFiltersOpen ? '고급 필터 접기' : `고급 필터${advancedFilterCount ? ` ${formatNumber(advancedFilterCount)}` : ''}`}
                </button>
              </div>

              <div class="inbox-search-row">
                <label class="search-field inbox-search-field" for="inbox-search">
                  <span class="search-field-kicker">검색</span>
                  <input
                    id="inbox-search"
                    type="search"
                    inputmode="search"
                    aria-label="기사 검색"
                    placeholder="제목 · 요약 · 매체 · 키워드 검색"
                    value="${escapeHtml(searchQuery)}"
                  />
                  ${searchQuery ? '<button class="ghost-btn search-clear-btn" id="inbox-search-clear" type="button">지우기</button>' : ''}
                </label>
              </div>

              <div class="inbox-active-filter-summary ${activeFilterLabels.length ? 'has-filters' : ''}">
                <div>
                  <span>현재 보기</span>
                  <strong>${escapeHtml(activeFilterLabels.length ? activeFilterLabels.join(' · ') : '전체 기사')}</strong>
                </div>
                <p>${escapeHtml(`${formatNumber(data.length)}건 표시 · 미반영 ${formatNumber(statusFilterCounts.unreported)}건 · 카카오 추천 ${formatNumber(aiFilterCounts.recommended)}건`)}</p>
                ${activeFilterCount ? '<button class="ghost-btn" id="inbox-clear-filters-summary" type="button">필터 초기화</button>' : ''}
              </div>

              <div class="inbox-advanced-panel ${advancedFiltersOpen ? 'is-open' : ''}" id="inbox-advanced-panel" ${advancedFiltersOpen ? '' : 'hidden'}>
                <div class="chip-group chip-group-inline inbox-status-group">
                  ${[
                    ['all', '전체 상태', statusFilterCounts.all],
                    ['unreported', '미반영만', statusFilterCounts.unreported],
                    ['reported', '리포트 반영', statusFilterCounts.reported]
                  ].map(([value, label, count]) => `
                    <button class="filter-chip keyword-chip ${state.inboxStatusFilter === value ? 'active' : ''}" data-status-filter="${value}" aria-pressed="${state.inboxStatusFilter === value}">
                      <strong>${escapeHtml(label)}</strong>
                      <span>${formatNumber(count)}</span>
                    </button>
                  `).join('')}
                </div>
                <div class="chip-group chip-group-inline inbox-status-group">
                  ${[
                    ['all', '전체 기사', aiFilterCounts.all],
                    ['recommended', '카카오 추천만', aiFilterCounts.recommended]
                  ].map(([value, label, count]) => `
                    <button class="filter-chip keyword-chip ${state.inboxAiFilter === value ? 'active' : ''}" data-ai-filter="${value}" aria-pressed="${state.inboxAiFilter === value}">
                      <strong>${escapeHtml(label)}</strong>
                      <span>${formatNumber(count)}</span>
                    </button>
                  `).join('')}
                </div>

                <div class="inbox-utility-row">
                  <div class="toolbar-stats inbox-results-pills">
                    <span class="panel-pill tone-neutral">현재 범위 ${formatNumber(filterScope.length)}건</span>
                    <span class="panel-pill tone-neutral">카카오 추천 ${formatNumber(aiFilterCounts.recommended)}건</span>
                    <span class="panel-pill tone-neutral">미반영 ${formatNumber(statusFilterCounts.unreported)}건</span>
                    <span class="panel-pill tone-neutral">리포트 반영 ${formatNumber(assignedCount)}건</span>
                    ${activeFilterCount ? `<span class="panel-pill tone-neutral">활성 필터 ${formatNumber(activeFilterCount)}개</span>` : ''}
                    ${searchQuery ? `<span class="panel-pill tone-neutral">검색어 "${escapeHtml(searchQuery)}"</span>` : ''}
                  </div>
                  <div class="inline-actions compact inbox-jump-actions">
                    ${activeFilterCount ? '<button class="ghost-btn" id="inbox-clear-filters">필터 초기화</button>' : ''}
                    <button class="ghost-btn" id="jump-current-article" ${previewArticle ? '' : 'disabled'}>현재 기사로</button>
                    <button class="ghost-btn" id="scroll-top-inbox">맨 위로</button>
                  </div>
                </div>
              </div>
            </div>

            ${(advancedFiltersOpen && (state.inboxSavedPresets.length || state.inboxRecentSearches.length || activeFilterCount))
              ? `<div class="inbox-memory-stack">
                  <div class="inbox-memory-row">
                    <div class="inbox-memory-copy">
                      <strong>저장 조건</strong>
                    </div>
                    ${activeFilterCount ? '<button class="ghost-btn" id="inbox-save-preset" type="button">현재 필터 저장</button>' : ''}
                  </div>
                  ${state.inboxSavedPresets.length
                    ? `<div class="inbox-memory-group">
                        <span class="keyword-band-title">저장 프리셋</span>
                        <div class="inbox-memory-chip-list">
                          ${state.inboxSavedPresets.map((preset) => `
                            <div class="inbox-memory-chip">
                              <button class="filter-chip keyword-chip" type="button" data-apply-preset="${escapeHtml(preset.id)}">
                                <strong>${escapeHtml(preset.label)}</strong>
                                <span>적용</span>
                              </button>
                              <button class="ghost-btn inbox-memory-remove" type="button" data-remove-preset="${escapeHtml(preset.id)}" aria-label="${escapeHtml(`${preset.label} 프리셋 삭제`)}">삭제</button>
                            </div>
                          `).join('')}
                        </div>
                      </div>`
                    : ''}
                  ${state.inboxRecentSearches.length
                    ? `<div class="inbox-memory-group">
                        <span class="keyword-band-title">최근 검색</span>
                        <div class="chip-group chip-group-inline">
                          ${state.inboxRecentSearches.map((query) => `
                            <button class="filter-chip keyword-chip" type="button" data-apply-recent-search="${escapeHtml(query)}">
                              <strong>${escapeHtml(query)}</strong>
                            </button>
                          `).join('')}
                        </div>
                      </div>`
                    : ''}
                </div>`
              : ''}

            ${state.inboxSectionFilter !== 'all' && keywordGroups.length
              ? `<div class="keyword-band-list">
                  ${keywordGroups.map((group) => `
                    <div class="keyword-filter-band">
                      <div class="keyword-band-heading">
                        <strong class="keyword-band-title">${escapeHtml(group.label)}</strong>
                        ${group.subLabel ? `<span>${escapeHtml(group.subLabel)}</span>` : ''}
                      </div>
                      <div class="chip-group chip-group-inline">
                        <button class="filter-chip keyword-chip ${inboxKeywordFiltersForSection(group.key).length === 0 ? 'active' : ''}" data-clear-keyword-group="${escapeHtml(group.key)}" aria-pressed="${inboxKeywordFiltersForSection(group.key).length === 0}">
                          <strong>전체</strong>
                        </button>
                        ${group.options.map((keyword) => `
                          <button class="filter-chip keyword-chip ${hasInboxKeywordFilter(group.key, keyword) ? 'active' : ''}" data-keyword-section="${escapeHtml(group.key)}" data-keyword-filter="${escapeHtml(keyword)}" aria-pressed="${hasInboxKeywordFilter(group.key, keyword)}">
                            <strong>${escapeHtml(keyword)}</strong>
                          </button>
                        `).join('')}
                      </div>
                    </div>
                  `).join('')}
                </div>`
              : ''}

            <div class="selection-toolbar ${selectedCount ? '' : 'is-idle'}">
              <div class="selection-toolbar-summary">
                <label class="table-select-all">
                  <input type="checkbox" id="select-all-visible" ${allVisibleSelected ? 'checked' : ''} ${selectableVisible.length ? '' : 'disabled'} />
                  <span>현재 페이지 전체 선택</span>
                </label>
                <div class="selection-badge" aria-live="polite" aria-atomic="true">
                  <span>선택 기사</span>
                  <strong>${formatNumber(selectedCount)}</strong>
                </div>
              </div>
              ${selectedCount
                ? `
                  <div class="selection-insight">
                    <strong>추천 ${formatNumber(inboxAssignment.available.length)}건</strong>
                    <p>주요 ${formatNumber(majorAssignment.available.length)} · 업계 ${formatNumber(industryAssignment.available.length)}${majorAssignment.blocked.length ? ` · 제외 ${formatNumber(majorAssignment.blocked.length)}` : ''}</p>
                  </div>
                  <div class="toolbar-actions">
                    <div class="action-cluster action-cluster-primary">
                      <button class="primary-btn" id="add-selected-to-report" ${inboxAssignment.available.length ? '' : 'disabled'}>추천 경로 추가</button>
                    </div>
                    <div class="action-cluster">
                      <button class="ghost-btn" id="assign-major" ${majorAssignment.available.length ? '' : 'disabled'}>주요 보도만</button>
                      <button class="ghost-btn" id="assign-industry" ${industryAssignment.available.length ? '' : 'disabled'}>업계 보도만</button>
                    </div>
                    <div class="action-cluster">
                      <button class="ghost-btn" id="open-selected" aria-label="Open selected articles" ${canOpenSelected ? '' : 'disabled'}>선택 기사 열기</button>
                      <button class="ghost-btn" id="clear-selection" ${selectedCount ? '' : 'disabled'}>선택 해제</button>
                    </div>
                  </div>
                `
                : '<p class="selection-toolbar-hint">체크하면 일괄 버튼이 열립니다.</p>'}
            </div>

            ${bulkHelpText
              ? `<div class="toolbar-note ${majorAssignment.blocked.length ? 'has-lock' : ''}">
                  <strong>${majorAssignment.blocked.length ? '잠금' : '선택'}</strong>
                  <span>${bulkHelpText}</span>
                </div>`
              : ''}

            ${renderInboxAiCurationCard(state.articles)}

            ${renderInboxPaginationControls({ maxPage, mode: 'top' })}

            <div class="table table-articles">
              <div class="table-head">
                <span class="table-head-label table-head-label-center">선택</span>
                ${renderInboxSortHeader('title', '기사')}
                ${renderInboxSortHeader('score', '점수')}
                <span class="table-head-label table-head-label-center">상태</span>
                ${renderInboxSortHeader('media', '매체')}
                ${renderInboxSortHeader('time', '발행')}
                <span class="table-head-label table-head-label-center">액션</span>
              </div>
              ${visible.length
                ? visible.map((article, index) => {
                  const globalIndex = start + index;
                  const status = articleStatus(article);
                  const focused = articleKey(state.selectedArticle) === articleKey(article);
                  const picked = isArticleSelected(article);
                  const locked = isArticleAssigned(article);
                  const targetSection = inboxTargetSection(article);
                  const addEnabled = canAddInboxReport(article);
                  const rowAddLabel = addEnabled
                    ? `${article.title || '기사'} ${sectionLabel(targetSection)}에 보도 추가`
                    : `${article.title || '기사'} 보도 반영 완료`;
                  const sourcePill = renderArticleSourcePill(article);
                  const score = inboxArticleScore(article);
                  return `
                    <div class="table-row-wrap ${focused ? 'is-expanded' : ''}">
                      <div
                        class="table-row ${focused ? 'selected' : ''} ${picked ? 'picked' : ''} ${locked ? 'locked' : ''}"
                        data-index="${globalIndex}"
                        data-article-key="${escapeHtml(articleKey(article))}"
                        role="button"
                        tabindex="0"
                        aria-label="${escapeHtml(`${article.title || '기사'} 상세 보기`)}"
                      >
                        <div class="selection-cell">
                          <input type="checkbox" data-select-article="${globalIndex}" ${picked ? 'checked' : ''} ${locked ? 'disabled' : ''} aria-label="select article ${globalIndex + 1}" />
                        </div>
                        <div class="table-cell table-cell-title title-wrap">
                          <div class="title-meta-strip">
                            ${sourcePill || ''}
                            ${renderAiPriorityPill(article, { compact: true })}
                            <span class="panel-pill tone-neutral">${escapeHtml(article.keyword || '키워드 없음')}</span>
                          </div>
                          <strong>${highlightTitleKeywords(article.title, article)}</strong>
                          <p>${highlightSummaryKeywords(article.summary, article)}</p>
                        </div>
                        <div class="table-cell table-cell-score" data-label="점수"><strong>${formatNumber(score)}</strong><span>점</span></div>
                        <div class="table-cell table-cell-status" data-label="상태"><span class="status-badge status-${escapeHtml(status)}">${escapeHtml(statusLabel(status))}</span></div>
                        <div class="table-cell table-cell-media" data-label="매체">${escapeHtml(mediaLabel(article))}</div>
                        <div class="table-cell table-cell-time" data-label="발행">${escapeHtml(formatArticlePublishedTime(article))}</div>
                        <div class="table-cell table-cell-actions">
                          ${renderInboxActionButton({
                            actionName: 'open',
                            dataAttribute: 'data-open-article',
                            index: globalIndex,
                            disabled: !article.url,
                            label: `${article.title || '기사'} 기사 열기`,
                            tooltip: '기사 열기',
                            buttonText: '기사 열기',
                            extraClass: 'row-action-btn'
                          })}
                          ${renderInboxActionButton({
                            actionName: 'add',
                            dataAttribute: 'data-add-report-article',
                            index: globalIndex,
                            disabled: !addEnabled,
                            label: rowAddLabel,
                            tooltip: addEnabled ? `${sectionLabel(targetSection)} 추가` : '반영 완료',
                            buttonText: addEnabled ? (targetSection === 'major' ? '주요 보도' : '업계 보도') : '반영 완료',
                            extraClass: `row-action-btn ${addEnabled ? 'is-primary' : 'is-complete'}`
                          })}
                        </div>
                      </div>
                    </div>
                  `;
                }).join('')
                : renderInboxEmptyState({ activeFilterCount, aiFilterCounts })}
            </div>

            ${renderInboxPaginationControls({ maxPage, mode: 'bottom' })}
          </article>
        </div>

        <aside class="inbox-preview-rail">
          ${renderInboxPreviewPanel(previewArticle)}
        </aside>
      </div>
      ${renderMobileSelectionBar({
        selectedCount,
        inboxAssignment,
        canOpenSelected
      })}
      ${renderMobilePreviewDock(previewArticle, { selectedCount })}
      ${renderInboxAiBusyOverlay()}
      ${renderInboxAiCurationResultModal()}
    </section>
  `;

  if (state.inboxAiCurationModalOpen && state.inboxAiCurationResult) {
    queueMicrotask(() => {
      document.getElementById('inbox-ai-curation-modal')?.focus();
    });
  }

  bindWorkflowProgressActions();

  document.getElementById('inbox-ai-curation-toggle')?.addEventListener('click', () => {
    state.inboxAiCurationOpen = !state.inboxAiCurationOpen;
    renderInbox();
  });

  document.getElementById('inbox-ai-curation-open-modal')?.addEventListener('click', () => {
    if (!state.inboxAiCurationResult) return;
    state.inboxAiCurationModalOpen = true;
    renderInbox();
  });

  document.getElementById('inbox-ai-curation-modal-close')?.addEventListener('click', () => {
    state.inboxAiCurationModalOpen = false;
    renderInbox();
  });

  document.getElementById('inbox-ai-curation-modal-backdrop')?.addEventListener('click', (event) => {
    if (event.target.id !== 'inbox-ai-curation-modal-backdrop') return;
    state.inboxAiCurationModalOpen = false;
    renderInbox();
  });

  app.querySelectorAll('[data-ai-focus-article]').forEach((button) => {
    button.addEventListener('click', () => {
      const key = button.dataset.aiFocusArticle || '';
      focusInboxArticleByKey(key);
    });
  });

  app.querySelectorAll('[data-ai-curation-focus]').forEach((button) => {
    button.addEventListener('click', () => {
      const key = button.dataset.aiCurationFocus || '';
      focusInboxArticleByKey(key);
    });
  });

  app.querySelectorAll('[data-ai-curation-add]').forEach((button) => {
    button.addEventListener('click', () => {
      const key = button.dataset.aiCurationAdd || '';
      const sectionName = button.dataset.aiCurationSection || 'major';
      addAiCurationPickToReport(sectionName, key);
    });
  });

  app.querySelectorAll('[data-ai-curation-open-builder]').forEach((button) => {
    button.addEventListener('click', () => {
      const key = button.dataset.aiCurationOpenBuilder || '';
      const sections = getReportSections();
      const majorArticle = sections.major.find((article) => articleKey(article) === key);
      const industryArticle = sections.industry.find((article) => articleKey(article) === key);
      const entry = majorArticle
        ? draftEntryKey('major', majorArticle)
        : industryArticle
          ? draftEntryKey('industry', industryArticle)
          : '';
      if (entry) {
        setBuilderFocus(entry);
      }
      state.builderDraftTab = 'suggestion';
      render('builder');
    });
  });

  app.querySelectorAll('[data-ai-curation-add-all]').forEach((button) => {
    button.addEventListener('click', () => {
      const sectionName = button.dataset.aiCurationAddAll || 'major';
      addAllAiCurationPicksToReport(sectionName);
    });
  });

  document.getElementById('inbox-toggle-advanced')?.addEventListener('click', () => {
    state.inboxFiltersOpen = !state.inboxFiltersOpen;
    renderInbox();
  });

  const addSelectedToReportButton = document.getElementById('add-selected-to-report');
  if (addSelectedToReportButton) {
    addSelectedToReportButton.classList.add('toolbar-btn');
    addSelectedToReportButton.disabled = !inboxAssignment.available.length;
    addSelectedToReportButton.setAttribute('aria-label', 'Add selected articles to their recommended report section');
  }

  document.getElementById('open-selected')?.classList.add('toolbar-btn');
  document.getElementById('clear-selection')?.classList.add('toolbar-btn');
  document.getElementById('assign-major')?.classList.add('toolbar-btn');
  document.getElementById('assign-industry')?.classList.add('toolbar-btn');

  document.querySelectorAll('[data-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      const changed = handleInboxFilterChange(() => {
        state.inboxSectionFilter = button.dataset.filter || 'all';
        if (button.dataset.filter === 'all') {
          setInboxKeywordFilterTokens([]);
        }
      });
      if (changed) renderInbox();
    });
  });

  document.querySelectorAll('[data-status-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      const changed = handleInboxFilterChange(() => {
        state.inboxStatusFilter = button.dataset.statusFilter || 'all';
      });
      if (changed) renderInbox();
    });
  });

  document.querySelectorAll('[data-ai-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      const changed = handleInboxFilterChange(() => {
        state.inboxAiFilter = button.dataset.aiFilter || 'all';
      });
      if (changed) renderInbox();
    });
  });

  document.getElementById('inbox-ai-token')?.addEventListener('input', (event) => {
    setStoredAiToken(event.currentTarget.value);
  });

  document.getElementById('inbox-ai-curation-prompt')?.addEventListener('input', (event) => {
    state.inboxAiCurationPrompt = event.currentTarget.value;
  });

  document.getElementById('inbox-ai-curation-reset')?.addEventListener('click', () => {
    state.inboxAiCurationPrompt = DEFAULT_INBOX_AI_CURATION_PROMPT;
    renderInbox();
  });

  document.querySelectorAll('#inbox-ai-curation-run, #inbox-ai-curation-run-compact').forEach((button) => {
    button.addEventListener('click', async () => {
      const promptInput = document.getElementById('inbox-ai-curation-prompt');
      if (promptInput) {
        state.inboxAiCurationPrompt = promptInput.value;
      }
      await curateInboxArticlesWithAi();
    });
  });

  document.querySelectorAll('[data-clear-keyword-group]').forEach((button) => {
    button.addEventListener('click', () => {
      const changed = handleInboxFilterChange(() => {
        clearInboxKeywordFiltersForSection(button.dataset.clearKeywordGroup || '');
      });
      if (changed) renderInbox();
    });
  });

  document.querySelectorAll('[data-keyword-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      const changed = handleInboxFilterChange(() => {
        toggleInboxKeywordFilter(button.dataset.keywordSection || '', button.dataset.keywordFilter || '');
      });
      if (changed) renderInbox();
    });
  });

  document.querySelectorAll('[data-sort-key]').forEach((button) => {
    button.addEventListener('click', () => {
      toggleInboxSort(button.dataset.sortKey || 'time');
      state.selectedPage = 1;
      renderInbox();
    });
  });

  const inboxSearchInput = document.getElementById('inbox-search');
  if (inboxSearchInput) {
    inboxSearchInput.addEventListener('compositionstart', () => {
      inboxSearchCompositionActive = true;
    });

    inboxSearchInput.addEventListener('compositionend', (event) => {
      inboxSearchCompositionActive = false;
      const target = event.currentTarget;
      const selection = {
        start: target.selectionStart ?? target.value.length,
        end: target.selectionEnd ?? target.value.length
      };

      if (setInboxSearchQuery(target.value)) {
        renderInbox();
        requestAnimationFrame(() => {
          restoreInboxSearchField(selection);
        });
      }
    });

    inboxSearchInput.addEventListener('input', (event) => {
      if (inboxSearchCompositionActive || event.isComposing) {
        return;
      }

      const target = event.currentTarget;
      const selection = {
        start: target.selectionStart ?? target.value.length,
        end: target.selectionEnd ?? target.value.length
      };

      if (setInboxSearchQuery(target.value)) {
        renderInbox();
        requestAnimationFrame(() => {
          restoreInboxSearchField(selection);
        });
      }
    });
  }

  document.getElementById('inbox-search-clear')?.addEventListener('click', () => {
    if (setInboxSearchQuery('')) {
      renderInbox();
      requestAnimationFrame(() => {
        restoreInboxSearchField({ start: 0, end: 0 });
      });
    }
  });

  inboxSearchInput?.addEventListener('change', (event) => {
    commitInboxRecentSearch(event.currentTarget.value);
  });

  const clearInboxFilters = () => {
    const hadSelection = selectedArticleCount() > 0;
    const changed = handleInboxFilterChange(() => {
      state.inboxSectionFilter = 'all';
      state.inboxStatusFilter = 'all';
      state.inboxAiFilter = 'all';
      state.inboxSearchQuery = '';
      setInboxKeywordFilterTokens([]);
    });
    if (!changed) return;
    renderInbox();
    if (!hadSelection) {
      showToast('필터를 초기화했습니다.');
    }
  };

  document.getElementById('inbox-clear-filters')?.addEventListener('click', clearInboxFilters);
  document.getElementById('inbox-clear-filters-summary')?.addEventListener('click', clearInboxFilters);
  document.getElementById('inbox-empty-clear-filters')?.addEventListener('click', clearInboxFilters);
  document.getElementById('inbox-empty-show-all')?.addEventListener('click', clearInboxFilters);
  document.getElementById('inbox-empty-run-ai')?.addEventListener('click', async () => {
    await curateInboxArticlesWithAi();
  });

  document.getElementById('inbox-save-preset')?.addEventListener('click', () => {
    saveCurrentInboxPreset();
    renderInbox();
  });

  document.querySelectorAll('[data-apply-preset]').forEach((button) => {
    button.addEventListener('click', () => {
      applyInboxPreset(button.dataset.applyPreset || '');
    });
  });

  document.querySelectorAll('[data-remove-preset]').forEach((button) => {
    button.addEventListener('click', () => {
      removeInboxPreset(button.dataset.removePreset || '');
      showToast('저장 프리셋을 삭제했습니다.');
      renderInbox();
    });
  });

  document.querySelectorAll('[data-apply-recent-search]').forEach((button) => {
    button.addEventListener('click', () => {
      const query = button.dataset.applyRecentSearch || '';
      if (!setInboxSearchQuery(query)) return;
      renderInbox();
      requestAnimationFrame(() => {
        restoreInboxSearchField({ start: query.length, end: query.length }, { focus: false });
      });
    });
  });

  document.getElementById('page-size')?.addEventListener('change', (event) => {
    state.pageSize = Number(event.target.value);
    state.selectedPage = 1;
    renderInbox();
  });

  ['prev-page', 'prev-page-top'].forEach((id) => {
    document.getElementById(id)?.addEventListener('click', () => {
      state.selectedPage = Math.max(1, state.selectedPage - 1);
      renderInbox();
    });
  });

  ['next-page', 'next-page-top'].forEach((id) => {
    document.getElementById(id)?.addEventListener('click', () => {
      state.selectedPage = Math.min(maxPage, state.selectedPage + 1);
      renderInbox();
    });
  });

  document.getElementById('jump-current-article')?.addEventListener('click', () => {
    if (!previewArticle) return;
    const selector = `.table-row[data-article-key="${CSS.escape(articleKey(previewArticle))}"]`;
    app.querySelector(selector)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  document.getElementById('scroll-top-inbox')?.addEventListener('click', () => {
    document.getElementById('article-inbox-page')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  document.querySelectorAll('[data-select-article]').forEach((checkbox) => {
    checkbox.addEventListener('click', (event) => {
      event.stopPropagation();
      const article = data[Number(checkbox.dataset.selectArticle)] || null;
      if (!article) return;
      toggleArticleSelection(article, checkbox.checked);
      renderInbox();
    });
  });

  document.querySelectorAll('[data-open-article]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const article = data[Number(button.dataset.openArticle)] || null;
      if (!article?.url) return;
      openArticleUrl(article.url);
    });
  });

  document.querySelectorAll('[data-add-report-article]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const article = data[Number(button.dataset.addReportArticle)] || null;
      if (!article) return;
      const snapshot = captureWorkspaceSnapshot();
      const targetSection = inboxTargetSection(article);
      const result = addArticleToReportSection(targetSection, article);
      if (result.added) {
        deselectArticles([article]);
        registerUndoAction(`기사를 ${sectionLabel(targetSection)}에 추가했습니다.`, snapshot);
      } else if (result.reason === 'industry_to_main_blocked') {
        showToast('업계 보도에 들어간 기사는 주요 보도로 올릴 수 없습니다.');
      }
      renderInbox();
    });
  });

  app.querySelectorAll('.table-row[data-index]').forEach((row) => {
    const focusArticle = () => {
      state.selectedArticle = data[Number(row.dataset.index)] || null;
      state.inboxPreviewOpen = false;
      renderInbox();
    };

    row.addEventListener('click', focusArticle);
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        focusArticle();
      }
    });
  });

  document.getElementById('select-all-visible')?.addEventListener('change', (event) => {
    toggleVisibleArticleSelection(visible, event.target.checked);
    renderInbox();
  });

  document.getElementById('clear-selection')?.addEventListener('click', () => {
    clearSelectedArticles();
    renderInbox();
  });

  addSelectedToReportButton?.addEventListener('click', () => {
    assignSelectedArticlesToInboxReport();
    renderInbox();
  });

  document.getElementById('assign-major')?.addEventListener('click', () => {
    assignSelectedArticlesToSection('major');
    renderInbox();
  });

  document.getElementById('assign-industry')?.addEventListener('click', () => {
    assignSelectedArticlesToSection('industry');
    renderInbox();
  });

  document.getElementById('open-selected')?.addEventListener('click', () => {
    openSelectedArticles();
  });

  document.getElementById('mobile-add-selected')?.addEventListener('click', () => {
    assignSelectedArticlesToInboxReport();
    renderInbox();
  });

  document.getElementById('mobile-open-selected')?.addEventListener('click', () => {
    openSelectedArticles();
  });

  document.getElementById('mobile-clear-selection')?.addEventListener('click', () => {
    clearSelectedArticles();
    renderInbox();
  });

  const addPreviewArticleToReport = (article) => {
    if (!article) return;
    const snapshot = captureWorkspaceSnapshot();
    const targetSection = inboxTargetSection(article);
    const result = addArticleToReportSection(targetSection, article);
    if (result.added) {
      deselectArticles([article]);
      registerUndoAction(`기사를 ${sectionLabel(targetSection)}에 추가했습니다.`, snapshot);
    }
    state.inboxPreviewOpen = false;
    renderInbox();
  };

  const openPreviewBuilder = () => {
    state.builderSideView = 'draft';
    state.inboxPreviewOpen = false;
    render('builder');
  };

  document.getElementById('preview-open-article')?.addEventListener('click', () => {
    if (previewArticle?.url) {
      openArticleUrl(previewArticle.url);
    }
  });

  document.getElementById('preview-add-report')?.addEventListener('click', () => {
    addPreviewArticleToReport(previewArticle);
  });

  document.getElementById('preview-open-builder')?.addEventListener('click', () => {
    openPreviewBuilder();
  });

  document.getElementById('preview-send-ai-draft')?.addEventListener('click', () => {
    sendArticleToBuilderWithAi(previewArticle);
  });

  document.getElementById('mobile-preview-open-article')?.addEventListener('click', () => {
    if (previewArticle?.url) {
      openArticleUrl(previewArticle.url);
    }
  });

  document.getElementById('mobile-preview-add-report')?.addEventListener('click', () => {
    addPreviewArticleToReport(previewArticle);
  });

  document.getElementById('mobile-preview-open-builder')?.addEventListener('click', () => {
    openPreviewBuilder();
  });

  document.getElementById('mobile-preview-send-ai-draft')?.addEventListener('click', () => {
    sendArticleToBuilderWithAi(previewArticle);
  });

  document.getElementById('mobile-preview-toggle')?.addEventListener('click', () => {
    state.inboxPreviewOpen = true;
    renderInbox();
  });

  ['mobile-preview-close', 'mobile-preview-dismiss'].forEach((id) => {
    document.getElementById(id)?.addEventListener('click', () => {
      state.inboxPreviewOpen = false;
      renderInbox();
    });
  });
};

function renderBuilderInlineSuggestionSummary(article, entryKey) {
  const insight = buildArticleAiInsight(article);
  const themeLabels = articleRecommendationThemeLabels(article, { sectionName: article?.section || '' });
  return `
    <div class="builder-inline-suggestion">
      <div class="builder-inline-suggestion-head">
        <div>
          <span>추천 관점</span>
          <strong>${escapeHtml(insight.draft.title)}</strong>
        </div>
        <button class="ghost-btn" type="button" data-builder-show-suggestion="${escapeHtml(entryKey)}">자세히</button>
      </div>
      <p>${escapeHtml(insight.draft.keyPoint)}</p>
      ${themeLabels.length
        ? `<div class="builder-chip-row preview-ai-chip-row">
            ${themeLabels.map((label) => `<span class="panel-pill tone-neutral">${escapeHtml(label)}</span>`).join('')}
          </div>`
        : ''}
    </div>
  `;
}

renderBuilderColumn = function renderBuilderColumnOverride(sectionName, items) {
  const heading = builderSectionHeading(sectionName);
  return `
    <article class="card builder-column" data-drop-zone="${sectionName}">
      ${renderAnnotation(sectionName === 'major' ? 'SCR-BUILD-MAJOR-001' : 'SCR-BUILD-INDUSTRY-001')}
      <div class="panel-heading">
        <div>
          <h3>${heading}</h3>
        </div>
        <span class="panel-pill tone-neutral">${formatNumber(items.length)}건</span>
      </div>
      <div class="builder-card-list">
        ${items.length
          ? items.map((article) => {
            const entryKey = draftEntryKey(sectionName, article);
            const active = entryKey === state.builderFocusKey;
            return `
              <div class="builder-item ${active ? 'active is-expanded' : ''}" data-builder-focus="${escapeHtml(entryKey)}">
                <div class="builder-item-head">
                  <div class="builder-item-head-copy">
                    <strong>${escapeHtml(article.title)}</strong>
                    <p class="builder-item-subcopy">${escapeHtml(mediaLabel(article))} · ${escapeHtml(article.keyword || '-')}</p>
                  </div>
                  <span class="panel-pill tone-neutral">${active ? '편집 중' : '카드 선택'}</span>
                </div>
                ${renderBuilderItemMeta(article)}
                ${renderBuilderItemSummaryRows(article)}
                ${active
                  ? `${renderBuilderInlineSuggestionSummary(article, entryKey)}${renderBuilderInlineEditor(sectionName, article, entryKey)}`
                  : '<p class="small-copy builder-item-hint">선택해 편집</p>'}
              </div>
            `;
          }).join('')
          : renderDataEmpty(`builder-empty-${sectionName}`, '카드 없음', '기사 선택 후 표시됩니다.')}
      </div>
    </article>
  `;
};

renderBuilderDetailPanel = function renderBuilderDetailPanelOverride() {
  return '';
};

renderReportBuilder = function renderReportBuilderOverride() {
  updateShellMeta();
  ensureBuilderFocus();
  state.builderSideView = 'draft';
  const sections = getReportSections();
  const canImportArticles = canImportCustomBuilderArticles();
  const reportText = state.reportTextDraft || generateReportText();
  const reportItemCount = sections.major.length + sections.industry.length;
  const totalDraftChars = characterLength(reportText);
  const importFeedback = getBuilderImportFeedback(state.builderImportUrl, state.builderImportSection);
  const existingImportLocation = state.builderImportUrl
    ? findExistingArticleLocation({ url: state.builderImportUrl, title: '', publisher: '' })
    : null;

  app.innerHTML = `
    <section class="page" id="report-builder-page">
      ${renderWorkflowProgress('builder')}
      <div class="builder-layout">
        <div class="builder-workspace">
          ${canImportArticles
            ? `
              <article class="card builder-toolbar-card">
                <div class="panel-heading">
                  <div>
                    <h3>기사 추가</h3>
                  </div>
                  <button class="${state.builderImportOpen ? 'ghost-btn' : 'primary-btn'}" id="builder-toggle-import">
                    ${state.builderImportOpen ? '입력 닫기' : '직접 링크 추가'}
                  </button>
                </div>
                ${state.builderImportOpen
                  ? `
                    <form class="builder-import-form" id="builder-import-form">
                      <label class="detail-field builder-import-field">
                        <span>기사 링크</span>
                        <input
                          id="builder-import-url"
                          type="url"
                          inputmode="url"
                          placeholder="https://기사-링크"
                          value="${escapeHtml(state.builderImportUrl)}"
                          ${state.builderImportBusy ? 'disabled' : ''}
                        />
                      </label>
                      <div class="builder-import-section" role="group" aria-label="추가 위치 선택">
                        ${[
                          ['major', '주요 보도'],
                          ['industry', '업계 보도']
                        ].map(([value, label]) => `
                          <button
                            type="button"
                            class="filter-chip ${state.builderImportSection === value ? 'active' : ''}"
                            data-builder-import-section="${value}"
                            aria-pressed="${state.builderImportSection === value}"
                            ${state.builderImportBusy ? 'disabled' : ''}
                          >
                            <strong>${label}</strong>
                          </button>
                        `).join('')}
                      </div>
                      <div class="inline-actions compact builder-import-actions">
                        <button type="button" class="ghost-btn" id="builder-import-cancel" ${state.builderImportBusy ? 'disabled' : ''}>취소</button>
                        <button type="submit" class="primary-btn" id="builder-import-submit" ${(state.builderImportBusy || existingImportLocation || importFeedback.state === 'invalid' || importFeedback.state === 'idle') ? 'disabled' : ''}>
                          ${state.builderImportBusy ? '기사 가져오는 중...' : '링크 기사 추가'}
                        </button>
                      </div>
                      <div class="builder-import-status is-${escapeHtml(importFeedback.state)}">
                        <strong>${escapeHtml(importFeedback.title)}</strong>
                        <p>${escapeHtml(importFeedback.description)}</p>
                      </div>
                      ${existingImportLocation
                        ? `<div class="builder-import-duplicate">
                            <strong>${escapeHtml(existingImportLocation.scope === 'report' ? '이미 리포트에 있는 링크입니다.' : '기사 인박스에 이미 있는 링크입니다.')}</strong>
                            <button type="button" class="ghost-btn" id="builder-import-duplicate-jump">${escapeHtml(existingImportLocation.scope === 'report' ? '기존 카드 보기' : '인박스에서 보기')}</button>
                          </div>`
                        : ''}
                    </form>
                  `
                  : ''
                }
              </article>
            `
            : ''}
          <div class="builder-columns">
            ${renderBuilderColumn('major', sections.major)}
            ${renderBuilderColumn('industry', sections.industry)}
          </div>
        </div>

        <aside class="builder-side-stack">
          ${renderBuilderDraftPanel({
            reportText,
            reportItemCount,
            totalDraftChars,
            sections,
            canImportArticles
          })}
        </aside>
      </div>
      ${renderBuilderAiBusyOverlay()}
      ${renderAiReviewCard()}
    </section>
  `;

  if (state.pendingAiReview?.proposals?.length) {
    queueMicrotask(() => {
      document.getElementById('builder-ai-review-card')?.focus();
    });
  }

  bindWorkflowProgressActions();

  app.querySelectorAll('[data-builder-draft-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      const nextTab = button.dataset.builderDraftTab === 'suggestion' ? 'suggestion' : 'draft';
      if (nextTab === 'suggestion' && !findDraftLocation(state.builderFocusKey)) return;
      state.builderDraftTab = nextTab;
      renderReportBuilder();
    });
  });

  document.getElementById('builder-open-ai-source')?.addEventListener('click', () => {
    const location = findDraftLocation(state.builderFocusKey);
    openArticleUrl(location?.item?.url || '');
  });

  app.querySelectorAll('[data-builder-focus]').forEach((node) => {
    node.addEventListener('click', () => {
      setBuilderFocus(node.dataset.builderFocus);
      renderReportBuilder();
    });
  });

  app.querySelectorAll('[data-builder-show-suggestion]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      setBuilderFocus(button.dataset.builderShowSuggestion);
      state.builderDraftTab = 'suggestion';
      renderReportBuilder();
    });
  });

  app.querySelectorAll('.builder-item input, .builder-item button').forEach((node) => {
    node.addEventListener('click', (event) => {
      event.stopPropagation();
    });
  });

  app.querySelectorAll('[data-builder-remove]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const snapshot = captureWorkspaceSnapshot();
      removeDraftItem(button.dataset.builderRemove);
      registerUndoAction('리포트 빌더에서 기사를 제거했습니다.', snapshot);
      renderReportBuilder();
    });
  });

  app.querySelectorAll('[data-builder-open]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      openArticleUrl(button.dataset.builderOpen);
    });
  });

  app.querySelectorAll('[data-builder-ai]').forEach((button) => {
    button.addEventListener('click', async (event) => {
      event.stopPropagation();
      if (!state.capabilities?.aiSummarize) {
        const connected = await connectRemoteAiAccess();
        if (!connected) return;
        renderReportBuilder();
        return;
      }

      if (state.capabilities?.requiresToken && !getStoredAiToken()) {
        showToast('AI 접근 토큰을 먼저 입력해주세요.');
        return;
      }

      if (button.dataset.builderAi === 'report-draft') {
        await summarizeReportDraftWithAi();
        return;
      }

      await summarizeDraftItemWithAi(button.dataset.builderAi);
    });
  });

  app.querySelectorAll('[data-ai-token-input]').forEach((input) => {
    input.addEventListener('click', (event) => {
      event.stopPropagation();
    });
    input.addEventListener('input', (event) => {
      setStoredAiToken(String(event.target.value || '').trim());
    });
  });

  app.querySelectorAll('[data-builder-move-industry]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const snapshot = captureWorkspaceSnapshot();
      const result = moveDraftItemToSection(button.dataset.builderMoveIndustry, 'industry');
      if (result.moved) {
        registerUndoAction('기사를 업계 보도로 이동했습니다.', snapshot);
      }
      renderReportBuilder();
    });
  });

  app.querySelectorAll('[data-builder-summary-input]').forEach((input) => {
    input.addEventListener('input', (event) => {
      updateDraftItem(event.target.dataset.builderSummaryInput, {
        summaryLead: event.target.value,
        conclusion: event.target.value
      });
      syncBuilderCardPreview(event.target.dataset.builderSummaryInput);
      syncBuilderReportTextArea();
    });
  });

  app.querySelectorAll('[data-builder-keypoint-input]').forEach((input) => {
    input.addEventListener('input', (event) => {
      updateDraftItem(event.target.dataset.builderKeypointInput, {
        keyPoint: event.target.value,
        oneLine: event.target.value
      });
      syncBuilderCardPreview(event.target.dataset.builderKeypointInput);
      syncBuilderReportTextArea();
    });
  });

  const reportTextField = document.getElementById('report-text');
  if (reportTextField) {
    resizeReportTextArea(reportTextField);
    reportTextField.addEventListener('input', (event) => {
      state.reportTextDraft = event.target.value;
      state.builderDraftRestored = false;
      persistStoredBuilderDraft();
      resizeReportTextArea(event.target);
      const charCount = document.getElementById('builder-draft-char-count');
      if (charCount) {
        charCount.textContent = formatNumber(characterLength(event.target.value));
      }
    });
  }

  const draftToKakaoButton = document.getElementById('draft-to-kakao');
  if (draftToKakaoButton) {
    draftToKakaoButton.addEventListener('click', () => {
      render('kakao');
    });
  }

  document.getElementById('ai-review-apply')?.addEventListener('click', () => {
    const snapshot = captureWorkspaceSnapshot();
    if (applyPendingAiReview()) {
      registerUndoAction('AI 제안 적용을 되돌릴 수 있습니다.', snapshot);
      renderReportBuilder();
    }
  });

  document.getElementById('ai-review-cancel')?.addEventListener('click', () => {
    clearPendingAiReview();
    pushActivityLog({
      title: 'AI 제안 취소',
      detail: '기존 문구를 유지했습니다.',
      tone: 'reported',
      page: 'builder'
    });
    showToast('AI 제안을 취소하고 기존 문구를 유지했습니다.');
    renderReportBuilder();
  });

  document.querySelectorAll('[data-builder-empty-nav]').forEach((button) => {
    button.addEventListener('click', () => {
      render(button.dataset.builderEmptyNav || 'builder');
    });
  });

  document.getElementById('builder-empty-import')?.addEventListener('click', () => {
    state.builderImportOpen = true;
    renderReportBuilder();
  });

  const builderToggleImport = document.getElementById('builder-toggle-import');
  if (builderToggleImport) {
    builderToggleImport.addEventListener('click', () => {
      state.builderImportOpen = !state.builderImportOpen;
      if (!state.builderImportOpen) {
        state.builderImportUrl = '';
        state.builderImportSection = 'major';
      }
      renderReportBuilder();
    });
  }

  const builderImportUrl = document.getElementById('builder-import-url');
  if (builderImportUrl) {
    builderImportUrl.addEventListener('input', (event) => {
      state.builderImportUrl = String(event.target.value || '');
      syncBuilderImportInlineFeedback();
    });
  }

  app.querySelectorAll('[data-builder-import-section]').forEach((button) => {
    button.addEventListener('click', () => {
      state.builderImportSection = button.dataset.builderImportSection === 'industry' ? 'industry' : 'major';
      renderReportBuilder();
    });
  });

  const builderImportCancel = document.getElementById('builder-import-cancel');
  if (builderImportCancel) {
    builderImportCancel.addEventListener('click', () => {
      state.builderImportOpen = false;
      state.builderImportUrl = '';
      state.builderImportSection = 'major';
      renderReportBuilder();
    });
  }

  const builderImportForm = document.getElementById('builder-import-form');
  if (builderImportForm) {
    builderImportForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      await submitBuilderImportedArticle();
    });
  }

  document.getElementById('builder-import-duplicate-jump')?.addEventListener('click', () => {
    if (existingImportLocation) {
      focusExistingArticleLocation(existingImportLocation);
    }
  });
};

function buildKakaoFinalCheckItems({ sections, derivedSegments, totalChars }) {
  const majorCount = sections.major.length;
  const industryCount = sections.industry.length;
  const overLimitCount = derivedSegments.filter((segment) => characterLength(segment.content) > KAKAO_SEGMENT_CHAR_LIMIT).length;
  return [
    {
      label: '주요 보도',
      value: `${formatNumber(majorCount)}건`,
      status: majorCount > 0 ? 'pass' : 'warn'
    },
    {
      label: '업계 보도',
      value: `${formatNumber(industryCount)}건`,
      status: industryCount > 0 ? 'pass' : 'warn'
    },
    {
      label: '분할 제한',
      value: overLimitCount ? `${formatNumber(overLimitCount)}개 초과` : '정상',
      status: overLimitCount ? 'warn' : 'pass'
    },
    {
      label: '복사 준비',
      value: totalChars > 0 && derivedSegments.length ? '가능' : '대기',
      status: totalChars > 0 && derivedSegments.length ? 'pass' : 'warn'
    }
  ];
}

function renderKakaoFinalCheckCard({ sections, derivedSegments, totalChars }) {
  const items = buildKakaoFinalCheckItems({ sections, derivedSegments, totalChars });
  const readyCount = items.filter((item) => item.status === 'pass').length;
  return `
    <div class="kakao-final-check-card">
      <div class="kakao-final-check-head">
        <div>
          <span>최종 점검</span>
          <strong>${formatNumber(readyCount)}/${formatNumber(items.length)} 완료</strong>
        </div>
        <button class="ghost-btn" type="button" id="kakao-final-edit">초안 수정</button>
      </div>
      <div class="kakao-final-check-grid">
        ${items.map((item) => `
          <div class="kakao-final-check-item is-${escapeHtml(item.status)}">
            <span>${escapeHtml(item.label)}</span>
            <strong>${escapeHtml(item.value)}</strong>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

renderKakaoPreview = function renderKakaoPreviewOverride() {
  updateShellMeta();
  const sections = getReportSections();
  const reportItemCount = sections.major.length + sections.industry.length;
  const fullText = getCurrentReportText();
  const derivedSegments = buildKakaoPreviewSegments();
  const activeSegment = derivedSegments.find((segment) => segment.order === state.selectedSegmentOrder) || derivedSegments[0] || null;
  const totalChars = characterLength(fullText);
  const activeSegmentChars = activeSegment ? characterLength(activeSegment.content) : 0;

  if (!activeSegment && state.selectedSegmentOrder !== 1) {
    state.selectedSegmentOrder = 1;
  } else if (activeSegment && state.selectedSegmentOrder !== activeSegment.order) {
    state.selectedSegmentOrder = activeSegment.order;
  }

  if (!reportItemCount) {
    app.innerHTML = `
      <section class="page" id="kakao-preview-page">
        ${renderWorkflowProgress('kakao')}
        <div class="kakao-layout kakao-layout-empty kakao-layout-empty-compact">
          <article class="card kakao-empty-hero">
            ${renderAnnotation('SCR-KAKAO-EMPTY-001')}
            <div class="panel-heading">
              <div>
                <p class="panel-kicker">검수 준비</p>
                <h3>초안이 필요합니다</h3>
              </div>
              <span class="panel-pill tone-neutral">대기</span>
            </div>
            <div class="inline-actions compact stack-mobile">
              <button class="primary-btn" id="kakao-empty-to-builder">초안 보기</button>
              <button class="ghost-btn" id="kakao-empty-to-inbox">기사 선택</button>
            </div>
          </article>
        </div>
      </section>
    `;

    bindWorkflowProgressActions();

    document.getElementById('kakao-empty-to-builder')?.addEventListener('click', () => {
      render('builder');
    });
    document.getElementById('kakao-empty-to-inbox')?.addEventListener('click', () => {
      render('inbox');
    });
    return;
  }

  app.innerHTML = `
    <section class="page" id="kakao-preview-page">
      ${renderWorkflowProgress('kakao')}
      <div class="kakao-layout">
        <article class="card kakao-device-card">
          ${renderAnnotation('SCR-KAKAO-DEVICE-001')}
          <div class="panel-heading">
            <div>
              <p class="panel-kicker">메시지</p>
              <h3>${state.kakaoView === 'full' ? '전체 메시지' : '분할 메시지'}</h3>
            </div>
            <div class="toggle" role="tablist" aria-label="kakao-view-toggle">
              <button role="tab" aria-label="Full" aria-selected="${state.kakaoView === 'full'}" class="${state.kakaoView === 'full' ? 'active' : ''}" data-kakao-view="full">전체</button>
              <button role="tab" aria-label="Segmented" aria-selected="${state.kakaoView === 'segmented'}" class="${state.kakaoView === 'segmented' ? 'active' : ''}" data-kakao-view="segmented">분할</button>
            </div>
          </div>

          <div class="phone-frame">
            <div class="phone-status-bar">
              <span>9:41</span>
              <span>LTE · 87%</span>
            </div>
            <div class="phone-notch"></div>
            <div class="chat-app-bar">
              <div>
                <strong>Daily Comm Report</strong>
                <span>대외 커뮤니케이션</span>
              </div>
            </div>
            <div class="phone-screen ${state.kakaoView === 'full' ? '' : 'hidden'}">
              <p class="bubble-meta">전체 메시지 · <span id="kakao-full-char-count">${formatNumber(totalChars)}</span>자</p>
              <div class="chat-row self">
                <div class="kakao-bubble" id="kakao-full">${escapeHtml(fullText || '리포트 빌더 결과가 아직 없습니다.')}</div>
              </div>
            </div>

            <div class="phone-screen ${state.kakaoView === 'segmented' ? '' : 'hidden'}">
              <p class="bubble-meta">
                분할 메시지
                ${activeSegment ? `· Part ${activeSegment.order} · <span id="kakao-active-segment-char-count">${formatNumber(activeSegmentChars)}</span> / ${formatNumber(KAKAO_SEGMENT_CHAR_LIMIT)}자` : ''}
              </p>
              ${activeSegment
                ? `
                  <div class="chat-row self">
                    <div class="kakao-bubble" id="segment-content">${escapeHtml(activeSegment.content)}</div>
                  </div>
                `
                : renderDataEmpty('segment-empty', '분할 메시지가 없습니다', '기사를 추가하세요.')}
            </div>
            <div class="chat-compose-bar">
              <span>메시지를 입력하세요</span>
              <button type="button" class="compose-send" aria-hidden="true">전송</button>
            </div>
          </div>
        </article>

        <aside class="card kakao-side-card">
          ${renderAnnotation('SCR-KAKAO-SIDE-001')}
          <div class="panel-heading">
            <div>
              <p class="panel-kicker">분할 메시지</p>
              <h3>한 화면용 파트</h3>
            </div>
            <span class="panel-pill tone-neutral">${formatNumber(derivedSegments.length)}개 파트</span>
          </div>
          <p class="panel-note">파트별 글자 수만 확인하세요.</p>
          ${renderKakaoFinalCheckCard({ sections, derivedSegments, totalChars })}
          <div class="segment-tabs">
            ${derivedSegments.length
              ? derivedSegments.map((segment) => `
                <button class="${segment.order === state.selectedSegmentOrder ? 'active' : ''}" data-segment-order="${segment.order}">
                  <span>Part ${segment.order}</span>
                  <small>${segment.chars || segment.content.length} / ${KAKAO_SEGMENT_CHAR_LIMIT}자</small>
                </button>
              `).join('')
              : renderDataEmpty('kakao-empty', '분할 메시지가 없습니다', '기사를 추가하세요.')}
          </div>
          <div class="draft-summary">
            <div>
              <span>전체 글자 수</span>
              <strong id="kakao-total-char-count">${formatNumber(totalChars)}</strong>
            </div>
            <div>
              <span>현재 파트</span>
              <strong>${activeSegment ? `Part ${activeSegment.order}` : '-'}</strong>
            </div>
            <div>
              <span>현재 파트 글자 수</span>
              <strong id="kakao-part-char-count">${activeSegment ? formatNumber(activeSegmentChars) : '-'}</strong>
            </div>
            <div>
              <span>파트 제한</span>
              <strong id="kakao-part-char-limit">${formatNumber(KAKAO_SEGMENT_CHAR_LIMIT)}자</strong>
            </div>
          </div>
          <div class="inline-actions stack-mobile kakao-copy-actions">
            <button class="ghost-btn" id="copy-all" aria-label="Copy all">전체 복사</button>
            <button class="primary-btn" id="copy-current" aria-label="Copy current" ${activeSegment ? '' : 'disabled'}>현재 파트 복사</button>
          </div>
        </aside>
      </div>
    </section>
  `;

  bindWorkflowProgressActions();

  document.getElementById('kakao-final-edit')?.addEventListener('click', () => {
    render('builder');
  });

  const kakaoFullTab = app.querySelector('[data-kakao-view="full"]');
  const kakaoSegmentedTab = app.querySelector('[data-kakao-view="segmented"]');
  const kakaoPanels = app.querySelectorAll('.phone-screen');
  if (kakaoFullTab && kakaoSegmentedTab && kakaoPanels.length >= 2) {
    kakaoFullTab.id = 'kakao-view-full';
    kakaoFullTab.setAttribute('aria-controls', 'kakao-panel-full');
    kakaoFullTab.setAttribute('tabindex', state.kakaoView === 'full' ? '0' : '-1');
    kakaoSegmentedTab.id = 'kakao-view-segmented';
    kakaoSegmentedTab.setAttribute('aria-controls', 'kakao-panel-segmented');
    kakaoSegmentedTab.setAttribute('tabindex', state.kakaoView === 'segmented' ? '0' : '-1');
    kakaoPanels[0].id = 'kakao-panel-full';
    kakaoPanels[0].setAttribute('role', 'tabpanel');
    kakaoPanels[0].setAttribute('aria-labelledby', 'kakao-view-full');
    kakaoPanels[0].setAttribute('aria-hidden', state.kakaoView === 'full' ? 'false' : 'true');
    kakaoPanels[1].id = 'kakao-panel-segmented';
    kakaoPanels[1].setAttribute('role', 'tabpanel');
    kakaoPanels[1].setAttribute('aria-labelledby', 'kakao-view-segmented');
    kakaoPanels[1].setAttribute('aria-hidden', state.kakaoView === 'segmented' ? 'false' : 'true');
  }

  const composeSend = app.querySelector('.compose-send');
  if (composeSend) {
    composeSend.setAttribute('tabindex', '-1');
    composeSend.setAttribute('role', 'presentation');
    composeSend.setAttribute('aria-hidden', 'true');
  }

  app.querySelectorAll('[data-kakao-view]').forEach((button) => {
    button.addEventListener('click', () => {
      state.kakaoView = button.dataset.kakaoView;
      renderKakaoPreview();
    });
  });

  app.querySelectorAll('[data-segment-order]').forEach((button) => {
    const selected = Number(button.dataset.segmentOrder) === state.selectedSegmentOrder;
    button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    button.setAttribute('aria-label', `Part ${button.dataset.segmentOrder} 보기`);
    button.addEventListener('click', () => {
      state.selectedSegmentOrder = Number(button.dataset.segmentOrder);
      state.kakaoView = 'segmented';
      renderKakaoPreview();
    });
  });

  document.getElementById('copy-all').addEventListener('click', async () => {
    await navigator.clipboard.writeText(fullText);
    pushActivityLog({
      title: '카카오 전체 복사',
      detail: `전체 메시지 ${formatNumber(totalChars)}자를 복사했습니다.`,
      tone: 'warning',
      page: 'kakao'
    });
    showToast('전체 메시지를 복사했습니다.');
  });

  document.getElementById('copy-current').addEventListener('click', async () => {
    if (!activeSegment) return;
    await navigator.clipboard.writeText(activeSegment.content);
    pushActivityLog({
      title: '카카오 파트 복사',
      detail: `Part ${formatNumber(activeSegment.order)} ${formatNumber(activeSegmentChars)}자를 복사했습니다.`,
      tone: 'warning',
      page: 'kakao'
    });
    showToast(`Part ${activeSegment.order} 복사 완료`);
  });
};

renderSettings = function renderSettingsOverride() {
  updateShellMeta();
  const config = state.config || {
    keywords: [],
    mediaWhitelistLabels: [],
    classificationDictionary: {},
    schedule: [],
    retry: { maxRetries: 3, intervalMinutes: 5 }
  };

  const allowedDomains = Array.isArray(config.domainPolicy?.allowedDomains) ? config.domainPolicy.allowedDomains : [];
  const alertPolicy = config.alertPolicy && typeof config.alertPolicy === 'object'
    ? config.alertPolicy
    : { enabled: false, channel: '', consecutiveFailures: 0 };
  const validationPolicy = config.validation && typeof config.validation === 'object'
    ? config.validation
    : { strict: false, minValidUrlRatio: 0 };
  const deployment = deploymentConfig(config);
  const alertDeliveryLabel = formatAlertDeliveryLabel(alertPolicy);
  const settingsPolicyRows = [
    {
      label: '재시도 정책',
      value: `${formatNumber(config.retry?.maxRetries ?? 3)}회 / ${formatNumber(config.retry?.intervalMinutes ?? 5)}분 간격`
    },
    {
      label: '장애 알림',
      value: alertPolicy.enabled
        ? `${String(alertPolicy.channel || 'email').toUpperCase()} · ${formatNumber(alertPolicy.consecutiveFailures || 0)}회 연속 실패`
        : '비활성'
    },
    {
      label: '알림 수신처',
      value: alertDeliveryLabel
    },
    {
      label: '허용 도메인',
      value: allowedDomains.length
        ? allowedDomains.join(', ')
        : '제한 없음'
    },
    {
      label: 'URL 검증',
      value: `${validationPolicy.strict ? '엄격 검증' : '기본 검증'} · 최소 ${formatNumber(Math.round(Number(validationPolicy.minValidUrlRatio || 0) * 100))}%`
    },
    {
      label: '배포 공개 범위',
      value: formatSettingsVisibility(deployment.visibility)
    },
    {
      label: 'AI API',
      value: hasRemoteAiConfigured(config) ? formatApiHostLabel(deployment.aiApiBase) : '로컬 기본 경로'
    },
    {
      label: 'AI 연결',
      value: `${hasRemoteAiConfigured(config) ? '외부 API 연동' : '로컬 API 기본'} · ${formatSettingsVisibility(deployment.visibility)}`
    },
    {
      label: '마지막 반영 데이터',
      value: formatDateTime(state.articleMeta?.generatedAt || state.report?.generatedAt)
    }
  ];
  [
    '재시도 횟수와 간격이 길어질수록 실제 장애 인지가 늦어질 수 있습니다.',
    '알림 채널이 비활성이면 크롤링 실패를 운영자가 직접 발견해야 합니다.',
    '수신처가 잘못되면 장애가 나도 담당자에게 도착하지 않습니다.',
    '허용 도메인이 좁을수록 잘못된 링크 유입은 줄지만 기사 누락 가능성은 커질 수 있습니다.',
    '검증 기준이 높을수록 링크 품질은 좋아지지만 usable 기사 수는 줄 수 있습니다.',
    '배포 공개 범위는 노출 가능한 기능과 운영 카드 범위를 함께 바꿉니다.',
    'AI API 경로가 바뀌면 요약과 기사 링크 추가 동선이 함께 영향을 받습니다.',
    '외부 AI 연결 여부에 따라 공개 배포판에서 가능한 기능 범위가 달라집니다.',
    '마지막 반영 시각이 오래되면 운영자가 오늘 데이터로 오인할 수 있습니다.'
  ].forEach((impact, index) => {
    if (settingsPolicyRows[index]) {
      settingsPolicyRows[index].impact = impact;
    }
  });
  const renderTagList = (items, emptyTitle, emptyBody) => {
    if (!items.length) {
      return renderDataEmpty(`settings-empty-${String(emptyTitle).replace(/\s+/g, '-').toLowerCase()}`, emptyTitle, emptyBody);
    }

    return `
      <div class="settings-tag-list settings-tag-list-full">
        ${items.map((item) => `<span class="settings-tag">${escapeHtml(item)}</span>`).join('')}
      </div>
    `;
  };
  const renderSettingsKeywordGroups = (groups) => `
    <div class="settings-keyword-groups">
      ${groups.map((group) => `
        <div class="settings-keyword-group settings-keyword-group-${escapeHtml(group.key)}">
          <div class="settings-keyword-group-head">
            <div>
              <strong>${escapeHtml(group.label)}</strong>
              <span>${escapeHtml(group.subLabel)}</span>
            </div>
            <span class="panel-pill tone-neutral">${formatNumber(group.items.length)}개</span>
          </div>
          ${group.items.length
            ? `<div class="settings-tag-list settings-tag-list-full">
                ${group.items.map((item) => `<span class="settings-tag">${escapeHtml(item)}</span>`).join('')}
              </div>`
            : renderDataEmpty(`settings-empty-${group.key}-keywords`, `${group.label}가 없습니다`, 'config에 추가하면 표시됩니다.')}
        </div>
      `).join('')}
    </div>
  `;
  const keywordGroups = groupedConfiguredKeywords(config);

  app.innerHTML = `
    <section class="page" id="settings-page">
      <div class="settings-quick-actions">
        <span class="panel-pill tone-neutral">확인 전용</span>
        <button class="ghost-btn" id="settings-to-builder">초안 만들기</button>
      </div>
      <div class="settings-grid">
        <article class="card settings-card">
          ${renderAnnotation('SCR-SET-KEY-001')}
          <div class="panel-heading">
            <div>
              <p class="panel-kicker">키워드</p>
              <h3>키워드 관리</h3>
            </div>
            <span class="panel-pill">${formatNumber(keywordList().length)}개</span>
          </div>
          ${renderSettingsKeywordGroups(keywordGroups)}
        </article>

        <article class="card settings-card">
          ${renderAnnotation('SCR-SET-SCHED-001')}
          <div class="panel-heading">
            <div>
              <p class="panel-kicker">스케줄</p>
              <h3>크롤링 스케줄</h3>
            </div>
            <span class="panel-pill">${formatNumber((config.schedule || []).length)}개</span>
          </div>
          ${(config.schedule || []).length
            ? `<div class="settings-list">${config.schedule.map((slot) => `<div class="settings-row"><strong>${escapeHtml(slot)}</strong><span>자동 실행</span></div>`).join('')}</div>`
            : renderDataEmpty('settings-empty-schedule', '등록된 스케줄이 없습니다', '추가하면 표시됩니다.')}
        </article>

        <article class="card settings-card">
          ${renderAnnotation('SCR-SET-MEDIA-001')}
          <div class="panel-heading">
            <div>
              <p class="panel-kicker">매체</p>
              <h3>매체 라벨</h3>
            </div>
            <span class="panel-pill">${formatNumber(mediaWhitelist().length)}개</span>
          </div>
          ${renderTagList(mediaWhitelist(), '등록된 매체 라벨이 없습니다', '추가하면 표시됩니다.')}
        </article>

        <article class="card settings-card settings-policy-link-card">
          ${renderAnnotation('SCR-SET-DICT-001')}
          <div class="panel-heading">
            <div>
              <p class="panel-kicker">Operations</p>
              <h3>운영 정책</h3>
            </div>
            <button class="ghost-btn" id="open-settings-policy-modal">정책 보기</button>
          </div>
          <div class="settings-trust-banner">
            <strong>${escapeHtml(alertDeliveryLabel)}</strong>
            <span>${escapeHtml(formatSettingsVisibility(deployment.visibility))} · ${escapeHtml(formatDateTime(state.articleMeta?.generatedAt || state.report?.generatedAt))}</span>
          </div>
        </article>
              </div>

      ${renderSettingsPolicyModal({ settingsPolicyRows, alertPolicy, deployment })}
    </section>
  `;

  document.getElementById('settings-to-builder').addEventListener('click', () => {
    render('builder');
  });
  document.getElementById('open-settings-policy-modal')?.addEventListener('click', () => {
    state.settingsPolicyModalOpen = true;
    renderSettings();
  });
  document.getElementById('close-settings-policy-modal')?.addEventListener('click', () => {
    state.settingsPolicyModalOpen = false;
    renderSettings();
  });
  document.getElementById('settings-policy-modal-backdrop')?.addEventListener('click', (event) => {
    if (event.target.id !== 'settings-policy-modal-backdrop') return;
    state.settingsPolicyModalOpen = false;
    renderSettings();
  });
  document.getElementById('settings-alert-test')?.addEventListener('click', async () => {
    if (state.settingsAlertTestBusy) return;
    state.settingsAlertTestBusy = true;
    state.settingsAlertTestResult = null;
    renderSettings();

    try {
      const payload = await requestAlertTest(alertPolicy);
      state.settingsAlertTestResult = {
        state: payload?.mode === 'sent' ? 'ready' : 'warning',
        title: payload?.mode === 'sent' ? '테스트 알림을 발송했습니다.' : '테스트 알림 payload를 검증했습니다.',
        description: payload?.description || '전달 방식과 메시지 구성을 점검했습니다.',
        meta: payload?.subject
          ? `${formatAlertDeliveryLabel(alertPolicy)} / ${payload.subject}`
          : formatAlertDeliveryLabel(alertPolicy)
      };
      pushActivityLog({
        title: '장애 알림 점검',
        detail: state.settingsAlertTestResult.meta || '전달 방식과 payload를 점검했습니다.',
        tone: payload?.mode === 'sent' ? 'warning' : 'reported',
        page: 'settings'
      });
      showToast(state.settingsAlertTestResult.title);
    } catch (error) {
      state.settingsAlertTestResult = {
        state: 'invalid',
        title: '테스트 알림 점검에 실패했습니다.',
        description: error instanceof Error ? error.message : '알림 설정을 다시 확인해 주세요.',
        meta: ''
      };
      showToast(state.settingsAlertTestResult.description);
    } finally {
      state.settingsAlertTestBusy = false;
      renderSettings();
    }
  });
};

buildTrendItems = function buildTrendItemsOverride() {
  const buildItems = (sectionName, limit = 6) => {
    const source = state.articles.filter((article) => article.section === sectionName);
    const configuredKeywords = keywordList();
    const fallbackKeywords = Array.from(new Set(source.map((article) => article.keyword).filter(Boolean)))
      .filter((keyword) => keywordBelongsToSection(keyword, sectionName));
    const candidates = (configuredKeywords.length ? configuredKeywords : fallbackKeywords)
      .filter((keyword) => keywordBelongsToSection(keyword, sectionName));
    const items = candidates
      .map((keyword) => ({
        keyword,
        count: source.filter((article) => articleHasKeywordInDisplayText(article, keyword)).length
      }))
      .filter((item) => item.count > 0)
      .sort((left, right) => right.count - left.count || left.keyword.localeCompare(right.keyword, 'ko'))
      .slice(0, limit);

    const max = Math.max(...items.map((item) => item.count), 1);
    return items.map((item) => ({
      ...item,
      percent: Math.round((item.count / max) * 100)
    }));
  };

  return {
    major: buildItems('major'),
    industry: buildItems('industry')
  };
};

buildMediaDistribution = function buildMediaDistributionOverride() {
  const counts = state.articles.reduce((acc, article) => {
    const key = mediaLabel(article);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const total = Math.max(state.articles.length, 1);
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, count]) => ({
      name,
      count,
      percent: Math.round((count / total) * 100),
      widthPercent: Math.max(8, Math.round((count / total) * 100))
    }));
};

function dateKeyToUtcDayIndex(dateKey) {
  const match = String(dateKey || '').match(/^(\d{4})-(\d{2})-(\d{2})$/u);
  if (!match) return Number.NaN;
  const [, year, month, day] = match;
  return Math.floor(Date.UTC(Number(year), Number(month) - 1, Number(day)) / 86400000);
}

function buildOperationalMicroPolicies() {
  const stats = getStats();
  const articles = state.articles;
  const total = Math.max(articles.length, 1);
  const currentDateKey = currentSeoulDateKey();
  const dataDateIndex = dateKeyToUtcDayIndex(state.date);
  const currentDateIndex = dateKeyToUtcDayIndex(currentDateKey);
  const lagDays = Number.isFinite(dataDateIndex) && Number.isFinite(currentDateIndex)
    ? Math.max(currentDateIndex - dataDateIndex, 0)
    : 0;
  const failedKeywords = Array.isArray(stats.failedKeywords) ? stats.failedKeywords.filter(Boolean) : [];
  const majorCount = articles.filter((article) => article.section === 'major').length;
  const majorShare = Math.round((majorCount / total) * 100);
  const mediaItems = buildMediaDistribution();
  const topMedia = mediaItems[0] || null;
  const keywordCounts = Object.entries(
    articles.reduce((acc, article) => {
      const key = String(article.keyword || '').trim();
      if (!key) return acc;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {})
  ).sort((left, right) => right[1] - left[1]);
  const [topKeywordName = '', topKeywordCount = 0] = keywordCounts[0] || [];
  const topKeywordShare = topKeywordCount ? Math.round((topKeywordCount / total) * 100) : 0;
  const blockedTextCount = Number(stats.droppedBlockedTextCount || 0);
  const noUsableCandidatePages = Number(stats.noUsableCandidatePages || 0);

  const items = [
    lagDays > 0
      ? {
          statusClass: 'warning',
          statusLabel: '주의',
          title: '데이터 기준일 지연',
          detail: `오늘은 ${formatDateLabel(currentDateKey)}인데 현재 로드 데이터는 ${formatDateLabel(state.date)} 기준입니다.`,
          meta: `+${formatNumber(lagDays)}일`
        }
      : {
          statusClass: 'reported',
          statusLabel: '정상',
          title: '데이터 기준일',
          detail: `현재 화면은 ${formatDateLabel(state.date)} 당일 데이터 기준으로 동작합니다.`,
          meta: formatDateLabel(state.date)
        },
    failedKeywords.length
      ? {
          statusClass: 'warning',
          statusLabel: '주의',
          title: '실패 키워드 확인',
          detail: `이번 수집에서 ${failedKeywords.join(', ')} 키워드는 usable candidate를 만들지 못했습니다.`,
          meta: `${formatNumber(failedKeywords.length)}개`
        }
      : {
          statusClass: 'selected',
          statusLabel: '안정',
          title: '키워드 커버리지',
          detail: '설정된 키워드가 모두 usable article을 확보했습니다.',
          meta: '누락 없음'
        },
    majorCount < 8 || majorShare < 10
      ? {
          statusClass: 'warning',
          statusLabel: '주의',
          title: '주요 보도 부족',
          detail: `전체 ${formatNumber(articles.length)}건 중 주요 보도는 ${formatNumber(majorCount)}건(${formatNumber(majorShare)}%)입니다.`,
          meta: `${formatNumber(majorCount)}건`
        }
      : {
          statusClass: 'selected',
          statusLabel: '안정',
          title: '주요/업계 비중',
          detail: `주요 보도 ${formatNumber(majorCount)}건, 업계 보도 ${formatNumber(Math.max(articles.length - majorCount, 0))}건으로 분포가 유지됩니다.`,
          meta: `${formatNumber(majorShare)}%`
        },
    topMedia && topMedia.percent >= 20
      ? {
          statusClass: 'warning',
          statusLabel: '주의',
          title: '매체 편중 감시',
          detail: `${topMedia.name}가 ${formatNumber(topMedia.count)}건으로 전체의 ${formatNumber(topMedia.percent)}%를 차지합니다.`,
          meta: `${formatNumber(topMedia.percent)}%`
        }
      : {
          statusClass: 'selected',
          statusLabel: '안정',
          title: '매체 분산',
          detail: topMedia
            ? `상위 매체 ${topMedia.name} 비중이 ${formatNumber(topMedia.percent)}% 수준입니다.`
            : '집계할 매체 데이터가 아직 없습니다.',
          meta: topMedia ? topMedia.name : '-'
        },
    topKeywordName && topKeywordShare >= 15
      ? {
          statusClass: 'warning',
          statusLabel: '주의',
          title: '키워드 편중 감시',
          detail: `${topKeywordName} 관련 기사가 ${formatNumber(topKeywordCount)}건으로 전체의 ${formatNumber(topKeywordShare)}%입니다.`,
          meta: `${formatNumber(topKeywordShare)}%`
        }
      : {
          statusClass: 'reported',
          statusLabel: '정상',
          title: '키워드 분포',
          detail: topKeywordName
            ? `최다 키워드는 ${topKeywordName} ${formatNumber(topKeywordCount)}건입니다.`
            : '키워드 분포를 계산할 데이터가 없습니다.',
          meta: topKeywordName ? topKeywordName : '-'
        },
    {
      statusClass: blockedTextCount >= 20 || noUsableCandidatePages >= 50 ? 'reported' : 'selected',
      statusLabel: blockedTextCount >= 20 || noUsableCandidatePages >= 50 ? '필터링' : '정상',
      title: '노이즈 차단',
      detail: `차단 텍스트 ${formatNumber(blockedTextCount)}건, usable candidate 없음 ${formatNumber(noUsableCandidatePages)}페이지를 걸러냈습니다.`,
      meta: `${formatNumber(blockedTextCount)}건`
    }
  ];

  return {
    items,
    warningCount: items.filter((item) => item.statusClass === 'warning' || item.statusClass === 'failed').length
  };
}

function renderOperationalMicroPolicyCard(context = 'dashboard') {
  const { items, warningCount } = buildOperationalMicroPolicies();
  const dashboardMode = context === 'dashboard';
  const wrapperClass = dashboardMode
    ? 'card panel-card dashboard-card dashboard-card-ops'
    : 'card settings-card settings-ops-card';
  const summaryLabel = warningCount ? `${formatNumber(warningCount)}개 주의` : '안정적';

  return `
    <article class="${wrapperClass}">
      <div class="panel-heading dashboard-panel-heading">
        <div>
          <p class="panel-kicker">Guardrails</p>
          <h3>운영 미세 폴리시</h3>
        </div>
        ${dashboardMode
          ? `<button class="ghost-btn" id="dashboard-open-settings">설정 보기</button>`
          : `<span class="panel-pill">${summaryLabel}</span>`}
      </div>
      <p class="panel-note ops-policy-note">실데이터 기준으로 기준일 지연, 실패 키워드, 편중 신호를 즉시 확인합니다.</p>
      <div class="ops-policy-list">
        ${items.map((item) => `
          <div class="ops-policy-item is-${escapeHtml(item.statusClass)}">
            <span class="status-badge status-${escapeHtml(item.statusClass)}">${escapeHtml(item.statusLabel)}</span>
            <div class="ops-policy-copy">
              <strong>${escapeHtml(item.title)}</strong>
              <p>${escapeHtml(item.detail)}</p>
            </div>
            <span class="ops-policy-meta">${escapeHtml(item.meta || '')}</span>
          </div>
        `).join('')}
      </div>
    </article>
  `;
}

buildRunLogs = function buildRunLogsOverride() {
  const stats = getStats();
  const stamp = state.articleMeta?.generatedAt || state.report?.generatedAt || new Date().toISOString();
  const excludedCount = (stats.invalidUrlDropped || 0) + (stats.unusableCandidateDropped || 0) + (stats.emptyTitleDropped || 0);
  return [
    {
      time: formatDateTime(stamp),
      label: '크롤링 결과',
      statusClass: stats.invalidUrlDropped || stats.unusableCandidateDropped || stats.emptyTitleDropped ? 'warning' : 'reported',
      statusLabel: stats.invalidUrlDropped || stats.unusableCandidateDropped || stats.emptyTitleDropped ? '주의' : '완료',
      detail: `${formatDateTime(stamp)} · 원본 ${formatNumber(stats.totalRaw || state.articles.length)}건 · 사용 ${formatNumber(stats.totalDeduped || state.articles.length)}건`
    },
    {
      time: formatDateTime(stamp),
      label: '검증 결과',
      statusClass: excludedCount ? 'warning' : 'selected',
      statusLabel: excludedCount ? '점검' : '통과',
      detail: `${formatDateTime(stamp)} · 유효 링크 ${formatNumber(stats.validUrlCount || state.articles.length)}건 · 제외 ${formatNumber(excludedCount)}건`
    }
  ];
};

function renderRecentActivityLog(limit = 6) {
  const items = state.activityLog.slice(0, limit);
  if (!items.length) {
    return renderDataEmpty('activity-log-empty', '최근 작업 로그가 없습니다', '기사 반영, AI 적용, 카카오 복사 같은 운영 작업이 이곳에 누적됩니다.');
  }

  return `
    <div class="run-log-list activity-log-list">
      ${items.map((item) => `
        <div class="run-log-row">
          <div class="run-log-main">
            <strong>${escapeHtml(item.title)}</strong>
            <span class="run-log-time">${escapeHtml(formatDateTime(item.createdAt))}</span>
          </div>
          <span class="status-badge status-${escapeHtml(item.tone || 'reported')}">${escapeHtml(item.page || '작업')}</span>
          <p class="run-log-detail">${escapeHtml(item.detail || '운영 작업 기록')}</p>
        </div>
      `).join('')}
    </div>
  `;
}

renderDashboard = function renderDashboardOverride() {
  const stats = getStats();
  const sections = getReportSections();
  const reported = sections.major.length + sections.industry.length;
  const total = state.articles.length;
  const pending = Math.max(total - reported, 0);
  const failed = (stats.invalidUrlDropped || 0) + (stats.unusableCandidateDropped || 0);
  const trendItems = buildTrendItems();
  const mediaItems = buildMediaDistribution();
  const runLogs = buildRunLogs();
  const spotlight = state.articles.filter((article) => !isArticleAssigned(article)).slice(0, 5);
  const spotlightItems = spotlight.length ? spotlight : state.articles.slice(0, 5);
  const coverageRatio = total ? Math.round((reported / total) * 100) : 0;
  const flow = buildDashboardFlowState({ total, reported });

  app.innerHTML = `
    <section class="page" id="dashboard-page">
      ${renderFreshnessBanner()}
      ${renderDashboardFlowCard(flow)}
      ${renderDashboardPriorityStrip({ total, pending, reported, failed, coverageRatio })}

      <div class="dashboard-grid">
        <article class="card panel-card dashboard-card dashboard-card-trend">
          ${renderAnnotation('SCR-DASH-TREND-001')}
          <div class="panel-heading dashboard-panel-heading">
            <div>
              <p class="panel-kicker">트렌드</p>
              <h3>키워드 트렌드</h3>
            </div>
            <span class="panel-pill">0건 키워드 제외</span>
          </div>
          <div class="trend-section-list">
            ${[
              ['major', '주요 보도', trendItems.major],
              ['industry', '업계 보도', trendItems.industry]
            ].map(([sectionKey, sectionTitle, items]) => `
              <div class="trend-section" data-trend-section="${escapeHtml(sectionKey)}">
                <div class="trend-section-head">
                  <strong>${escapeHtml(sectionTitle)}</strong>
                  <span>${formatNumber(items.length)}개 키워드</span>
                </div>
                ${items.length
                  ? `<div class="trend-list">
                      ${items.map((item) => `
                        <div class="trend-row">
                          <div class="trend-labels">
                            <strong>${escapeHtml(item.keyword)}</strong>
                            <span>${formatNumber(item.count)}건</span>
                          </div>
                          <div class="trend-track"><span style="width:${item.percent}%"></span></div>
                        </div>
                      `).join('')}
                    </div>`
                  : renderDataEmpty(`trend-empty-${escapeHtml(sectionKey)}`, `${escapeHtml(sectionTitle)} 키워드가 없습니다`, '표시할 키워드가 없습니다.')}
              </div>
            `).join('')}
          </div>
        </article>

        <article class="card panel-card dashboard-card dashboard-card-media">
          ${renderAnnotation('SCR-DASH-MEDIA-001')}
          <div class="panel-heading dashboard-panel-heading">
            <div>
              <p class="panel-kicker">분포</p>
              <h3>매체 분포</h3>
            </div>
            <span class="panel-pill">상위 ${formatNumber(mediaItems.length)}개 매체</span>
          </div>
          <div class="distribution-list">
            ${mediaItems.length
              ? mediaItems.map((item) => `
                <div class="distribution-row">
                  <div class="distribution-labels">
                    <strong>${escapeHtml(item.name)}</strong>
                    <span>${formatNumber(item.count)}건 / ${formatNumber(item.percent)}%</span>
                  </div>
                  <div class="distribution-track"><span style="width:${item.widthPercent}%"></span></div>
                </div>
              `).join('')
              : renderDataEmpty('media-empty', '매체 분포가 없습니다', '집계할 출처가 없습니다.')}
          </div>
        </article>

        <article class="card panel-card dashboard-card dashboard-card-logs">
          <div id="dashboard-log-panel"></div>
          ${renderAnnotation('SCR-DASH-LOG-001')}
          <div class="panel-heading">
            <div>
              <p class="panel-kicker">운영 로그</p>
              <h3>최근 실행 기록</h3>
            </div>
            <button class="ghost-btn" id="go-inbox">인박스 보기</button>
          </div>
          <div class="run-log-list">
            ${runLogs.map((row) => `
              <div class="run-log-row">
                <div class="run-log-main">
                  <strong>${escapeHtml(row.label)}</strong>
                </div>
                <span class="status-badge status-${escapeHtml(row.statusClass)}">${escapeHtml(row.statusLabel)}</span>
                <p class="run-log-detail">${escapeHtml(row.detail)}</p>
              </div>
            `).join('')}
          </div>
          <div class="spotlight-list">
            ${spotlightItems.length
              ? spotlightItems.map((article) => `
                <button class="spotlight-item" data-open-dashboard-article="${escapeHtml(articleKey(article))}">
                  <span class="spotlight-tag ${sectionBadgeClass(article.section)}">${escapeHtml(sectionLabel(article.section))}</span>
                  <strong>${escapeHtml(article.title)}</strong>
                </button>
              `).join('')
              : renderDataEmpty('dashboard-empty', '표시할 기사가 없습니다', '기사 데이터가 비어 있습니다.')}
          </div>
        </article>
      </div>
    </section>
  `;

  document.getElementById('go-inbox').addEventListener('click', () => render('inbox'));
  document.getElementById('dashboard-flow-primary')?.addEventListener('click', (event) => {
    const page = event.currentTarget.dataset.dashboardPage || 'dashboard';
    if (event.currentTarget.dataset.dashboardBuilderFocus === 'draft') {
      state.builderSideView = 'draft';
    }
    render(page);
  });
  document.getElementById('dashboard-flow-secondary')?.addEventListener('click', (event) => {
    const page = event.currentTarget.dataset.dashboardPage || '';
    const scrollTarget = event.currentTarget.dataset.dashboardScroll || '';
    if (page) {
      render(page);
      return;
    }
    if (scrollTarget) {
      document.getElementById(scrollTarget)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  app.querySelectorAll('[data-dashboard-priority-page]').forEach((button) => {
    button.addEventListener('click', (event) => {
      const page = event.currentTarget.dataset.dashboardPriorityPage || '';
      const scrollTarget = event.currentTarget.dataset.dashboardPriorityScroll || '';
      if (page) {
        render(page);
        return;
      }
      if (scrollTarget) {
        document.getElementById(scrollTarget)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  app.querySelectorAll('[data-open-dashboard-article]').forEach((button) => {
    button.addEventListener('click', () => {
      const article = findArticleRecord(button.dataset.openDashboardArticle || '');
      if (article?.url) window.open(article.url, '_blank', 'noopener,noreferrer');
    });
  });
};

function render(pageName) {
  const currentPage = state.activePage;
  if (currentPage) {
    state.pageScrollPositions[currentPage] = window.scrollY;
  }
  state.activePage = pageName;
  document.body.dataset.page = pageName;
  if (pageName !== 'inbox') {
    document.documentElement.classList.remove('has-modal-open');
    document.body.classList.remove('has-mobile-selection-bar');
    document.body.classList.remove('has-mobile-preview-bar');
    document.body.classList.remove('has-mobile-preview-sheet');
    document.body.classList.remove('has-modal-open');
  }
  setActiveNav();
  updateShellMeta();

  if (state.loading) {
    renderLoading();
    return;
  }

  if (state.loadError) {
    renderError();
    return;
  }

  if (pageName === 'dashboard') renderDashboard();
  if (pageName === 'inbox') renderInbox();
  if (pageName === 'builder') renderReportBuilder();
  if (pageName === 'kakao') renderKakaoPreview();
  if (pageName === 'settings') renderSettings();
  mountGlobalFreshnessBanner();

  const nextScrollTop = state.pageScrollPositions[pageName] ?? 0;
  requestAnimationFrame(() => {
    window.scrollTo({ top: nextScrollTop, left: 0, behavior: 'auto' });
  });
}

async function loadData() {
  state.loading = true;
  state.loadingPhase = 'source';
  state.loadingMessage = '오늘 데이터를 확인 중입니다.';
  state.loadError = '';
  render(state.activePage);

  const configPromise = fetchJson('../crawler/config/default.json', null, { cacheBust: true, noStore: true });
  let resolvedDate = state.date;
  let { articlePayload, reportPayload, segmentsPayload } = await fetchDateArtifacts(resolvedDate);

  if (!articlePayload) {
    state.loadingMessage = '최신 발행일을 찾는 중입니다.';
    render(state.activePage);
    const latestPayload = await fetchJson('../data/latest.json', null, { cacheBust: true, noStore: true });
    const fallbackDate = typeof latestPayload?.date === 'string' ? latestPayload.date : '';

    if (fallbackDate && fallbackDate !== resolvedDate) {
      state.loadingMessage = `${formatDateLabel(fallbackDate)} 데이터를 불러오는 중입니다.`;
      render(state.activePage);
      resolvedDate = fallbackDate;
      ({ articlePayload, reportPayload, segmentsPayload } = await fetchDateArtifacts(resolvedDate));
    }
  }

  if (!articlePayload) {
    state.loading = false;
    state.loadingPhase = '';
    state.loadingMessage = '';
    state.loadError = `기사 파일을 찾을 수 없습니다: data/articles/${resolvedDate}.json`;
    render(state.activePage);
    return;
  }

  state.loadingPhase = 'config';
  state.loadingMessage = '설정을 확인 중입니다.';
  render(state.activePage);
  const configPayload = await configPromise;

  state.loadingPhase = 'capabilities';
  state.loadingMessage = 'AI 상태를 확인 중입니다.';
  render(state.activePage);
  const capabilitiesPayload = shouldAutoFetchAiCapabilities(configPayload || {})
    ? await fetchAiCapabilities(configPayload || {})
    : {
        aiSummarize: false,
        requiresToken: false
      };

  state.loadingPhase = 'ready';
  state.loadingMessage = '화면을 준비 중입니다.';
  render(state.activePage);
  const articles = normalizeArticles(articlePayload);

  state.date = resolvedDate;
  state.articleMeta = articlePayload.metadata || null;
  state.articles = articles;
  state.report = reportPayload || { sections: { major: [], industry: [] } };
  state.segments = Array.isArray(segmentsPayload) ? segmentsPayload : [];
  state.config = configPayload || {};
  state.capabilities = {
    aiSummarize: Boolean(capabilitiesPayload?.aiSummarize),
    provider: String(capabilitiesPayload?.provider || ''),
    model: String(capabilitiesPayload?.model || ''),
    requiresToken: Boolean(capabilitiesPayload?.requiresToken)
  };
  const restoredDraft = initializeReportDraft();
  normalizeInboxKeywordFilter();
  state.loading = false;
  state.loadingPhase = '';
  state.loadingMessage = '';
  state.selectedArticle = state.articles[0] || null;
  state.selectedArticleUrls = [];
  state.previewMode = 'summary';
  state.aiBusyKey = '';
  ensureBuilderFocus();
  if (!restoredDraft) {
    state.reportTextDraft = generateReportText();
  }

  if (state.segments[0]) {
    state.selectedSegmentOrder = state.segments[0].order;
  }

  render(state.activePage);
}

pageButtons.forEach((button) => {
  button.addEventListener('click', () => render(button.dataset.page));
});

if (chrome.openReport) {
  chrome.openReport.addEventListener('click', () => {
    const targetPage = chrome.openReport.dataset.targetPage || 'builder';
    if (targetPage && targetPage !== state.activePage) {
      render(targetPage);
    }
  });
}

if (chrome.runCrawl) {
  chrome.runCrawl.addEventListener('click', () => {
    showToast('크롤링 실행은 현재 UI에서 비활성화되어 있습니다.');
  });
}

await loadData();
