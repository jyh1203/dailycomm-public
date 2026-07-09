function hasNaverNewsTail(value = '') {
  return /\s*(?:[:|\-]\s*)?네이버\s*뉴스\s*$/u.test(String(value || '').trim());
}

function hasDraftLine(article, fields = []) {
  return fields.some((field) => String(article?.[field] || '').trim());
}

export function buildPublishCheckItems({
  majorCount = 0,
  industryCount = 0,
  reportItemCount = 0,
  totalDraftChars = 0,
  segmentCount = 0,
  draftEdited = false,
  articles = [],
  formatNumber = (value) => String(value)
} = {}) {
  const items = [
    {
      state: majorCount ? 'complete' : 'pending',
      title: '주요 보도 확보',
      detail: majorCount
        ? `주요 보도 ${formatNumber(majorCount)}건이 포함되어 있습니다.`
        : '최소 1건은 넣어야 메시지 중심이 또렷해집니다.'
    },
    {
      state: industryCount ? 'complete' : 'pending',
      title: '업계 보도 균형',
      detail: industryCount
        ? `업계 보도 ${formatNumber(industryCount)}건이 포함되어 있습니다.`
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
  ];

  const manualFallbackCount = articles.filter((article) => article?.importMode === 'manual-fallback').length;
  if (manualFallbackCount) {
    items.push({
      state: 'watch',
      title: '원문 재수집 필요',
      detail: `수동 링크 ${formatNumber(manualFallbackCount)}건은 원문 재수집 또는 수동 보정 확인이 필요합니다.`
    });
  }

  const pollutedTitleCount = articles.filter((article) => hasNaverNewsTail(article?.title)).length;
  if (pollutedTitleCount) {
    items.push({
      state: 'watch',
      title: '제목 오염 확인',
      detail: `제목 끝의 네이버 뉴스 문구 ${formatNumber(pollutedTitleCount)}건을 확인하세요.`
    });
  }

  const missingDraftCount = articles.filter((article) => {
    const hasSummaryLead = hasDraftLine(article, ['summaryLead', 'conclusion']);
    const hasKeyPoint = hasDraftLine(article, ['keyPoint', 'oneLine', 'angle']);
    return !hasSummaryLead || !hasKeyPoint;
  }).length;
  if (missingDraftCount) {
    items.push({
      state: 'watch',
      title: 'AI 요약 확인',
      detail: `요약/핵심 문구가 부족한 기사 ${formatNumber(missingDraftCount)}건이 있습니다.`
    });
  }

  return items;
}

export function summarizePublishCheck(items = []) {
  const safeItems = Array.isArray(items) ? items : [];
  return {
    readyCount: safeItems.filter((item) => item?.state === 'complete').length,
    watchCount: safeItems.filter((item) => item?.state === 'watch').length,
    pendingCount: safeItems.filter((item) => item?.state === 'pending').length
  };
}
