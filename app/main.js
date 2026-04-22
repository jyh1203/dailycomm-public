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
const UNDO_TOAST_DURATION = 4200;

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

const pageMeta = {
  dashboard: {
    kicker: '운영 현황',
    title: '대시보드',
    subtitle: '오늘 수집 현황과 리포트 진행 상태를 확인합니다.'
  },
  inbox: {
    kicker: '기사 분류',
    title: '기사 인박스',
    subtitle: '필터링하고 필요한 기사만 바로 분류합니다.'
  },
  builder: {
    kicker: '리포트 편집',
    title: '리포트 빌더',
    subtitle: '반영된 기사만 모아 초안을 편집합니다.'
  },
  kakao: {
    kicker: '카카오 검수',
    title: '카카오 프리뷰',
    subtitle: '전송 전 메시지와 분할 본문을 확인합니다.'
  },
  settings: {
    kicker: '운영 설정',
    title: '설정',
    subtitle: '운영 키워드와 스케줄을 관리합니다.'
  }
};

const LOADING_STEPS = [
  {
    id: 'source',
    label: '원본 확인',
    description: '기사와 리포트 파일을 읽고 오늘 기준 데이터를 확인합니다.'
  },
  {
    id: 'config',
    label: '운영 설정',
    description: '키워드와 분류 기준, 배포 설정을 동기화합니다.'
  },
  {
    id: 'capabilities',
    label: 'AI 준비',
    description: '요약 기능 사용 가능 여부와 연결 상태를 점검합니다.'
  },
  {
    id: 'ready',
    label: '화면 구성',
    description: '기사 인박스와 보고서 초안 화면을 정리합니다.'
  }
];

let state = {
  date: currentSeoulDateKey(),
  loading: true,
  loadingPhase: 'source',
  loadingMessage: '오늘 기사와 보고서 파일을 확인하고 있습니다.',
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
  inboxKeywordFilter: [],
  inboxSearchQuery: '',
  inboxSortKey: 'time',
  inboxSortDirection: 'desc',
  inboxFiltersOpen: false,
  inboxPreviewOpen: false,
  inboxSavedPresets: loadStoredInboxPresets(),
  inboxRecentSearches: loadStoredInboxRecentSearches(),
  builderSideView: 'detail',
  builderFocusKey: '',
  builderImportOpen: false,
  builderImportUrl: '',
  builderImportSection: 'major',
  builderImportBusy: false,
  builderDraftStatus: 'idle',
  builderDraftSavedAt: '',
  builderDraftRestored: false,
  reportTextDraft: '',
  capabilities: {
    aiSummarize: false,
    provider: '',
    model: '',
    requiresToken: false
  },
  aiBusyKey: '',
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
  state.inboxSortDirection = sortKey === 'time' ? 'desc' : 'asc';
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
          ? (storedToken ? 'AI 연결 후 정리' : 'AI 연결')
          : 'AI 연결 필요';
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
        class="${buttonClass}"
        ${id ? `id="${id}"` : ''}
        data-builder-ai="${escapeHtml(key)}"
        ${(!enabled && !canConnect) || busy ? 'disabled' : ''}
      >
        ${label}
      </button>
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

function articleKeywordFilterToken(article) {
  return inboxKeywordToken(article?.section, article?.keyword);
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

  try {
    const response = await fetch(buildAiApiUrl('/capabilities', config), {
      cache: 'no-store',
      headers
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      if (throwOnError) {
        throw new Error(payload?.error || 'AI 연결을 확인해주세요.');
      }
      return {
        aiSummarize: false,
        requiresToken: false
      };
    }

    return await response.json();
  } catch (error) {
    if (throwOnError) throw error;
    return {
      aiSummarize: false,
      requiresToken: false
    };
  }
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

  let response;
  try {
    response = await fetch(buildAiApiUrl('/ai/summarize'), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        article: {
          title: article?.title || '',
          summary: article?.summary || '',
          publisher: mediaLabel(article),
          keyword: article?.keyword || '',
          section: article?.section || '',
          url: article?.url || ''
        }
      })
    });
  } catch (error) {
    throw new Error(normalizeAiRequestError(error, 'AI 정리에 실패했습니다.'));
  }

  const payload = await response.json().catch(() => null);
  if (response.status === 401) {
    setStoredAiToken('');
    throw new Error(payload?.error || 'AI 접근 토큰을 다시 입력해주세요.');
  }

  if (!response.ok) {
    throw new Error(payload?.error || 'AI 정리에 실패했습니다.');
  }

  return payload || {};
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
    inboxKeywordFilter: [...inboxKeywordFilterTokens()],
    inboxSearchQuery: String(state.inboxSearchQuery || ''),
    inboxSortKey: String(state.inboxSortKey || 'time'),
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
  state.inboxKeywordFilter = Array.isArray(snapshot.inboxKeywordFilter) ? [...snapshot.inboxKeywordFilter] : [];
  state.inboxSearchQuery = String(snapshot.inboxSearchQuery || '');
  state.inboxSortKey = String(snapshot.inboxSortKey || 'time');
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
  return {
    ...seed,
    section,
    summaryLead: String(seed.summaryLead || seed.conclusion || seed.oneLine || seed.summary || seed.title || '').trim(),
    keyPoint: String(seed.keyPoint || seed.oneLine || seed.angle || seed.summary || seed.title || '').trim(),
    oneLine: String(seed.oneLine || seed.summary || seed.title || '').trim(),
    angle: String(seed.angle || '').trim(),
    conclusion: String(seed.conclusion || '').trim(),
    includeInKakao: seed.includeInKakao !== false,
    priority: String(seed.priority || (section === 'major' ? 'high' : 'normal'))
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
  return [...new Set(
    state.articles
      .filter((article) => article.section === sectionName)
      .map((article) => String(article.keyword || '').trim())
      .filter(Boolean)
  )].sort((left, right) => left.localeCompare(right, 'ko'));
}

