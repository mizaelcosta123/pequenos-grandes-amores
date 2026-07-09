import { createIcons, icons } from 'https://cdn.jsdelivr.net/npm/lucide@latest/+esm';

// Backend URL, configured per deployment via <meta name="backend"> in index.html.
const BACKEND = (document.querySelector('meta[name="backend"]') && document.querySelector('meta[name="backend"]').content) || 'http://localhost:3000';
const app = document.getElementById('app');

let authToken = localStorage.getItem('authToken') || null;

let state = {
  user: null,
  profile: null,
  view: 'discover',
  deck: [],
  matches: [],
  chatWith: null,
  chatMessages: [],
  radius: parseInt(localStorage.getItem('radius')) || 50,
  hasLocation: false,
};

const RADIUS_OPTIONS = [5, 10, 25, 50, 100, 250, 0]; // 0 = qualquer distância

// Ask the browser for the current position and store it on the backend.
function getPosition(){
  return new Promise((resolve, reject)=>{
    if(!navigator.geolocation){ reject(new Error('no_geo')); return; }
    navigator.geolocation.getCurrentPosition(
      pos=>resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      err=>reject(err),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  });
}
async function updateMyLocation(){
  const coords = await getPosition();
  const { profile } = await api('/location', { method:'POST', body: JSON.stringify(coords) });
  state.profile = profile;
  return profile;
}

const INTERESTS = ['Cinema','Música','Viagens','Cozinhar','Games','Leitura','Dança','Esportes','Arte','Fotografia','Natureza','Café','Pets','Praia','Séries','Humor'];

function el(html){ const t=document.createElement('template'); t.innerHTML=html.trim(); return t.content.firstElementChild; }
function refreshIcons(){ createIcons({ icons }); }
function esc(s){ return (s||'').toString().replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

async function api(path, opts={}){
  const headers = { 'Content-Type':'application/json' };
  if(authToken) headers['Authorization'] = 'Bearer ' + authToken;
  const res = await fetch(BACKEND + path, { ...opts, headers });
  let data;
  try { data = await res.json(); } catch(e){ data = {}; }
  if(!res.ok){ const err = new Error(data.error||('http_'+res.status)); err.data=data; throw err; }
  return data;
}

// ---------- Auth ----------
async function init(){
  renderLoading();
  if(!authToken){ renderLanding(); return; }
  try {
    const { user } = await api('/auth/me');
    state.user = user;
  } catch(e){ authToken=null; localStorage.removeItem('authToken'); renderLanding(); return; }
  await loadProfile();
}

async function loadProfile(){
  renderLoading();
  try {
    const { profile } = await api('/profile/me');
    state.profile = profile;
  } catch(e){ state.profile = null; }
  if(!state.profile){ renderEditProfile(true); }
  else { state.view='discover'; renderMain(); loadDeck(); }
}

// Custom login/signup screen (replaces Puter auth)
function signIn(){ showAuth(); }
function showAuth(){
  app.innerHTML='';
  const wrap = el(`
  <div class="min-h-screen flex flex-col items-center justify-center px-6 text-center max-w-md mx-auto w-full">
    <div class="floaty mb-6">
      <div class="w-20 h-20 rounded-[2rem] bg-brand flex items-center justify-center">
        <i data-lucide="heart-handshake" class="text-white w-10 h-10"></i>
      </div>
    </div>
    <h1 class="font-display text-3xl font-extrabold tracking-tight text-ink">Entrar</h1>
    <p class="mt-2 text-ink/60">Acesse ou crie sua conta para continuar.</p>
    <div class="flex gap-2 mt-6 w-full">
      <button id="tabLogin" class="flex-1 py-2.5 rounded-2xl font-semibold text-sm border ${true?'bg-brand text-white border-brand':'bg-white text-ink/70 border-black/10'}">Entrar</button>
      <button id="tabSignup" class="flex-1 py-2.5 rounded-2xl font-semibold text-sm border bg-white text-ink/70 border-black/10">Criar conta</button>
    </div>
    <form id="authForm" class="w-full mt-4 space-y-3 text-left">
      <input id="authUser" autocomplete="username" placeholder="Usuário (3-20 letras/números)" class="w-full rounded-2xl border border-black/10 bg-white p-3.5 text-sm focus:outline-none focus:border-brand">
      <input id="authPass" type="password" autocomplete="current-password" placeholder="Senha (mín. 4 caracteres)" class="w-full rounded-2xl border border-black/10 bg-white p-3.5 text-sm focus:outline-none focus:border-brand">
      <p id="authErr" class="text-sm text-red-500 hidden"></p>
      <button id="authSubmit" class="w-full bg-brand hover:bg-brand-dark text-white font-semibold py-4 rounded-2xl transition-colors flex items-center justify-center gap-2">
        <i data-lucide="log-in" class="w-5 h-5"></i> Entrar
      </button>
    </form>
    <button id="authBack" class="mt-4 text-sm text-ink/40">Voltar</button>
  </div>`);
  app.appendChild(wrap);
  let mode = 'login';
  const tabLogin = wrap.querySelector('#tabLogin');
  const tabSignup = wrap.querySelector('#tabSignup');
  const submit = wrap.querySelector('#authSubmit');
  function setMode(m){
    mode = m;
    const isLogin = m==='login';
    tabLogin.className = `flex-1 py-2.5 rounded-2xl font-semibold text-sm border ${isLogin?'bg-brand text-white border-brand':'bg-white text-ink/70 border-black/10'}`;
    tabSignup.className = `flex-1 py-2.5 rounded-2xl font-semibold text-sm border ${!isLogin?'bg-brand text-white border-brand':'bg-white text-ink/70 border-black/10'}`;
    submit.innerHTML = isLogin ? '<i data-lucide="log-in" class="w-5 h-5"></i> Entrar' : '<i data-lucide="user-plus" class="w-5 h-5"></i> Criar conta';
    wrap.querySelector('#authErr').classList.add('hidden');
    refreshIcons();
  }
  tabLogin.onclick = ()=>setMode('login');
  tabSignup.onclick = ()=>setMode('signup');
  wrap.querySelector('#authBack').onclick = renderLanding;
  wrap.querySelector('#authForm').onsubmit = async (e)=>{
    e.preventDefault();
    const username = wrap.querySelector('#authUser').value.trim();
    const password = wrap.querySelector('#authPass').value;
    const errEl = wrap.querySelector('#authErr');
    if(!username || !password){ errEl.textContent='Preencha usuário e senha.'; errEl.classList.remove('hidden'); return; }
    submit.disabled = true; submit.innerHTML = 'Aguarde...';
    try {
      const { token, user } = await api('/auth/' + (mode==='login'?'login':'signup'), { method:'POST', body: JSON.stringify({ username, password }) });
      authToken = token; localStorage.setItem('authToken', token);
      state.user = user;
      await loadProfile();
    } catch(err){
      const msg = (err && err.message) || 'Erro';
      errEl.textContent = msg==='username_taken' ? 'Esse usuário já existe.' :
        msg==='bad_credentials' ? 'Usuário ou senha incorretos.' :
        msg==='invalid_username' ? 'Usuário inválido (3-20 caracteres, só letras/números).' :
        msg==='weak_password' ? 'Senha muito curta (mín. 4).' : 'Não foi possível entrar. Tente novamente.';
      errEl.classList.remove('hidden');
      submit.disabled = false; setMode(mode);
    }
  };
  refreshIcons();
}

// ---------- Rendering: shells ----------
function renderLoading(){
  app.innerHTML = '';
  app.appendChild(el(`<div class="min-h-screen flex flex-col items-center justify-center gap-4">
    <div class="floaty"><div class="w-16 h-16 rounded-3xl bg-brand flex items-center justify-center"><i data-lucide="heart" class="text-white w-8 h-8"></i></div></div>
    <p class="text-ink/50 font-medium">Carregando...</p>
  </div>`));
  refreshIcons();
}

function renderLanding(){
  app.innerHTML='';
  app.appendChild(el(`
  <div class="min-h-screen flex flex-col">
    <div class="flex-1 flex flex-col items-center justify-center px-6 text-center max-w-md mx-auto w-full">
      <div class="floaty mb-8">
        <div class="w-24 h-24 rounded-[2rem] bg-brand flex items-center justify-center">
          <i data-lucide="heart-handshake" class="text-white w-12 h-12"></i>
        </div>
      </div>
      <h1 class="font-display text-4xl font-extrabold tracking-tight text-ink">Pequenos<br>Grandes Amores</h1>
      <p class="mt-4 text-ink/60 text-lg leading-relaxed">O app de relacionamentos feito para pessoas de baixa estatura encontrarem conexões de verdade. 💗</p>
      <ul class="mt-8 space-y-3 text-left w-full">
        ${[['sparkles','Perfis reais e verificados pela comunidade'],['message-circle-heart','Converse quando o interesse é mútuo'],['shield-check','Um espaço seguro, acolhedor e respeitoso']].map(([i,t])=>`
        <li class="flex items-center gap-3 bg-white rounded-2xl p-4 border border-black/5">
          <div class="w-9 h-9 rounded-xl bg-brand-light flex items-center justify-center shrink-0"><i data-lucide="${i}" class="w-5 h-5 text-brand"></i></div>
          <span class="text-sm font-medium text-ink/80">${t}</span>
        </li>`).join('')}
      </ul>
      <button id="signInBtn" class="mt-8 w-full bg-brand hover:bg-brand-dark text-white font-semibold py-4 rounded-2xl text-lg transition-colors flex items-center justify-center gap-2">
        <i data-lucide="log-in" class="w-5 h-5"></i> Entrar e começar
      </button>
      <p class="mt-4 text-xs text-ink/40">Ao entrar, você concorda em manter o respeito com todos.</p>
    </div>
  </div>`));
  document.getElementById('signInBtn').onclick = signIn;
  refreshIcons();
}

// ---------- Profile editor ----------
function renderEditProfile(isNew){
  const p = state.profile || {};
  const selected = new Set(p.interests||[]);
  app.innerHTML='';
  const wrap = el(`
  <div class="min-h-screen max-w-md mx-auto w-full">
    <header class="sticky top-0 bg-[#f6f2f7]/90 backdrop-blur border-b border-black/5 px-5 py-4 flex items-center gap-3 z-10">
      ${isNew?'':'<button id="backBtn" class="w-9 h-9 rounded-full hover:bg-black/5 flex items-center justify-center"><i data-lucide="arrow-left" class="w-5 h-5"></i></button>'}
      <h1 class="font-display font-bold text-xl">${isNew?'Criar seu perfil':'Editar perfil'}</h1>
    </header>
    <div class="p-5 space-y-5 pb-28">
      <div class="flex flex-col items-center">
        <div id="photoWrap" class="relative w-32 h-32 rounded-full bg-brand-light border-2 border-brand/20 overflow-hidden flex items-center justify-center cursor-pointer">
          ${p.photo?`<img src="${esc(p.photo)}" class="w-full h-full object-cover">`:'<i data-lucide="camera" class="w-8 h-8 text-brand/50"></i>'}
          <div class="absolute bottom-0 inset-x-0 bg-brand text-white text-[11px] font-semibold py-1 text-center">Foto</div>
        </div>
        <input type="file" id="photoInput" accept="image/*" class="hidden">
        <p class="text-xs text-ink/40 mt-2">Toque para escolher uma foto</p>
      </div>

      ${field('name','Nome','Como quer ser chamado(a)', p.name||'')}
      <div class="grid grid-cols-2 gap-3">
        ${field('age','Idade','Ex: 28', p.age||'', 'number')}
        ${field('height','Altura (cm)','Ex: 135', p.height||'', 'number')}
      </div>
      ${field('city','Cidade','Ex: São Paulo, SP', p.city||'')}

      <div>
        <label class="block text-sm font-semibold mb-2">Eu sou</label>
        <div class="grid grid-cols-3 gap-2" id="genderGroup">
          ${['Mulher','Homem','Não-binário'].map(g=>chip('gender',g,p.gender===g)).join('')}
        </div>
      </div>
      <div>
        <label class="block text-sm font-semibold mb-2">Procuro por</label>
        <div class="grid grid-cols-3 gap-2" id="seekingGroup">
          ${['Mulheres','Homens','Todos'].map(g=>chip('seeking',g,p.seeking===g)).join('')}
        </div>
      </div>

      <div>
        <label class="block text-sm font-semibold mb-1">Sobre mim</label>
        <textarea id="bio" rows="3" maxlength="500" placeholder="Conte um pouco sobre você, o que ama e o que procura..." class="w-full rounded-2xl border border-black/10 bg-white p-3.5 text-sm focus:outline-none focus:border-brand resize-none">${esc(p.bio||'')}</textarea>
      </div>

      <div>
        <label class="block text-sm font-semibold mb-2">Interesses</label>
        <div class="flex flex-wrap gap-2" id="interests">
          ${INTERESTS.map(i=>`<button type="button" data-int="${i}" class="int-chip px-3.5 py-2 rounded-full text-sm font-medium border ${selected.has(i)?'bg-brand text-white border-brand':'bg-white text-ink/70 border-black/10'}">${i}</button>`).join('')}
        </div>
      </div>
      <p id="formErr" class="text-sm text-red-500 hidden"></p>
    </div>
    <div class="fixed bottom-0 inset-x-0 max-w-md mx-auto p-4 bg-gradient-to-t from-[#f6f2f7] via-[#f6f2f7] to-transparent">
      <button id="saveBtn" class="w-full bg-brand hover:bg-brand-dark text-white font-semibold py-4 rounded-2xl transition-colors flex items-center justify-center gap-2">
        <i data-lucide="check" class="w-5 h-5"></i> ${isNew?'Criar perfil':'Salvar alterações'}
      </button>
    </div>
  </div>`);
  app.appendChild(wrap);

  let photoData = p.photo||'';
  const photoInput = wrap.querySelector('#photoInput');
  wrap.querySelector('#photoWrap').onclick = ()=>photoInput.click();
  photoInput.onchange = ()=>{
    const f = photoInput.files[0]; if(!f) return;
    if(f.size > 4*1024*1024){ alert('Escolha uma imagem de até 4MB.'); return; }
    const reader = new FileReader();
    reader.onload = ()=>{
      photoData = reader.result;
      const pw = wrap.querySelector('#photoWrap');
      pw.innerHTML = `<img src="${photoData}" class="w-full h-full object-cover"><div class="absolute bottom-0 inset-x-0 bg-brand text-white text-[11px] font-semibold py-1 text-center">Foto</div>`;
    };
    reader.readAsDataURL(f);
  };

  // single-select chips
  wrap.querySelectorAll('#genderGroup .sel-chip, #seekingGroup .sel-chip').forEach(btn=>{
    btn.onclick = ()=>{
      const group = btn.parentElement;
      group.querySelectorAll('.sel-chip').forEach(b=>{ b.classList.remove('bg-brand','text-white','border-brand'); b.classList.add('bg-white','text-ink/70','border-black/10'); });
      btn.classList.add('bg-brand','text-white','border-brand'); btn.classList.remove('bg-white','text-ink/70','border-black/10');
      group.dataset.value = btn.dataset.value;
    };
  });
  wrap.querySelector('#genderGroup').dataset.value = p.gender||'';
  wrap.querySelector('#seekingGroup').dataset.value = p.seeking||'';

  wrap.querySelectorAll('.int-chip').forEach(btn=>{
    btn.onclick = ()=>{
      const on = btn.classList.toggle('bg-brand');
      btn.classList.toggle('text-white', on); btn.classList.toggle('border-brand', on);
      btn.classList.toggle('bg-white', !on); btn.classList.toggle('text-ink/70', !on); btn.classList.toggle('border-black/10', !on);
    };
  });

  const back = wrap.querySelector('#backBtn');
  if(back) back.onclick = ()=>{ state.view='profile'; renderMain(); };

  wrap.querySelector('#saveBtn').onclick = async ()=>{
    const name = wrap.querySelector('[name="name"]').value.trim();
    const age = wrap.querySelector('[name="age"]').value.trim();
    const height = wrap.querySelector('[name="height"]').value.trim();
    const city = wrap.querySelector('[name="city"]').value.trim();
    const gender = wrap.querySelector('#genderGroup').dataset.value;
    const seeking = wrap.querySelector('#seekingGroup').dataset.value;
    const bio = wrap.querySelector('#bio').value.trim();
    const interests = [...wrap.querySelectorAll('.int-chip.bg-brand')].map(b=>b.dataset.int);
    const errEl = wrap.querySelector('#formErr');
    if(!name || !age || !gender || !seeking){ errEl.textContent='Preencha ao menos nome, idade, gênero e quem você procura.'; errEl.classList.remove('hidden'); window.scrollTo(0,0); return; }
    const btn = wrap.querySelector('#saveBtn'); btn.disabled=true; btn.innerHTML='Salvando...';
    try {
      const { profile } = await api('/profile', { method:'POST', body: JSON.stringify({ name, age, height, city, gender, seeking, bio, interests, photo: photoData }) });
      state.profile = profile;
      // On first profile creation, try to capture location for distance search.
      if(isNew && (profile.lat==null || profile.lng==null)){
        btn.innerHTML='Obtendo localização...';
        try { await updateMyLocation(); } catch(e){}
      }
      state.view='discover'; renderMain(); loadDeck();
    } catch(e){ errEl.textContent='Erro ao salvar. Tente novamente.'; errEl.classList.remove('hidden'); btn.disabled=false; btn.innerHTML='Salvar'; }
  };
  refreshIcons();
}
function field(name,label,ph,val,type='text'){
  return `<div><label class="block text-sm font-semibold mb-1">${label}</label>
  <input name="${name}" type="${type}" value="${esc(val)}" placeholder="${ph}" class="w-full rounded-2xl border border-black/10 bg-white p-3.5 text-sm focus:outline-none focus:border-brand"></div>`;
}
function chip(group,val,active){
  return `<button type="button" data-value="${val}" class="sel-chip px-2 py-2.5 rounded-xl text-sm font-medium border ${active?'bg-brand text-white border-brand':'bg-white text-ink/70 border-black/10'}">${val}</button>`;
}

// ---------- Main shell with nav ----------
function renderMain(){
  app.innerHTML='';
  const shell = el(`
  <div class="min-h-screen max-w-md mx-auto w-full flex flex-col">
    <header class="sticky top-0 bg-[#f6f2f7]/90 backdrop-blur border-b border-black/5 px-5 py-3.5 flex items-center justify-between z-10">
      <div class="flex items-center gap-2">
        <div class="w-8 h-8 rounded-xl bg-brand flex items-center justify-center"><i data-lucide="heart" class="w-4 h-4 text-white"></i></div>
        <span class="font-display font-bold text-lg">Pequenos Amores</span>
      </div>
      <button id="profBtn" class="w-9 h-9 rounded-full overflow-hidden bg-brand-light border border-brand/20 flex items-center justify-center">
        ${state.profile&&state.profile.photo?`<img src="${esc(state.profile.photo)}" class="w-full h-full object-cover">`:'<i data-lucide="user" class="w-4 h-4 text-brand"></i>'}
      </button>
    </header>
    <main id="mainContent" class="flex-1 flex flex-col"></main>
    <nav class="sticky bottom-0 bg-white border-t border-black/5 grid grid-cols-3 max-w-md mx-auto w-full">
      ${navBtn('discover','flame','Descobrir')}
      ${navBtn('matches','messages-square','Matches')}
      ${navBtn('profile','user','Perfil')}
    </nav>
  </div>`);
  app.appendChild(shell);
  shell.querySelector('#profBtn').onclick=()=>{ state.view='profile'; renderMain(); };
  shell.querySelectorAll('[data-nav]').forEach(b=>{
    b.onclick=()=>{ state.view=b.dataset.nav; renderMain();
      if(state.view==='discover') loadDeck();
      if(state.view==='matches') loadMatches();
    };
  });
  const content = shell.querySelector('#mainContent');
  if(state.view==='discover') renderDiscover(content);
  else if(state.view==='matches') renderMatches(content);
  else if(state.view==='profile') renderProfileView(content);
  refreshIcons();
}
function navBtn(id,icon,label){
  const active = state.view===id;
  return `<button data-nav="${id}" class="py-2.5 flex flex-col items-center gap-0.5 ${active?'text-brand':'text-ink/40'}">
    <i data-lucide="${icon}" class="w-5 h-5"></i>
    <span class="text-[11px] font-semibold">${label}</span>
  </button>`;
}

// ---------- Discover ----------
async function loadDeck(){
  try {
    const q = state.radius > 0 ? ('?radius=' + state.radius) : '';
    const { profiles, hasLocation } = await api('/discover' + q);
    state.deck = profiles;
    state.hasLocation = !!hasLocation;
  } catch(e){ state.deck=[]; }
  if(state.view==='discover') renderMain();
}
function radiusLabel(r){ return r > 0 ? (r + ' km') : 'Qualquer'; }

function openRadiusSheet(){
  const overlay = el(`<div class="fixed inset-0 z-50 flex items-end justify-center" style="background:rgba(0,0,0,0.4)">
    <div class="bg-white w-full max-w-md rounded-t-3xl p-5 pb-8">
      <div class="w-10 h-1.5 rounded-full bg-black/10 mx-auto mb-4"></div>
      <h2 class="font-display font-bold text-xl mb-1">Distância máxima</h2>
      <p class="text-sm text-ink/50 mb-4">Mostrar pessoas dentro do raio que você escolher.</p>
      <div id="radiusList" class="grid grid-cols-2 gap-2">
        ${RADIUS_OPTIONS.map(r=>`<button data-r="${r}" class="radius-opt py-3 rounded-2xl text-sm font-semibold border ${state.radius===r?'bg-brand text-white border-brand':'bg-white text-ink/70 border-black/10'}">${radiusLabel(r)}</button>`).join('')}
      </div>
    </div>
  </div>`);
  document.body.appendChild(overlay);
  overlay.onclick=(e)=>{ if(e.target===overlay) overlay.remove(); };
  overlay.querySelectorAll('.radius-opt').forEach(b=>{
    b.onclick=()=>{ state.radius = parseInt(b.dataset.r); localStorage.setItem('radius', state.radius); overlay.remove(); renderMain(); loadDeck(); };
  });
}
function renderDiscover(content){
  content.innerHTML='';
  if(!state.deck.length){
    const radiusMsg = state.radius>0
      ? `Ninguém dentro de <b>${state.radius} km</b> por enquanto. Tente aumentar a distância máxima.`
      : 'Você já viu todos os perfis disponíveis. Volte mais tarde para conhecer novas pessoas! 💗';
    const locMsg = !state.hasLocation ? '<p class="text-ink/50 text-sm max-w-xs">Ative sua localização no seu perfil para buscar pessoas por perto.</p>' : '';
    content.appendChild(el(`<div class="flex-1 flex flex-col items-center justify-center text-center p-8 gap-3">
      <div class="w-20 h-20 rounded-3xl bg-brand-light flex items-center justify-center"><i data-lucide="search-x" class="w-9 h-9 text-brand"></i></div>
      <h2 class="font-display font-bold text-xl">Ninguém por perto agora</h2>
      <p class="text-ink/50 text-sm max-w-xs">${radiusMsg}</p>
      ${locMsg}
      <div class="flex gap-2 mt-2">
        <button id="radiusBtn2" class="bg-white border border-black/10 text-ink font-semibold px-5 py-3 rounded-2xl flex items-center gap-2"><i data-lucide="sliders-horizontal" class="w-4 h-4"></i> Distância</button>
        <button id="reloadBtn" class="bg-brand text-white font-semibold px-5 py-3 rounded-2xl flex items-center gap-2"><i data-lucide="refresh-cw" class="w-4 h-4"></i> Atualizar</button>
      </div>
    </div>`));
    content.querySelector('#reloadBtn').onclick=loadDeck;
    content.querySelector('#radiusBtn2').onclick=openRadiusSheet;
    refreshIcons(); return;
  }
  const stack = el(`<div class="flex-1 flex flex-col p-4">
    <button id="radiusBtn" class="self-center mb-3 flex items-center gap-2 bg-white border border-black/10 rounded-full pl-3 pr-4 py-2 text-sm font-semibold text-ink/80">
      <i data-lucide="map-pin" class="w-4 h-4 text-brand"></i>
      <span>${state.radius>0?('Até '+state.radius+' km'):'Qualquer distância'}</span>
      <i data-lucide="chevron-down" class="w-4 h-4 text-ink/40"></i>
    </button>
    <div id="cardStack" class="relative flex-1 min-h-[420px]"></div>
    <div class="flex items-center justify-center gap-5 py-5">
      <button id="passBtn" class="w-16 h-16 rounded-full bg-white border border-black/10 flex items-center justify-center text-ink/40 active:scale-90 transition-transform"><i data-lucide="x" class="w-8 h-8"></i></button>
      <button id="infoBtn" class="w-12 h-12 rounded-full bg-white border border-black/10 flex items-center justify-center text-sky-500 active:scale-90 transition-transform"><i data-lucide="info" class="w-5 h-5"></i></button>
      <button id="likeBtn" class="w-16 h-16 rounded-full bg-brand flex items-center justify-center text-white active:scale-90 transition-transform"><i data-lucide="heart" class="w-8 h-8"></i></button>
    </div>
  </div>`);
  content.appendChild(stack);
  const stackEl = stack.querySelector('#cardStack');
  // render up to 3 cards, topmost last
  const show = state.deck.slice(0,3).reverse();
  show.forEach((p,idx)=>{
    const isTop = idx===show.length-1;
    const depth = show.length-1-idx;
    const card = buildCard(p);
    card.style.zIndex = idx;
    card.style.transform = `scale(${1-depth*0.04}) translateY(${depth*10}px)`;
    if(isTop) enableDrag(card, p);
    stackEl.appendChild(card);
  });
  stack.querySelector('#radiusBtn').onclick=openRadiusSheet;
  stack.querySelector('#passBtn').onclick=()=>animateTop('pass');
  stack.querySelector('#likeBtn').onclick=()=>animateTop('like');
  stack.querySelector('#infoBtn').onclick=()=>{ const p=state.deck[0]; if(p) openProfileModal(p); };
  refreshIcons();
}

function buildCard(p){
  const initials = (p.name||'?').slice(0,1).toUpperCase();
  const photo = p.photo ? `<img src="${esc(p.photo)}" class="absolute inset-0 w-full h-full object-cover">`
    : `<div class="absolute inset-0 bg-brand-light flex items-center justify-center"><span class="font-display text-7xl font-extrabold text-brand/40">${initials}</span></div>`;
  const card = el(`<div class="swipe-card absolute inset-0 rounded-3xl overflow-hidden bg-white border border-black/5 select-none">
    ${photo}
    <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent"></div>
    <div class="card-stamp like-stamp absolute top-8 left-6 border-4 border-green-400 text-green-400 font-display font-extrabold text-3xl px-3 py-1 rounded-xl -rotate-12">CURTIR</div>
    <div class="card-stamp nope-stamp absolute top-8 right-6 border-4 border-red-400 text-red-400 font-display font-extrabold text-3xl px-3 py-1 rounded-xl rotate-12">PASSAR</div>
    <div class="absolute bottom-0 inset-x-0 p-5 text-white">
      <div class="flex items-end gap-2">
        <h2 class="font-display font-extrabold text-3xl leading-tight">${esc(p.name||'')}${p.age?`, ${p.age}`:''}</h2>
      </div>
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-white/90 text-sm">
        ${p.height?`<span class="flex items-center gap-1"><i data-lucide="ruler" class="w-3.5 h-3.5"></i>${p.height} cm</span>`:''}
        ${(p.distance!==null&&p.distance!==undefined)?`<span class="flex items-center gap-1"><i data-lucide="map-pin" class="w-3.5 h-3.5"></i>${p.distance<=1?'a menos de 1':'a '+p.distance} km</span>`:(p.city?`<span class="flex items-center gap-1"><i data-lucide="map-pin" class="w-3.5 h-3.5"></i>${esc(p.city)}</span>`:'')}
      </div>
      ${p.bio?`<p class="mt-2 text-sm text-white/85 line-clamp-2">${esc(p.bio)}</p>`:''}
      ${(p.interests&&p.interests.length)?`<div class="flex flex-wrap gap-1.5 mt-3">${p.interests.slice(0,4).map(i=>`<span class="text-[11px] font-medium bg-white/20 backdrop-blur px-2.5 py-1 rounded-full">${esc(i)}</span>`).join('')}</div>`:''}
    </div>
  </div>`);
  return card;
}

function enableDrag(card, p){
  let startX=0, startY=0, dx=0, dy=0, dragging=false;
  const like = card.querySelector('.like-stamp');
  const nope = card.querySelector('.nope-stamp');
  function down(x,y){ dragging=true; startX=x; startY=y; card.style.transition='none'; }
  function move(x,y){
    if(!dragging) return;
    dx=x-startX; dy=y-startY;
    const rot = dx/18;
    card.style.transform=`translate(${dx}px,${dy}px) rotate(${rot}deg)`;
    like.style.opacity = dx>0 ? Math.min(dx/100,1) : 0;
    nope.style.opacity = dx<0 ? Math.min(-dx/100,1) : 0;
  }
  function up(){
    if(!dragging) return; dragging=false;
    card.style.transition='transform .3s ease';
    if(dx>110){ fling(card,'like',p); }
    else if(dx<-110){ fling(card,'pass',p); }
    else { card.style.transform=''; like.style.opacity=0; nope.style.opacity=0; }
  }
  card.addEventListener('touchstart',e=>down(e.touches[0].clientX,e.touches[0].clientY),{passive:true});
  card.addEventListener('touchmove',e=>move(e.touches[0].clientX,e.touches[0].clientY),{passive:true});
  card.addEventListener('touchend',up);
  card.addEventListener('mousedown',e=>{ down(e.clientX,e.clientY); const mm=ev=>move(ev.clientX,ev.clientY); const mu=()=>{ up(); document.removeEventListener('mousemove',mm); document.removeEventListener('mouseup',mu);}; document.addEventListener('mousemove',mm); document.addEventListener('mouseup',mu); });
  card._fling = (dir)=>fling(card,dir,p);
}

let animating=false;
function animateTop(dir){
  const stackEl = document.getElementById('cardStack');
  if(!stackEl) return;
  const top = stackEl.lastElementChild;
  if(top && top._fling) top._fling(dir);
}
function fling(card, dir, p){
  if(animating) return; animating=true;
  card.style.transition='transform .4s ease, opacity .4s ease';
  const off = dir==='like'? window.innerWidth : -window.innerWidth;
  card.style.transform=`translate(${off}px, -40px) rotate(${dir==='like'?25:-25}deg)`;
  card.style.opacity='0';
  const swiped = state.deck.shift();
  doSwipe(swiped, dir);
  setTimeout(()=>{ animating=false; renderMain(); }, 300);
}
async function doSwipe(p, dir){
  try {
    const res = await api('/swipe', { method:'POST', body: JSON.stringify({ target:p.username, action: dir }) });
    if(res.matched){ setTimeout(()=>showMatch(res.targetProfile||p), 350); }
  } catch(e){}
}

function showMatch(p){
  const overlay = el(`<div class="fixed inset-0 z-50 flex flex-col items-center justify-center p-8 text-center" style="background:rgba(43,34,51,0.92)">
    <div class="pop">
      <p class="font-display text-white/70 font-semibold tracking-widest uppercase text-sm">É um match!</p>
      <h2 class="font-display text-white text-4xl font-extrabold mt-2">Vocês se curtiram 💗</h2>
      <div class="flex items-center justify-center gap-4 my-8">
        ${avatarBubble(state.profile)}
        <div class="w-12 h-12 rounded-full bg-brand flex items-center justify-center"><i data-lucide="heart" class="w-6 h-6 text-white"></i></div>
        ${avatarBubble(p)}
      </div>
      <p class="text-white/80 mb-8">Que tal começar uma conversa com <b>${esc(p.name||'')}</b>?</p>
      <button id="matchChatBtn" class="w-full max-w-xs bg-brand text-white font-semibold py-4 rounded-2xl flex items-center justify-center gap-2"><i data-lucide="message-circle" class="w-5 h-5"></i> Enviar mensagem</button>
      <button id="matchLaterBtn" class="w-full max-w-xs text-white/70 font-medium py-3 mt-2">Continuar descobrindo</button>
    </div>
  </div>`);
  document.body.appendChild(overlay);
  overlay.querySelector('#matchLaterBtn').onclick=()=>overlay.remove();
  overlay.querySelector('#matchChatBtn').onclick=()=>{ overlay.remove(); openChat(p); };
  refreshIcons();
}
function avatarBubble(p){
  if(p&&p.photo) return `<div class="w-20 h-20 rounded-full overflow-hidden border-4 border-white"><img src="${esc(p.photo)}" class="w-full h-full object-cover"></div>`;
  const i=(p&&p.name||'?').slice(0,1).toUpperCase();
  return `<div class="w-20 h-20 rounded-full border-4 border-white bg-brand-light flex items-center justify-center font-display text-2xl font-bold text-brand">${i}</div>`;
}

function openProfileModal(p){
  const overlay = el(`<div class="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style="background:rgba(0,0,0,0.4)">
    <div class="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl max-h-[85vh] overflow-y-auto no-scrollbar">
      <div class="relative h-72">
        ${p.photo?`<img src="${esc(p.photo)}" class="w-full h-full object-cover">`:`<div class="w-full h-full bg-brand-light flex items-center justify-center"><span class="font-display text-7xl font-extrabold text-brand/40">${(p.name||'?').slice(0,1).toUpperCase()}</span></div>`}
        <button id="closeModal" class="absolute top-4 right-4 w-9 h-9 rounded-full bg-black/40 text-white flex items-center justify-center"><i data-lucide="x" class="w-5 h-5"></i></button>
      </div>
      <div class="p-5">
        <h2 class="font-display font-extrabold text-2xl">${esc(p.name||'')}${p.age?`, ${p.age}`:''}</h2>
        <div class="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-ink/60 text-sm">
          ${p.height?`<span class="flex items-center gap-1"><i data-lucide="ruler" class="w-4 h-4"></i>${p.height} cm</span>`:''}
          ${p.city?`<span class="flex items-center gap-1"><i data-lucide="map-pin" class="w-4 h-4"></i>${esc(p.city)}</span>`:''}
          ${p.gender?`<span class="flex items-center gap-1"><i data-lucide="user" class="w-4 h-4"></i>${esc(p.gender)}</span>`:''}
        </div>
        ${p.bio?`<p class="mt-4 text-sm text-ink/80 leading-relaxed">${esc(p.bio)}</p>`:''}
        ${(p.interests&&p.interests.length)?`<div class="mt-4"><h3 class="text-xs font-bold uppercase text-ink/40 mb-2">Interesses</h3><div class="flex flex-wrap gap-2">${p.interests.map(i=>`<span class="text-sm font-medium bg-brand-light text-brand px-3 py-1.5 rounded-full">${esc(i)}</span>`).join('')}</div></div>`:''}
      </div>
    </div>
  </div>`);
  document.body.appendChild(overlay);
  overlay.querySelector('#closeModal').onclick=()=>overlay.remove();
  overlay.onclick=(e)=>{ if(e.target===overlay) overlay.remove(); };
  refreshIcons();
}

// ---------- Matches ----------
async function loadMatches(){
  try { const { matches } = await api('/matches'); state.matches=matches; }
  catch(e){ state.matches=[]; }
  if(state.view==='matches') renderMain();
}
function renderMatches(content){
  content.innerHTML='';
  if(!state.matches.length){
    content.appendChild(el(`<div class="flex-1 flex flex-col items-center justify-center text-center p-8 gap-3">
      <div class="w-20 h-20 rounded-3xl bg-brand-light flex items-center justify-center"><i data-lucide="heart" class="w-9 h-9 text-brand"></i></div>
      <h2 class="font-display font-bold text-xl">Nenhum match ainda</h2>
      <p class="text-ink/50 text-sm max-w-xs">Continue descobrindo perfis. Quando o interesse for mútuo, o match aparece aqui! 💗</p>
    </div>`));
    refreshIcons(); return;
  }
  const list = el(`<div class="p-4 space-y-2"></div>`);
  state.matches.forEach(m=>{
    const p=m.profile;
    const last = m.lastMessage;
    const preview = last ? (last.from===state.user.username?'Você: ':'')+last.text : 'Vocês deram match! Diga oi 👋';
    const row = el(`<button class="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-white transition-colors text-left">
      <div class="w-14 h-14 rounded-full overflow-hidden bg-brand-light border border-brand/10 flex items-center justify-center shrink-0">
        ${p.photo?`<img src="${esc(p.photo)}" class="w-full h-full object-cover">`:`<span class="font-display font-bold text-xl text-brand/50">${(p.name||'?').slice(0,1).toUpperCase()}</span>`}
      </div>
      <div class="min-w-0 flex-1">
        <div class="font-display font-bold text-ink">${esc(p.name||'')}${p.age?`, ${p.age}`:''}</div>
        <div class="text-sm text-ink/50 truncate ${last?'':'italic'}">${esc(preview)}</div>
      </div>
      <i data-lucide="chevron-right" class="w-5 h-5 text-ink/30"></i>
    </button>`);
    row.onclick=()=>openChat(p);
    list.appendChild(row);
  });
  content.appendChild(list);
  refreshIcons();
}

// ---------- Chat ----------
async function openChat(p){
  state.chatWith=p;
  app.innerHTML='';
  const view = el(`<div class="min-h-screen max-w-md mx-auto w-full flex flex-col">
    <header class="sticky top-0 bg-white/95 backdrop-blur border-b border-black/5 px-3 py-3 flex items-center gap-3 z-10">
      <button id="chatBack" class="w-9 h-9 rounded-full hover:bg-black/5 flex items-center justify-center"><i data-lucide="arrow-left" class="w-5 h-5"></i></button>
      <div class="w-10 h-10 rounded-full overflow-hidden bg-brand-light flex items-center justify-center shrink-0">
        ${p.photo?`<img src="${esc(p.photo)}" class="w-full h-full object-cover">`:`<span class="font-display font-bold text-brand/50">${(p.name||'?').slice(0,1).toUpperCase()}</span>`}
      </div>
      <div class="min-w-0"><div class="font-display font-bold leading-tight truncate">${esc(p.name||'')}</div><div class="text-xs text-ink/40">${esc(p.city||'')}</div></div>
      <button id="chatInfo" class="ml-auto w-9 h-9 rounded-full hover:bg-black/5 flex items-center justify-center"><i data-lucide="info" class="w-5 h-5 text-ink/50"></i></button>
    </header>
    <div id="msgs" class="flex-1 overflow-y-auto no-scrollbar p-4 space-y-2 bg-[#f6f2f7]"></div>
    <form id="chatForm" class="sticky bottom-0 bg-white border-t border-black/5 p-3 flex items-center gap-2">
      <input id="chatInput" autocomplete="off" placeholder="Mensagem..." class="flex-1 rounded-full bg-[#f0ecf2] px-4 py-3 text-sm focus:outline-none">
      <button type="submit" class="w-11 h-11 rounded-full bg-brand text-white flex items-center justify-center shrink-0"><i data-lucide="send" class="w-5 h-5"></i></button>
    </form>
  </div>`);
  app.appendChild(view);
  view.querySelector('#chatBack').onclick=()=>{ state.view='matches'; renderMain(); loadMatches(); };
  view.querySelector('#chatInfo').onclick=()=>openProfileModal(p);
  const form=view.querySelector('#chatForm');
  const input=view.querySelector('#chatInput');
  form.onsubmit=async(e)=>{ e.preventDefault(); const text=input.value.trim(); if(!text) return; input.value='';
    state.chatMessages.push({ from: state.user.username, text, ts: Date.now(), pending:true });
    renderMessages();
    try { await api('/messages', { method:'POST', body: JSON.stringify({ to:p.username, text }) }); }
    catch(err){}
    await fetchMessages(false);
  };
  refreshIcons();
  await fetchMessages(true);
  startChatPolling();
}
let chatPoll=null;
function startChatPolling(){ stopChatPolling(); chatPoll=setInterval(()=>{ if(state.chatWith) fetchMessages(false); else stopChatPolling(); }, 3500); }
function stopChatPolling(){ if(chatPoll){ clearInterval(chatPoll); chatPoll=null; } }
async function fetchMessages(scroll){
  if(!state.chatWith) return;
  try { const { messages } = await api('/messages?with='+encodeURIComponent(state.chatWith.username)); state.chatMessages=messages||[]; }
  catch(e){ if(!state.chatMessages) state.chatMessages=[]; }
  renderMessages(scroll);
}
function renderMessages(scroll){
  const box=document.getElementById('msgs'); if(!box) return;
  const me=state.user.username;
  if(!state.chatMessages.length){
    box.innerHTML=`<div class="h-full flex flex-col items-center justify-center text-center text-ink/40 gap-2 py-10"><i data-lucide="message-circle-heart" class="w-10 h-10 text-brand/40"></i><p class="text-sm">Comece a conversa com um oi! 👋</p></div>`;
    refreshIcons(); return;
  }
  box.innerHTML=state.chatMessages.map(m=>{
    const mine=m.from===me;
    return `<div class="flex ${mine?'justify-end':'justify-start'}"><div class="max-w-[75%] px-3.5 py-2 rounded-2xl text-sm ${mine?'bg-brand text-white rounded-br-md':'bg-white text-ink rounded-bl-md border border-black/5'}">${esc(m.text)}<div class="text-[10px] ${mine?'text-white/60':'text-ink/30'} mt-0.5 text-right">${fmtTime(m.ts)}</div></div></div>`;
  }).join('');
  refreshIcons();
  if(scroll!==false) box.scrollTop=box.scrollHeight;
}
function fmtTime(ts){ const d=new Date(ts); return d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}); }

