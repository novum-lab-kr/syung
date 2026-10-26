// 회원: 메뉴 서랍 맨 위 로그인 줄 + '내 정보' 쪽(출퇴근 집 · 회사 · 시각 · 요일, 로그아웃, 탈퇴).
// 서버 주소는 server/routes/members.py. 로그인 방법이 하나도 설정되지 않았으면(/api/auth/providers 가 빈 목록 · 실패) 아무것도 보이지 않는다 —
// 로그인 안 한 화면은 지금과 같다. 본체가 지도를 다 띄운 뒤 import() 로 부른다(첫 화면 코드에 없음).
const $ = id => document.getElementById(id);
const CHANGE = {'X-Requested-With': 'syung'};   // 바꾸는 요청에 붙이는 머리말(서버가 확인한다)
const PROVIDERS = {kakao: '카카오로 계속하기', google: '구글로 계속하기', apple: 'Apple로 계속하기'};
const PROVIDER_NAMES = {kakao: '카카오', google: '구글', apple: 'Apple'};
const LOGIN_ERRORS = {
  denied: '로그인을 취소했어요.',
  provider: '로그인 서비스가 답하지 않아요. 잠시 뒤 다시 해 주세요.',
  limit: '시도가 너무 많아요. 10분 뒤 다시 해 주세요.',
};
const DAYS = ['월', '화', '수', '목', '금', '토', '일'];   // 1(월) … 7(일)

async function getJson(url) {
  const r = await fetch(url, {cache: 'no-store', credentials: 'same-origin'});
  return {status: r.status, body: r.headers.get('content-type')?.includes('json') ? await r.json() : null};
}

