// 자율형공립고 2.0 자체평가회 — 실시간 인터랙티브 발표 서버 (Node 내장 http + Server-Sent Events)
// 실행: node server.js   (환경변수 PORT, PUBLIC_URL, PIN 선택)
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const QRCode = require('qrcode');
const CFG = require('./public/config.js');

const argPort = process.argv.slice(2).find((a) => /^\d+$/.test(a));
const PORT = Number(process.env.PORT || argPort) || 8080;
const PIN = process.env.PIN || '0821';
const PUBLIC_DIR = path.join(__dirname, 'public');
const STATE_FILE = path.join(__dirname, 'state.json');
const ROSTER_FILE = path.join(__dirname, 'roster.csv');
const PLAN = CFG.PLAN;
const TOTAL_SLIDES = PLAN.length;
const NG = CFG.GROUPS.length;

const INTERACTIONS = {};
PLAN.forEach((p, i) => { if (p.interact) INTERACTIONS[i + 1] = p.interact; });
const ANSWERS = {};
for (const [s, cfg] of Object.entries(INTERACTIONS)) if (cfg.quiz) ANSWERS[s] = CFG.QUIZ[cfg.quiz].answer;
const REPORT_SLIDES = new Set(PLAN.map((p, i) => (['shareAll', 'report'].includes(p.key) ? i + 1 : 0)).filter(Boolean));

// ---------- 상태 ----------
let state = {
  slide: 1,
  responses: {},   // { [slide]: { [clientId]: value } }
  questions: [],   // { id, text, name, ts, done }
  spotlight: null, // 화면에 띄운 질문/의견 id
  reveal: {},      // { [slide]: true }
  tokens: [],
  roster: [],      // { name, group, leader, note }
  people: {},      // { [clientId]: { name, group, ts } }
  leaders: {},     // { [group]: name }
  reports: {},     // { [group]: { achieve, issue, propose, status, by, ts } }  분임장 최종 의견
  notes: {},       // { [group]: { [name]: { achieve, issue, propose, ts } } }  분임원 개인 의견
  comments: {},    // { [group]: [{ id, t, name, ts, hidden }] }
  timer: { dur: 20 * 60000, end: null, left: 20 * 60000 },
};
try { state = Object.assign(state, JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))); } catch (_) { /* 처음 실행 */ }

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tmp = STATE_FILE + '.tmp';
    fs.writeFile(tmp, JSON.stringify(state), (e) => { if (!e) fs.rename(tmp, STATE_FILE, () => {}); });
  }, 300);
}
const tokens = new Set(state.tokens || []);

// ---------- 명단 ----------
const norm = (s) => String(s || '').replace(/\s+/g, '').toLowerCase();
const YES = /^(o|ㅇ|○|●|v|y|yes|1|예|분임장|장|true)$/i;

function parseRoster(text) {
  const out = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(/^﻿/, '').trim();
    if (!line || line.startsWith('#')) continue;
    const cols = line.split(/\t|,/).map((c) => c.trim());
    const name = cols[0];
    const gm = String(cols[1] || '').match(/\d+/);
    if (!name || !gm) continue; // 머리글 줄 등은 건너뜀
    const group = Number(gm[0]);
    if (group < 1 || group > NG) continue;
    out.push({ name: name.slice(0, 20), group, leader: YES.test(cols[2] || ''), note: (cols[3] || '').slice(0, 20) });
  }
  return out;
}
function rosterText() {
  return state.roster.map((r) => [r.name, r.group, r.leader ? 'O' : '', r.note].join('\t').replace(/\t+$/, '')).join('\n');
}
function applyRosterLeaders() {
  for (const r of state.roster) if (r.leader) state.leaders[r.group] = r.name;
}
if (!state.roster.length) {
  try {
    state.roster = parseRoster(fs.readFileSync(ROSTER_FILE, 'utf8'));
    applyRosterLeaders();
  } catch (_) { /* 명단 없음 */ }
}