// ---------- Profile view ----------
function renderProfileView(content){
  const p=state.profile;
  content.innerHTML='';
  content.appendChild(el(`<div class="p-5">
    <div class="bg-white rounded-3xl overflow-hidden border border-black/5">
      <div class="relative h-64">
        ${p.photo?`<img src="${esc(p.photo)}" class="w-full h-full object-cover">`:`<div class="w-full h-full bg-brand-light flex items-center justify-center"><span class="font-display text-7xl font-extrabold text-brand/40">${(p.name||'?').slice(0,1).toUpperCase()}</span></div>`}
      </div>
      <div class="p-5">
        <h2 class="font-display font-extrabold text-2xl">${esc(p.name||'')}${p.age?`, ${p.age}`:''}</h2>
        <div class="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-ink/60 text-sm">
          ${p.height?`<span class="flex items-center gap-1"><i data-lucide="ruler" class="w-4 h-4"></i>${p.height} cm</span>`:''}
          ${p.city?`<span class="flex items-center gap-1"><i data-lucide="map-pin" class="w-4 h-4"></i>${esc(p.city)}</span>`:''}
        </div>
        <div class="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-ink/60 text-sm">
          ${p.gender?`<span class="flex items-center gap-1"><i data-lucide="user" class="w-4 h-4"></i>${esc(p.gender)}</span>`:''}
          ${p.seeking?`<span class="flex items-center gap-1"><i data-lucide="search" class="w-4 h-4"></i>Procura: ${esc(p.seeking)}</span>`:''}
        </div>
        ${p.bio?`<p class="mt-4 text-sm text-ink/80 leading-relaxed">${esc(p.bio)}</p>`:''}
        ${(p.interests&&p.interests.length)?`<div class="mt-4"><h3 class="text-xs font-bold uppercase text-ink/40 mb-2">Interesses</h3><div class="flex flex-wrap gap-2">${p.interests.map(i=>`<span class="text-sm font-medium bg-brand-light text-brand px-3 py-1.5 rounded-full">${esc(i)}</span>`).join('')}</div></div>`:''}
      </div>
    </div>
    <div class="mt-4 bg-white rounded-2xl border border-black/5 p-4 flex items-center gap-3">
      <div class="w-10 h-10 rounded-xl ${(p.lat!=null&&p.lng!=null)?'bg-green-50':'bg-brand-light'} flex items-center justify-center shrink-0"><i data-lucide="${(p.lat!=null&&p.lng!=null)?'map-pin-check':'map-pin-off'}" class="w-5 h-5 ${(p.lat!=null&&p.lng!=null)?'text-green-500':'text-brand'}"></i></div>
      <div class="min-w-0 flex-1">
        <div class="font-semibold text-sm">Localização</div>
        <div class="text-xs text-ink/50">${(p.lat!=null&&p.lng!=null)?'Ativada — buscando pessoas por perto':'Desativada — ative para buscar por distância'}</div>
      </div>
      <button id="locBtn" class="shrink-0 bg-brand text-white text-sm font-semibold px-4 py-2 rounded-xl">${(p.lat!=null&&p.lng!=null)?'Atualizar':'Ativar'}</button>
    </div>
    <button id="editBtn" class="mt-4 w-full bg-white border border-black/10 text-ink font-semibold py-3.5 rounded-2xl flex items-center justify-center gap-2"><i data-lucide="pencil" class="w-4 h-4"></i> Editar perfil</button>
    <button id="signOutBtn" class="mt-2 w-full text-ink/50 font-medium py-3 rounded-2xl flex items-center justify-center gap-2"><i data-lucide="log-out" class="w-4 h-4"></i> Sair</button>
  </div>`));
  content.querySelector('#editBtn').onclick=()=>renderEditProfile(false);
  const locBtn = content.querySelector('#locBtn');
  locBtn.onclick=async()=>{
    locBtn.disabled=true; const orig=locBtn.textContent; locBtn.textContent='...';
    try { await updateMyLocation(); renderMain(); }
    catch(e){
      locBtn.disabled=false; locBtn.textContent=orig;
      alert(e && e.code===1 ? 'Permissão de localização negada. Autorize no navegador para buscar pessoas por perto.' : 'Não foi possível obter sua localização. Tente novamente.');
    }
  };
  content.querySelector('#signOutBtn').onclick=()=>{ authToken=null; localStorage.removeItem('authToken'); state.user=null; state.profile=null; renderLanding(); };
  refreshIcons();
}

init();
