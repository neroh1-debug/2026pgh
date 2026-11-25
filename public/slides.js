// 슬라이드 정의 (1440×810 캔버스 기준 좌표). 순서는 config.js의 PLAN을 따름.
// 애니메이션: class="a up|left|right|zoom|pop|fade|wipe|wipe-d", style="--d:지연(s)"
(function () {
  const C = window.CFG;
  const E = C.EVENT;
  const S = C.SURVEY;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const SECN = (n) => `0${n}`;

  const H = (sec) => `<div class="hdr">${sec ? `${SECN(sec)} ${C.SECTIONS[sec - 1]}` : E.title}</div><div class="bar"></div>`;
  const T = (text, top = 162, d = 0.1) => `<h2 class="ttl a left" style="top:${top}px;--d:${d}s">${text}</h2>`;
  const TOTAL = (n) => `<div class="resp-total a fade" style="--d:.6s"><span data-total="${n}">0</span>명 참여</div>`;
  const QUIZ = () => `<div class="quiz-badge a down" style="--d:0s">QUIZ</div>`;
  const BARROWS = (n, options, top, rowH, startD = 0.5) => `
    <div class="choice-list" data-choice="${n}" style="top:${top}px">
      ${options.map((o, i) => `<div class="choice-row a left" style="height:${rowH}px;--d:${startD + i * 0.08}s" data-i="${i}">
        <span class="lab"><b class="no">${i + 1}</b>${esc(o)}</span><div class="choice-track"><div class="choice-fill"></div></div><div class="choice-num">0</div></div>`).join('')}
    </div>`;
  const CLOUD = (n, q, hint) => `
    <p class="big abs a up" style="left:0;right:0;top:176px;font-size:52px;color:#111;--d:.2s">${q}</p>
    <div class="cloud" data-cloud="${n}"></div>
    <div class="cloud-empty a fade" style="--d:.8s" data-empty="${n}">${hint}<span class="dots"><span>.</span><span>.</span><span>.</span></span></div>
    ${TOTAL(n)}`;
  const grp = (g) => C.GROUPS[g - 1];

  const builders = {
    cover: () => `
      <svg class="abs" width="1440" height="810" viewBox="0 0 1440 810" style="left:0;top:0">
        <line x1="1193" y1="0" x2="1193" y2="810" stroke="#ececec" stroke-width="2"/>
        <line x1="0" y1="563" x2="1440" y2="563" stroke="#ececec" stroke-width="2"/>
        <path d="M1193,810 A247,247 0 0 1 1440,563" fill="none" stroke="#e4e4e4" stroke-width="2"/>
        <path class="draw" style="--len:700;--d:.2s" d="M1219,-10 V330 A205,205 0 0 0 1424,535 H1460" fill="none" stroke="#eeeeee" stroke-width="52"/>
        <path class="draw" style="--len:1360;--d:.1s;--t:1.6s" d="M-10,588 H967 A200,200 0 0 1 1167,788 V830" fill="none" stroke="#224b99" stroke-width="50"/>
      </svg>
      <p class="abs a up" style="left:58px;top:236px;margin:0;font-size:36px;font-weight:600;--d:.5s">${E.year} ${E.title}</p>
      <h1 class="abs a up" style="left:50px;top:300px;margin:0;font-size:104px;font-weight:800;letter-spacing:-0.04em;line-height:1.2;--d:.75s">
        <span style="color:var(--navy)">${E.theme1}</span> <span style="color:var(--teal)">${E.theme2}</span></h1>
      <p class="abs a fade" style="left:62px;top:448px;margin:0;font-size:26px;font-weight:600;color:#7a8599;--d:1.2s">설문결과 소개 · 분임별 주제토의 · 토의결과 공유 · 차년도 의견수렴</p>
      <p class="abs a fade" style="left:92px;top:676px;margin:0;font-size:31px;font-weight:600;--d:1.4s">${E.school}</p>`,

    join: () => `${H(0)}${T('휴대폰으로 함께 참여하기')}
      <div class="join-steps">
        ${[['QR 코드 스캔', '휴대폰 카메라로 오른쪽 QR 코드 스캔'], ['이름 입력', '이름 입력 시 분임 자동 배정'], ['함께 보기 · 참여하기', '휴대폰에서 발표 화면 실시간 확인<br>응답 및 분임 토의 기록 참여']]
          .map(([a, b], i) => `<div class="jstep a left" style="--d:${0.4 + i * 0.25}s"><b>${i + 1}</b><div><h4>${a}</h4><p>${b}</p></div></div>`).join('')}
      </div>
      <div class="join-qr a zoom" style="--d:.5s"><img src="/qr.svg" alt="참여 QR"><div class="u" data-joinurl></div></div>
      <div class="join-live a up" style="--d:1.2s"><span class="dot"></span><b data-joined>0</b>명 입장
        <span class="jl-groups" data-jgroups></span></div>`,

    agenda: () => `
      <svg class="abs" width="1440" height="810" viewBox="0 0 1440 810" style="left:0;top:0">
        <line x1="420" y1="0" x2="420" y2="810" stroke="#ececec" stroke-width="2"/>
        <path d="M420,822 A200,200 0 0 1 620,622 H1440" fill="none" stroke="#e4e4e4" stroke-width="2"/>
        <path class="draw" style="--len:950;--d:.1s" d="M395,-10 V397 A200,200 0 0 1 195,597 H-10" fill="none" stroke="#224b99" stroke-width="50"/>
      </svg>
      <h2 class="abs a zoom" style="left:70px;top:88px;margin:0;font-size:80px;font-weight:800;color:var(--navy);line-height:1.15;--d:.4s">진행<br>순서</h2>
      ${[['설문결과 소개', '교육주체 설문으로 돌아본 2026학년도'], ['분임별 주제토의', '8개 분임 · 영역별 성과와 과제, 실천 제안'], ['토의결과 공유', '분임장 발표 · 공감 나누기'], ['차년도 교육활동 의견수렴', '2027학년도를 함께 그리기']]
        .map(([t, s], i) => `<div class="ag-row a right" style="top:${96 + i * 128}px;--d:${0.5 + i * 0.15}s"><b>0${i + 1}</b><div><div class="t">${t}</div><div class="s">${s}</div></div></div>`).join('')}`,

    ice: (n) => `${H(0)}${CLOUD(n, '올 한 해 우리 학교를 <span class="hl">한 단어</span>로 표현한다면?', '휴대폰으로 떠오르는 단어를 보내 주십시오')}`,

    sec: (n, p) => `
      <svg class="abs" width="1440" height="810" viewBox="0 0 1440 810" style="left:0;top:0">
        <path class="draw" style="--len:1500;--d:.1s;--t:1.4s" d="M-10,520 H1040 A180,180 0 0 0 1220,340 V-10" fill="none" stroke="#224b99" stroke-width="44"/>
        <path class="draw" style="--len:700;--d:.4s" d="M1460,640 H1300 A120,120 0 0 0 1180,760 V830" fill="none" stroke="#eeeeee" stroke-width="40"/>
      </svg>
      <div class="sec-no a zoom" style="--d:.3s">${SECN(p.n)}</div>
      <h2 class="abs a up" style="left:100px;top:340px;margin:0;font-size:84px;font-weight:800;color:var(--navy);letter-spacing:-0.035em;--d:.55s">${C.SECTIONS[p.n - 1]}</h2>
      <p class="abs a fade" style="left:104px;top:578px;margin:0;font-size:30px;font-weight:600;color:#6b7487;--d:1s">${['교육주체 설문으로 돌아본 우리 학교의 한 해', '지나온 성장을 돌아보고, 함께할 도약을 설계합니다', '분임별 토의 결과 공유', '2027학년도 교육활동에 대한 선생님들의 의견 수렴'][p.n - 1]}</p>`,

    svResp: () => `${H(1)}${T('교육주체 설문 개요')}
      <p class="abs a fade" style="left:70px;top:244px;margin:0;font-size:26px;font-weight:600;color:#6b7487;--d:.3s">연구학교 자체평가를 위한 교육주체 설문 · ${S.period}</p>
      <div class="stat-row">
        ${S.respondents.map((r, i) => `<div class="stat a up" style="--d:${0.5 + i * 0.2}s"><div class="k">${r.who}</div><div class="v"><span class="cnt" data-to="${r.n}" data-d="${0.6 + i * 0.2}">0</span><small>명</small></div></div>`).join('')}
      </div>
      <p class="big abs a up" style="left:0;right:0;top:640px;font-size:42px;--d:1.5s">총 <span class="cnt hl" data-to="${S.respondents.reduce((a, r) => a + r.n, 0)}" data-d="1.6">0</span>명의 목소리를 모았습니다</p>`,

    quiz: (n, p) => {
      const q = C.QUIZ[p.q];
      return `${H(1)}${QUIZ()}
        <p class="abs a up quiz-q" style="--d:.25s">${esc(q.title)}</p>
        ${BARROWS(n, q.options, 330, 84, 0.5)}${TOTAL(n)}`;
    },

    svGrowth: () => {
      const max = 100;
      return `${H(1)}${T('학생이 느낀 역량 성장')}
        <p class="abs a fade" style="left:70px;top:244px;margin:0;font-size:24px;font-weight:600;color:#6b7487;--d:.3s">“도움이 되었다” 긍정 응답 비율 · 학생 ${S.respondents[0].n}명</p>
        <div class="hbars">
          ${S.growth.map((g, i) => `<div class="hb${i === 0 ? ' top' : ''}"><div class="l">${esc(g.label)}</div>
            <div class="tr"><div class="f" style="width:${(g.pct / max) * 100}%;--d:${0.5 + i * 0.15}s"></div></div>
            <div class="v a fade" style="--d:${1.1 + i * 0.15}s">${g.pct.toFixed(1)}<small>%</small></div></div>`).join('')}
        </div>
        <div class="tcards">
          <div class="tc-h a fade" style="--d:.6s">교원 ${S.respondents[2].n}명 응답</div>
          ${S.teacher.map((t, i) => `<div class="tc a right" style="--d:${0.8 + i * 0.25}s"><div class="v">${t.pct.toFixed(1)}<small>%</small></div><div class="l">${esc(t.label)}</div></div>`).join('')}
        </div>`;
    },

    svVoice: () => {
      const m = S.memorable;
      const max = Math.max(...m.map((x) => x.n));
      return `${H(1)}${T('학생의 목소리 · 기억에 남는 활동')}
        <div class="vbars">
          ${m.map((x, i) => `<div class="vb"><div class="num a pop" style="--d:${1 + i * 0.2}s">${x.n}<small>명</small></div>
            <div class="col" style="height:${(x.n / max) * 300}px;--d:${0.4 + i * 0.2}s;background:${i ? 'var(--teal)' : 'var(--navy)'}"></div>
            <div class="lb">${i + 1}위 · ${esc(x.label)}</div></div>`).join('')}
        </div>
        <div class="quotes">
          <div class="qt a right" style="--d:.9s">주제와 모둠을 스스로 정하고<br><b>오랜 기간 협력한 경험</b>이 의미 있었다</div>
          <div class="qt a right" style="--d:1.2s">부스를 직접 계획하고<br><b>지역 주민에게 과학 원리를 설명한 경험</b></div>
          <div class="qt a right" style="--d:1.5s"><b>진로·대학 관련 활동</b>도<br>기억에 남는 활동으로 꼽혔다</div>
          <p class="src a fade" style="--d:1.8s">학생 서술형 응답 요약</p>
        </div>`;
    },

    svNeeds: () => `${H(1)}${T('함께 풀어야 할 과제')}
      <div class="needs">
        ${[['학생', S.needs.student, 'var(--teal)'], ['교원', S.needs.teacher, 'var(--navy)']].map(([who, list, col], i) => `
          <div class="nd a up" style="--d:${0.4 + i * 0.3}s;--c:${col}"><div class="who">${who}이 바라는 것</div>
            ${list.map((x) => `<div class="it"><span>${esc(x.label)}</span><b>${x.v}</b></div>`).join('')}</div>`).join('')}
      </div>
      <div class="next a up" style="--d:1.2s"><span class="tag">2027 교육계획 반영 예정</span>
        진로 분야별 사전 수요조사와 선택 프로그램 구성 · 일정 통합·역할 분담·공통 서식으로 업무 경감</div>`,

    groups: () => `${H(2)}${T('분임 구성')}
      <p class="abs a fade" style="left:70px;top:244px;margin:0;font-size:24px;font-weight:600;color:#6b7487;--d:.3s">휴대폰의 <b style="color:var(--navy)">우리 분임</b> 탭에서 내 분임과 토의 기록 확인</p>
      <div class="ggrid">
        ${C.GROUPS.map((g, i) => `<div class="gcard a up" style="--d:${0.35 + i * 0.07}s;--c:${g.color}" data-gcard="${i + 1}">
          <div class="no">${i + 1}<small>분임</small></div><div class="tp">${esc(g.topic)}</div>
          <div class="meta"><span data-gjoin>입장 0명</span><span data-glead></span></div></div>`).join('')}
      </div>`,

    guide: () => `${H(2)}${T('토의 진행 방법')}
      <div class="flow four">
        ${[['개인 의견 입력', '분임원 각자', '좋았던 점 · 개선할 점<br>실천 제안 입력'], ['의견 함께 보며 토론', '분임원 모두', '[모두의 의견 보기]로<br>확인하며 말로 토론'], ['최종 의견 정리', '분임장', '토론 내용을 요약하여<br>분임 최종 의견 작성'], ['실시간 공유', '전체', '전체 화면 공유<br>공감 ♥ · 댓글(익명 가능)']]
          .map(([h, who, s], i) => `<div class="fl f${i + 1} a up" style="--d:${0.4 + i * 0.25}s"><div class="n">${i + 1}</div><div class="who">${who}</div><div class="h">${h}</div><div class="s">${s}</div></div>${i < 3 ? `<div class="arr a fade" style="--d:${0.55 + i * 0.25}s">→</div>` : ''}`).join('')}
      </div>
      <div class="rules">
        <div class="ru a left" style="--d:1.5s"><b>입력 위치</b><span>휴대폰 <em>우리 분임</em> 탭 · 입력 내용 자동 저장</span></div>
        <div class="ru a left" style="--d:1.7s"><b>입력 항목</b><span>${C.FIELDS.map((f) => f.label).join(' · ')}</span></div>
      </div>`,

    timer: () => `${H(2)}
      <div class="tm-wrap a zoom" style="--d:.2s">
        <div class="tm-k">분임별 주제토의</div>
        <div class="tm" data-timer>20:00</div>
        <div class="tm-bar"><div class="tm-fill" data-tfill></div></div>
        <div class="tm-end" data-tend>토의 시간 종료</div>
      </div>
      <div class="tstat">
        ${C.GROUPS.map((g, i) => `<div class="ts a up" style="--d:${0.5 + i * 0.06}s;--c:${g.color}" data-ts="${i + 1}">
          <div class="no">${i + 1}</div><div class="tx"><div class="tp">${esc(g.topic)}</div><div class="st" data-tsst>대기</div></div></div>`).join('')}
      </div>`,

    shareAll: () => `${H(3)}${T('분임별 토의 결과 한눈에 보기')}
      <div class="sgrid">
        ${C.GROUPS.map((g, i) => `<div class="scard a up" style="--d:${0.3 + i * 0.07}s;--c:${g.color}" data-scard="${i + 1}">
          <div class="hd"><span class="no">${i + 1}분임</span><span class="st" data-sst>미작성</span></div>
          <div class="tp">${esc(g.topic)}</div><div class="pv" data-spv></div></div>`).join('')}
      </div>`,

    report: (n, p) => {
      const g = grp(p.g);
      return `${H(3)}
        <div class="rp-head a left" style="--d:.1s;--c:${g.color}"><span class="no">${p.g}분임</span><span class="tp">${esc(g.topic)}</span></div>
        <div class="rp-meta a fade" style="--d:.4s"><span data-rlead></span></div>
        <div class="rp-cols" data-report="${p.g}">
          ${C.FIELDS.map((f, i) => `<div class="rp a up" style="--d:${0.35 + i * 0.2}s;--c:${g.color}"><div class="h"><b>${f.label}</b><small>${f.sub}</small></div><div class="bd" data-f="${f.key}"></div></div>`).join('')}
        </div>
        <div class="cm-strip a fade" style="--d:.9s" data-comments="${p.g}">
          <div class="lk-k"><span class="h">♥</span> 공감 <b data-total="${n}">0</b><div class="burst"></div></div>
          <div class="cm-k">💬 댓글 <b data-cn>0</b></div>
          <div class="cm-items"></div><div class="cm-empty">휴대폰에서 공감 ♥ 과 댓글을 남겨 주십시오</div>
        </div>`;
    },

    prio: (n, p) => `${H(4)}
      <p class="abs a up" style="left:70px;top:150px;margin:0;font-size:46px;font-weight:800;color:var(--navy);--d:.2s">2027학년도에 가장 힘을 모아야 할 영역은?</p>
      <p class="abs a fade" style="left:72px;top:222px;margin:0;font-size:24px;font-weight:600;color:#6b7487;--d:.4s">휴대폰에서 최대 3개까지 골라 주세요</p>
      ${BARROWS(n, p.interact.options, 276, 52, 0.4)}${TOTAL(n)}`,

    opinion: (n) => `${H(4)}
      <p class="abs a up" style="left:70px;top:150px;margin:0;font-size:46px;font-weight:800;color:var(--navy);--d:.2s">2027학년도 교육활동에 바라는 점</p>
      <p class="abs a fade" style="left:72px;top:222px;margin:0;font-size:24px;font-weight:600;color:#6b7487;--d:.4s">익명 · 자유 서술 · 1인 최대 3개</p>
      <div class="wall" data-wall="${n}"></div>
      <div class="wall-more" data-wmore></div>
      <div class="cloud-empty a fade" style="--d:.8s;top:470px" data-empty="${n}">휴대폰으로 의견을 보내 주십시오<span class="dots"><span>.</span><span>.</span><span>.</span></span></div>
      ${TOTAL(n)}`,

    pledge: (n) => `${H(4)}${CLOUD(n, '함께할 도약을 위한 <span class="hl" style="color:var(--teal)">나의 한 단어</span>', '2027학년도를 향한 다짐을 한 단어로 보내 주십시오')}`,

    end: () => `
      <svg class="abs" width="1440" height="810" viewBox="0 0 1440 810" style="left:0;top:0">
        <path class="draw" style="--len:1360;--d:.1s;--t:1.6s" d="M-10,588 H967 A200,200 0 0 1 1167,788 V830" fill="none" stroke="#224b99" stroke-width="50"/>
        <path class="draw" style="--len:700;--d:.3s" d="M1219,-10 V330 A205,205 0 0 0 1424,535 H1460" fill="none" stroke="#eeeeee" stroke-width="52"/>
      </svg>
      <p class="abs a up" style="left:96px;top:214px;margin:0;font-size:40px;font-weight:700;--d:.3s"><span style="color:var(--navy)">${E.theme1}</span> <span style="color:var(--teal)">${E.theme2}</span></p>
      <h1 class="abs a zoom" style="left:86px;top:280px;margin:0;font-size:128px;font-weight:800;color:var(--navy-d);letter-spacing:-0.04em;--d:.6s">감사합니다</h1>
      <p class="abs a fade" style="left:96px;top:458px;margin:0;font-size:28px;font-weight:600;color:#6b7487;--d:1.1s">오늘 모아 주신 의견은 2027학년도 교육계획에 반영하겠습니다</p>
      <p class="abs a fade" style="left:92px;top:676px;margin:0;font-size:31px;font-weight:600;--d:1.4s">${E.year} ${E.school}</p>`,
  };

  window.SLIDES = C.PLAN.map((p, i) => Object.assign({}, p, { html: builders[p.key](i + 1, p) }));
})();