// ---------- 집계 ----------
function aggregate(slide) {
  const cfg = INTERACTIONS[slide];
  const r = state.responses[slide] || {};
  const people = Object.keys(r).length;
  const answer = state.reveal[slide] && slide in ANSWERS ? ANSWERS[slide] : null;
  if (cfg.type === 'choice' || cfg.type === 'multi') {
    const counts = Array(cfg.options.length).fill(0);
    for (const v of Object.values(r)) for (const n of [].concat(v)) if (counts[n - 1] !== undefined) counts[n - 1]++;
    return { type: cfg.type, counts, total: people, answer };
  }
  if (cfg.type === 'like') return { type: 'like', total: people };
  if (cfg.type === 'text') {
    const list = [];
    for (const arr of Object.values(r)) for (const o of arr) if (!o.hidden) list.push({ id: o.id, t: o.t, ts: o.ts });
    list.sort((a, b) => b.ts - a.ts);
    return { type: 'text', list, total: people };
  }
  // words
  const groups = new Map();
  for (const arr of Object.values(r)) {
    for (const w of arr) {
      const k = norm(w.t);
      if (!k) continue;
      const g = groups.get(k) || { count: 0, first: w.ts, forms: {} };
      g.count++;
      g.forms[w.t] = (g.forms[w.t] || 0) + 1;
      g.first = Math.min(g.first, w.ts);
      groups.set(k, g);
    }
  }
  const words = [...groups.values()].map((g) => ({
    text: Object.entries(g.forms).sort((a, b) => b[1] - a[1])[0][0], count: g.count, first: g.first,
  }));
  words.sort((a, b) => b.count - a.count || a.first - b.first);
  return { type: 'words', words: words.slice(0, 80), total: people };
}

function groupsInfo() {
  const info = [];
  for (let g = 1; g <= NG; g++) {
    const joined = new Set();
    for (const p of Object.values(state.people)) if (p.group === g) joined.add(p.name);
    const rep = state.reports[g];
    info.push({
      g,
      roster: state.roster.filter((r) => r.group === g).length,
      joined: [...joined],
      leader: state.leaders[g] || null,
      status: rep ? rep.status : null,
      notes: Object.values(state.notes[g] || {}).filter((n) => CFG.FIELDS.some((f) => (n[f.key] || '').trim())).length,
    });
  }
  return info;
}

function publicState() {
  const results = {};
  if (INTERACTIONS[state.slide]) results[state.slide] = aggregate(state.slide);
  const spot = findSpot(state.spotlight);
  return {
    slide: state.slide,
    results,
    groups: groupsInfo(),
    timer: Object.assign({ now: Date.now() }, state.timer),
    openQuestions: state.questions.filter((q) => !q.done).length,
    spotlight: spot,
    clients: [...clients.values()].filter((c) => !c.presenter).length,
    joined: new Set(Object.values(state.people).map((p) => p.name)).size,
    rosterSize: state.roster.length,
  };
}
function findSpot(id) {
  if (!id) return null;
  if (id.startsWith('o:')) {
    const oid = id.slice(2);
    for (const bucket of Object.values(state.responses)) {
      for (const v of Object.values(bucket)) {
        if (!Array.isArray(v)) continue;
        const o = v.find((x) => x && x.id === oid);
        if (o) return { id, text: o.t, kind: 'opinion' };
      }
    }
    return null;
  }
  const q = state.questions.find((x) => x.id === id);
  return q ? { id, text: q.text, name: q.name, kind: 'question' } : null;
}

// ---------- SSE ----------
const clients = new Map(); // res -> { presenter, cid }
let broadcastTimer = null;
function broadcast() {
  if (broadcastTimer) return;
  broadcastTimer = setTimeout(() => {
    broadcastTimer = null;
    const pub = `event: state\ndata: ${JSON.stringify(publicState())}\n\n`;
    // 분임장 최종 의견·댓글·분임원 개인 의견 (개인 의견은 같은 분임과 발표자에게만)
    const allComments = {};
    for (let g = 1; g <= NG; g++) allComments[g] = (state.comments[g] || []).filter((c) => !c.hidden).map(({ id, t, name, ts }) => ({ id, t, name, ts }));
    const pack = (o) => `event: reports\ndata: ${JSON.stringify(o)}\n\n`;
    const presFull = pack({ reports: state.reports, comments: allComments, notes: state.notes });
    const perGroup = {}, fullFor = {};
    for (let g = 1; g <= NG; g++) {
      const own = { [g]: state.notes[g] || {} };
      perGroup[g] = pack({ reports: state.reports[g] ? { [g]: state.reports[g] } : {}, comments: { [g]: allComments[g] }, notes: own });
      fullFor[g] = pack({ reports: state.reports, comments: allComments, notes: own });
    }
    const fullAnon = pack({ reports: state.reports, comments: allComments, notes: {} });
    const pres = `event: questions\ndata: ${JSON.stringify({ questions: state.questions })}\n\n`;
    const needAll = REPORT_SLIDES.has(state.slide);
    for (const [res, info] of clients) {
      res.write(pub);
      const me = info.cid && state.people[info.cid];
      if (info.presenter) res.write(presFull);
      else if (needAll) res.write(me ? fullFor[me.group] : fullAnon);
      else if (me) res.write(perGroup[me.group]);
      if (info.presenter) res.write(pres);
    }
  }, 150);
}
setInterval(() => { for (const res of clients.keys()) res.write(': ping\n\n'); }, 20000);

