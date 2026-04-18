const app = document.getElementById('app');
const pageButtons = Array.from(document.querySelectorAll('nav button[data-page]'));

const chrome = {
  title: document.getElementById('workspace-title'),
  subtitle: document.getElementById('workspace-subtitle'),
  kicker: document.getElementById('workspace-kicker'),
  date: document.getElementById('header-date'),
  runtimeGenerated: document.getElementById('runtime-generated'),
  runtimeUsable: document.getElementById('runtime-usable'),
  runtimeReport: document.getElementById('runtime-report'),
  runtimeSegments: document.getElementById('runtime-segments'),
  runtimeStatus: document.getElementById('runtime-status'),
  openReport: document.getElementById('header-open-report'),
  runCrawl: document.getElementById('header-run-crawl')
};

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

let state = {
  date: new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date()),
  loading: true,
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
  kakaoView: 'full',
  selectedSegmentOrder: 1,
  inboxSectionFilter: 'all',
  inboxKeywordFilter: '',
  inboxSortKey: 'time',
  inboxSortDirection: 'desc',
  inboxFiltersOpen: false,
  builderFocusKey: '',
  reportTextDraft: '',
  capabilities: {
    aiSummarize: false,
    provider: '',
    model: ''
  },
  aiBusyKey: ''
};

let toastId = 0;
const AI_TOKEN_STORAGE_KEY = 'input_ai_token';
const AI_TOKEN_LEGACY_STORAGE_KEY = 'dailycomm.aiToken';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showToast(message) {
  let wrap = document.querySelector('.toast-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'toast-wrap';
    document.body.append(wrap);
  }

  const node = document.createElement('div');
  node.className = 'toast';
  node.textContent = message;
  const currentId = ++toastId;
  wrap.append(node);

  setTimeout(() => {
    if (currentId <= toastId) node.remove();
  }, 2200);
}