export async function initAccount() {
  const item = $('accountItem'), page = $('menuAccount');
  if (!item || !page) return;
  let providers = [];
  try { const r = await getJson('./api/auth/providers'); providers = r.status === 200 ? r.body?.providers || [] : []; } catch { return; }
  if (!providers.length) return;   // 설정 전: 로그인 줄을 숨긴 채로

  const msg = $('accountMsg');
  const say = text => { msg.textContent = text || ''; };
  let me = null;

  // 로그인 전: 제공자 버튼(그 주소로 이동하면 서버가 제공자 화면으로 보낸다)
  const list = $('accountProviders');
  list.replaceChildren(...providers.filter(p => PROVIDERS[p]).map(p => {
    const b = document.createElement('a');
    b.className = `login-button login-${p}`; b.href = `./api/auth/${p}/start`; b.textContent = PROVIDERS[p];
    return b;
  }));

  function show() {
    item.hidden = false;
    $('accountOut').hidden = !!me; $('accountIn').hidden = !me;
    const name = $('accountItemName');
    name.firstChild.textContent = me ? me.name : '로그인 · 가입';
    name.querySelector('small').textContent = me ? '내 정보 · 출퇴근' : '출퇴근을 저장해 두려면';
    page.setAttribute('aria-label', me ? '내 정보' : '로그인');
    if (me) $('accountWho').textContent = `${me.name} · ${PROVIDER_NAMES[me.provider] || me.provider}로 로그인`;
  }

  // ---- 출퇴근 ----
  const picked = {home: null, work: null};
  const dayBox = $('commuteDays');
  dayBox.replaceChildren(...DAYS.map((label, index) => {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = label; b.dataset.day = String(index + 1); b.setAttribute('aria-pressed', 'false');
    b.onclick = () => b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true'));
    return b;
  }));
  function bindPlace(which) {
    const input = $(which === 'home' ? 'commuteHome' : 'commuteWork'), found = $(which === 'home' ? 'commuteHomeList' : 'commuteWorkList');
    let timer = 0, seq = 0;
    input.addEventListener('input', () => {
      picked[which] = null; clearTimeout(timer);
      const q = input.value.trim();
      if (q.length < 2) { found.hidden = true; return; }
      timer = setTimeout(async () => {
        const my = ++seq;
        const row = text => { const li = document.createElement('li'); li.className = 'commute-empty'; li.textContent = text; return li; };
        try {
          const {body} = await getJson(`./api/place?q=${encodeURIComponent(q)}`);
          if (my !== seq) return;
          if (!body?.ok) found.replaceChildren(row('검색하지 못했어요'));
          else if (!body.places.length) found.replaceChildren(row('찾는 곳이 없어요'));
          else found.replaceChildren(...body.places.map(p => {
            const li = document.createElement('li'), b = document.createElement('button'), name = document.createElement('b'), addr = document.createElement('small');
            b.type = 'button'; name.textContent = p.name; addr.textContent = p.address; b.append(name, addr);
            b.onclick = () => { picked[which] = {name: p.name, lat: p.lat, lng: p.lng}; input.value = p.name; found.hidden = true; };
            li.append(b); return li;
          }));
          found.hidden = false;
        } catch { if (my === seq) { found.replaceChildren(row('검색하지 못했어요')); found.hidden = false; } }
      }, 300);
    });
  }
  bindPlace('home'); bindPlace('work');

  function fill(c) {
    picked.home = c.home; picked.work = c.work;
    $('commuteHome').value = c.home?.name || ''; $('commuteWork').value = c.work?.name || '';
    $('commuteLeave').value = c.leave || ''; $('commuteBack').value = c.back || '';
    for (const b of dayBox.children) b.setAttribute('aria-pressed', String(c.days.includes(+b.dataset.day)));
  }
  async function loadCommute() {
    try { const r = await getJson('./api/me/commute'); if (r.status === 200) fill(r.body); } catch { /* 다음에 열 때 다시 */ }
  }

  $('commuteForm').onsubmit = async e => {
    e.preventDefault();
    for (const which of ['home', 'work']) {
      const typed = $(which === 'home' ? 'commuteHome' : 'commuteWork').value.trim();
      if (typed && !picked[which]) { say(`${which === 'home' ? '집' : '회사'}은 검색 목록에서 골라 주세요.`); return; }
      if (!typed) picked[which] = null;
    }
    const body = {home: picked.home, work: picked.work, leave: $('commuteLeave').value || null, back: $('commuteBack').value || null,
      days: [...dayBox.children].filter(b => b.getAttribute('aria-pressed') === 'true').map(b => +b.dataset.day)};
    say('저장하는 중…');
    try {
      const r = await fetch('./api/me/commute', {method: 'PUT', credentials: 'same-origin', headers: {...CHANGE, 'Content-Type': 'application/json'}, body: JSON.stringify(body)});
      const d = await r.json().catch(() => null);
      if (r.status === 401) { me = null; show(); say('로그인이 끝났어요. 다시 로그인해 주세요.'); return; }
      if (!r.ok) { say(d?.error?.message || '저장하지 못했어요.'); return; }
      fill(d); say('저장했어요.');
    } catch { say('저장하지 못했어요. 연결을 확인해 주세요.'); }
  };

  $('accountLogout').onclick = async () => {
    try { await fetch('./api/auth/logout', {method: 'POST', credentials: 'same-origin', headers: CHANGE}); } catch { /* 쿠키는 서버가 지운다 */ }
    me = null; show(); say('로그아웃했어요.');
  };
  // 탈퇴는 두 번 누른다(첫 번째는 무엇이 지워지는지 알림)
  const quit = $('accountDelete');let quitArmed = false;
  quit.onclick = async () => {
    if (!quitArmed) { quitArmed = true; quit.textContent = '한 번 더 누르면 탈퇴 — 출퇴근 설정까지 모두 지워져요'; return; }
    try {
      const r = await fetch('./api/me', {method: 'DELETE', credentials: 'same-origin', headers: CHANGE});
      if (!r.ok && r.status !== 401) { say('탈퇴하지 못했어요. 잠시 뒤 다시 해 주세요.'); return; }
      me = null; show(); say('탈퇴했어요. 저장한 정보를 모두 지웠어요.');
    } catch { say('탈퇴하지 못했어요. 연결을 확인해 주세요.'); }
    quitArmed = false; quit.textContent = '탈퇴';
  };

  try { const r = await getJson('./api/me'); me = r.status === 200 ? r.body : null; } catch { me = null; }
  show();
  if (me) loadCommute();

  // 로그인에서 돌아옴(#login=ok · #login=<오류>): 주소를 지우고 메뉴의 그 쪽을 연다
  const back = /(?:^#|&)login=(\w+)/.exec(location.hash);
  if (back) {
    history.replaceState(null, '', location.pathname + location.search);
    say(back[1] === 'ok' ? (me ? '로그인했어요.' : '') : LOGIN_ERRORS[back[1]] || '로그인이 끝나지 않았어요. 다시 해 주세요.');
    $('settingsButton')?.click(); item.querySelector('.menu-item')?.click();
  }
}