// ---------- 유틸 ----------
function lanAddress() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254')) return a.address;
    }
  }
  return 'localhost';
}
function joinUrl(req) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/?$/, '/');
  const host = req && req.headers.host;
  if (host && !/^(localhost|127\.0\.0\.1)/.test(host)) {
    const proto = req.headers['x-forwarded-proto'] || 'http';
    return `${proto}://${host}/`;
  }
  return `http://${lanAddress()}:${PORT}/`;
}
function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 200000) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); } });
  });
}
function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json',
};
function serveStatic(req, res, pathname) {
  if (pathname === '/' || pathname === '/presenter') pathname = '/index.html';
  let file;
  try { file = path.normalize(path.join(PUBLIC_DIR, decodeURIComponent(pathname))); } catch { return json(res, 400, { error: 'bad path' }); }
  if (!file.startsWith(PUBLIC_DIR)) return json(res, 403, { error: 'forbidden' });
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return json(res, 404, { error: 'not found' });
    const ext = path.extname(file);
    const longCache = ['.webp', '.woff2', '.png', '.jpg'].includes(ext);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': longCache ? 'public, max-age=86400' : 'no-cache',
    });
    fs.createReadStream(file).pipe(res);
  });
}
const isPresenter = (body) => body && tokens.has(body.token);
const cleanText = (s, max) => String(s || '').replace(/[\u0000-\u0009\u000b-\u001f]/g, ' ').trim().slice(0, max);
const cleanLine = (s, max) => String(s || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const rid = () => crypto.randomBytes(6).toString('hex');

// 이름으로 분임 찾기
function lookup(name) {
  const k = norm(name);
  return state.roster.filter((r) => norm(r.name) === k);
}

// ---------- CSV 내보내기 ----------
function csvCell(v) {
  const s = String(v == null ? '' : v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function exportCsv() {
  const rows = [];
  const push = (...cols) => rows.push(cols.map(csvCell).join(','));
  push(`${CFG.EVENT.year} ${CFG.EVENT.title} 결과`);
  push('내보낸 시각', new Date().toLocaleString('ko-KR'));
  push();
  push('[분임별 토의 결과]');
  push('분임', '주제', '분임장', ...CFG.FIELDS.map((f) => `${f.label}(${f.sub})`), '상태', '공감 수');
  PLAN.forEach((p, i) => {
    if (p.key !== 'report') return;
    const g = p.g, rep = state.reports[g] || {};
    const likes = Object.keys(state.responses[i + 1] || {}).length;
    push(`${g}분임`, CFG.GROUPS[g - 1].topic, rep.by || state.leaders[g] || '', ...CFG.FIELDS.map((f) => rep[f.key] || ''),
      rep.status === 'done' ? '제출 완료' : rep.status ? '작성 중' : '미작성', likes);
  });
  for (const [s, cfg] of Object.entries(INTERACTIONS)) {
    if (cfg.type === 'like') continue;
    const r = aggregate(Number(s));
    push();
    push(`[${s}쪽] ${cfg.title}`, `응답 ${r.total}명`);
    if (cfg.type === 'choice' || cfg.type === 'multi') {
      cfg.options.forEach((o, i) => push(o, r.counts[i]));
    } else if (cfg.type === 'text') {
      r.list.slice().reverse().forEach((o) => push(o.t));
    } else {
      r.words.forEach((w) => push(w.text, w.count));
    }
  }
  push();
  push('[분임원 개인 의견]');
  push('분임', '이름', ...CFG.FIELDS.map((f) => f.label));
  for (let g = 1; g <= NG; g++) for (const [nm, n] of Object.entries(state.notes[g] || {})) push(`${g}분임`, nm, ...CFG.FIELDS.map((f) => n[f.key] || ''));
  push();
  push('[분임 결과 댓글]');
  push('분임', '작성자', '댓글');
  for (let g = 1; g <= NG; g++) for (const c of state.comments[g] || []) if (!c.hidden) push(`${g}분임`, c.name || '익명', c.t);
  if (state.questions.length) {
    push();
    push('[질문]');
    state.questions.forEach((q) => push(q.text, q.name || '익명'));
  }
  push();
  push('[분임별 입장 인원]');
  groupsInfo().forEach((g) => push(`${g.g}분임`, g.joined.join(' / ')));
  return '﻿' + rows.join('\r\n');
}

// ---------- 라우팅 ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;

  if (req.method === 'GET' && p === '/events') {
    const presenter = tokens.has(url.searchParams.get('token'));
    res.writeHead(200, {
      'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache',
      Connection: 'keep-alive', 'X-Accel-Buffering': 'no',
    });
    res.write('retry: 2000\n\n');
    clients.set(res, { presenter, cid: cleanLine(url.searchParams.get('cid'), 64) });
    broadcast();
    req.on('close', () => { clients.delete(res); broadcast(); });
    return;
  }

  if (req.method === 'GET' && p === '/api/info') {
    return json(res, 200, { joinUrl: joinUrl(req), total: TOTAL_SLIDES });
  }

  if (req.method === 'GET' && p === '/api/export') {
    if (!tokens.has(url.searchParams.get('token'))) return json(res, 401, { error: '발표자 인증이 필요합니다.' });
    const fname = `자체평가회_결과_${new Date().toISOString().slice(0, 10)}.csv`;
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store',
      'Content-Disposition': `attachment; filename="result.csv"; filename*=UTF-8''${encodeURIComponent(fname)}`,
    });
    return res.end(exportCsv());
  }

  if (req.method === 'GET' && p === '/qr.svg') {
    const svg = await QRCode.toString(joinUrl(req), { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#1b2f5e', light: '#ffffff' } });
    res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-cache' });
    return res.end(svg);
  }

  if (req.method === 'POST' && p.startsWith('/api/')) {
    const body = await readBody(req);
    const action = p.slice(5);
    const cid = cleanLine(body.clientId, 64);
    const me = cid && state.people[cid];

    if (action === 'login') {
      if (String(body.pin) !== PIN) return json(res, 401, { error: '핀코드가 올바르지 않습니다.' });
      const token = crypto.randomBytes(16).toString('hex');
      tokens.add(token);
      state.tokens = [...tokens].slice(-20);
      save();
      return json(res, 200, { token });
    }
    if (action === 'check') return json(res, 200, { ok: isPresenter(body) });

    // ----- 참여자 입장 -----
    if (action === 'join') {
      const name = cleanLine(body.name, 20);
      if (!cid || !name) return json(res, 400, { error: '이름을 입력해 주십시오.' });
      const pick = Number(body.group);
      const hits = lookup(name);
      let group = null, matched = false;
      if (hits.length === 1) { group = hits[0].group; matched = true; }
      else if (hits.length > 1) {
        if (hits.some((h) => h.group === pick)) { group = pick; matched = true; }
        else return json(res, 200, { candidates: hits.map((h) => ({ group: h.group, note: h.note })) });
      } else if (pick >= 1 && pick <= NG) group = pick;
      else return json(res, 200, { notFound: true, rosterSize: state.roster.length });
      const real = hits.find((h) => h.group === group);
      const finalName = real ? real.name : name;
      state.people[cid] = { name: finalName, group, ts: Date.now() };
      save(); broadcast();
      return json(res, 200, { ok: true, name: finalName, group, matched });
    }
    if (action === 'leave') {
      if (cid) delete state.people[cid];
      save(); broadcast();
      return json(res, 200, { ok: true });
    }

    // ----- 분임장 -----
    if (action === 'claim') {
      if (!me) return json(res, 401, { error: '먼저 이름을 입력해 주십시오.' });
      const cur = state.leaders[me.group];
      if (cur && cur !== me.name) return json(res, 409, { error: `이미 ${cur} 선생님이 분임장으로 작성 중입니다.` });
      state.leaders[me.group] = me.name;
      save(); broadcast();
      return json(res, 200, { ok: true });
    }
    if (action === 'report') {
      if (!me) return json(res, 401, { error: '먼저 이름을 입력해 주십시오.' });
      if (state.leaders[me.group] !== me.name) return json(res, 403, { error: '분임장만 작성할 수 있습니다.' });
      const prev = state.reports[me.group] || {};
      const rep = { by: me.name, ts: Date.now(), status: body.submit ? 'done' : (prev.status || 'draft') };
      const f = body.fields || {};
      for (const fd of CFG.FIELDS) rep[fd.key] = cleanText(f[fd.key], 800);
      state.reports[me.group] = rep;
      save(); broadcast();
      return json(res, 200, { ok: true, status: rep.status });
    }

    // ----- 분임원 개인 의견 · 댓글 -----
    if (action === 'note') {
      if (!me) return json(res, 401, { error: '먼저 이름을 입력해 주십시오.' });
      const f = body.fields || {};
      const n = { ts: Date.now() };
      for (const fd of CFG.FIELDS) n[fd.key] = cleanText(f[fd.key], 600);
      (state.notes[me.group] = state.notes[me.group] || {})[me.name] = n;
      save(); broadcast();
      return json(res, 200, { ok: true });
    }
    if (action === 'comment') {
      const g = Number(body.g);
      const t = cleanText(body.text, 200);
      if (!(g >= 1 && g <= NG)) return json(res, 400, { error: 'bad group' });
      if (!t) return json(res, 400, { error: '댓글 내용을 입력해 주십시오.' });
      const name = body.anon || !me ? '' : me.name;
      (state.comments[g] = state.comments[g] || []).push({ id: rid(), t, name, ts: Date.now() });
      save(); broadcast();
      return json(res, 200, { ok: true });
    }

    // ----- 참여자 응답 -----
    if (action === 'respond') {
      const slide = Number(body.slide);
      const cfg = INTERACTIONS[slide];
      if (!cfg || !cid) return json(res, 400, { error: 'bad request' });
      if (slide !== state.slide) return json(res, 409, { error: '지금은 응답할 수 없는 화면입니다.' });
      if (state.reveal[slide]) return json(res, 409, { error: '정답이 공개되어 응답이 마감되었습니다.' });
      const bucket = (state.responses[slide] = state.responses[slide] || {});
      const v = body.value;
      if (cfg.type === 'choice') {
        const n = Number(v);
        if (!(n >= 1 && n <= cfg.options.length)) return json(res, 400, { error: 'bad value' });
        bucket[cid] = n;
      } else if (cfg.type === 'multi') {
        const arr = [...new Set([].concat(v).map(Number))].filter((n) => n >= 1 && n <= cfg.options.length);
        if (arr.length > cfg.max) return json(res, 400, { error: `최대 ${cfg.max}개까지 선택할 수 있습니다.` });
        if (arr.length) bucket[cid] = arr; else delete bucket[cid];
      } else if (cfg.type === 'like') {
        if (v) bucket[cid] = 1; else delete bucket[cid];
      } else if (cfg.type === 'text') {
        const t = cleanText(v, cfg.len);
        if (!t) return json(res, 400, { error: '내용을 입력해 주십시오.' });
        const arr = (bucket[cid] = bucket[cid] || []);
        if (arr.length >= cfg.max) return json(res, 429, { error: `최대 ${cfg.max}개까지 보낼 수 있습니다.` });
        arr.push({ id: rid(), t, ts: Date.now() });
      } else {
        const t = cleanLine(v, 20);
        if (!t) return json(res, 400, { error: '단어를 입력해 주십시오.' });
        if (cfg.chars && t.replace(/\s+/g, '').length > cfg.chars) return json(res, 400, { error: `${cfg.chars}글자 이내로 입력해 주십시오.` });
        const arr = (bucket[cid] = bucket[cid] || []);
        if (arr.length >= cfg.max) return json(res, 429, { error: `최대 ${cfg.max}개까지 보낼 수 있습니다.` });
        if (arr.some((w) => norm(w.t) === norm(t))) return json(res, 409, { error: '이미 보낸 단어입니다.' });
        arr.push({ t, ts: Date.now() });
      }
      save(); broadcast();
      return json(res, 200, { ok: true });
    }
    if (action === 'question') {
      const text = cleanText(body.text, 300);
      if (!text) return json(res, 400, { error: '내용을 입력해 주십시오.' });
      state.questions.push({ id: rid(), text, name: cleanLine(body.name, 20), ts: Date.now(), done: false });
      save(); broadcast();
      return json(res, 200, { ok: true });
    }

    // ----- 발표자 전용 -----
    if (!isPresenter(body)) return json(res, 401, { error: '발표자 인증이 필요합니다.' });
    if (action === 'slide') {
      const n = Number(body.slide);
      if (n >= 1 && n <= TOTAL_SLIDES) state.slide = n;
    } else if (action === 'reset') {
      delete state.responses[Number(body.slide)];
      delete state.reveal[Number(body.slide)];
    } else if (action === 'reveal') {
      const s = Number(body.slide);
      if (body.on && s in ANSWERS) state.reveal[s] = true; else delete state.reveal[s];
    } else if (action === 'ohide') {
      for (const bucket of Object.values(state.responses)) {
        for (const v of Object.values(bucket)) {
          if (!Array.isArray(v)) continue;
          const o = v.find((x) => x && x.id === body.id);
          if (o) o.hidden = true;
        }
      }
      if (state.spotlight === 'o:' + body.id) state.spotlight = null;
    } else if (action === 'qdone') {
      const q = state.questions.find((x) => x.id === body.id);
      if (q) q.done = !q.done;
    } else if (action === 'qdelete') {
      state.questions = state.questions.filter((x) => x.id !== body.id);
      if (state.spotlight === body.id) state.spotlight = null;
    } else if (action === 'spotlight') {
      state.spotlight = body.id || null;
    } else if (action === 'timer') {
      const t = state.timer, now = Date.now();
      const left = () => (t.end ? Math.max(0, t.end - now) : t.left);
      if (body.op === 'set') { t.dur = Math.max(1, Math.min(120, Number(body.min) || 20)) * 60000; t.end = null; t.left = t.dur; }
      else if (body.op === 'start') { if (!t.end && t.left > 0) { t.end = now + t.left; t.left = null; } }
      else if (body.op === 'pause') { if (t.end) { t.left = left(); t.end = null; } }
      else if (body.op === 'add') { const d = (Number(body.min) || 1) * 60000; if (t.end) t.end = Math.max(now, t.end + d); else t.left = Math.max(0, t.left + d); }
      else if (body.op === 'reset') { t.end = null; t.left = t.dur; }
    } else if (action === 'roster') {
      if (typeof body.text === 'string') {
        state.roster = parseRoster(body.text);
        fs.writeFile(ROSTER_FILE, '﻿이름,분임,분임장,비고\n' + rosterText().replace(/\t/g, ','), () => {});
        state.leaders = {};
        applyRosterLeaders();
        // 이미 입장한 사람은 새 명단 기준으로 분임 재배정
        for (const p of Object.values(state.people)) {
          const hits = lookup(p.name);
          if (hits.length === 1) { p.group = hits[0].group; p.name = hits[0].name; }
        }
        save(); broadcast();
      }
      return json(res, 200, { ok: true, count: state.roster.length, text: rosterText() });
    } else if (action === 'admin') {
      return json(res, 200, { roster: rosterText(), people: Object.values(state.people) });
    } else if (action === 'release') {
      delete state.leaders[Number(body.g)];
    } else if (action === 'reopen') {
      const r = state.reports[Number(body.g)];
      if (r) r.status = 'draft';
    } else if (action === 'chide') {
      const c = (state.comments[Number(body.g)] || []).find((x) => x.id === body.id);
      if (c) c.hidden = true;
    } else if (action === 'clearPeople') {
      state.people = {};
    } else {
      return json(res, 404, { error: 'unknown action' });
    }
    save(); broadcast();
    return json(res, 200, { ok: true });
  }

  if (req.method === 'GET') return serveStatic(req, res, p);
  json(res, 405, { error: 'method not allowed' });
});

server.listen(PORT, '0.0.0.0', () => {
  const url = process.env.PUBLIC_URL || `http://${lanAddress()}:${PORT}/`;
  console.log(`\n  ▶ ${CFG.EVENT.title} 발표 서버가 시작되었습니다.`);
  console.log(`  · 참여자 접속 주소 (QR): ${url}`);
  console.log(`  · 발표자 화면:          ${url.replace(/\/$/, '')}/presenter  (핀코드 ${PIN})`);
  console.log(`  · 명단: ${state.roster.length}명 등록됨 (roster.csv 또는 발표자 화면 '분임 관리'에서 입력)\n`);
});