function inboxKeywordGroups() {
  const majorOptions = keywordOptionsForSection('major');
  const industryOptions = keywordOptionsForSection('industry');

  if (state.inboxSectionFilter === 'major') {
    return majorOptions.length ? [{ key: 'major', label: '주요 보도', options: majorOptions }] : [];
  }

  if (state.inboxSectionFilter === 'industry') {
    return industryOptions.length ? [{ key: 'industry', label: '업계 보도', options: industryOptions }] : [];
  }

  return [
    { key: 'major', label: '주요 보도', options: majorOptions },
    { key: 'industry', label: '업계 보도', options: industryOptions }
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
    normalizedInboxSearchQuery(),
    inboxKeywordFilterTokens().join('|')
  ].join('::');
  mutate();
  normalizeInboxKeywordFilter();
  const after = [
    state.inboxSectionFilter,
    state.inboxStatusFilter,
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
  if (normalizedInboxSearchQuery()) count += 1;
  count += inboxKeywordFilterTokens().length;
  return count;
}

function snapshotCurrentInboxPreset() {
  return {
    sectionFilter: state.inboxSectionFilter,
    statusFilter: state.inboxStatusFilter,
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

  const item = createDraftItem(article, sectionName);
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
  }
  const charCount = document.getElementById('builder-draft-char-count');
  if (charCount) {
    charCount.textContent = formatNumber(characterLength(nextText));
  }
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
      title: '기사 인박스',
      detail: total
        ? `수집 기사 ${formatNumber(total)}건 중 리포트 후보를 고릅니다.`
        : '오늘 수집된 기사가 아직 없습니다.',
      status: reported === 0 ? 'current' : 'done'
    },
    {
      title: '리포트 빌더',
      detail: reported
        ? `반영된 기사 ${formatNumber(reported)}건으로 초안을 다듬습니다.`
        : '기사 선택 후 초안 편집이 열립니다.',
      status: reported > 0 ? 'current' : 'upcoming'
    },
    {
      title: '카카오 프리뷰',
      detail: reported
        ? '최종 메시지와 분할 파트를 복사 전 점검합니다.'
        : '초안이 만들어지면 마지막 점검 단계가 열립니다.',
      status: reported > 0 ? 'upcoming' : 'upcoming'
    }
  ];

  if (!total) {
    return {
      eyebrow: '오늘 작업 시작',
      title: '먼저 수집 결과를 확인해 주세요',
      description: '기사 인박스에서 오늘 데이터가 들어왔는지 확인한 뒤, 리포트에 넣을 기사부터 고르면 됩니다.',
      primary: { label: '기사 인박스 열기', page: 'inbox' },
      secondary: { label: '설정 확인', page: 'settings' },
      steps
    };
  }

  if (!reported) {
    return {
      eyebrow: '다음 행동',
      title: '기사 선택부터 시작하면 됩니다',
      description: `오늘 수집 기사 ${formatNumber(total)}건이 준비되어 있습니다. 기사 인박스에서 필요한 기사만 체크하고 리포트에 바로 추가하세요.`,
      primary: { label: '기사 인박스에서 고르기', page: 'inbox' },
      secondary: { label: '최근 실행 기록 보기', scrollTarget: 'dashboard-log-panel' },
      steps
    };
  }

  return {
    eyebrow: '다음 행동',
    title: '초안을 다듬고 카카오 전송 전 점검만 남았습니다',
    description: `리포트에 ${formatNumber(reported)}건이 반영되어 있습니다. 초안 문구를 정리한 뒤 카카오 프리뷰에서 최종 메시지를 확인하세요.`,
    primary: { label: '보고서 초안 열기', page: 'builder', builderFocus: 'draft' },
    secondary: { label: '카카오 프리뷰 보기', page: 'kakao' },
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
          <p class="small-copy">${escapeHtml(flow.description)}</p>
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
      title: pending ? `미반영 기사 ${formatNumber(pending)}건 정리` : '초안 반영이 완료되었습니다',
      detail: pending
        ? `기사 인박스에서 필요한 후보를 먼저 고르면 오늘 수집 ${formatNumber(total)}건 중 우선 정리할 수 있습니다.`
        : '기사 인박스 선별이 끝났습니다. 리포트 빌더에서 문구를 다듬고 카카오 검수로 넘어가면 됩니다.',
      actionLabel: pending ? '기사 인박스 열기' : '리포트 빌더 열기',
      actionPage: pending ? 'inbox' : 'builder'
    },
    {
      kicker: '운영 리스크',
      title: failed ? `제외/실패 ${formatNumber(failed)}건 점검 필요` : '검증 이슈가 없습니다',
      detail: failed
        ? '최근 실행 기록과 설정 정책에서 링크 검증, 허용 도메인, 장애 알림 조건을 같이 확인해 보세요.'
        : '현재 기준으로는 크롤링과 링크 검증 흐름에서 큰 경고가 보이지 않습니다.',
      actionLabel: failed ? '설정 보기' : '최근 실행 기록 보기',
      actionPage: failed ? 'settings' : '',
      actionScroll: failed ? '' : 'dashboard-log-panel'
    },
    {
      kicker: '전달 준비',
      title: reported ? `카카오 검수 준비 ${formatNumber(reported)}건` : `리포트 반영률 ${formatNumber(coverageRatio)}%`,
      detail: reported
        ? '기사 카드에서 문구를 다듬었다면 카카오 프리뷰에서 전체 메시지와 파트 길이를 최종 점검하세요.'
        : '반영된 기사가 아직 적습니다. 주요 보도와 업계 보도를 먼저 나누면 뒤쪽 단계가 훨씬 빨라집니다.',
      actionLabel: reported ? '카카오 프리뷰 열기' : '리포트 빌더 열기',
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
          <p class="panel-kicker">Workflow</p>
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

  return `
      <div class="panel-heading">
        <div>
          <p class="panel-kicker">${compact ? 'Quick Preview' : 'Selected Article'}</p>
          <h3>현재 기사</h3>
        </div>
        <span class="panel-pill tone-neutral">${selected ? '체크됨' : '단건 액션'}</span>
      </div>
      <div class="preview-title-block">
        <div class="builder-chip-row preview-pill-row">
          ${renderReportPills(article)}
          <span class="panel-pill tone-neutral">${escapeHtml(formatArticlePublishedTime(article))}</span>
        </div>
        <strong class="preview-inline-title">${escapeHtml(article.title || '')}</strong>
        <p class="preview-summary">${escapeHtml(summary)}</p>
      </div>
      <dl class="meta-list preview-meta-list">
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
      </dl>
      <p class="policy-note"><strong>안내</strong><span>${compact ? '현재 보고 있는 기사 1건만 여기서 바로 처리합니다.' : '체크한 기사는 상단 일괄 처리에서 한 번에 추가하고, 이 패널은 현재 보고 있는 기사 1건만 바로 처리합니다.'}</span></p>
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
        ${renderDataEmpty('inbox-preview-empty', '기사를 선택하세요', '목록에서 한 건을 누르면 이 영역에 현재 기사 요약과 단건 액션이 고정됩니다.')}
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
  const summary = String(article.summary || article.title || '').trim();

  return `
    <div class="mobile-preview-region ${open ? 'is-open' : ''}">
      <button class="mobile-preview-bar" id="mobile-preview-toggle" type="button" aria-expanded="${open}" aria-controls="mobile-preview-sheet">
        <div class="mobile-preview-bar-copy">
          <span class="mobile-preview-bar-kicker">현재 기사</span>
          <strong>${escapeHtml(article.title || '')}</strong>
          <span>${escapeHtml(mediaLabel(article))} · ${escapeHtml(article.keyword || '-')} · ${escapeHtml(formatArticlePublishedTime(article))}</span>
        </div>
        <span class="panel-pill tone-neutral">${summary ? `${formatNumber(characterLength(summary))}자` : '바로 보기'}</span>
      </button>
      <button class="mobile-preview-backdrop ${open ? 'is-open' : ''}" id="mobile-preview-close" type="button" aria-label="현재 기사 미리보기 닫기"></button>
      <div class="mobile-preview-sheet ${open ? 'is-open' : ''}" id="mobile-preview-sheet" role="dialog" aria-modal="false" aria-label="현재 기사 미리보기">
        <div class="mobile-preview-sheet-head">
          <div>
            <p class="panel-kicker">Quick Preview</p>
            <strong>현재 기사 빠른 확인</strong>
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
        <strong>이 카드 안에서 바로 편집</strong>
        <p>여기서 다듬은 문구는 오른쪽 보고서 초안과 카카오 프리뷰에 바로 반영됩니다.</p>
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
  const savedDescription = state.builderDraftRestored
    ? '이 브라우저에 저장된 초안을 복구했습니다.'
    : '카드 편집과 보고서 초안은 이 브라우저에 자동 저장됩니다.';
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
          <p>${escapeHtml(savedDescription)}</p>
        </div>
        <div class="builder-empty-metrics">
          <span class="panel-pill tone-neutral">오늘 수집 ${formatNumber(state.articles.length)}건</span>
          <span class="panel-pill tone-neutral">주요 ${formatNumber(state.articles.filter((article) => article.section === 'major').length)}건</span>
          <span class="panel-pill tone-neutral">업계 ${formatNumber(state.articles.filter((article) => article.section === 'industry').length)}건</span>
        </div>
        ${renderDataEmpty('builder-draft-empty', '초안이 아직 비어 있습니다', canImportArticles ? '기사 인박스에서 먼저 고르거나, 왼쪽 상단 기사 추가로 링크를 바로 넣어 시작해 보세요.' : '기사 인박스에서 기사를 추가해 초안을 시작해 보세요.')}
        <div class="builder-empty-guide">
          ${[
            ['1', '기사 후보 먼저 고르기', `기사 인박스에서 오늘 수집 ${formatNumber(state.articles.length)}건 중 필요한 기사만 체크해 바로 반영합니다.`],
            ['2', canImportArticles ? '링크 기사도 바로 추가' : '카드를 반영해 초안 시작', canImportArticles ? '왼쪽 상단 기사 추가 버튼으로 보고형 URL을 직접 넣어 초안을 채울 수 있습니다.' : '기사 인박스에서 반영한 카드가 이 초안 영역에 바로 쌓입니다.'],
            ['3', '문구 편집 후 카카오 검수', '카드를 선택해 요약을 다듬으면 오른쪽 초안과 카카오 프리뷰에 바로 반영됩니다.']
          ].map(([step, title, body]) => `
            <div class="builder-empty-guide-card">
              <span class="builder-empty-step">${escapeHtml(step)}</span>
              <div class="builder-empty-guide-copy">
                <strong>${escapeHtml(title)}</strong>
                <p>${escapeHtml(body)}</p>
              </div>
            </div>
          `).join('')}
        </div>
        <div class="inline-actions compact stack-mobile builder-empty-actions">
          <button class="primary-btn" type="button" data-builder-empty-nav="inbox">기사 인박스 보기</button>
          ${canImportArticles ? '<button class="ghost-btn" type="button" id="builder-empty-import">기사 추가 열기</button>' : ''}
        </div>
        ${canImportArticles ? '<p class="panel-note builder-empty-note">링크 기사는 왼쪽 상단 기사 추가에서 바로 넣을 수 있습니다.</p>' : ''}
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
        <p>${escapeHtml(savedDescription)}</p>
      </div>
      <div class="builder-readiness-card">
        <div class="builder-readiness-head">
          <div>
            <p class="panel-kicker">Publish Check</p>
            <h3>전송 전 체크</h3>
          </div>
          <span class="panel-pill tone-neutral">${formatNumber(readinessItems.filter((item) => item.state === 'complete').length)}개 준비</span>
        </div>
        <div class="builder-readiness-list">
          ${readinessItems.map((item) => `
            <div class="builder-readiness-item is-${escapeHtml(item.state)}">
              <span class="builder-readiness-state">${item.state === 'complete' ? 'OK' : item.state === 'watch' ? 'CHECK' : 'TODO'}</span>
              <div class="builder-readiness-copy">
                <strong>${escapeHtml(item.title)}</strong>
                <p>${escapeHtml(item.detail)}</p>
              </div>
            </div>
          `).join('')}
        </div>
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
  `;
}

function renderMobileSelectionBar({ selectedCount, inboxAssignment, canOpenSelected }) {
  if (!selectedCount) return '';

  return `
    <div class="mobile-selection-bar" role="region" aria-label="선택 기사 일괄 처리">
      <div class="mobile-selection-head">
        <strong>선택 기사 ${formatNumber(selectedCount)}건</strong>
        <span>체크한 기사만 한 번에 처리합니다.</span>
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

function buildAiSummaryUpdates(article, result) {
  const nextSummaryLead = String(result?.summaryLead || articleSummaryLead(article)).trim();
  const nextKeyPoint = String(result?.keyPoint || articleKeyPoint(article)).trim();
  return {
    summaryLead: nextSummaryLead,
    keyPoint: nextKeyPoint,
    conclusion: nextSummaryLead,
    oneLine: nextKeyPoint
  };
}

async function applyAiSummaryToDraftItem(key) {
  const location = findDraftLocation(key);
  if (!location) {
    return {
      updated: false,
      changed: false
    };
  }

  const previousSummaryLead = articleSummaryLead(location.item);
  const previousKeyPoint = articleKeyPoint(location.item);
  const result = await requestAiSummary(location.item);
  const updates = buildAiSummaryUpdates(location.item, result);
  const changed = previousSummaryLead !== updates.summaryLead || previousKeyPoint !== updates.keyPoint;

  updateDraftItem(key, updates);
  return {
    updated: true,
    changed
  };
}

function generateReportText() {
  return buildKakaoPreviewText();
}

async function summarizeDraftItemWithAi(key) {
  if (state.aiBusyKey) return;

  state.aiBusyKey = key;
  renderReportBuilder();

  try {
    const outcome = await applyAiSummaryToDraftItem(key);
    if (!outcome?.updated) {
      showToast('리포트에 반영된 기사만 AI 정리를 사용할 수 있습니다.');
      return;
    }
    showToast('AI 정리로 요약을 채웠습니다.');
  } catch (error) {
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
  if (!entryKeys.length) {
    showToast('리포트에 반영된 기사가 있을 때 사용할 수 있습니다.');
    return;
  }

  state.aiBusyKey = 'report-draft';
  state.builderSideView = 'draft';
  renderReportBuilder();

  let successCount = 0;
  let changedCount = 0;
  let failedCount = 0;
  let lastError = null;

  try {
    for (const key of entryKeys) {
      try {
        const outcome = await applyAiSummaryToDraftItem(key);
        if (!outcome?.updated) {
          continue;
        }
        successCount += 1;
        if (outcome.changed) {
          changedCount += 1;
        }
      } catch (error) {
        failedCount += 1;
        lastError = error;
      }
    }

    if (!successCount && lastError) {
      throw lastError;
    }

    state.reportTextDraft = generateReportText();
    persistStoredBuilderDraft();

    if (failedCount > 0) {
      showToast(`AI가 기사 ${successCount}건을 정리했고 ${failedCount}건은 실패했습니다.`);
      return;
    }

    if (changedCount > 0) {
      showToast(`AI가 기사 ${changedCount}건을 정리하고 보고서 초안을 갱신했습니다.`);
      return;
    }

    showToast(`AI가 기사 ${successCount}건을 검토하고 보고서 초안을 다시 생성했습니다.`);
  } catch (error) {
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

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightKeywordsForText(text, article) {
  const source = String(text || '');
  const candidates = [
    article?.keyword,
    ...keywordList().filter((keyword) => {
      const candidate = String(keyword || '').trim();
      return candidate ? new RegExp(escapeRegExp(candidate), 'i').test(source) : false;
    })
  ]
    .map((keyword) => String(keyword || '').trim())
    .filter(Boolean);

  return [...new Set(candidates)].sort((a, b) => b.length - a.length);
}

function renderKeywordHighlights(text, keywords) {
  const source = String(text || '');
  if (keywords.length === 0) return escapeHtml(source);

  const pattern = new RegExp(`(${keywords.map(escapeRegExp).join('|')})`, 'gi');
  let cursor = 0;
  let html = '';

  for (const match of source.matchAll(pattern)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    html += escapeHtml(source.slice(cursor, start));
    html += `<mark class="keyword-highlight">${escapeHtml(match[0])}</mark>`;
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

  const pattern = new RegExp(`(${keywords.map(escapeRegExp).join('|')})`, 'gi');
  const firstMatch = pattern.exec(text);
  if (!firstMatch) {
    return renderKeywordHighlights(text.length > maxLength ? `${text.slice(0, Math.max(maxLength - 1, 1)).trimEnd()}…` : text, keywords);
  }

  const firstIndex = firstMatch.index ?? 0;
  const totalLength = text.length;
  let excerptStart = 0;

  if (totalLength > maxLength) {
    const centeredStart = Math.max(0, firstIndex - Math.floor((maxLength - firstMatch[0].length) / 2));
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
  chrome.kicker.textContent = meta.kicker;
  chrome.title.textContent = meta.title;
  chrome.subtitle.textContent = meta.subtitle;

  const sections = getReportSections();
  const majorCount = sections.major.length;
  const industryCount = sections.industry.length;
  const reportCount = sections.major.length + sections.industry.length;
  const segmentCount = getCurrentKakaoSegmentCount();
  const coverageRatio = state.articles.length ? Math.round((reportCount / state.articles.length) * 100) : 0;

  chrome.date.textContent = formatDateLabel(state.date);
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
  } else if (!state.articles.length) {
    chrome.runtimeStatus.hidden = false;
    chrome.runtimeStatus.textContent = '기사 데이터가 아직 없습니다.';
  } else {
    chrome.runtimeStatus.textContent = '';
    chrome.runtimeStatus.hidden = true;
  }

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
    dashboard: { label: '기사 인박스', targetPage: 'inbox', ariaLabel: 'Open Inbox Shortcut' },
    inbox: { label: '리포트 빌더', targetPage: 'builder', ariaLabel: 'Open Report Builder' },
    builder: { label: '카카오 프리뷰', targetPage: 'kakao', ariaLabel: 'Open Kakao Preview' },
    kakao: { label: '리포트 빌더', targetPage: 'builder', ariaLabel: 'Open Report Builder' },
    settings: { label: '리포트 빌더', targetPage: 'builder', ariaLabel: 'Open Report Builder' }
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
  const loadingMessage = state.loadingMessage || '기사, 리포트, 설정 파일을 순서대로 읽고 있습니다.';
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
              <h3>데이터를 불러오는 중입니다</h3>
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

function filterInboxArticles({ ignoreStatusFilter = false, ignoreSearchQuery = false } = {}) {
  const sectionFiltered =
    state.inboxSectionFilter === 'all'
      ? state.articles
      : state.articles.filter((article) => article.section === state.inboxSectionFilter);
  const activeKeywordTokens = inboxKeywordFilterTokens();
  const keywordFiltered = activeKeywordTokens.length
    ? sectionFiltered.filter((article) => activeKeywordTokens.includes(articleKeywordFilterToken(article)))
    : sectionFiltered;

  const searchQuery = ignoreSearchQuery ? '' : normalizedInboxSearchQuery();
  const searchFiltered = searchQuery
    ? keywordFiltered.filter((article) => articleMatchesInboxSearch(article, searchQuery))
    : keywordFiltered;

  if (ignoreStatusFilter || state.inboxStatusFilter === 'all') {
    return searchFiltered;
  }

  if (state.inboxStatusFilter === 'reported') {
    return searchFiltered.filter((article) => isArticleAssigned(article));
  }

  return searchFiltered.filter((article) => !isArticleAssigned(article));
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
    reportTextField.addEventListener('input', (event) => {
      state.reportTextDraft = event.target.value;
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
    showToast('전체 메시지를 복사했습니다.');
  });

  document.getElementById('copy-current').addEventListener('click', async () => {
    if (!activeSegment) return;
    await navigator.clipboard.writeText(activeSegment.content);
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

renderInbox = function renderInboxOverride() {
  updateShellMeta();
  normalizeInboxKeywordFilter();
  const data = filteredArticles();
  const filterScope = filterInboxArticles({ ignoreStatusFilter: true });
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
  const bulkHelpText = majorAssignment.blocked.length
    ? `체크한 기사는 여기서 한 번에 추가하고, 현재 기사 1건은 행 버튼과 오른쪽 패널에서 처리합니다. 업계 보도 기사 ${formatNumber(majorAssignment.blocked.length)}건은 주요 보도만으로는 옮길 수 없습니다.`
    : selectedCount
      ? '체크한 기사는 여기서 한 번에 추가하고, 현재 기사 1건은 행 버튼과 오른쪽 패널에서 바로 처리합니다.'
      : '먼저 기사에 체크하면 추천 경로 추가와 일괄 열기가 활성화됩니다. 현재 기사 1건은 오른쪽 패널 또는 모바일 하단 미리보기에서 바로 처리할 수 있습니다.';

  document.body.classList.toggle('has-mobile-selection-bar', selectedCount > 0);
  document.body.classList.toggle('has-mobile-preview-bar', Boolean(previewArticle) && !selectedCount);
  document.body.classList.toggle('has-mobile-preview-sheet', Boolean(previewArticle) && !selectedCount && state.inboxPreviewOpen);

  app.innerHTML = `
    <section class="page ${selectedCount ? 'has-mobile-selection-bar' : ''}" id="article-inbox-page">
      ${renderWorkflowProgress('inbox')}
      <div class="inbox-layout">
        <div class="content-stack inbox-stack">
          <article class="card table-card inbox-table-card">
            ${renderAnnotation('SCR-INBOX-TABLE-001')}
            <div class="toolbar-topline">
              <div>
                <p class="panel-kicker">Inbox Controls</p>
                <h3>기사 목록</h3>
              </div>
              <div class="toolbar-meta">
                <span class="panel-pill tone-neutral">${searchQuery ? `검색 결과 ${formatNumber(data.length)}건` : `${formatNumber(data.length)}건 표시`}</span>
              </div>
            </div>

            <div class="table-control-stack">
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
              </div>

              <div class="inbox-utility-row">
                <div class="toolbar-stats inbox-results-pills">
                  <span class="panel-pill tone-neutral">현재 범위 ${formatNumber(filterScope.length)}건</span>
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

            ${(state.inboxSavedPresets.length || state.inboxRecentSearches.length || activeFilterCount)
              ? `<div class="inbox-memory-stack">
                  <div class="inbox-memory-row">
                    <div class="inbox-memory-copy">
                      <strong>반복 조건 재사용</strong>
                      <p>자주 보는 필터를 저장하고 최근 검색을 한 번에 다시 불러옵니다.</p>
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
                      <strong class="keyword-band-title">${escapeHtml(group.label)}</strong>
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
                <span class="selection-meta">체크한 기사 일괄 처리</span>
              </div>
              ${selectedCount
                ? `
                  <div class="selection-insight">
                    <strong>이번 일괄 처리 예상</strong>
                    <p>추천 반영 ${formatNumber(inboxAssignment.available.length)}건, 주요 보도 가능 ${formatNumber(majorAssignment.available.length)}건, 업계 보도 가능 ${formatNumber(industryAssignment.available.length)}건${majorAssignment.blocked.length ? `, 제외 ${formatNumber(majorAssignment.blocked.length)}건` : ''}</p>
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
                : '<p class="selection-toolbar-hint">체크한 기사만 추천 경로 추가, 주요 보도만, 업계 보도만, 기사 열기를 한 번에 처리할 수 있습니다.</p>'}
            </div>

            <div class="toolbar-note ${majorAssignment.blocked.length ? 'has-lock' : ''}">
              <strong>${majorAssignment.blocked.length ? '잠금' : '안내'}</strong>
              <span>${bulkHelpText}</span>
            </div>

            ${renderInboxPaginationControls({ maxPage, mode: 'top' })}

            <div class="table table-articles">
              <div class="table-head">
                <span class="table-head-label table-head-label-center">선택</span>
                <span class="table-head-label table-head-label-center">상태</span>
                ${renderInboxSortHeader('media', '매체')}
                ${renderInboxSortHeader('title', '기사')}
                ${renderInboxSortHeader('keyword', '키워드')}
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
                        <div class="table-cell table-cell-status" data-label="상태"><span class="status-badge status-${escapeHtml(status)}">${escapeHtml(statusLabel(status))}</span></div>
                        <div class="table-cell table-cell-media" data-label="매체">${escapeHtml(mediaLabel(article))}</div>
                        <div class="table-cell table-cell-title title-wrap">
                          ${sourcePill ? `<div class="title-meta-strip">${sourcePill}</div>` : ''}
                          <strong>${highlightTitleKeywords(article.title, article)}</strong>
                          <p>${highlightSummaryKeywords(article.summary, article)}</p>
                        </div>
                        <div class="table-cell table-cell-keyword" data-label="키워드">${escapeHtml(article.keyword || '-')}</div>
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
                : renderDataEmpty('inbox-empty', '조건에 맞는 기사가 없습니다', activeFilterCount ? '상단 필터 초기화로 전체 목록으로 돌아가거나, 검색어와 상태 조건을 바꿔 다시 확인해보세요.' : searchQuery ? '검색어 또는 상태 필터를 바꿔 다시 확인해보세요.' : '필터를 바꾸거나 페이지 크기를 조정해 다시 확인해보세요.')}
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
    </section>
  `;

  bindWorkflowProgressActions();

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

  document.getElementById('inbox-clear-filters')?.addEventListener('click', () => {
    const hadSelection = selectedArticleCount() > 0;
    const changed = handleInboxFilterChange(() => {
      state.inboxSectionFilter = 'all';
      state.inboxStatusFilter = 'all';
      state.inboxSearchQuery = '';
      setInboxKeywordFilterTokens([]);
    });
    if (!changed) return;
    renderInbox();
    if (!hadSelection) {
      showToast('필터를 초기화했습니다.');
    }
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
                  ? renderBuilderInlineEditor(sectionName, article, entryKey)
                  : '<p class="small-copy builder-item-hint">카드를 선택하면 이 자리에서 바로 문구를 편집할 수 있습니다.</p>'}
              </div>
            `;
          }).join('')
          : renderDataEmpty(`builder-empty-${sectionName}`, '아직 카드가 없습니다', '기사 인박스 또는 기사 추가 버튼으로 리포트에 반영하세요.')}
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
    </section>
  `;

  bindWorkflowProgressActions();

  app.querySelectorAll('[data-builder-focus]').forEach((node) => {
    node.addEventListener('click', () => {
      setBuilderFocus(node.dataset.builderFocus);
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
    reportTextField.addEventListener('input', (event) => {
      state.reportTextDraft = event.target.value;
      state.builderDraftRestored = false;
      persistStoredBuilderDraft();
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
        <div class="kakao-layout kakao-layout-empty">
          <article class="card kakao-empty-hero">
            ${renderAnnotation('SCR-KAKAO-EMPTY-001')}
            <div class="panel-heading">
              <div>
                <p class="panel-kicker">Message Ready</p>
                <h3>초안이 만들어지면 여기서 바로 검수합니다</h3>
              </div>
              <span class="panel-pill tone-neutral">검수 준비 전</span>
            </div>
            <div class="kakao-empty-grid">
              <div class="kakao-empty-copy">
                <p class="small-copy">리포트 빌더에서 기사 카드를 반영하면 전체 메시지, 분할 파트, 복사 버튼이 이 화면에 바로 열립니다. 지금은 거대한 폰 목업 대신 검수 순서만 먼저 보여줍니다.</p>
                <div class="kakao-empty-checklist">
                  ${[
                    '기사 인박스에서 필요한 기사 선택',
                    '리포트 빌더에서 문구 정리',
                    '카카오 프리뷰에서 전체/분할 길이 최종 확인'
                  ].map((item) => `<div class="kakao-empty-check"><strong>${escapeHtml(item)}</strong></div>`).join('')}
                </div>
                <div class="inline-actions compact stack-mobile">
                  <button class="primary-btn" id="kakao-empty-to-builder">리포트 빌더로 이동</button>
                  <button class="ghost-btn" id="kakao-empty-to-inbox">기사 인박스 보기</button>
                </div>
              </div>
              <div class="kakao-empty-sample">
                <div class="kakao-empty-sample-head">
                  <strong>Daily Comm Report</strong>
                  <span>검수 예시</span>
                </div>
                <div class="kakao-empty-sample-body">
                  <p class="bubble-meta">전체 메시지 · 준비 전</p>
                  <div class="kakao-empty-bubble">기사 2~3건을 반영하면 여기서 실제 카카오 메시지를 한 번에 검수할 수 있습니다.</div>
                  <div class="kakao-empty-segments">
                    <span class="panel-pill tone-neutral">Part 1</span>
                    <span class="panel-pill tone-neutral">Part 2</span>
                  </div>
                </div>
              </div>
            </div>
          </article>

          <aside class="card kakao-side-card kakao-empty-side">
            <div class="panel-heading">
              <div>
                <p class="panel-kicker">검수 체크리스트</p>
                <h3>비어 있을 때 먼저 할 일</h3>
              </div>
              <span class="panel-pill tone-neutral">3단계</span>
            </div>
            <div class="segment-tabs">
              <button class="active" type="button" disabled>
                <span>기사 반영</span>
                <small>인박스에서 시작</small>
              </button>
              <button type="button" disabled>
                <span>초안 편집</span>
                <small>빌더에서 문구 정리</small>
              </button>
              <button type="button" disabled>
                <span>메시지 검수</span>
                <small>여기서 최종 확인</small>
              </button>
            </div>
            <div class="draft-summary">
              <div>
                <span>리포트 기사</span>
                <strong>0건</strong>
              </div>
              <div>
                <span>예상 파트 수</span>
                <strong>-</strong>
              </div>
            </div>
          </aside>
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
              <p class="panel-kicker">Message View</p>
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
                : renderDataEmpty('segment-empty', '분할 메시지가 없습니다', '리포트 빌더에서 기사를 추가하면 화면형 분할 메시지를 확인할 수 있습니다.')}
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
          <p class="panel-note">전체 글자 수를 먼저 보여주고, 화면형 파트는 각 메시지가 ${formatNumber(KAKAO_SEGMENT_CHAR_LIMIT)}자 이내가 되도록 분할합니다.</p>
          <div class="segment-tabs">
            ${derivedSegments.length
              ? derivedSegments.map((segment) => `
                <button class="${segment.order === state.selectedSegmentOrder ? 'active' : ''}" data-segment-order="${segment.order}">
                  <span>Part ${segment.order}</span>
                  <small>${segment.chars || segment.content.length} / ${KAKAO_SEGMENT_CHAR_LIMIT}자</small>
                </button>
              `).join('')
              : renderDataEmpty('kakao-empty', '분할 메시지가 없습니다', '리포트 빌더에 반영된 기사로 카카오 메시지를 만들 수 있습니다.')}
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
    showToast('전체 메시지를 복사했습니다.');
  });

  document.getElementById('copy-current').addEventListener('click', async () => {
    if (!activeSegment) return;
    await navigator.clipboard.writeText(activeSegment.content);
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
  const alertRecipient = String(alertPolicy.recipient || '').trim();
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
      value: alertRecipient || '미지정'
    },
    {
      label: '허용 도메인',
      value: allowedDomains.length
        ? `${allowedDomains[0]}${allowedDomains.length > 1 ? ` 외 ${formatNumber(allowedDomains.length - 1)}개` : ''}`
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
  const showOpsPolicyCard = deployment.visibility !== 'public-readonly';
  const renderTagList = (items, emptyTitle, emptyBody) =>
    items.length
      ? `<div class="settings-tag-list">${items.map((item) => `<span class="settings-tag">${escapeHtml(item)}</span>`).join('')}</div>`
      : renderDataEmpty(`settings-empty-${String(emptyTitle).replace(/\s+/g, '-').toLowerCase()}`, emptyTitle, emptyBody);

  app.innerHTML = `
    <section class="page" id="settings-page">
      <div class="settings-grid">
        <article class="card settings-card">
          ${renderAnnotation('SCR-SET-KEY-001')}
          <div class="panel-heading">
            <div>
              <p class="panel-kicker">Keywords</p>
              <h3>키워드 관리</h3>
            </div>
            <span class="panel-pill">${formatNumber(keywordList().length)}개</span>
          </div>
          ${renderTagList(keywordList(), '등록된 키워드가 없습니다', 'config에 키워드를 추가하면 이곳에 표시됩니다.')}
        </article>

        <article class="card settings-card">
          ${renderAnnotation('SCR-SET-SCHED-001')}
          <div class="panel-heading">
            <div>
              <p class="panel-kicker">Schedule</p>
              <h3>크롤링 스케줄</h3>
            </div>
            <span class="panel-pill">${formatNumber((config.schedule || []).length)}개</span>
          </div>
          ${(config.schedule || []).length
            ? `<div class="settings-list">${config.schedule.map((slot) => `<div class="settings-row"><strong>${escapeHtml(slot)}</strong><span>자동 실행</span></div>`).join('')}</div>`
            : renderDataEmpty('settings-empty-schedule', '등록된 스케줄이 없습니다', '스케줄을 추가하면 이곳에 표시됩니다.')}
        </article>

        <article class="card settings-card">
          ${renderAnnotation('SCR-SET-MEDIA-001')}
          <div class="panel-heading">
            <div>
              <p class="panel-kicker">Whitelist</p>
              <h3>매체 라벨</h3>
            </div>
            <span class="panel-pill">${formatNumber(mediaWhitelist().length)}개</span>
          </div>
          ${renderTagList(mediaWhitelist(), '등록된 매체 라벨이 없습니다', '화이트리스트 매체를 추가하면 이곳에 표시됩니다.')}
        </article>

        ${showOpsPolicyCard
          ? `<article class="card settings-card">
              ${renderAnnotation('SCR-SET-DICT-001')}
              <div class="panel-heading">
                <div>
                  <p class="panel-kicker">Operations Policy</p>
                  <h3>운영 정책 요약</h3>
                </div>
                <span class="panel-pill">${formatNumber(settingsPolicyRows.length)}개</span>
              </div>
              <p class="small-copy">크롤링 재시도, 장애 알림, 허용 도메인, 검증 기준, AI 연결 상태처럼 운영 안정성에 직접 영향을 주는 설정만 한 카드에서 빠르게 확인합니다.</p>
              <div class="settings-trust-banner">
                <strong>장애 알림은 ${alertPolicy.enabled ? String(alertPolicy.channel || 'email').toUpperCase() : '비활성'} 채널로 ${escapeHtml(alertRecipient || '수신처 미지정')}에 전달됩니다.</strong>
                <span>배포 공개 범위 ${escapeHtml(formatSettingsVisibility(deployment.visibility))} · 마지막 데이터 ${escapeHtml(formatDateTime(state.articleMeta?.generatedAt || state.report?.generatedAt))}</span>
              </div>
              <div class="settings-list">
                ${settingsPolicyRows.map((row) => `
                    <div class="settings-row">
                      <strong>${escapeHtml(row.label)}</strong>
                      <span>${escapeHtml(row.value)}</span>
                    </div>
                  `).join('')}
              </div>
            </article>`
          : ''}
      </div>

      ${showOpsPolicyCard ? renderOperationalMicroPolicyCard('settings') : ''}

      <article class="card toolbar-card settings-readonly-card">
        ${renderAnnotation('SCR-SET-ACTION-001')}
        <p class="small-copy">현재 배포본의 설정 페이지는 확인 전용입니다. 실제 운영 값 수정은 설정 파일과 배포 파이프라인에서 관리되고, 이 화면에서는 키워드와 스케줄 상태만 안전하게 점검할 수 있습니다.</p>
        <div class="inline-actions compact">
          <button class="ghost-btn" id="settings-to-builder">리포트 빌더 보기</button>
        </div>
      </article>
    </section>
  `;

  document.getElementById('settings-to-builder').addEventListener('click', () => {
    render('builder');
  });
};

buildTrendItems = function buildTrendItemsOverride() {
  const buildItems = (sectionName, limit = 6) => {
    const source = state.articles.filter((article) => article.section === sectionName);
    const configuredKeywords = keywordList();
    const fallbackKeywords = Array.from(new Set(source.map((article) => article.keyword).filter(Boolean)));
    const candidates = configuredKeywords.length ? configuredKeywords : fallbackKeywords;
    const items = candidates
      .map((keyword) => ({
        keyword,
        count: source.filter((article) => article.title?.includes(keyword) || article.keyword === keyword).length
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
      ${renderDashboardFlowCard(flow)}
      ${renderDashboardPriorityStrip({ total, pending, reported, failed, coverageRatio })}
      <div class="kpi-grid">
        ${[
          ['오늘 수집 기사', `${formatNumber(total)}건`],
          ['리포트 반영률', `${coverageRatio}%`],
          ['리포트 기사', `${formatNumber(reported)}건`],
          ['미반영 기사', `${formatNumber(pending)}건`],
          ['제외 / 실패', `${formatNumber(failed)}건`]
        ].map(([label, value], index) => `
          <article class="card kpi-card">
            ${renderAnnotation(`SCR-DASH-CARD-00${index + 1}`)}
            <div class="kpi-copy">
              <h3>${escapeHtml(label)}</h3>
            </div>
            <p class="kpi-value">${escapeHtml(value)}</p>
          </article>
        `).join('')}
      </div>

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
                  : renderDataEmpty(`trend-empty-${escapeHtml(sectionKey)}`, `${escapeHtml(sectionTitle)} 키워드가 없습니다`, '수집된 기사 0건 키워드는 표시하지 않습니다.')}
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
              : renderDataEmpty('media-empty', '매체 분포가 없습니다', '수집된 기사 출처를 집계할 수 없습니다.')}
          </div>
          <p class="panel-note">전체 수집 기사 기준 상위 매체 비중입니다. 막대 길이는 전체 기사에서 차지하는 실제 비율을 뜻합니다.</p>
        </article>

        ${renderOperationalMicroPolicyCard('dashboard')}

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
                  <p>${escapeHtml(article.summary || '')}</p>
                </button>
              `).join('')
              : renderDataEmpty('dashboard-empty', '표시할 기사가 없습니다', '기사 데이터가 비어 있어 최근 실행 기록을 만들 수 없습니다.')}
          </div>
        </article>
      </div>
    </section>
  `;

  document.getElementById('go-inbox').addEventListener('click', () => render('inbox'));
  document.getElementById('dashboard-open-settings')?.addEventListener('click', () => render('settings'));
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
    document.body.classList.remove('has-mobile-selection-bar');
    document.body.classList.remove('has-mobile-preview-bar');
    document.body.classList.remove('has-mobile-preview-sheet');
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

  const nextScrollTop = state.pageScrollPositions[pageName] ?? 0;
  requestAnimationFrame(() => {
    window.scrollTo({ top: nextScrollTop, left: 0, behavior: 'auto' });
  });
}

async function loadData() {
  state.loading = true;
  state.loadingPhase = 'source';
  state.loadingMessage = '오늘 기사와 보고서 파일을 확인하고 있습니다.';
  state.loadError = '';
  render(state.activePage);

  const configPromise = fetchJson('../crawler/config/default.json', null, { cacheBust: true, noStore: true });
  let resolvedDate = state.date;
  let { articlePayload, reportPayload, segmentsPayload } = await fetchDateArtifacts(resolvedDate);

  if (!articlePayload) {
    state.loadingMessage = '오늘 데이터가 없어 최신 발행일을 다시 확인하고 있습니다.';
    render(state.activePage);
    const latestPayload = await fetchJson('../data/latest.json', null, { cacheBust: true, noStore: true });
    const fallbackDate = typeof latestPayload?.date === 'string' ? latestPayload.date : '';

    if (fallbackDate && fallbackDate !== resolvedDate) {
      state.loadingMessage = `${formatDateLabel(fallbackDate)} 기준 데이터로 다시 불러오고 있습니다.`;
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
  state.loadingMessage = '운영 설정과 키워드 구성을 동기화하고 있습니다.';
  render(state.activePage);
  const configPayload = await configPromise;

  state.loadingPhase = 'capabilities';
  state.loadingMessage = 'AI 요약 기능과 연결 상태를 확인하고 있습니다.';
  render(state.activePage);
  const capabilitiesPayload = await fetchAiCapabilities(configPayload || {});

  state.loadingPhase = 'ready';
  state.loadingMessage = '기사 인박스와 보고서 초안을 준비하고 있습니다.';
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
