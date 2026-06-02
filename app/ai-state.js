export function normalizeAiCapabilities(payload = {}) {
  return {
    aiSummarize: Boolean(payload?.aiSummarize),
    provider: String(payload?.provider || ''),
    model: String(payload?.model || ''),
    requiresToken: Boolean(payload?.requiresToken)
  };
}

export function describeAiConnection({ capabilities = {}, hasRemote = false, hasToken = false, status = 'idle', error = '' } = {}) {
  if (status === 'checking') {
    return {
      tone: 'reported',
      label: 'AI 확인 중',
      detail: '원격 AI API 연결 상태를 확인하고 있습니다.'
    };
  }

  if (status === 'error') {
    return {
      tone: 'warning',
      label: 'AI 장애',
      detail: error || '원격 AI API 연결을 확인해야 합니다.'
    };
  }

  if (capabilities.aiSummarize) {
    if (capabilities.requiresToken && !hasToken) {
      return {
        tone: 'warning',
        label: 'AI 토큰 필요',
        detail: '서버가 AI 접근 토큰을 요구합니다.'
      };
    }
    return {
      tone: 'selected',
      label: 'AI 정상',
      detail: capabilities.provider
        ? `${capabilities.provider}${capabilities.model ? ` / ${capabilities.model}` : ''}`
        : '원격 AI 요약을 사용할 수 있습니다.'
    };
  }

  if (hasRemote) {
    return {
      tone: 'reported',
      label: 'AI 연결 전',
      detail: '버튼 실행 시 원격 API를 확인합니다.'
    };
  }

  return {
    tone: 'neutral',
    label: 'AI 미설정',
    detail: '원격 AI API 주소가 설정되지 않았습니다.'
  };
}

export function importModeBadge(importMode = '') {
  const mode = String(importMode || '').trim();
  if (mode === 'manual-fallback') {
    return { tone: 'warning', label: '수동 링크' };
  }
  if (mode === 'api-refresh') {
    return { tone: 'selected', label: '원문 재수집' };
  }
  if (mode) {
    return { tone: 'neutral', label: 'API 추가' };
  }
  return null;
}