function formatDateLabel(value) {
  if (!value) return '-';
  return value.replace(/-/g, '.');
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
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const dateLabel = [
    String(date.getFullYear()).padStart(4, '0'),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('.');
  const timeLabel = [
    String(date.getHours()).padStart(2, '0'),
    String(date.getMinutes()).padStart(2, '0')
  ].join(':');
  return `${dateLabel} ${timeLabel}`;
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

  const sameDay = formatDateLabel(state.date) === formatDateLabel(
    `${publishedDate.getFullYear()}-${String(publishedDate.getMonth() + 1).padStart(2, '0')}-${String(publishedDate.getDate()).padStart(2, '0')}`
  );
  const hour = String(publishedDate.getHours()).padStart(2, '0');
  const minute = String(publishedDate.getMinutes()).padStart(2, '0');
  if (sameDay) {
    return `${hour}:${minute}`;
  }

  const month = String(publishedDate.getMonth() + 1).padStart(2, '0');
  const day = String(publishedDate.getDate()).padStart(2, '0');
  return `${month}.${day} ${hour}:${minute}`;
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
  const indicator = active ? (state.inboxSortDirection === 'desc' ? '↓' : '↑') : '↕';
  return `
    <button class="table-sort-btn ${active ? 'active' : ''}" data-sort-key="${sortKey}">
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
  const busy = state.aiBusyKey === key;
  const canConnect = hasRemoteAiConfigured();
  const buttonClass = mode === 'detail' ? 'primary-btn' : 'ghost-btn';
  const label = enabled
    ? (busy ? 'AI 정리 중...' : 'AI 정리')
    : (canConnect ? 'AI 연결' : 'AI 연결 필요');
  const tokenInput = mode === 'detail' && canConnect
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

function buildAiApiUrl(pathname, config = state.config) {
  return `${getAiApiBase(config)}${pathname}`;
}

async function fetchAiCapabilities(config = state.config) {
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
      return {
        aiSummarize: false,
        requiresToken: false
      };
    }

    return await response.json();
  } catch {
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

  const token = getStoredAiToken();
  if (!token) {
    showToast('AI 접근 토큰을 먼저 입력해주세요.');
    return false;
  }
  const capabilitiesPayload = await fetchAiCapabilities();
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

  const response = await fetch(buildAiApiUrl('/ai/summarize'), {
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

function mediaLabel(article) {
  return article?.publisher || article?.media || article?.source || '-';
}

function articleKey(article) {
  if (!article) return '';
  if (article.url) return String(article.url);
  return `${article.keyword || ''}:${article.title || ''}:${mediaLabel(article)}`;
}

function draftEntryKey(sectionName, article) {
  return `${sectionName}::${articleKey(article)}`;
}

function cloneArticle(article) {
  return article ? JSON.parse(JSON.stringify(article)) : null;
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
  return !isMainReport && !isIndustryReport;
}

function canAddIndustryReport(article) {
  return !reportMembership(article).isIndustryReport;
}

function renderReportPills(article) {
  const membership = reportMembership(article);
  const pills = [];
  if (membership.isMainReport) {
    pills.push('<span class="panel-pill tone-main">주요 보도</span>');
  }
  if (membership.isIndustryReport) {
    pills.push('<span class="panel-pill tone-industry">업계 보도</span>');
  }
  if (!pills.length) {
    pills.push('<span class="panel-pill tone-neutral">미반영</span>');
  }
  return pills.join('');
}

function renderPolicyNote(article) {
  const membership = reportMembership(article);
  if (membership.isIndustryReport && !membership.isMainReport) {
    return '<p class="policy-note is-locked"><strong>잠금</strong><span>업계 보도에 반영된 기사는 주요 보도로 올릴 수 없습니다.</span></p>';
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
  const options = inboxKeywordGroups().flatMap((group) => group.options);
  if (state.inboxKeywordFilter && !options.includes(state.inboxKeywordFilter)) {
    state.inboxKeywordFilter = '';
  }
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
  const before = `${state.inboxSectionFilter}::${state.inboxKeywordFilter}`;
  mutate();
  normalizeInboxKeywordFilter();
  const after = `${state.inboxSectionFilter}::${state.inboxKeywordFilter}`;

  if (before === after) {
    return false;
  }

  const hadSelection = selectedArticleCount() > 0;
  clearSelectedArticles();
  state.selectedPage = 1;
  syncSelectedArticleToVisibleArticles();

  if (hadSelection) {
    showToast('필터가 변경되어 선택을 초기화했습니다.');
  }

  return true;
}

function summarizeAssignableArticles(sectionName, articles) {
  return articles.reduce(
    (acc, article) => {
      const membership = reportMembership(article);
      if (sectionName === 'major') {
        if (membership.isMainReport) acc.alreadyAssigned.push(article);
        else if (membership.isIndustryReport) acc.blocked.push(article);
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
  state.reportDraft = {
    major: [],
    industry: []
  };
  syncReportFromDraft();
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

function toggleArticleSelection(article, forceValue) {
  const key = articleKey(article);
  if (!key) return;

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
    if (!key) continue;
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
}

function addArticleToReportSection(sectionName, article) {
  if (!article) return { added: false, reason: 'missing_article' };

  if (sectionName === 'major') {
    if (!canAddMajorReport(article)) {
      const membership = reportMembership(article);
      return {
        added: false,
        reason: membership.isIndustryReport ? 'industry_to_main_blocked' : 'already_main'
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
  return { moved: true, reason: 'moved' };
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
}

function syncBuilderReportTextArea() {
  const reportText = document.getElementById('report-text');
  if (reportText) {
    const nextText = state.reportTextDraft || generateReportText();
    reportText.value = nextText;
    reportText.textContent = nextText;
  }
}

function syncBuilderCardPreview(key) {
  const location = findDraftLocation(key);
  if (!location) return;

  const nextNote = articleSummaryLead(location.item) || articleKeyPoint(location.item) || location.item.summary || '요약 미입력';
  document.querySelectorAll('[data-builder-focus]').forEach((node) => {
    if (node.dataset.builderFocus !== key) return;
    const note = node.querySelector('.builder-item-note');
    if (note) {
      note.textContent = nextNote;
    }
  });
}

function openArticleUrl(url) {
  if (!url) return;
  window.open(url, '_blank', 'noopener,noreferrer');
}

async function summarizeDraftItemWithAi(key) {
  const location = findDraftLocation(key);
  if (!location) return;
  if (state.aiBusyKey) return;

  state.aiBusyKey = key;
  renderReportBuilder();

  try {
    const result = await requestAiSummary(location.item);
    updateDraftItem(key, {
      summaryLead: result.summaryLead || articleSummaryLead(location.item),
      keyPoint: result.keyPoint || articleKeyPoint(location.item)
    });
    showToast('AI 정리로 요약을 채웠습니다.');
  } catch (error) {
    showToast(error instanceof Error ? error.message : 'AI 정리에 실패했습니다.');
  } finally {
    state.aiBusyKey = '';
    renderReportBuilder();
  }
}

function generateReportText() {
  return buildKakaoPreviewText();
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

function splitKakaoPreviewBlock(block, maxChars, maxLines) {
  const lines = String(block || '').split('\n');
  const chunks = [];
  let current = '';

  for (const line of lines) {
    const candidate = current ? `${current}\n${line}` : line;
    if (current && (candidate.length > maxChars || estimateKakaoPreviewLineCount(candidate) > maxLines)) {
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
    { title: '1. 주요 보도 및 배경', items: getReportSections().major.filter((article) => article.includeInKakao !== false) },
    { title: '2. 업계 보도', items: getReportSections().industry.filter((article) => article.includeInKakao !== false) }
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

function buildKakaoPreviewSegments(maxChars = 1100, maxLines = 18, maxBlocksPerSegment = 3) {
  const blocks = buildKakaoBlocks();
  const segments = [];
  let current = '';
  let currentBlockCount = 0;

  blocks.forEach((block) => {
    const blockParts =
      block.length > maxChars || estimateKakaoPreviewLineCount(block) > maxLines
        ? splitKakaoPreviewBlock(block, maxChars, maxLines)
        : [block];

    blockParts.forEach((part) => {
      const candidate = current ? `${current}\n\n${part}` : part;
      const nextBlockCount = currentBlockCount + 1;
      if (
        current &&
        (
          candidate.length > maxChars ||
          estimateKakaoPreviewLineCount(candidate) > maxLines ||
          nextBlockCount > maxBlocksPerSegment
        )
      ) {
        segments.push(current);
        current = part;
        currentBlockCount = 1;
        return;
      }
      current = candidate;
      currentBlockCount = nextBlockCount;
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

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightTitleKeywords(title, article) {
  const text = String(title || '');
  const candidates = [
    article?.keyword,
    ...keywordList().filter((keyword) => text.includes(keyword))
  ]
    .map((keyword) => String(keyword || '').trim())
    .filter(Boolean);

  const keywords = [...new Set(candidates)].sort((a, b) => b.length - a.length);
  if (keywords.length === 0) return escapeHtml(text);

  const pattern = new RegExp(`(${keywords.map(escapeRegExp).join('|')})`, 'gi');
  let cursor = 0;
  let html = '';

  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    html += escapeHtml(text.slice(cursor, start));
    html += `<mark class="keyword-highlight">${escapeHtml(match[0])}</mark>`;
    cursor = end;
  }

  html += escapeHtml(text.slice(cursor));
  return html;
}

function articleStatus(article) {
  if (!article?.url) return 'failed';
  const { isMainReport, isIndustryReport } = reportMembership(article);
  if (isMainReport) return 'selected';
  if (isIndustryReport) return 'reported';
  return 'pending';
}

function updateShellMeta() {
  const meta = pageMeta[state.activePage] || pageMeta.dashboard;
  chrome.kicker.textContent = meta.kicker;
  chrome.title.textContent = meta.title;
  chrome.subtitle.textContent = meta.subtitle;

  const sections = getReportSections();
  chrome.runtimeGenerated.previousElementSibling.textContent = '생성';
  chrome.runtimeUsable.previousElementSibling.textContent = '기사';
  chrome.runtimeReport.previousElementSibling.textContent = '선택';
  chrome.runtimeSegments.previousElementSibling.textContent = '리포트';
  chrome.date.textContent = formatDateLabel(state.date);
  chrome.runtimeGenerated.textContent = formatDateTime(state.articleMeta?.generatedAt || state.report?.generatedAt);
  chrome.runtimeUsable.textContent = formatNumber(state.articles.length);
  chrome.runtimeReport.textContent = formatNumber(selectedArticleCount());
  chrome.runtimeSegments.textContent = formatNumber(sections.major.length + sections.industry.length);

  if (state.loading) {
    chrome.runtimeStatus.textContent = '불러오는 중';
  } else if (state.loadError) {
    chrome.runtimeStatus.textContent = '불러오기 실패';
  } else {
    chrome.runtimeStatus.textContent = '준비 완료';
  }
}

function setActiveNav() {
  pageButtons.forEach((button) => button.classList.toggle('active', button.dataset.page === state.activePage));
}

function renderAnnotation(id) {
  return `<span class="annotation">${escapeHtml(id)}</span>`;
}

function renderLoading() {
  app.innerHTML = `
    <section class="page page-state">
      <article class="card state-card">
        ${renderAnnotation('SCR-STATE-LOADING')}
        <h3>데이터를 불러오는 중입니다</h3>
        <p>기사, 리포트, 설정 파일을 순서대로 읽고 있습니다.</p>
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
  const selected = sections.major.length;
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
                  <span class="spotlight-tag">${escapeHtml(article.section || 'unclassified')}</span>
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

function filteredArticles() {
  const sectionFiltered =
    state.inboxSectionFilter === 'all'
      ? state.articles
      : state.articles.filter((article) => article.section === state.inboxSectionFilter);

  const keywordFiltered = state.inboxKeywordFilter
    ? sectionFiltered.filter((article) => article.keyword === state.inboxKeywordFilter)
    : sectionFiltered;

  return [...keywordFiltered].sort((a, b) => {
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
    return renderDataEmpty('article-preview-empty', '기사를 선택하세요', '목록에서 한 건을 고르면 요약과 분류 액션이 표시됩니다.');
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
    <div class="preview-card-body">
      <div class="preview-head">
        <div>
          <span class="status-badge status-${escapeHtml(articleStatus(article))}">${escapeHtml(statusLabel(articleStatus(article)))}</span>
          <h3>${escapeHtml(article.title)}</h3>
        </div>
        <a href="${escapeHtml(article.url)}" target="_blank" rel="noopener noreferrer" class="text-link">원문 열기</a>
      </div>
      <dl class="meta-list">
        <div><dt>분류</dt><dd>${escapeHtml(sectionLabel(article.section))}</dd></div>
        <div><dt>키워드</dt><dd>${escapeHtml(article.keyword || '-')}</dd></div>
        <div><dt>매체</dt><dd>${escapeHtml(mediaLabel(article))}</dd></div>
      </dl>
      <p class="preview-summary">${escapeHtml(article.summary || '요약 정보가 없습니다.')}</p>
      <div class="builder-chip-row">
        ${renderReportPills(article)}
        <span class="panel-pill tone-neutral">${selected ? '선택됨' : '선택 전'}</span>
      </div>
      <div class="inline-actions compact">
        <button class="ghost-btn" id="toggle-preview-selection">${selected ? '선택 해제' : '선택'}</button>
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
  const reviewReady = visible.filter((article) => articleStatus(article) !== 'failed').length;
  const selectedCount = selectedArticleCount();
  const visibleSelectedCount = visible.filter((article) => isArticleSelected(article)).length;
  const allVisibleSelected = visible.length > 0 && visibleSelectedCount === visible.length;
  const selectedArticles = getSelectedArticles();
  const majorAssignment = summarizeAssignableArticles('major', selectedArticles);
  const industryAssignment = summarizeAssignableArticles('industry', selectedArticles);
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
                <button class="filter-chip ${state.inboxSectionFilter === value ? 'active' : ''}" data-filter="${value}">
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
                  <option value="${escapeHtml(keyword)}" ${state.inboxKeywordFilter === keyword ? 'selected' : ''}>${escapeHtml(keyword)}</option>
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
                  <button class="ghost-btn" id="open-selected" aria-label="Open selected" ${state.selectedArticle ? '' : 'disabled'}>원문 열기</button>
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

  document.querySelectorAll('[data-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      state.inboxSectionFilter = button.dataset.filter;
      state.selectedPage = 1;
      renderInbox();
    });
  });

  document.getElementById('industry-keyword-filter').addEventListener('change', (event) => {
    state.inboxKeywordFilter = event.target.value;
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
  const heading = sectionName === 'major' ? '1. 주요 보도 및 배경' : '2. 업계 보도';
  return `
    <article class="card builder-column" data-drop-zone="${sectionName}">
      ${renderAnnotation(sectionName === 'major' ? 'SCR-BUILD-MAJOR-001' : 'SCR-BUILD-INDUSTRY-001')}
      <div class="panel-heading">
        <div>
          <p class="panel-kicker">${sectionName === 'major' ? '주요 보도' : '업계 보도'}</p>
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
              <div class="builder-item-head">
                <span class="drag-label">${sectionName === 'major' ? '주요' : '업계'}</span>
                <span class="status-badge status-selected">${escapeHtml(article.keyword || sectionLabel(article.section))}</span>
              </div>
              <strong>${escapeHtml(article.title)}</strong>
              <p class="builder-item-source">${escapeHtml(mediaLabel(article))}</p>
                <p class="builder-item-note">${escapeHtml(articleSummaryLead(article) || articleKeyPoint(article) || article.summary || '요약 미입력')}</p>
              <div class="builder-chip-row">
                <span class="panel-pill ${sectionName === 'major' ? 'tone-main' : 'tone-industry'}">${sectionLabel(sectionName)}</span>
              </div>
              <div class="inline-actions compact">
                <button class="ghost-btn" data-builder-open="${escapeHtml(article.url || '')}">원문 열기</button>
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
          : renderDataEmpty(`builder-empty-${sectionName}`, '아직 카드가 없습니다', '기사 인박스에서 선택한 뒤 보고서에 반영하세요.')}
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
    <article class="card detail-panel">
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
        <span class="panel-pill ${location.sectionName === 'major' ? 'tone-main' : 'tone-industry'}">${sectionLabel(location.sectionName)}</span>
      </div>
      ${renderBuilderAiActionButton(key, { mode: 'detail', id: 'builder-ai-summarize' })}
      <div class="inline-actions compact">
        <button class="ghost-btn" id="builder-detail-open">원문 열기</button>
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
      <label class="checkbox-row">
        <input type="checkbox" id="builder-kakao" data-detail-key="${escapeHtml(key)}" ${article.includeInKakao === false ? '' : 'checked'} />
        <span>카카오 메시지에 포함</span>
      </label>
    </article>
  `;
}

function renderReportBuilder() {
  updateShellMeta();
  const sections = getReportSections();
  ensureBuilderFocus();
  const reportText = state.reportTextDraft || generateReportText();
  const reportItemCount = sections.major.length + sections.industry.length;

  app.innerHTML = `
    <section class="page" id="report-builder-page">
      <div class="section-banner">
        ${renderAnnotation('SCR-BUILD-HEAD-001')}
        <div>
          <p class="panel-kicker">Report Builder</p>
          <h3>${formatDateLabel(state.date)} 리포트 빌더</h3>
          <p>반영된 기사만 정리하고 초안을 다듬습니다.</p>
        </div>
      </div>

      <div class="builder-layout">
        <div class="builder-workspace">
          <div class="builder-columns">
            ${renderBuilderColumn('major', sections.major)}
            ${renderBuilderColumn('industry', sections.industry)}
          </div>
        </div>

        <aside class="builder-side-stack">
          ${renderBuilderDetailPanel()}
          <article class="card draft-panel">
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
            <div class="inline-actions stack-mobile">
              <button class="ghost-btn" id="reset-report">초기화</button>
              <button class="ghost-btn" id="copy-report">복사</button>
              <button class="primary-btn" id="save-report" aria-label="Save">저장</button>
              <button class="primary-btn secondary-tone" id="finalize-report">확정</button>
            </div>
          </article>
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
        if (connected) {
          renderReportBuilder();
        }
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
      updateDraftItem(event.target.dataset.detailKey, { summaryLead: event.target.value });
      syncBuilderCardPreview(event.target.dataset.detailKey);
      syncBuilderReportTextArea();
    });
  }

  const detailKeyPoint = document.getElementById('builder-key-point');
  if (detailKeyPoint) {
    detailKeyPoint.addEventListener('input', (event) => {
      updateDraftItem(event.target.dataset.detailKey, { keyPoint: event.target.value });
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

  const detailKakao = document.getElementById('builder-kakao');
  if (detailKakao) {
    detailKakao.addEventListener('change', (event) => {
      updateDraftItem(event.target.dataset.detailKey, { includeInKakao: event.target.checked });
      renderReportBuilder();
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

  document.getElementById('copy-report').addEventListener('click', async () => {
    await navigator.clipboard.writeText(document.getElementById('report-text').value);
    showToast('보고서를 복사했습니다.');
  });

  document.getElementById('save-report').addEventListener('click', () => {
    showToast('리포트 초안을 저장했습니다.');
  });

  document.getElementById('finalize-report').addEventListener('click', () => {
    showToast('보고서를 확정했습니다.');
  });

  document.getElementById('report-text').addEventListener('input', (event) => {
    state.reportTextDraft = event.target.value;
  });

  document.getElementById('reset-report').addEventListener('click', () => {
    state.reportTextDraft = generateReportText();
    renderReportBuilder();
    showToast('보고서 편집 상태를 초기화했습니다.');
  });
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
          <div class="inline-actions stack-mobile">
            <button class="ghost-btn" id="copy-all" aria-label="Copy all">전체 복사</button>
            <button class="primary-btn" id="copy-current" aria-label="Copy current" ${activeSegment ? '' : 'disabled'}>현재 파트 복사</button>
          </div>
        </aside>
      </div>
    </section>
  `;

  app.querySelectorAll('[data-kakao-view]').forEach((button) => {
    button.addEventListener('click', () => {
      state.kakaoView = button.dataset.kakaoView;
      renderKakaoPreview();
    });
  });

  app.querySelectorAll('[data-segment-order]').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedSegmentOrder = Number(button.dataset.segmentOrder);
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
  normalizeInboxKeywordFilter();
  updateShellMeta();
  const data = filteredArticles();
  if (!data.some((article) => articleKey(article) === articleKey(state.selectedArticle))) {
    state.selectedArticle = data[0] || null;
  }
  const sections = getReportSections();
  const keywordGroups = inboxKeywordGroups();
  const statusCounts = {
    all: state.articles.length,
    major: state.articles.filter((article) => article.section === 'major').length,
    industry: state.articles.filter((article) => article.section === 'industry').length
  };
  const maxPage = Math.max(1, Math.ceil(data.length / state.pageSize));
  state.selectedPage = Math.min(state.selectedPage, maxPage);
  const start = (state.selectedPage - 1) * state.pageSize;
  const visible = data.slice(start, start + state.pageSize);
  const reviewReady = visible.filter((article) => articleStatus(article) !== 'failed').length;
  const selectedCount = selectedArticleCount();
  const visibleSelectedCount = visible.filter((article) => isArticleSelected(article)).length;
  const allVisibleSelected = visible.length > 0 && visibleSelectedCount === visible.length;
  const selectedArticles = getSelectedArticles();
  const majorAssignment = summarizeAssignableArticles('major', selectedArticles);
  const industryAssignment = summarizeAssignableArticles('industry', selectedArticles);
  const assignedCount = sections.major.length + sections.industry.length;
  const showMajorActions = state.inboxSectionFilter !== 'industry';

  app.innerHTML = `
    <section class="page" id="article-inbox-page">
      <div class="section-banner section-banner-inline">
        <div>
          ${renderAnnotation('SCR-INBOX-HEAD-001')}
          <p class="panel-kicker">Article Inbox</p>
          <h3>기사 인박스</h3>
          <p>테이블에서 선택하고 바로 주요 보도와 업계 보도로 분류합니다.</p>
        </div>
        <span class="panel-pill tone-neutral">${formatNumber(data.length)}건 표시</span>
      </div>

      <div class="content-stack inbox-stack">
        <article class="card table-card inbox-table-card">
          ${renderAnnotation('SCR-INBOX-TABLE-001')}
          <div class="toolbar-topline">
            <div>
              <p class="panel-kicker">Table Controls</p>
              <h3>기사 목록</h3>
            </div>
            <div class="toolbar-meta">
              <label for="page-size">페이지 크기</label>
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
                <button class="filter-chip ${state.inboxSectionFilter === value ? 'active' : ''}" data-filter="${value}">
                  <strong>${escapeHtml(label)}</strong>
                  <span>${formatNumber(count)}</span>
                </button>
              `).join('')}
            </div>
          </div>

          ${keywordGroups.length
            ? `<div class="keyword-band-list">
                ${keywordGroups.map((group) => `
                  <div class="keyword-filter-band">
                    <strong class="keyword-band-title">${escapeHtml(group.label)}</strong>
                    <div class="chip-group chip-group-inline">
                      <button class="filter-chip keyword-chip ${state.inboxKeywordFilter === '' ? 'active' : ''}" data-keyword-filter="">
                        <strong>전체</strong>
                      </button>
                      ${group.options.map((keyword) => `
                        <button class="filter-chip keyword-chip ${state.inboxKeywordFilter === keyword ? 'active' : ''}" data-keyword-filter="${escapeHtml(keyword)}">
                          <strong>${escapeHtml(keyword)}</strong>
                        </button>
                      `).join('')}
                    </div>
                  </div>
                `).join('')}
              </div>`
            : ''}

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
                ${showMajorActions ? `<button class="primary-btn" id="assign-major" ${majorAssignment.available.length ? '' : 'disabled'}>주요 보도 추가</button>` : ''}
                <button class="primary-btn secondary-tone" id="assign-industry" ${industryAssignment.available.length ? '' : 'disabled'}>업계 보도 추가</button>
              </div>
              <div class="action-cluster">
                <button class="ghost-btn" id="open-selected" aria-label="Open selected" ${state.selectedArticle ? '' : 'disabled'}>원문 열기</button>
              </div>
            </div>
          </div>

          <div class="toolbar-stats">
            <span class="panel-pill tone-neutral">검토 가능 ${formatNumber(reviewReady)}건</span>
            <span class="panel-pill tone-neutral">리포트 반영 ${formatNumber(assignedCount)}건</span>
            <span class="panel-pill tone-neutral">현재 페이지 ${formatNumber(visibleSelectedCount)}건 선택</span>
          </div>

          ${(selectedCount || majorAssignment.blocked.length)
            ? `<div class="toolbar-note ${majorAssignment.blocked.length ? 'has-lock' : ''}">
                ${majorAssignment.blocked.length
                  ? '<strong>잠금</strong><span>업계 보도에 들어간 기사는 주요 보도로 올릴 수 없습니다.</span>'
                  : '<strong>안내</strong><span>선택한 기사만 주요 보도 또는 업계 보도로 보낼 수 있습니다.</span>'}
              </div>`
            : ''}

          <div class="table table-articles">
            <div class="table-head">
              <span>선택</span>
              <span>상태</span>
              ${renderInboxSortHeader('media', '매체')}
              ${renderInboxSortHeader('title', '기사')}
              ${renderInboxSortHeader('keyword', '키워드')}
              ${renderInboxSortHeader('time', '시간')}
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
                    <div>${escapeHtml(formatArticlePublishedTime(article))}</div>
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
              <p class="panel-kicker">Selected Article</p>
              <h3>기사 요약</h3>
            </div>
            <span class="panel-pill tone-neutral">선택 기사</span>
          </div>
          ${renderArticlePreview(state.selectedArticle)}
        </article>
      </div>
    </section>
  `;

  document.querySelectorAll('[data-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      const changed = handleInboxFilterChange(() => {
        state.inboxSectionFilter = button.dataset.filter;
      });
      if (changed) {
        renderInbox();
      }
    });
  });

  document.querySelectorAll('[data-keyword-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      const changed = handleInboxFilterChange(() => {
        state.inboxKeywordFilter = button.dataset.keywordFilter || '';
      });
      if (changed) {
        renderInbox();
      }
    });
  });

  document.querySelectorAll('[data-sort-key]').forEach((button) => {
    button.addEventListener('click', () => {
      toggleInboxSort(button.dataset.sortKey || 'time');
      state.selectedPage = 1;
      renderInbox();
    });
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

  if (showMajorActions) {
    document.getElementById('assign-major').addEventListener('click', () => {
      assignSelectedArticlesToSection('major');
      renderInbox();
    });
  }

  document.getElementById('assign-industry').addEventListener('click', () => {
    assignSelectedArticlesToSection('industry');
    renderInbox();
  });

  document.getElementById('open-selected').addEventListener('click', () => {
    if (state.selectedArticle?.url) {
      window.open(state.selectedArticle.url, '_blank', 'noopener,noreferrer');
    }
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
          showToast('업계 보도에 들어간 기사는 주요 보도로 올릴 수 없습니다.');
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
};

renderBuilderColumn = function renderBuilderColumnOverride(sectionName, items) {
  const heading = sectionName === 'major' ? '1. 주요 보도 및 배경' : '2. 업계 보도';
  return `
    <article class="card builder-column" data-drop-zone="${sectionName}">
      ${renderAnnotation(sectionName === 'major' ? 'SCR-BUILD-MAJOR-001' : 'SCR-BUILD-INDUSTRY-001')}
      <div class="panel-heading">
        <div>
          <p class="panel-kicker">${sectionName === 'major' ? '주요 보도' : '업계 보도'}</p>
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
                <div class="builder-item-head">
                  <span class="drag-label">${sectionName === 'major' ? '주요' : '업계'}</span>
                  <span class="status-badge status-selected">${escapeHtml(article.keyword || sectionLabel(article.section))}</span>
                </div>
                <strong>${escapeHtml(article.title)}</strong>
                <p class="builder-item-source">${escapeHtml(mediaLabel(article))}</p>
                <p class="builder-item-note">${escapeHtml(articleSummaryLead(article) || articleKeyPoint(article) || article.summary || '요약을 아직 입력하지 않았습니다.')}</p>
              <div class="builder-chip-row">
                <span class="panel-pill ${sectionName === 'major' ? 'tone-main' : 'tone-industry'}">${sectionLabel(sectionName)}</span>
              </div>
                <div class="inline-actions compact">
                  <button class="ghost-btn" data-builder-open="${escapeHtml(article.url || '')}">원문 열기</button>
                  ${sectionName === 'major'
                    ? `<button class="ghost-btn" data-builder-move-industry="${escapeHtml(entryKey)}">업계로 이동</button>`
                    : ''}
                  <button class="ghost-btn" data-builder-remove="${escapeHtml(entryKey)}">제거</button>
                </div>
              </div>
            `;
          }).join('')
          : renderDataEmpty(`builder-empty-${sectionName}`, '아직 카드가 없습니다', '기사 인박스에서 추가한 기사만 이곳에 표시됩니다.')}
      </div>
    </article>
  `;
};

renderBuilderDetailPanel = function renderBuilderDetailPanelOverride() {
  const location = findDraftLocation(state.builderFocusKey);
  if (!location) {
    return `
      <article class="card detail-panel">
        ${renderAnnotation('SCR-BUILD-DETAIL-001')}
        <div class="panel-heading">
          <div>
            <p class="panel-kicker">기사 설정</p>
            <h3>기사별 설정</h3>
          </div>
        </div>
        ${renderDataEmpty('builder-detail-empty', '편집할 기사를 선택하세요', '리포트에 반영된 기사를 고르면 요약과 발행 옵션을 수정할 수 있습니다.')}
      </article>
    `;
  }

  const article = location.item;
  const key = draftEntryKey(location.sectionName, article);
  return `
    <article class="card detail-panel">
      ${renderAnnotation('SCR-BUILD-DETAIL-001')}
      <div class="panel-heading">
        <div>
          <p class="panel-kicker">기사 설정</p>
          <h3>기사별 설정</h3>
        </div>
        <span class="panel-pill tone-neutral">${escapeHtml(sectionLabel(location.sectionName))}</span>
      </div>
      <div class="detail-hero">
        <strong>${escapeHtml(article.title)}</strong>
        <p>${escapeHtml(mediaLabel(article))} · ${escapeHtml(article.keyword || '-')}</p>
      </div>
      <div class="builder-chip-row">
        <span class="panel-pill ${location.sectionName === 'major' ? 'tone-main' : 'tone-industry'}">${sectionLabel(location.sectionName)}</span>
      </div>
      ${renderBuilderAiActionButton(key, { mode: 'detail', id: 'builder-ai-summarize' })}
      <div class="inline-actions compact">
        <button class="ghost-btn" id="builder-detail-open">원문 열기</button>
      </div>
      <div class="detail-guide">
        <strong>기본 생성 기준</strong>
        <p>타입은 현재 기사 위치에 따라 주요 보도 또는 업계 보도로 표시됩니다.</p>
        <p>기사 요약 및 결론은 기사 요약이나 제목을 바탕으로 30자 안팎으로 시작합니다.</p>
        <p>주요 내용 한줄 요약은 기사 본문 요약을 바탕으로 40자 안팎으로 채우고, 제목·매체·링크는 원문 값이 자동 반영됩니다.</p>
      </div>
      ${location.sectionName === 'major'
        ? '<div class="inline-actions compact"><button class="ghost-btn" id="builder-detail-move-industry">업계로 이동</button></div>'
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
      <label class="checkbox-row">
        <input type="checkbox" id="builder-kakao" data-detail-key="${escapeHtml(key)}" ${article.includeInKakao === false ? '' : 'checked'} />
        <span>카카오 메시지에 포함</span>
      </label>
    </article>
  `;
};

const baseRenderReportBuilder = renderReportBuilder;
renderReportBuilder = function renderReportBuilderOverride() {
  updateShellMeta();
  return baseRenderReportBuilder();
};

renderKakaoPreview = function renderKakaoPreviewOverride() {
  updateShellMeta();
  const fullText = buildKakaoPreviewText();
  const derivedSegments = buildKakaoPreviewSegments();
  const activeSegment = derivedSegments.find((segment) => segment.order === state.selectedSegmentOrder) || derivedSegments[0] || null;

  if (!activeSegment && state.selectedSegmentOrder !== 1) {
    state.selectedSegmentOrder = 1;
  } else if (activeSegment && state.selectedSegmentOrder !== activeSegment.order) {
    state.selectedSegmentOrder = activeSegment.order;
  }

  app.innerHTML = `
    <section class="page" id="kakao-preview-page">
      <div class="section-banner">
        ${renderAnnotation('SCR-KAKAO-HEAD-001')}
        <div>
          <p class="panel-kicker">Kakao Preview</p>
          <h3>카카오 프리뷰</h3>
          <p>리포트 빌더 결과를 카카오톡 형식 그대로 검수하고 복사합니다.</p>
        </div>
      </div>

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
              <p class="bubble-meta">전체 메시지</p>
              <div class="chat-row self">
                <div class="kakao-bubble" id="kakao-full">${escapeHtml(fullText || '리포트 빌더 결과가 아직 없습니다.')}</div>
              </div>
            </div>

            <div class="phone-screen ${state.kakaoView === 'segmented' ? '' : 'hidden'}">
              <p class="bubble-meta">분할 메시지</p>
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
            <span class="panel-pill tone-neutral">${formatNumber(derivedSegments.length)}개</span>
          </div>
          <div class="segment-tabs">
            ${derivedSegments.length
              ? derivedSegments.map((segment) => `
                <button class="${segment.order === state.selectedSegmentOrder ? 'active' : ''}" data-segment-order="${segment.order}">
                  <span>Part ${segment.order}</span>
                  <small>${segment.chars || segment.content.length}자</small>
                </button>
              `).join('')
              : renderDataEmpty('kakao-empty', '분할 메시지가 없습니다', '리포트 빌더에 반영된 기사로 카카오 메시지를 만들 수 있습니다.')}
          </div>
          <div class="draft-summary">
            <div>
              <span>현재 파트</span>
              <strong>${activeSegment ? `Part ${activeSegment.order}` : '-'}</strong>
            </div>
            <div>
              <span>문자 수</span>
              <strong>${activeSegment ? formatNumber(activeSegment.chars || activeSegment.content.length) : '-'}</strong>
            </div>
            <div>
              <span>예상 줄</span>
              <strong>${activeSegment ? formatNumber(activeSegment.lineCount || estimateKakaoPreviewLineCount(activeSegment.content)) : '-'}</strong>
            </div>
          </div>
          <p class="panel-note">분할 메시지는 기사 3개 안팎을 기준으로 묶고, 긴 기사는 더 잘게 나눠 카카오톡 채팅 화면에서 읽기 쉽게 맞춥니다.</p>
          <div class="inline-actions stack-mobile">
            <button class="ghost-btn" id="copy-all" aria-label="Copy all">전체 복사</button>
            <button class="primary-btn" id="copy-current" aria-label="Copy current" ${activeSegment ? '' : 'disabled'}>현재 파트 복사</button>
          </div>
        </aside>
      </div>
    </section>
  `;

  app.querySelectorAll('[data-kakao-view]').forEach((button) => {
    button.addEventListener('click', () => {
      state.kakaoView = button.dataset.kakaoView;
      renderKakaoPreview();
    });
  });

  app.querySelectorAll('[data-segment-order]').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedSegmentOrder = Number(button.dataset.segmentOrder);
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

  const dictionaryEntries = Object.entries(config.classificationDictionary || {});
  const renderTagList = (items, emptyTitle, emptyBody) =>
    items.length
      ? `<div class="settings-tag-list">${items.map((item) => `<span class="settings-tag">${escapeHtml(item)}</span>`).join('')}</div>`
      : renderDataEmpty(`settings-empty-${String(emptyTitle).replace(/\s+/g, '-').toLowerCase()}`, emptyTitle, emptyBody);

  app.innerHTML = `
    <section class="page" id="settings-page">
      <div class="section-banner">
        ${renderAnnotation('SCR-SET-HEAD-001')}
        <div>
          <p class="panel-kicker">Operations</p>
          <h3>설정</h3>
          <p>운영 키워드, 크롤링 스케줄, 화이트리스트, 분류 사전을 한 화면에서 확인합니다.</p>
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

        <article class="card settings-card">
          ${renderAnnotation('SCR-SET-DICT-001')}
          <div class="panel-heading">
            <div>
              <p class="panel-kicker">Dictionary</p>
              <h3>분류 사전</h3>
            </div>
            <span class="panel-pill">${formatNumber(dictionaryEntries.length)}개</span>
          </div>
          ${dictionaryEntries.length
            ? `<div class="settings-list">${dictionaryEntries.map(([key, value]) => `
                <div class="settings-row">
                  <strong>${escapeHtml(key)}</strong>
                  <span>${escapeHtml(value)}</span>
                </div>
              `).join('')}</div>`
            : renderDataEmpty('settings-empty-dictionary', '등록된 분류 사전이 없습니다', '키워드-섹션 매핑을 추가하면 이곳에 표시됩니다.')}
        </article>
      </div>

      <article class="card toolbar-card">
        ${renderAnnotation('SCR-SET-ACTION-001')}
        <p class="small-copy">설정 편집 UI는 읽기 전용 상태이며, 저장 버튼은 현재 확인용 액션입니다.</p>
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
    .slice(0, 6)
    .map(([name, count]) => ({
      name,
      count,
      percent: Math.round((count / total) * 100),
      widthPercent: Math.max(8, Math.round((count / total) * 100))
    }));
};

buildRunLogs = function buildRunLogsOverride() {
  const stats = getStats();
  const stamp = state.articleMeta?.generatedAt || state.report?.generatedAt || new Date().toISOString();
  return [
    {
      time: formatDateTime(stamp),
      label: '크롤링 결과',
      statusClass: stats.invalidUrlDropped || stats.unusableCandidateDropped || stats.emptyTitleDropped ? 'warning' : 'reported',
      statusLabel: stats.invalidUrlDropped || stats.unusableCandidateDropped || stats.emptyTitleDropped ? '주의' : '완료',
      detail: `사용 가능한 기사 ${formatNumber(stats.totalDeduped || state.articles.length)}건`
    },
    {
      time: formatDateTime(stamp),
      label: '검증 결과',
      statusClass: stats.invalidUrlDropped ? 'failed' : 'selected',
      statusLabel: stats.invalidUrlDropped ? '점검 필요' : '통과',
      detail: stats.invalidUrlDropped
        ? `유효하지 않은 링크 ${formatNumber(stats.invalidUrlDropped || 0)}건 제외`
        : '링크 검증을 통과했습니다'
    }
  ];
};

renderDashboard = function renderDashboardOverride() {
  const stats = getStats();
  const sections = getReportSections();
  const reported = sections.major.length + sections.industry.length;
  const total = state.articles.length;
  const pending = Math.max(total - reported, 0);
  const selected = sections.major.length;
  const failed = (stats.invalidUrlDropped || 0) + (stats.unusableCandidateDropped || 0);
  const trendItems = buildTrendItems();
  const mediaItems = buildMediaDistribution();
  const runLogs = buildRunLogs();
  const spotlight = state.articles.slice(0, 5);
  const coverageRatio = total ? Math.round((reported / total) * 100) : 0;
  const kakaoIncluded = [...sections.major, ...sections.industry].filter((article) => article.includeInKakao !== false).length;

  app.innerHTML = `
    <section class="page" id="dashboard-page">
      <article class="hero-panel">
        <div>
          ${renderAnnotation('SCR-DASH-HERO-001')}
          <p class="hero-kicker">오늘 요약</p>
          <h3>${formatDateLabel(state.date)} Daily Comm Report</h3>
          <p class="hero-copy">오늘 수집 기사와 리포트 반영 현황을 한 화면에서 점검하는 운영 대시보드입니다.</p>
        </div>
        <div class="hero-stack">
          <div class="hero-chip">
            <span>오늘 수집 기사</span>
            <strong>${formatNumber(total)}건</strong>
          </div>
          <div class="hero-chip">
            <span>리포트 반영률</span>
            <strong>${coverageRatio}%</strong>
          </div>
          <div class="hero-chip">
            <span>리포트 기사</span>
            <strong>${formatNumber(reported)}건</strong>
          </div>
        </div>
      </article>

      <div class="kpi-grid">
        ${[
          ['전체 기사', '오늘 수집', total],
          ['미반영', '미반영 기사', pending],
          ['주요 보도', '주요 보도', selected],
          ['리포트 반영', '리포트 반영', reported],
          ['제외/실패', '실패 / 제외', failed]
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
              <p class="panel-kicker">운영 로그</p>
              <h3>최근 실행 기록</h3>
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
                <span class="status-badge status-${escapeHtml(row.statusClass)}">${escapeHtml(row.statusLabel)}</span>
                <p class="run-log-detail">${escapeHtml(row.detail)}</p>
              </div>
            `).join('')}
          </div>
          <div class="spotlight-list">
            ${spotlight.length
              ? spotlight.map((article, index) => `
                <button class="spotlight-item" data-open="${index}">
                  <span class="spotlight-tag">${escapeHtml(article.section || 'unclassified')}</span>
                  <strong>${escapeHtml(article.title)}</strong>
                  <p>${escapeHtml(article.summary || '')}</p>
                </button>
              `).join('')
              : renderDataEmpty('dashboard-empty', '표시할 기사가 없습니다', '기사 데이터가 비어 있어 최근 실행 기록을 만들 수 없습니다.')}
          </div>
        </article>

        <article class="card panel-card">
          ${renderAnnotation('SCR-DASH-TREND-001')}
          <div class="panel-heading">
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

        <article class="card panel-card">
          ${renderAnnotation('SCR-DASH-MEDIA-001')}
          <div class="panel-heading">
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

        <article class="card panel-card">
          ${renderAnnotation('SCR-DASH-COMP-001')}
          <div class="panel-heading">
            <div>
              <p class="panel-kicker">리포트</p>
              <h3>리포트 현황</h3>
            </div>
            <span class="panel-pill">${formatNumber(sections.major.length + sections.industry.length)}건 반영</span>
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
              <span>카카오 포함</span>
              <strong>${formatNumber(kakaoIncluded)}</strong>
            </div>
            <div class="snapshot-card">
              <span>미수집 페이지</span>
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
};

function render(pageName) {
  state.activePage = pageName;
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
}

async function loadData() {
  state.loading = true;
  state.loadError = '';
  render(state.activePage);

  const configPromise = fetchJson('../crawler/config/default.json', null, { cacheBust: true, noStore: true });
  let resolvedDate = state.date;
  let { articlePayload, reportPayload, segmentsPayload } = await fetchDateArtifacts(resolvedDate);

  if (!articlePayload) {
    const latestPayload = await fetchJson('../data/latest.json', null, { cacheBust: true, noStore: true });
    const fallbackDate = typeof latestPayload?.date === 'string' ? latestPayload.date : '';

    if (fallbackDate && fallbackDate !== resolvedDate) {
      resolvedDate = fallbackDate;
      ({ articlePayload, reportPayload, segmentsPayload } = await fetchDateArtifacts(resolvedDate));
    }
  }

  const configPayload = await configPromise;
  const capabilitiesPayload = await fetchAiCapabilities(configPayload || {});

  const articles = normalizeArticles(articlePayload);

  if (!articlePayload) {
    state.loading = false;
    state.loadError = `기사 파일을 찾을 수 없습니다: data/articles/${resolvedDate}.json`;
    render(state.activePage);
    return;
  }

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
  initializeReportDraft();
  normalizeInboxKeywordFilter();
  state.loading = false;
  state.selectedArticle = state.articles[0] || null;
  state.selectedArticleUrls = [];
  state.previewMode = 'summary';
  state.aiBusyKey = '';
  ensureBuilderFocus();
  state.reportTextDraft = generateReportText();

  if (state.segments[0]) {
    state.selectedSegmentOrder = state.segments[0].order;
  }

  render(state.activePage);
}

pageButtons.forEach((button) => {
  button.addEventListener('click', () => render(button.dataset.page));
});

chrome.openReport.addEventListener('click', () => render('builder'));
chrome.runCrawl.addEventListener('click', () => {
  showToast('크롤링 실행은 현재 UI에서 비활성화되어 있습니다.');
});

await loadData();
