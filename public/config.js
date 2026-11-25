// 발표 내용 설정 (서버와 화면이 함께 사용)
// 문구·설문 수치·분임 주제를 바꾸려면 이 파일만 고치면 됩니다.
(function (root) {
  const CFG = {
    EVENT: {
      year: '2026학년도',
      school: '청학고등학교',
      title: '자율형공립고 2.0 자체평가회',
      theme1: '지나온 성장,',
      theme2: '함께할 도약',
    },

    // 분임 (번호 = 배열 순서 + 1)
    GROUPS: [
      { topic: '지역연계 교육활동', color: '#224b99',
        guide: ['지역 기관·대학·마을과 함께한 활동 중 효과가 컸던 것은?', '지역 연계를 지속 가능하게 만들려면 무엇이 필요할까?'] },
      { topic: '학생활동 및 탐구활동', color: '#138380',
        guide: ['학생 주도 탐구·동아리 활동에서 의미 있었던 장면은?', '탐구 활동의 질을 높이기 위해 필요한 지원은?'] },
      { topic: '학생 학력 신장', color: '#0e6ca5',
        guide: ['학력 향상에 도움이 된 수업·프로그램은?', '기초학력과 심화학습을 함께 챙기려면?'] },
      { topic: '진로 및 진학 지원', color: '#6a54b8',
        guide: ['학생의 진로 설계·진학에 실질적으로 도움이 된 지원은?', '학년별로 더 체계화할 부분은?'] },
      { topic: '학교문화 및 학교환경 개선', color: '#2b8a3e',
        guide: ['올해 달라진 학교 문화·공간 중 긍정적인 변화는?', '모두가 머물고 싶은 학교가 되려면?'] },
      { topic: '교원 업무 경감 및 업무 효율화', color: '#d9822b',
        guide: ['업무 경감에 실제로 도움이 된 변화는?', '줄이거나 합치거나 디지털화할 업무는?'] },
      { topic: '교육과정 특성화 및 다양화', color: '#3462b4',
        guide: ['우리 학교만의 특색 교육과정으로 자리 잡은 것은?', '학생 선택권을 넓히기 위한 다음 단계는?'] },
      { topic: '학교 경쟁력 강화', color: '#b8433c',
        guide: ['자율형공립고 2.0으로서 우리 학교의 강점은?', '지역에서 선택받는 학교가 되기 위한 전략은?'] },
    ],

    // 분임장이 작성하는 토의 결과 항목
    FIELDS: [
      { key: 'achieve', label: '좋았던 점', sub: '올해의 성과 · 잘된 점' },
      { key: 'issue', label: '개선할 점', sub: '아쉬운 점 · 보완이 필요한 점' },
      { key: 'propose', label: '2027학년도 실천 제안', sub: '차년도 실천 방안' },
    ],

    // 설문 결과 (2026 자공2.0 자체평가 보고서, 교육주체 설문 10.26.~10.30.)
    SURVEY: {
      period: '2026. 10. 26. ~ 10. 30.',
      respondents: [
        { who: '학생', n: 309 },
        { who: '학부모', n: 105 },
        { who: '교원', n: 35 },
      ],
      // 학생: 역량 성장에 도움이 되었다는 긍정 응답 비율
      growth: [
        { label: 'AI·디지털 활용 능력', pct: 84.5 },
        { label: '자기주도 학습·탐구 역량', pct: 77.0 },
        { label: '문제 해결 능력', pct: 76.4 },
        { label: '협력·의견 나누기 역량', pct: 75.1 },
      ],
      // 교원 긍정 응답
      teacher: [
        { label: '디지털 수업이 학생의 수업 참여 유도에 도움', pct: 88.6, note: '35명 중 31명' },
        { label: '지역 연계 활동이 학생의 진로·지역 이해에 도움', pct: 85.7 },
      ],
      // 학생 서술형: 기억에 남는 활동
      memorable: [
        { label: '탐구 및 과제연구', n: 47 },
        { label: '다산캠프', n: 39 },
      ],
      // 개선 요구
      needs: {
        student: [
          { label: '흥미·진로를 고려한 프로그램 다양화', v: '96명' },
          { label: '학생 의견 반영·기획 참여', v: '61명' },
        ],
        teacher: [
          { label: '학생 참여 동기 제고', v: '57.1%' },
          { label: '업무 부담 분담', v: '42.9%' },
        ],
      },
    },
  };

  // 퀴즈 선택지와 정답 (정답 번호는 1부터)
  CFG.QUIZ = {
    growth: {
      title: '학생들이 가장 많이 "성장했다"고 답한 역량은?',
      options: CFG.SURVEY.growth.map((g) => g.label),
      answer: 1,
    },
    memorable: {
      title: '학생들이 꼽은 "기억에 남는 활동" 1위는?',
      options: ['탐구 및 과제연구', '다산캠프', '대학연계 현장체험학습', '진로진학아카데미'],
      answer: 1,
    },
  };

  const topics = CFG.GROUPS.map((g) => g.topic);

  // 슬라이드 순서와 인터랙션 (번호는 1부터, 이 순서대로 화면이 만들어짐)
  CFG.PLAN = [
    { key: 'cover' },
    { key: 'join' },
    { key: 'agenda' },
    { key: 'ice', interact: { type: 'words', max: 3, title: '올 한 해 우리 학교를 한 단어로 표현한다면?' } },
    { key: 'sec', n: 1 },
    { key: 'svResp' },
    { key: 'quiz', q: 'growth', interact: { type: 'choice', quiz: 'growth', title: CFG.QUIZ.growth.title, options: CFG.QUIZ.growth.options } },
    { key: 'svGrowth' },
    { key: 'quiz', q: 'memorable', interact: { type: 'choice', quiz: 'memorable', title: CFG.QUIZ.memorable.title, options: CFG.QUIZ.memorable.options } },
    { key: 'svVoice' },
    { key: 'svNeeds' },
    { key: 'sec', n: 2 },
    { key: 'groups' },
    { key: 'guide' },
    { key: 'timer', discuss: true },
    { key: 'sec', n: 3 },
    { key: 'shareAll' },
    ...CFG.GROUPS.map((g, i) => ({ key: 'report', g: i + 1, interact: { type: 'like', g: i + 1, title: `${i + 1}분임 · ${g.topic}` } })),
    { key: 'sec', n: 4 },
    { key: 'opinion', interact: { type: 'text', max: 3, len: 150, title: '2027학년도 교육활동에 바라는 점' } },
    { key: 'pledge', interact: { type: 'words', max: 2, title: '함께할 도약을 위한 나의 한 단어' } },
    { key: 'end' },
  ];

  CFG.SECTIONS = ['설문결과 소개', '분임별 주제토의', '토의결과 공유', '차년도 교육활동 의견수렴'];

  if (typeof module !== 'undefined' && module.exports) module.exports = CFG;
  else root.CFG = CFG;
})(this);
