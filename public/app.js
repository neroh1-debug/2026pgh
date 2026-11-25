(function () {
  'use strict';
  const C = window.CFG;
  const SLIDES = window.SLIDES;
  const N = SLIDES.length;
  const NG = C.GROUPS.length;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} },
    del(k) { try { localStorage.removeItem(k); } catch (_) {} },
  };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const P = 'sef_'; // localStorage 접두어 (다른 발표와 섞이지 않도록)

  // ---------- 상태 ----------
  let token = store.get(P + 'token');
  let isPresenter = false;
  let cur = 0;
  let last = null;
  let reports = {};
  let notes = {};     // 우리 분임 선생님들의 개인 의견 { [g]: { [name]: {...} } }
  let comments = {};  // 분임 결과 댓글 { [g]: [{ id, t, name, ts }] }
  let questions = [];
  let qFilter = 'open';
  let es = null;
  let offset = 0; // 서버 시각 - 내 시각
  let tab = 'screen';
  let cid = store.get(P + 'cid');
  if (!cid) { cid = Math.random().toString(36).slice(2) + Date.now().toString(36); store.set(P + 'cid', cid); }
  let me = null;
  try { me = JSON.parse(store.get(P + 'me') || 'null'); } catch (_) { me = null; }
  let mine = {};
  try { mine = JSON.parse(store.get(P + 'mine') || '{}'); } catch (_) { mine = {}; }
  const saveMine = () => store.set(P + 'mine', JSON.stringify(mine));
  const saveMe = () => (me ? store.set(P + 'me', JSON.stringify(me)) : store.del(P + 'me'));
  const slideNo = (pred) => SLIDES.findIndex(pred) + 1;
  const TIMER_SLIDE = slideNo((s) => s.key === 'timer');
  const groupColor = (g) => (C.GROUPS[g - 1] || {}).color || '#224b99';

  // ---------- 무대 구성 ----------
  const stage = $('#stage');
  const deck = $('#deck');
  deck.innerHTML = SLIDES.map((s, i) => `<section class="slide" data-n="${i + 1}" data-key="${s.key}">${s.html}</section>`).join('');
  const slideEl = (n) => deck.children[n - 1];
  deck.appendChild($('#spot'));

  function fit() {
    if (isPresenter) {
      const W = window.innerWidth, Hh = window.innerHeight;
      const s = Math.min(W / 1440, Hh / 810);
      stage.style.width = 1440 * s + 'px';
      stage.style.height = 810 * s + 'px';
      stage.style.left = (W - 1440 * s) / 2 + 'px';
      stage.style.top = (Hh - 810 * s) / 2 + 'px';
      deck.style.transform = `scale(${s})`;
    } else {
      const w = Math.max(100, ($('#aud').clientWidth || window.innerWidth) - 32);
      const s = w / 1440;
      stage.style.width = w + 'px';
      stage.style.height = 810 * s + 'px';
      stage.style.left = stage.style.top = '';
      deck.style.transform = `scale(${s})`;
    }
  }
  window.addEventListener('resize', fit);

  function show(n, animate = true) {
    n = Math.max(1, Math.min(N, n));
    if (n === cur) return;
    const prev = cur && slideEl(cur);
    if (prev) prev.classList.remove('active', 'play');
    const prevKey = cur && SLIDES[cur - 1].key;
    cur = n;
    const el = slideEl(n);
    el.classList.add('active');
    if (animate) replay(); else el.classList.add('play');
    $('#pg').textContent = `${n} / ${N}`;
    $('#audPg').textContent = `${n} / ${N}`;
    $('#resetBtn').classList.toggle('invisible', !SLIDES[n - 1].interact);
    $('#tCtl').classList.toggle('hidden', n !== TIMER_SLIDE);
    updateAnsBtn();
    renderReports();
    if (!isPresenter) {
      renderPanel();
      // 토의 시간 화면이 되면 휴대폰은 '우리 분임' 탭으로
      if (n === TIMER_SLIDE && prevKey !== 'timer' && me) setTab('group');
      updateTabDot();
    }
  }
  function replay() {
    const el = slideEl(cur);
    el.classList.remove('play');
    void el.offsetWidth;
    el.classList.add('play');
    countUps(el);
    requestAnimationFrame(() => fitReport(el));
  }
  function countUps(el) {
    $$('.cnt[data-to]', el).forEach((c) => {
      const to = Number(c.dataset.to), delay = Number(c.dataset.d || 0) * 1000, dur = 1200;
      c.textContent = '0';
      const t0 = performance.now() + delay;
      const step = (t) => {
        if (!el.classList.contains('play')) return;
        const k = Math.min(1, Math.max(0, (t - t0) / dur));
        c.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))).toLocaleString();
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  // ---------- 실시간 결과 ----------
  const PALETTE = ['#224b99', '#138380', '#0e6ca5', '#6a54b8', '#d9822b', '#3462b4', '#b8433c', '#2b8a3e'];
  const hash = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };

  function renderResults(results) {
    for (const [n, r] of Object.entries(results)) {
      const el = slideEl(Number(n));
      $$(`[data-total="${n}"]`, el).forEach((t) => {
        const prev = t.dataset.v === undefined ? null : Number(t.dataset.v);
        if (prev !== r.total) {
          t.textContent = r.total;
          t.dataset.v = r.total;
          const like = t.closest('.lk-k');
          // 처음 화면에 들어올 때는 조용히, 그 뒤로 공감이 늘면 하트 폭죽
          if (like && prev !== null && r.total > prev) heartBurst(like, Math.min(3, r.total - prev));
        }
      });
      if (r.type === 'choice' || r.type === 'multi') renderBars(el, r);
      else if (r.type === 'words') renderCloud(el, n, r);
      else if (r.type === 'text') renderWall(el, n, r);
    }
  }
  // 공감 하트 폭죽
  const HEARTS = ['#e2463f', '#ff6b81', '#ff8fa3', '#f0506e', '#ffb3c1', '#d63384'];
  function heartBurst(box, times = 1) {
    box.classList.remove('bump'); void box.offsetWidth; box.classList.add('bump');
    const layer = $('.burst', box);
    if (!layer || !box.closest('.slide').classList.contains('active')) return;
    for (let k = 0; k < times; k++) {
      setTimeout(() => {
        for (let i = 0; i < 22; i++) {
          const h = document.createElement('span');
          h.className = 'ht';
          h.textContent = '♥';
          const ang = (-90 + (Math.random() - 0.5) * 150) * Math.PI / 180;
          const dist = 160 + Math.random() * 320;
          h.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
          h.style.setProperty('--dy', Math.sin(ang) * dist + 'px');
          h.style.setProperty('--r', (Math.random() - 0.5) * 120 + 'deg');
          h.style.setProperty('--s', (0.7 + Math.random() * 1.3).toFixed(2));
          h.style.color = HEARTS[i % HEARTS.length];
          h.style.animationDelay = Math.random() * 0.12 + 's';
          layer.appendChild(h);
          setTimeout(() => h.remove(), 1700);
        }
        const big = document.createElement('span');
        big.className = 'ht-big';
        big.textContent = '♥';
        layer.appendChild(big);
        setTimeout(() => big.remove(), 1300);
      }, k * 260);
    }
  }

  function renderBars(el, r) {
    const list = $('.choice-list', el);
    const max = Math.max(1, ...r.counts);
    const order = r.counts.map((c, i) => [c, i]).filter((x) => x[0] > 0).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
    $$('.choice-row', list).forEach((row, i) => {
      const c = r.counts[i];
      $('.choice-fill', row).style.width = (c / max) * 100 + '%';
      const pct = r.total ? Math.round((c / r.total) * 100) : 0;
      $('.choice-num', row).innerHTML = `${c}<small>${pct}%</small>`;
      row.classList.remove('rank1', 'rank2', 'rank3');
      if (r.type === 'multi') { const k = order.findIndex((x) => x[1] === i); if (k >= 0 && k < 3) row.classList.add('rank' + (k + 1)); }
      row.classList.toggle('answer', r.answer === i + 1);
    });
    list.classList.toggle('revealed', r.answer != null);
  }
  function renderCloud(el, n, r) {
    const cloud = $('.cloud', el);
    $(`[data-empty="${n}"]`, el).classList.toggle('hidden', r.words.length > 0);
    const words = r.words.slice(0, 60).sort((a, b) => a.first - b.first);
    const max = Math.max(1, ...words.map((w) => w.count));
    const base = words.length < 10 ? 46 : words.length < 25 ? 36 : 28;
    const keep = new Set();
    for (const w of words) {
      const key = w.text.replace(/\s+/g, '').toLowerCase();
      keep.add(key);
      let node = cloud.querySelector(`[data-k="${CSS.escape(key)}"]`);
      if (!node) {
        node = document.createElement('span');
        node.className = 'w';
        node.dataset.k = key;
        node.style.color = PALETTE[hash(key) % PALETTE.length];
        cloud.appendChild(node);
      }
      node.textContent = w.text;
      if (w.count > 1) { const s = document.createElement('sup'); s.textContent = w.count; node.appendChild(s); }
      node.style.fontSize = Math.round(base + ((w.count - 1) / Math.max(1, max - 1)) * base * 1.25) + 'px';
    }
    $$('.w', cloud).forEach((nd) => { if (!keep.has(nd.dataset.k)) nd.remove(); });
  }
  function renderWall(el, n, r) {
    const wall = $('.wall', el);
    $(`[data-empty="${n}"]`, el).classList.toggle('hidden', r.list.length > 0);
    const keep = new Set(r.list.map((o) => o.id));
    $$('.op', wall).forEach((nd) => { if (!keep.has(nd.dataset.id)) nd.remove(); });
    r.list.forEach((o, i) => {
      let node = wall.querySelector(`[data-id="${o.id}"]`);
      if (!node) {
        node = document.createElement('div');
        node.className = 'op';
        node.dataset.id = o.id;
        node.style.setProperty('--c', PALETTE[hash(o.id) % PALETTE.length]);
        node.textContent = o.t;
        const x = document.createElement('button'); x.className = 'x'; x.textContent = '✕'; x.title = '화면에서 숨기기';
        node.appendChild(x);
        node.onclick = (e) => {
          if (!isPresenter) return;
          if (e.target === x) { if (confirm('이 의견을 화면에서 숨기시겠습니까?')) api('ohide', { id: o.id }); return; }
          const sid = 'o:' + o.id;
          api('spotlight', { id: last && last.spotlight && last.spotlight.id === sid ? null : sid });
        };
        wall.appendChild(node);
      }
      node.style.order = i;
      node.style.display = '';
    });
    // 넘치는 오래된 의견은 숨기고 개수만 표시
    let hidden = 0;
    if (el.classList.contains('active')) {
      const nodes = $$('.op', wall).sort((a, b) => Number(b.style.order) - Number(a.style.order));
      for (const nd of nodes) {
        if (wall.scrollHeight <= wall.clientHeight + 2) break;
        nd.style.display = 'none'; hidden++;
      }
    }
    $('[data-wmore]', el).textContent = hidden ? `+ 의견 ${hidden}개 더 있음` : '';
  }

  // 분임 현황 (참여 안내 · 분임 구성 · 타이머 · 결과 공유)
  function statusOf(g, gi) {
    const rep = reports[g];
    if (rep && rep.status === 'done') return ['done', '제출 완료'];
    if (rep && CFG_FIELDS_FILLED(rep)) return ['draft', '작성 중'];
    if (gi && gi.notes) return ['', `의견 ${gi.notes}명 입력`];
    if (gi && gi.leader) return ['', `분임장 ${gi.leader}`];
    return ['', gi && gi.joined.length ? '토의 중' : '대기'];
  }
  const CFG_FIELDS_FILLED = (rep) => C.FIELDS.some((f) => (rep[f.key] || '').trim());

  function renderGroups() {
    if (!last) return;
    const gs = last.groups;
    $$('[data-joined]').forEach((e) => (e.textContent = last.joined));
    $$('[data-jgroups]').forEach((box) => {
      box.innerHTML = gs.map((g) => `<span class="${g.joined.length ? 'on' : ''}" style="--c:${groupColor(g.g)}">${g.g}분임 ${g.joined.length}</span>`).join('');
    });
    gs.forEach((gi) => {
      const g = gi.g;
      const card = $(`[data-gcard="${g}"]`);
      if (card) {
        $('[data-gjoin]', card).textContent = `입장 ${gi.joined.length}${gi.roster ? ' / ' + gi.roster : ''}명`;
        $('[data-glead]', card).textContent = gi.leader ? `분임장 ${gi.leader}` : '';
      }
      const [cls, txt] = statusOf(g, gi);
      const ts = $(`[data-ts="${g}"] [data-tsst]`);
      if (ts) { ts.className = 'st ' + cls; ts.textContent = txt; }
      const sc = $(`[data-scard="${g}"]`);
      if (sc) {
        const st = $('[data-sst]', sc);
        st.className = 'st ' + cls; st.textContent = cls ? txt : '미작성';
        const rep = reports[g] || {};
        $('[data-spv]', sc).textContent = rep.propose || rep.achieve || rep.issue || '';
      }
    });
  }

  function renderReports() {
    $$('[data-report]').forEach((box) => {
      const g = Number(box.dataset.report);
      const rep = reports[g] || {};
      C.FIELDS.forEach((f) => {
        const bd = $(`[data-f="${f.key}"]`, box);
        const v = (rep[f.key] || '').trim();
        bd.textContent = v || '작성 전';
        bd.classList.toggle('empty', !v);
      });
      const slide = box.closest('.slide');
      const gi = last && last.groups[g - 1];
      const lead = rep.by || (gi && gi.leader);
      const [cls, txt] = statusOf(g, gi);
      $('[data-rlead]', slide).innerHTML = (lead ? `분임장 ${esc(lead)}　` : '') + (cls ? `<span class="st ${cls}">${txt}</span>` : '');
      if (slide.classList.contains('active')) fitReport(slide);
    });
    renderGroups();
    if (!isPresenter) { updateGroupTab(); updateReportPanel(); }
  }
  function fitReport(slide) {
    $$('.rp .bd', slide).forEach((bd) => {
      let fs = 27;
      bd.style.fontSize = fs + 'px';
      while (bd.scrollHeight > bd.clientHeight + 1 && fs > 15) { fs -= 1; bd.style.fontSize = fs + 'px'; }
    });
  }

  // ---------- 타이머 ----------
  const fmt = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
  function timerLeft() {
    const t = last && last.timer;
    if (!t) return null;
    return t.end ? t.end - (Date.now() + offset) : t.left;
  }
  function tick() {
    const t = last && last.timer;
    if (!t) return;
    const left = timerLeft();
    const running = !!t.end;
    const over = left <= 0;
    const tm = $('[data-timer]');
    if (tm) {
      tm.textContent = fmt(left);
      tm.classList.toggle('warn', !over && left < 60000);
      tm.classList.toggle('over', over);
      $('[data-tfill]').style.width = Math.max(0, Math.min(1, left / t.dur)) * 100 + '%';
      $('[data-tend]').classList.toggle('on', over);
    }
    const chip = $('#tChip');
    const active = running || (left < t.dur && left > 0) || over;
    chip.classList.toggle('hidden', !active || isPresenter);
    chip.classList.toggle('over', over);
    chip.textContent = over ? '⏱ 시간 종료' : `⏱ ${fmt(left)}${running ? '' : ' 멈춤'}`;
    const tg = $('#tToggle');
    tg.textContent = running ? '⏸ 일시정지' : '▶ 시작';
    $$('#tCtl [data-min]').forEach((b) => b.classList.toggle('on', Number(b.dataset.min) * 60000 === t.dur));
  }
  setInterval(tick, 250);

  // 질문/의견 스포트라이트
  function renderSpot(sp) {
    const root = $('#spot');
    if (!sp) { root.innerHTML = ''; root.dataset.id = ''; return; }
    if (root.dataset.id === sp.id) return;
    root.dataset.id = sp.id;
    root.innerHTML = '<div class="spot"><div class="spot-card"><div class="k"></div><div class="tx"></div><div class="nm"></div></div></div>';
    $('.k', root).textContent = sp.kind === 'opinion' ? '💬 선생님 의견' : 'Q. 참여자 질문';
    $('.tx', root).textContent = sp.text;
    $('.nm', root).textContent = sp.kind === 'opinion' ? '' : sp.name ? `— ${sp.name}` : '— 익명';
    if (isPresenter) $('.spot', root).addEventListener('click', () => api('spotlight', { id: null }));
  }

  // ---------- 서버 통신 ----------
  async function api(action, body = {}, quiet) {
    if (isPresenter) body.token = token;
    body.clientId = cid;
    try {
      const res = await fetch('/api/' + action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401 && isPresenter) { openPin(); throw new Error('발표자 인증이 만료되었습니다. 핀코드를 다시 입력해 주십시오.'); }
      if (!res.ok) throw new Error(data.error || '요청 실패');
      return data;
    } catch (e) {
      if (!quiet) toast(e.message === 'Failed to fetch' ? '서버에 연결할 수 없습니다.' : e.message);
      throw e;
    }
  }

  function connect() {
    if (es) es.close();
    const qs = new URLSearchParams({ cid });
    if (isPresenter) qs.set('token', token);
    es = new EventSource('/events?' + qs);
    const conn = $('#conn');
    es.onopen = () => { conn.textContent = '연결됨'; conn.classList.remove('off'); };
    es.onerror = () => { conn.textContent = '재연결 중'; conn.classList.add('off'); };
    es.addEventListener('state', (e) => {
      const s = JSON.parse(e.data);
      offset = s.timer.now - Date.now();
      for (const [n, r] of Object.entries(s.results)) if (r.total === 0 && mine[n] !== undefined) { delete mine[n]; saveMine(); }
      const slideChanged = !last || last.slide !== s.slide;
      const ansKey = (x) => JSON.stringify(x && x.results[x.slide] && x.results[x.slide].answer);
      const answerChanged = !slideChanged && ansKey(last) !== ansKey(s);
      last = s;
      if (s.slide !== cur) show(s.slide);
      renderResults(s.results);
      renderGroups();
      renderReports();
      renderSpot(s.spotlight);
      updateAnsBtn();
      tick();
      if (isPresenter) {
        $('#ppl').textContent = `접속 ${s.clients} · 입장 ${s.joined}명`;
        if ($('#admin').classList.contains('open')) renderAdminGroups();
      } else if (answerChanged) renderPanel();
    });
    es.addEventListener('reports', (e) => {
      const d = JSON.parse(e.data);
      reports = Object.assign({}, reports, d.reports);
      comments = Object.assign({}, comments, d.comments);
      notes = Object.assign({}, notes, d.notes);
      renderReports();
      renderComments();
    });
    es.addEventListener('questions', (e) => {
      const prevOpen = questions.filter((q) => !q.done).length;
      questions = JSON.parse(e.data).questions;
      const open = questions.filter((q) => !q.done).length;
      const b = $('#qBadge');
      b.textContent = open;
      b.classList.toggle('zero', open === 0);
      if (open > prevOpen) { const q = $('#qBtn'); q.classList.remove('ring'); void q.offsetWidth; q.classList.add('ring'); }
      renderQuestions();
    });
  }

  // ================= 참여자 =================
  // ---------- 입장 ----------
  function showJoin(step = 'name', data = {}) {
    $('#join').classList.remove('hidden');
    $('#aud').classList.add('hidden');
    $('#jYear').textContent = `${C.EVENT.year} ${C.EVENT.school}`;
    $('#jTitle').textContent = C.EVENT.title;
    const card = $('#jCard');
    card.style.animation = 'none'; void card.offsetWidth; card.style.animation = '';
    const gbtn = (g, note) => `<button data-g="${g}" style="--c:${groupColor(g)}"><b>${g}분임${note ? ' · ' + esc(note) : ''}</b>${esc(C.GROUPS[g - 1].topic)}</button>`;
    if (step === 'name') {
      card.innerHTML = `<h3>이름 입력</h3><p>명단에 따라 분임이 자동으로 배정됩니다.</p>
        <form class="row"><input type="text" maxlength="20" placeholder="예: 홍길동" autocomplete="name" enterkeyhint="go" required><button>입장</button></form>`;
      const inp = $('input', card);
      inp.value = data.name || (me && me.name) || '';
      setTimeout(() => inp.focus(), 50);
      $('form', card).onsubmit = async (e) => {
        e.preventDefault();
        const name = inp.value.trim();
        if (!name) return;
        $('button', card).disabled = true;
        try { handleJoin(name, await api('join', { name })); } catch (_) { $('button', card).disabled = false; }
      };
    } else if (step === 'pick') {
      const { name, candidates, rosterSize } = data;
      const head = candidates
        ? `<h3>동명이인 확인</h3><p>${esc(name)} 선생님의 분임을 선택해 주십시오.</p>`
        : rosterSize
          ? `<h3>명단에 없는 이름</h3><p>‘${esc(name)}’ 이름을 다시 확인하거나, 배정받은 분임을 직접 선택해 주십시오.</p>`
          : `<h3>분임 선택</h3><p>${esc(name)} 선생님이 참여할 분임을 선택해 주십시오.</p>`;
      const list = candidates ? candidates.map((c) => gbtn(c.group, c.note)) : C.GROUPS.map((_, i) => gbtn(i + 1));
      card.innerHTML = `${head}<div class="gpick">${list.join('')}</div><button class="linkbtn" data-back>이름 다시 입력</button>`;
      $$('[data-g]', card).forEach((b) => (b.onclick = async () => {
        try { handleJoin(name, await api('join', { name, group: Number(b.dataset.g) })); } catch (_) {}
      }));
      $('[data-back]', card).onclick = () => showJoin('name', { name });
    } else if (step === 'ok') {
      const g = me.group;
      card.innerHTML = `<div class="ok-g" style="--c:${groupColor(g)}"><span class="gno">${g}분임</span>
        <div class="gtp">${esc(C.GROUPS[g - 1].topic)}</div><div class="gnm">${esc(me.name)} 선생님, 환영합니다.</div>
        <button class="btn full">입장하기</button><button class="linkbtn" data-back>분임이 다른 경우</button></div>`;
      $('.btn', card).onclick = () => enterAudience();
      $('[data-back]', card).onclick = () => showJoin('pick', { name: me.name, rosterSize: 0 });
    }
  }
  function handleJoin(name, d) {
    if (d.ok) {
      me = { name: d.name, group: d.group };
      saveMe();
      // 이름 확인 후 확인 화면 없이 발표자가 띄운 화면으로 바로 입장
      tab = 'screen';
      enterAudience();
      toast(`${me.name} 선생님 · ${me.group}분임(${C.GROUPS[me.group - 1].topic}) 배정`);
    } else if (d.candidates) showJoin('pick', { name, candidates: d.candidates });
    else showJoin('pick', { name, rosterSize: d.rosterSize });
  }
  async function silentRejoin() {
    try {
      const d = await api('join', { name: me.name, group: me.group }, true);
      if (d.ok) { me = { name: d.name, group: d.group }; saveMe(); updateMeChip(); updateGroupTab(true); }
      else showJoin('pick', { name: me.name, candidates: d.candidates, rosterSize: d.rosterSize });
    } catch (_) { /* 오프라인: 저장된 정보로 계속 */ }
  }
  function updateMeChip() {
    if (!me) return;
    $('#meChip').innerHTML = `<span class="g" style="--c:${groupColor(me.group)}">${me.group}분임</span><span class="n">${esc(me.name)} 선생님</span>`;
  }

  // ---------- 탭 ----------
  function setTab(t) {
    tab = t;
    $$('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
    $('#tabScreen').classList.toggle('hidden', t !== 'screen');
    $('#tabGroup').classList.toggle('hidden', t !== 'group');
    $('#askBtn').classList.toggle('hidden', t !== 'screen');
    if (t === 'group') updateGroupTab(true);
    else fit();
    updateTabDot();
    window.scrollTo(0, 0);
  }
  function updateTabDot() {
    const k = SLIDES[cur - 1] && SLIDES[cur - 1].key;
    $('#tabDot').classList.toggle('hidden', !(tab === 'screen' && ['groups', 'guide', 'timer'].includes(k)));
  }
  $$('#tabs button').forEach((b) => (b.onclick = () => setTab(b.dataset.tab)));

  // ---------- 발표 화면 탭: 입력 패널 ----------
  function renderPanel() {
    const panel = $('#panel');
    const sl = SLIDES[cur - 1];
    if (!sl) return;
    const cfg = sl.interact;
    panel.className = 'panel';
    panel.style.animation = 'none'; void panel.offsetWidth; panel.style.animation = '';
    const n = String(cur);
    if (!cfg) {
      if (['groups', 'guide', 'timer'].includes(sl.key) && me) {
        panel.innerHTML = `<h4>분임별 주제토의</h4><p class="sub">${me.group}분임 · ${esc(C.GROUPS[me.group - 1].topic)}</p>
          <button class="btn full teal">우리 분임 탭 열기 (의견 입력) →</button>`;
        $('.btn', panel).onclick = () => setTab('group');
        return;
      }
      panel.classList.add('idle');
      panel.innerHTML = '발표 화면 실시간 공유 중<br>궁금한 점은 <b>질문하기</b>로 보내 주십시오.';
      return;
    }
    const res = last && last.results[n];
    const head = (sub) => `<h4></h4><p class="sub">${sub}</p>`;
    if (cfg.type === 'choice') {
      const answer = res && res.answer;
      panel.innerHTML = head(answer ? '정답 공개' : '하나를 선택해 주십시오. 다시 눌러 변경 가능합니다.') + cfg.options.map((o, i) =>
        `<button class="opt${mine[n] === i + 1 ? ' sel' : ''}${answer === i + 1 ? ' ans' : ''}"><span class="n">${i + 1}</span><span>${esc(o)}</span></button>`).join('') +
        (answer ? `<div class="ans-me">${mine[n] === undefined ? '' : mine[n] === answer ? '🎉 정답입니다!' : '정답은 노란색 항목입니다.'}</div>` : '');
      $$('.opt', panel).forEach((b, i) => {
        b.onclick = async () => {
          if (answer) return;
          await api('respond', { slide: cur, value: i + 1 });
          mine[n] = i + 1; saveMine();
          $$('.opt', panel).forEach((x) => x.classList.toggle('sel', x === b));
        };
      });
    } else if (cfg.type === 'multi') {
      panel.innerHTML = head(`최대 ${cfg.max}개 선택 · 다시 누르면 취소`) + cfg.options.map((o, i) =>
        `<button class="opt"><span class="n">${i + 1}</span><span>${esc(o)}</span></button>`).join('') + '<div class="hint"></div>';
      const paint = () => {
        const sel = mine[n] || [];
        $$('.opt', panel).forEach((b, i) => b.classList.toggle('sel', sel.includes(i + 1)));
        $('.hint', panel).textContent = `${sel.length} / ${cfg.max}개 선택`;
      };
      paint();
      $$('.opt', panel).forEach((b, i) => {
        b.onclick = async () => {
          let sel = (mine[n] || []).slice();
          if (sel.includes(i + 1)) sel = sel.filter((x) => x !== i + 1);
          else if (sel.length >= cfg.max) { toast(`최대 ${cfg.max}개까지 선택할 수 있습니다.`); return; }
          else sel.push(i + 1);
          await api('respond', { slide: cur, value: sel });
          mine[n] = sel; saveMine(); paint();
        };
      });
    } else if (cfg.type === 'like') {
      const g = cfg.g;
      panel.innerHTML = `<h4></h4><p class="sub">${g === (me && me.group) ? '우리 분임의 결과입니다 👏' : '공감되는 분임에 하트를 눌러 주십시오'}</p>
        <div class="rp-mobile"></div><button class="likebtn">♡ 공감</button>
        <div class="cm-box"><h5>💬 댓글 <span class="savest" data-ccount></span></h5>
          <form class="cm-form"><textarea class="ta sm" maxlength="200" placeholder="댓글 입력 (최대 200자)"></textarea>
            <div class="cm-row"><label class="chk"><input type="checkbox" checked> 익명으로 작성</label><button class="btn">등록</button></div></form>
          <div class="cm-list" data-clist></div></div>`;
      $('.cm-form', panel).onsubmit = async (e) => {
        e.preventDefault();
        const ta = $('.cm-form textarea', panel);
        const t = ta.value.trim();
        if (!t) return;
        const anon = $('.cm-form input', panel).checked;
        ta.value = ''; ta.blur();
        // 서버 응답을 기다리지 않고 내 화면에 먼저 표시
        const box = $('[data-clist]', panel);
        if (box) {
          $('.hint', box)?.remove();
          const m = document.createElement('div');
          m.className = 'cm-m';
          m.innerHTML = '<b></b>';
          $('b', m).textContent = anon ? '익명' : me ? me.name : '익명';
          m.append(t);
          box.prepend(m);
        }
        try { await api('comment', { g, text: t, anon }); } catch (_) { ta.value = t; renderComments(); return; }
        toast('댓글이 등록되었습니다.');
      };
      const btn = $('.likebtn', panel);
      const paint = () => { btn.classList.toggle('on', !!mine[n]); btn.textContent = mine[n] ? '♥ 공감 완료' : '♡ 공감'; };
      paint();
      btn.onclick = async () => {
        const v = !mine[n];
        await api('respond', { slide: cur, value: v });
        if (v) mine[n] = 1; else delete mine[n];
        saveMine(); paint();
        if (v && navigator.vibrate) navigator.vibrate(30);
      };
      updateReportPanel();
      renderComments();
    } else if (cfg.type === 'text') {
      panel.innerHTML = head(`익명 전달 · 한 번에 하나씩, 최대 ${cfg.max}개`) +
        `<form><textarea class="ta" maxlength="${cfg.len}" placeholder="바라는 점을 자유롭게 적어 주십시오"></textarea>
        <button class="btn full" style="margin-top:8px">보내기</button></form><div class="mine blocks"></div><div class="hint"></div>`;
      const renderMine = () => {
        const box = $('.mine', panel); box.innerHTML = '';
        (mine[n] || []).forEach((w) => { const s = document.createElement('span'); s.textContent = w; box.appendChild(s); });
        const left = cfg.max - (mine[n] || []).length;
        $('.hint', panel).textContent = left > 0 ? `${left}개 더 보낼 수 있습니다.` : '제출 완료. 감사합니다.';
        $('textarea', panel).disabled = $('form .btn', panel).disabled = left <= 0;
      };
      renderMine();
      $('form', panel).onsubmit = async (e) => {
        e.preventDefault();
        const ta = $('textarea', panel);
        const v = ta.value.trim();
        if (!v) return;
        await api('respond', { slide: cur, value: v });
        mine[n] = (mine[n] || []).concat(v); saveMine();
        ta.value = ''; ta.blur();
        renderMine();
        toast('의견이 전달되었습니다.');
      };
    } else {
      panel.innerHTML = head(cfg.chars ? `${cfg.chars}글자 이내(띄어쓰기 제외) · 한 번에 하나씩, 최대 ${cfg.max}개` : `짧은 단어로 입력 · 한 번에 하나씩, 최대 ${cfg.max}개`) +
        `<form class="row"><input type="text" maxlength="${cfg.chars ? cfg.chars + 3 : 20}" placeholder="${cfg.placeholder || '단어 입력'}" enterkeyhint="send" required><button>보내기</button></form><div class="mine"></div><div class="hint"></div>`;
      const renderMine = () => {
        const box = $('.mine', panel); box.innerHTML = '';
        (mine[n] || []).forEach((w) => { const s = document.createElement('span'); s.textContent = w; box.appendChild(s); });
        const left = cfg.max - (mine[n] || []).length;
        $('.hint', panel).textContent = left > 0 ? `${left}개 더 보낼 수 있습니다.` : '제출 완료. 발표 화면을 확인해 주십시오.';
        $('input', panel).disabled = $('form button', panel).disabled = left <= 0;
      };
      renderMine();
      $('form', panel).onsubmit = async (e) => {
        e.preventDefault();
        const inp = $('input', panel);
        const v = inp.value.trim();
        if (!v) return;
        if (cfg.chars && v.replace(/\s+/g, '').length > cfg.chars) { toast(`${cfg.chars}글자 이내로 입력해 주십시오.`); return; }
        await api('respond', { slide: cur, value: v });
        mine[n] = (mine[n] || []).concat(v); saveMine();
        inp.value = '';
        renderMine();
        if (!inp.disabled) inp.focus();
      };
    }
    $('h4', panel).textContent = cfg.title;
  }
  // 댓글: 발표 화면(분임 결과 슬라이드 아래) + 휴대폰 목록
  function renderComments() {
    $$('[data-comments]').forEach((strip) => {
      const g = Number(strip.dataset.comments);
      const list = (comments[g] || []).slice().reverse();
      $('[data-cn]', strip).textContent = list.length;
      const row = $('.cm-items', strip);
      const keep = new Set(list.slice(0, 3).map((c) => c.id));
      const fresh = strip.dataset.ready === '1';
      strip.dataset.ready = '1';
      $$('.cm-i', row).forEach((n) => { if (!keep.has(n.dataset.id)) n.remove(); });
      list.slice(0, 3).forEach((c, i) => {
        let n = row.querySelector(`[data-id="${c.id}"]`);
        if (!n) {
          n = document.createElement('div');
          n.className = 'cm-i' + (fresh ? ' new' : '');
          n.dataset.id = c.id;
          n.innerHTML = '<b></b><span></span><button class="x" title="화면에서 숨기기">✕</button>';
          $('b', n).textContent = c.name || '익명';
          $('span', n).textContent = c.t;
          $('.x', n).onclick = () => { if (isPresenter && confirm('이 댓글을 숨기시겠습니까?')) api('chide', { g, id: c.id }); };
          row.appendChild(n);
        }
        n.style.order = i;
      });
      $('.cm-empty', strip).classList.toggle('hidden', list.length > 0);
    });
    const box = $('#panel [data-clist]');
    const cfg = SLIDES[cur - 1] && SLIDES[cur - 1].interact;
    if (box && cfg && cfg.type === 'like') {
      const list = (comments[cfg.g] || []).slice().reverse();
      $('#panel [data-ccount]').textContent = `${list.length}개`;
      box.innerHTML = list.map((c) => `<div class="cm-m"><b>${esc(c.name || '익명')}</b>${esc(c.t)}</div>`).join('') || '<div class="hint">첫 댓글을 남겨 주십시오.</div>';
    }
  }

  // 결과 공유 슬라이드: 휴대폰에서도 읽기 쉽게 본문 표시
  function updateReportPanel() {
    const box = $('#panel .rp-mobile');
    const cfg = SLIDES[cur - 1] && SLIDES[cur - 1].interact;
    if (!box || !cfg || cfg.type !== 'like') return;
    const rep = reports[cfg.g] || {};
    box.innerHTML = C.FIELDS.map((f) => `<div class="fld"><label>${f.label}<small>${f.sub}</small></label>
      <div class="rview${(rep[f.key] || '').trim() ? '' : ' empty'}">${esc((rep[f.key] || '').trim() || '작성 전')}</div></div>`).join('');
  }

  // ---------- 우리 분임 탭 ----------
  // ① 분임원 각자 의견 입력 → ② 모두의 의견 함께 보며 토론 → ③ 분임장 최종 의견 작성·공유
  let gtabSig = '';
  let saveT = null;
  let noteT = null;
  let leaderDirty = false;
  let noteDraft = null;   // 입력 중인 내 의견 (화면을 다시 그려도 유지)
  let showAll = false;    // '모두의 의견 보기' 펼침 여부
  const hhmm = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  const filled = (n) => n && C.FIELDS.some((f) => (n[f.key] || '').trim());

  function updateGroupTab(force) {
    if (isPresenter || !me) return;
    const root = $('#tabGroup');
    const g = me.group;
    const gi = last && last.groups[g - 1];
    const leader = gi && gi.leader;
    const amLeader = leader === me.name;
    const sig = `${g}|${leader}|${amLeader}`;
    if (force || sig !== gtabSig || !root.firstChild) {
      if (!(amLeader && sig === gtabSig && root.firstChild)) buildGroupTab(root, g, leader, amLeader);
      gtabSig = sig;
    }
    // 함께하는 선생님
    const mem = $('[data-members]', root);
    if (mem && gi) {
      const names = gi.joined.slice().sort((a, b) => (a === leader ? -1 : b === leader ? 1 : a.localeCompare(b, 'ko')));
      mem.innerHTML = names.map((x) => `<span class="${x === leader ? 'lead' : ''}${x === me.name ? ' me' : ''}">${x === leader ? '★ ' : ''}${esc(x)}</span>`).join('') || '<span>입장 인원 없음</span>';
      $('[data-mcount]', root).textContent = `${names.length}명${gi.roster ? ' / ' + gi.roster + '명' : ''}`;
    }
    // 내 의견: 아직 입력 전이면 서버 값으로 채움
    const myNote = (notes[g] || {})[me.name];
    if (!noteDraft && myNote) {
      $$('[data-nk]', root).forEach((ta) => { if (document.activeElement !== ta) ta.value = myNote[ta.dataset.nk] || ''; });
    }
    // 모두의 의견
    const all = Object.entries(notes[g] || {}).filter(([, n]) => filled(n));
    const cnt = $('[data-ncount]', root);
    if (cnt) cnt.textContent = `${all.length}명 작성`;
    const box = $('[data-allnotes]', root);
    if (box) {
      box.classList.toggle('hidden', !showAll);
      $('[data-toggleall]', root).textContent = showAll ? '모두의 의견 접기' : `모두의 의견 보기 (${all.length}명)`;
      if (showAll) {
        box.innerHTML = all.length ? C.FIELDS.map((f) => {
          const items = all.filter(([, n]) => (n[f.key] || '').trim());
          return `<div class="an-f"><div class="an-h">${f.label} <small>${items.length}</small></div>${items.map(([nm, n]) =>
            `<div class="an-i"><b>${esc(nm)}</b>${esc(n[f.key].trim())}</div>`).join('') || '<div class="an-i empty">작성 내용 없음</div>'}</div>`;
        }).join('') : '<div class="an-i empty">아직 작성된 의견이 없습니다.</div>';
      }
    }
    // 분임 최종 의견
    const rep = reports[g] || {};
    if (amLeader && !leaderDirty) {
      $$('[data-fk]', root).forEach((ta) => {
        const v = rep[ta.dataset.fk] || '';
        if (document.activeElement !== ta && ta.value !== v) { ta.value = v; ta.nextElementSibling.textContent = `${v.length} / 800`; }
      });
    }
    if (!amLeader) {
      $$('[data-rv]', root).forEach((v) => {
        const t = (rep[v.dataset.rv] || '').trim();
        v.textContent = t || '작성 전';
        v.classList.toggle('empty', !t);
      });
    }
    const st = $('[data-rst]', root);
    if (st) {
      const [cls, txt] = rep.status === 'done' ? ['done', '제출 완료'] : CFG_FIELDS_FILLED(rep) ? ['draft', '작성 중'] : ['', '작성 전'];
      st.className = 'st ' + cls; st.textContent = txt;
    }
    const sb = $('[data-submit]', root);
    if (sb) sb.textContent = rep.status === 'done' ? '수정 내용 다시 제출하기' : '최종 의견 제출 · 전체 공유';
  }

  function buildGroupTab(root, g, leader, amLeader) {
    const G = C.GROUPS[g - 1];
    const rep = reports[g] || {};
    leaderDirty = false;
    let fin;
    if (amLeader) {
      fin = `<p class="hint" style="margin:-4px 0 12px">분임장 작성 · 토론 내용을 요약하여 입력 · 자동 저장</p>
        ${C.FIELDS.map((f) => `<div class="fld"><label>${f.label}<small>${f.sub}</small></label>
          <textarea class="ta" data-fk="${f.key}" maxlength="800" placeholder="토론 내용 요약 입력"></textarea><div class="cnt2"></div></div>`).join('')}
        <button class="btn full teal" data-submit>최종 의견 제출 · 전체 공유</button>`;
    } else if (leader) {
      fin = `<p class="hint" style="margin:-4px 0 12px">분임장 ${esc(leader)} 작성 · 실시간 표시</p>
        ${C.FIELDS.map((f) => `<div class="fld"><label>${f.label}<small>${f.sub}</small></label><div class="rview empty" data-rv="${f.key}"></div></div>`).join('')}`;
    } else {
      fin = `<div class="lead-cta">분임장 미지정<br>분임장을 맡으신 경우 아래 버튼을 눌러 주십시오.
        <button class="btn full" data-claim>분임장으로 최종 의견 작성</button></div>`;
    }
    root.innerHTML = `
      <div class="gbox head" style="--c:${G.color}"><div class="gk">${g}분임</div><div class="gt">${esc(G.topic)}</div>
        <ul>${G.guide.map((q) => `<li>${esc(q)}</li>`).join('')}</ul>
        <div class="steps"><span>① 나의 의견 입력</span><span>② 모두의 의견 보며 토론</span><span>③ 분임장 최종 정리</span></div></div>
      <div class="gbox" style="--c:${G.color}"><h5>함께하는 선생님 <span class="savest" data-mcount></span></h5><div class="members" data-members></div></div>
      <div class="gbox"><h5><span>① 나의 의견</span><span class="savest" data-nsave></span></h5>
        ${C.FIELDS.map((f) => `<div class="fld"><label>${f.label}<small>${f.sub}</small></label>
          <textarea class="ta sm" data-nk="${f.key}" maxlength="600" placeholder="${f.label} 입력"></textarea></div>`).join('')}
        <button class="btn full" data-nsavebtn>저장</button></div>
      <div class="gbox"><h5><span>② 우리 분임 의견 모아보기</span><span class="savest" data-ncount></span></h5>
        <button class="btn full" data-toggleall>모두의 의견 보기</button>
        <div class="allnotes hidden" data-allnotes></div></div>
      <div class="gbox"><h5><span>③ 분임 최종 의견</span><span class="st" data-rst></span></h5>${fin}</div>
      <button class="linkbtn" data-relogin>이름 다시 입력 · 분임 변경</button>`;

    $('[data-relogin]', root).onclick = async () => {
      if (!confirm('이름을 다시 입력하시겠습니까?')) return;
      await api('leave', {}, true).catch(() => {});
      me = null; saveMe(); gtabSig = ''; noteDraft = null; store.del(P + 'note');
      showJoin('name');
    };
    $('[data-toggleall]', root).onclick = () => { showAll = !showAll; updateGroupTab(); };

    // ① 나의 의견
    const nts = $$('[data-nk]', root);
    const myNote = (notes[g] || {})[me.name] || {};
    if (!noteDraft) { try { noteDraft = JSON.parse(store.get(P + 'note') || 'null'); } catch (_) { noteDraft = null; } }
    const ns = $('[data-nsave]', root);
    const sb = $('[data-nsavebtn]', root);
    const paintSave = (dirty) => {
      sb.textContent = dirty ? '저장' : '저장됨 · 수정 후 다시 저장';
      sb.classList.toggle('sec', !dirty);
      if (dirty) { ns.className = 'savest'; ns.textContent = '저장 전'; }
    };
    nts.forEach((ta) => {
      ta.value = noteDraft ? noteDraft[ta.dataset.nk] || '' : myNote[ta.dataset.nk] || '';
      ta.oninput = () => {
        noteDraft = Object.fromEntries(nts.map((t) => [t.dataset.nk, t.value]));
        store.set(P + 'note', JSON.stringify(noteDraft)); // 저장 전 입력도 휴대폰에 보관
        paintSave(true);
      };
    });
    if (noteDraft) paintSave(true);
    else if (filled(myNote)) { paintSave(false); ns.className = 'savest ok'; ns.textContent = '저장됨'; }
    sb.onclick = async () => {
      const fields = Object.fromEntries(nts.map((t) => [t.dataset.nk, t.value]));
      if (!filled(fields)) { toast('의견을 먼저 입력해 주십시오.'); return; }
      sb.disabled = true;
      try {
        await api('note', { fields });
        noteDraft = null; store.del(P + 'note');
        ns.className = 'savest ok'; ns.textContent = `저장됨 ${hhmm()}`;
        paintSave(false);
        // 저장하면 모두의 의견 보기로 바로 연결
        notes[g] = Object.assign({}, notes[g], { [me.name]: Object.assign({ ts: Date.now() }, fields) });
        showAll = true;
        updateGroupTab();
        const all = $('[data-allnotes]', root);
        if (all) all.closest('.gbox').scrollIntoView({ behavior: 'smooth', block: 'start' });
        toast('저장되었습니다. 우리 분임 의견에 공유되었습니다.');
      } catch (_) { /* 오류 안내는 api()에서 */ }
      sb.disabled = false;
    };

    const claim = $('[data-claim]', root);
    if (claim) claim.onclick = async () => {
      if (!confirm(`${g}분임 분임장으로 최종 의견을 작성하시겠습니까?`)) return;
      await api('claim', {});
      toast('분임장으로 지정되었습니다.');
    };
    if (amLeader) {
      const tas = $$('[data-fk]', root);
      const counter = (ta) => { ta.nextElementSibling.textContent = `${ta.value.length} / 800`; };
      tas.forEach((ta) => {
        ta.value = rep[ta.dataset.fk] || '';
        counter(ta);
        ta.oninput = () => { leaderDirty = true; counter(ta); queueSave(); };
      });
      const fields = () => Object.fromEntries(tas.map((t) => [t.dataset.fk, t.value]));
      const sv = $('[data-rst]', root);
      const doSave = async (submit) => {
        clearTimeout(saveT);
        try {
          await api('report', { fields: fields(), submit: !!submit }, !submit);
          return true;
        } catch (e) { toast('저장에 실패했습니다. 다시 시도해 주십시오.'); return false; }
      };
      function queueSave() { clearTimeout(saveT); sv.className = 'st'; sv.textContent = '입력 중…'; saveT = setTimeout(() => doSave(false), 1200); }
      $('[data-submit]', root).onclick = async () => {
        if (!tas.some((t) => t.value.trim())) { toast('내용을 먼저 입력해 주십시오.'); return; }
        if (await doSave(true)) toast('제출되었습니다. 전체 화면에 실시간으로 공유됩니다.');
      };
    }
  }

  // ---------- 질문하기 ----------
  function openAsk() {
    const root = $('#modalRoot');
    root.innerHTML = `<div class="sheet"><div class="sheet-in">
      <h4>발표자에게 질문하기</h4><p>질문은 발표자에게만 전달됩니다.</p>
      <textarea maxlength="300" placeholder="궁금한 점 입력"></textarea>
      <input type="text" maxlength="20" placeholder="이름 (선택, 비우면 익명)">
      <div class="acts"><button class="btn sec" data-x>취소</button><button class="btn" data-send>보내기</button></div>
    </div></div>`;
    const sh = $('.sheet', root);
    const close = () => { root.innerHTML = ''; };
    sh.addEventListener('click', (e) => { if (e.target === sh || e.target.hasAttribute('data-x')) close(); });
    const nameInp = $('input', sh);
    nameInp.value = '';
    $('textarea', sh).focus();
    $('[data-send]', sh).onclick = async (e) => {
      const text = $('textarea', sh).value.trim();
      if (!text) { $('textarea', sh).focus(); return; }
      e.target.disabled = true;
      try {
        await api('question', { text, name: nameInp.value.trim() });
        close();
        toast('질문이 전달되었습니다.');
      } catch (_) { e.target.disabled = false; }
    };
  }

  // ---------- 핀코드 ----------
  function openPin(onCancel) {
    const root = $('#modalRoot');
    root.innerHTML = `<div class="modal"><div class="pin-box">
      <h3>발표자 모드</h3><p>핀코드 4자리 입력</p>
      <div class="pin-dots"><i></i><i></i><i></i><i></i></div>
      <div class="pin-pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => `<button data-d="${d}">${d}</button>`).join('')}
        <button class="ghost" data-c>취소</button><button data-d="0">0</button><button class="ghost" data-b>지우기</button></div>
    </div></div>`;
    let code = '';
    const dots = $$('.pin-dots i', root);
    const paint = () => dots.forEach((d, i) => d.classList.toggle('on', i < code.length));
    const close = () => { root.innerHTML = ''; document.removeEventListener('keydown', onKey, true); };
    const press = async (d) => {
      if (code.length >= 4) return;
      code += d; paint();
      if (code.length === 4) {
        try {
          const res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: code }) });
          if (!res.ok) throw 0;
          const { token: t } = await res.json();
          token = t; store.set(P + 'token', t);
          close();
          if (location.pathname !== '/presenter') history.replaceState(null, '', '/presenter');
          enterPresenter();
        } catch (_) {
          const box = $('.pin-dots', root);
          box.classList.add('err');
          setTimeout(() => { box.classList.remove('err'); code = ''; paint(); }, 450);
        }
      }
    };
    const onKey = (e) => {
      if (/^\d$/.test(e.key)) { press(e.key); e.stopPropagation(); }
      else if (e.key === 'Backspace') { code = code.slice(0, -1); paint(); }
      else if (e.key === 'Escape') { close(); onCancel && onCancel(); }
    };
    document.addEventListener('keydown', onKey, true);
    $$('[data-d]', root).forEach((b) => (b.onclick = () => press(b.dataset.d)));
    $('[data-b]', root).onclick = () => { code = code.slice(0, -1); paint(); };
    $('[data-c]', root).onclick = () => { close(); onCancel && onCancel(); };
  }

  // ================= 발표자 =================
  function go(n) {
    if (n < 1 || n > N || n === cur) return;
    show(n);
    api('slide', { slide: n }).catch(() => {});
  }

  function enterPresenter() {
    isPresenter = true;
    document.body.className = 'presenter';
    $('#aud').classList.add('hidden');
    $('#join').classList.add('hidden');
    $('#pres').classList.remove('hidden');
    document.body.appendChild(stage);
    fit();
    connect();
    wake();
    if (!window.__keepAlive) window.__keepAlive = setInterval(() => fetch('/api/info', { cache: 'no-store' }).catch(() => {}), 4 * 60 * 1000);
  }

  function enterAudience() {
    isPresenter = false;
    document.body.className = 'audience';
    $('#pres').classList.add('hidden');
    if (!me) { showJoin('name'); connect(); return; }
    $('#join').classList.add('hidden');
    $('#aud').classList.remove('hidden');
    $('#audStageSlot').appendChild(stage);
    updateMeChip();
    setTab(tab);
    fit();
    connect();
    if (cur) renderPanel();
    updateGroupTab(true);
  }

  function renderQuestions() {
    const list = $('#qlist');
    const items = questions.filter((q) => qFilter === 'all' || !q.done).slice().reverse();
    list.innerHTML = '';
    if (!items.length) {
      list.innerHTML = `<div class="qempty">${qFilter === 'all' ? '받은 질문 없음' : '미답변 질문 없음'}<br>참여자는 QR 접속 후 <b>질문하기</b> 버튼으로 질문할 수 있습니다.</div>`;
      return;
    }
    const spotId = last && last.spotlight && last.spotlight.id;
    for (const q of items) {
      const d = document.createElement('div');
      d.className = 'qitem' + (q.done ? ' done' : '') + (q.id === spotId ? ' spot-on' : '');
      const t = new Date(q.ts);
      d.innerHTML = `<div class="qt2"></div><div class="qm"></div><div class="qa">
        <button class="pri" data-a="spot">${q.id === spotId ? '화면에서 내리기' : '화면에 띄우기'}</button>
        <button data-a="done">${q.done ? '미답변으로' : '답변 완료 ✓'}</button>
        <button data-a="del">삭제</button></div>`;
      $('.qt2', d).textContent = q.text;
      $('.qm', d).textContent = `${q.name || '익명'} · ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
      $('[data-a="spot"]', d).onclick = () => api('spotlight', { id: q.id === spotId ? null : q.id });
      $('[data-a="done"]', d).onclick = () => api('qdone', { id: q.id });
      $('[data-a="del"]', d).onclick = () => { if (confirm('이 질문을 삭제하시겠습니까?')) api('qdelete', { id: q.id }); };
      list.appendChild(d);
    }
  }

  // ---------- 분임 관리 ----------
  async function openAdmin() {
    const dr = $('#admin');
    if (dr.classList.contains('open')) { dr.classList.remove('open'); return; }
    $('#drawer').classList.remove('open');
    dr.classList.add('open');
    const adm = $('#adm');
    adm.innerHTML = `
      <div><h4>교사 명단</h4>
        <p class="help">엑셀에서 <code>이름 | 분임 | 분임장(O) | 비고</code> 열을 복사해 붙여넣습니다. 쉼표 구분도 가능합니다.<br>
        분임장 칸에 O 표시 시 기록 담당으로 지정되며, 비워 두면 분임원 중 한 분이 휴대폰에서 직접 맡을 수 있습니다. 동명이인은 비고(교과 등)로 구분합니다.</p>
        <textarea id="rosterTa" spellcheck="false" placeholder="홍길동	1	O	국어&#10;김철수	1&#10;이영희	2	O"></textarea>
        <div class="row2"><button class="btn" id="rosterSave">명단 저장</button><span class="savest" id="rosterMsg"></span></div></div>
      <div><h4>분임 현황</h4><div id="admGroups" style="display:flex;flex-direction:column;gap:8px"></div></div>
      <div><h4>결과 저장 · 정리</h4>
        <p class="help">토의 결과·투표·의견·단어를 엑셀에서 열 수 있는 CSV 파일로 내려받습니다.</p>
        <div class="row2"><button class="btn teal" id="exportBtn">결과 CSV 다운로드</button><button class="sm" id="clearPeople">입장 기록 초기화</button></div></div>`;
    try {
      const d = await api('admin', {});
      $('#rosterTa').value = d.roster;
      $('#rosterMsg').textContent = d.roster ? `${d.roster.split('\n').length}명 등록됨` : '등록된 명단 없음 (분임을 직접 고르게 됨)';
    } catch (_) {}
    $('#rosterSave').onclick = async () => {
      const d = await api('roster', { text: $('#rosterTa').value });
      $('#rosterTa').value = d.text;
      $('#rosterMsg').className = 'savest ok';
      $('#rosterMsg').textContent = `✓ ${d.count}명 저장됨`;
      toast(`명단 ${d.count}명이 저장되었습니다.`);
    };
    $('#exportBtn').onclick = () => { location.href = '/api/export?token=' + encodeURIComponent(token); };
    $('#clearPeople').onclick = () => { if (confirm('입장 기록을 모두 지우시겠습니까? (토의 기록과 응답은 유지됩니다)')) api('clearPeople', {}); };
    renderAdminGroups();
  }
  function renderAdminGroups() {
    const box = $('#admGroups');
    if (!box || !last) return;
    box.innerHTML = '';
    last.groups.forEach((gi) => {
      const g = gi.g;
      const [cls, txt] = statusOf(g, gi);
      const rep = reports[g] || {};
      const d = document.createElement('div');
      d.className = 'ginfo';
      d.style.setProperty('--c', groupColor(g));
      d.innerHTML = `<div class="t"><span>${g}분임 · ${esc(C.GROUPS[g - 1].topic)}</span><span class="st ${cls}">${cls ? txt : '미작성'}</span></div>
        <div class="m">분임장: ${gi.leader ? esc(gi.leader) : '<i>미정</i>'}<br>입장 ${gi.joined.length}${gi.roster ? ' / ' + gi.roster : ''}명: ${esc(gi.joined.join(', ')) || '-'}</div>
        <div class="row2">${gi.leader ? '<button class="sm" data-rel>분임장 해제</button>' : ''}${rep.status === 'done' ? '<button class="sm" data-reo>작성 중으로 되돌리기</button>' : ''}</div>`;
      const rel = $('[data-rel]', d);
      if (rel) rel.onclick = () => { if (confirm(`${g}분임 분임장(${gi.leader})을 해제하시겠습니까? 작성된 기록은 유지됩니다.`)) api('release', { g }); };
      const reo = $('[data-reo]', d);
      if (reo) reo.onclick = () => api('reopen', { g });
      box.appendChild(d);
    });
  }

  let joinUrlCache = '';
  function loadJoinUrl() {
    fetch('/api/info').then((r) => r.json()).then((info) => {
      joinUrlCache = info.joinUrl;
      $$('[data-joinurl]').forEach((e) => (e.textContent = info.joinUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')));
    }).catch(() => {});
  }
  function openQrBig() {
    const root = $('#modalRoot');
    if ($('.qr-big', root)) { root.innerHTML = ''; return; }
    root.innerHTML = `<div class="modal qr-modal"><div class="qr-big"><img alt="QR" src="/qr.svg"><div class="u"></div><div class="s">휴대폰 카메라로 스캔하여 참여 · 아무 곳이나 누르면 닫힘</div></div></div>`;
    $('.u', root).textContent = joinUrlCache || location.origin + '/';
    $('.modal', root).onclick = () => { root.innerHTML = ''; };
  }
  function toggleFs() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.(); else document.exitFullscreen?.();
  }

  // 발표자 이벤트
  $('#homeBtn').onclick = () => go(1);
  $('#prevBtn').onclick = () => go(cur - 1);
  $('#nextBtn').onclick = () => go(cur + 1);
  $('#replayBtn').onclick = replay;
  $('#fsBtn').onclick = toggleFs;
  $('#qrBigBtn').onclick = openQrBig;
  $('#qrCard').onclick = openQrBig;
  $('#adminBtn').onclick = openAdmin;
  $('#resetBtn').onclick = () => { if (confirm(`${cur}쪽의 응답을 모두 지우시겠습니까?`)) api('reset', { slide: cur }); };
  $('#exitBtn').onclick = () => { store.del(P + 'token'); token = null; history.replaceState(null, '', '/'); enterAudience(); };
  $('#qBtn').onclick = () => { $('#admin').classList.remove('open'); $('#drawer').classList.toggle('open'); };
  $$('.dclose').forEach((b) => (b.onclick = () => b.closest('.drawer').classList.remove('open')));
  $$('.filters button').forEach((b) => (b.onclick = () => {
    qFilter = b.dataset.f;
    $$('.filters button').forEach((x) => x.classList.toggle('on', x === b));
    renderQuestions();
  }));
  // 결과 공유 한눈에 보기: 카드를 누르면 해당 분임 화면으로
  $$('[data-scard]').forEach((c) => (c.onclick = () => {
    if (!isPresenter) return;
    const g = Number(c.dataset.scard);
    go(slideNo((s) => s.key === 'report' && s.g === g));
  }));
  // 타이머 조작
  function timerToggle() { api('timer', { op: last && last.timer.end ? 'pause' : 'start' }); }
  $$('#tCtl [data-min]').forEach((b) => (b.onclick = () => api('timer', { op: 'set', min: Number(b.dataset.min) })));
  $('#tCtl [data-op="toggle"]').onclick = timerToggle;
  $('#tCtl [data-op="add"]').onclick = () => api('timer', { op: 'add', min: 1 });
  $('#tCtl [data-op="reset"]').onclick = () => api('timer', { op: 'reset' });

  // 정답 확인
  const isQuiz = (n) => !!(SLIDES[n - 1] && SLIDES[n - 1].interact && SLIDES[n - 1].interact.quiz);
  const revealed = () => !!(last && last.results[cur] && last.results[cur].answer != null);
  function toggleAnswer() {
    if (!isPresenter || !isQuiz(cur)) return;
    api('reveal', { slide: cur, on: !revealed() }).catch(() => {});
  }
  function updateAnsBtn() {
    const b = $('#ansBtn');
    b.classList.toggle('hidden', !isQuiz(cur));
    b.classList.toggle('on', revealed());
    $('.lbl', b).textContent = revealed() ? '정답 숨기기' : '정답 확인';
  }
  $('#ansBtn').onclick = toggleAnswer;

  // 키보드 (리모컨 포함)
  let jump = '';
  document.addEventListener('keydown', (e) => {
    if (!isPresenter || e.target.closest('input, textarea') || ($('#modalRoot').innerHTML && e.key !== 'Escape')) return;
    const k = e.key;
    if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(k)) {
      if (k === 'Enter' && jump) { go(Number(jump)); jump = ''; } else go(cur + 1);
      e.preventDefault();
    } else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(k)) { go(cur - 1); e.preventDefault(); }
    else if (k === 'Home') go(1);
    else if (k === 'End') go(N);
    else if (k === 'f' || k === 'F') toggleFs();
    else if (k === 'r' || k === 'R') replay();
    else if (k === 'q' || k === 'Q') $('#qrCard').classList.toggle('mini');
    else if (k === 'm' || k === 'M') $('#qBtn').click();
    else if (k === 'g' || k === 'G') openAdmin();
    else if (k === 'a' || k === 'A') toggleAnswer();
    else if ((k === 't' || k === 'T') && cur === TIMER_SLIDE) timerToggle();
    else if (k === 'Escape') { $('#modalRoot').innerHTML = ''; $$('.drawer').forEach((d) => d.classList.remove('open')); }
    else if (/^\d$/.test(k)) { jump = (jump + k).slice(-2); setTimeout(() => { jump = ''; }, 1500); }
  });

  // 툴바 / 커서 자동 숨김
  let idleT;
  const wake = () => {
    $('#toolbar').classList.remove('idle');
    $('#tCtl').classList.remove('idle');
    document.body.style.cursor = '';
    clearTimeout(idleT);
    idleT = setTimeout(() => {
      if (!isPresenter) return;
      $('#toolbar').classList.add('idle');
      $('#tCtl').classList.add('idle');
      document.body.style.cursor = 'none';
    }, 2600);
  };
  document.addEventListener('mousemove', wake);
  let tx = null;
  stage.addEventListener('touchstart', (e) => { tx = e.touches[0].clientX; }, { passive: true });
  stage.addEventListener('touchend', (e) => {
    if (!isPresenter || tx === null) return;
    const dx = e.changedTouches[0].clientX - tx;
    if (Math.abs(dx) > 60) go(cur + (dx < 0 ? 1 : -1));
    tx = null;
  });

  // 참여자 이벤트
  $('#askBtn').onclick = openAsk;
  $('#lockBtn').onclick = () => openPin();
  $('#jLock').onclick = () => openPin();

  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2400);
  }

  // ---------- 시작 ----------
  loadJoinUrl();
  (async function init() {
    if (location.pathname === '/presenter') {
      if (token) {
        const ok = await fetch('/api/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) })
          .then((r) => r.json()).then((d) => d.ok).catch(() => false);
        if (ok) { enterPresenter(); return; }
        store.del(P + 'token');
      }
      enterAudience();
      openPin(() => history.replaceState(null, '', '/'));
    } else {
      enterAudience();
      if (me) silentRejoin();
    }
  })();
})();
