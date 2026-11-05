const get = (id) => document.getElementById(id);
const canvas = get('world');
const gl = canvas.getContext('webgl', { antialias: true, alpha: false });
const start = get('start');

if (!gl) {
  start.disabled = true;
  start.textContent = 'WEBGL INDISPONÍVEL';
  document.querySelector('.brief p').textContent = 'Ative a aceleração gráfica do navegador para jogar.';
} else {
  run();
}

function run() {
  const vertex = `
    attribute vec3 position, color;
    uniform vec3 eye, right, up, forward;
    uniform vec2 lens;
    varying vec3 tint;
    varying float depth;
    void main() {
      vec3 offset = position - eye;
      depth = dot(offset, forward);
      tint = color;
      gl_Position = vec4(dot(offset,right)*lens.x,dot(offset,up)*lens.y,depth*1.0008-0.09,depth);
    }`;
  const fragment = `
    precision mediump float;
    varying vec3 tint;
    varying float depth;
    uniform vec3 sky, ambient;
    void main() {
      float mist = smoothstep(16.0,88.0,depth)*0.72;
      gl_FragColor = vec4(mix(tint*ambient,sky,mist),1.0);
    }`;
  const program = gl.createProgram();
  for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]]) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(shader));
    gl.attachShader(program, shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(.73, .76, .62, 1);
  const attrs = ['position', 'color'].map(name => gl.getAttribLocation(program, name));
  const uniforms = Object.fromEntries(['eye', 'right', 'up', 'forward', 'lens', 'sky', 'ambient'].map(name => [name, gl.getUniformLocation(program, name)]));
  const scenery = gl.createBuffer();
  const actors = gl.createBuffer();
  let vertices = [];
  const colors = new Map();
  const walls = [];

  function triangle(a, b, c, color, light) {
    if (!colors.has(color)) {
      const rgb = [0, 2, 4].map(i => parseInt(color.slice(i, i + 2), 16) / 255);
      colors.set(color, rgb);
    }
    const tint = colors.get(color).map(value => value * light);
    for (const point of [a, b, c]) vertices.push(...point, ...tint);
  }

  function quad(a, b, c, d, color, light = 1) {
    triangle(a, b, c, color, light);
    triangle(a, c, d, color, light);
  }

  function box(x, y, z, w, h, d, color, solid = false) {
    const l = x - w / 2, r = x + w / 2, n = z - d / 2, f = z + d / 2, t = y + h;
    const a = [l,y,n], b = [r,y,n], c = [r,y,f], e = [l,y,f];
    const A = [l,t,n], B = [r,t,n], C = [r,t,f], E = [l,t,f];
    quad(A,B,C,E,color,1.08); quad(a,b,c,e,color,.55);
    quad(a,b,B,A,color,.94); quad(b,c,C,B,color,.73);
    quad(c,e,E,C,color,.81); quad(e,a,A,E,color,.89);
    if (solid) walls.push([l, y, n, r, t, f]);
  }

  function gem(x,y,z,w,h,d,color, rotation = 0) {
    const top = [x,y+h/2,z], bottom = [x,y-h/2,z];
    const rim = Array.from({length:8}, (_,i) => {
      const angle = i * Math.PI / 4 + rotation;
      return [x + Math.cos(angle)*w/2,y,z + Math.sin(angle)*d/2];
    });
    for (let i=0;i<8;i++) {
      const next = rim[(i+1)%8];
      triangle(top,rim[i],next,color,.86+.19*Math.cos(i*.79+1));
      triangle(bottom,rim[i],next,color,.65+.13*Math.cos(i*.79+1));
    }
  }

  let seed = 89103;
  function random() {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  }

  const streets = [
    'Rua dos Ipês','Rua das Mangueiras','Rua do Mirante','Rua dos Sabiás','Rua das Palmeiras',
    'Rua do Pomar','Rua das Bromélias','Rua dos Hibiscos','Rua da Fonte','Rua do Cajueiro'
  ].map((name,index) => ({name,z:(index-4)*28}));
  const homeStreet = streets[4];
  const cityBounds = [28,13,Math.max(...streets.map(street => Math.abs(street.z)))+14];
  const styles = [
    [-11,8,'ded2ac','b75a3c'], [0,10,'efe0b6','b75c40'], [11,8,'d3ddd0','537b78'],
    [-11,-7,'dbb897','8e594d'], [0,-10,'d1d9a7','707c53'], [11,-7,'ebc28a','a85037']
  ];
  const houses = [homeStreet,...streets.filter(street => street !== homeStreet)].flatMap(street =>
    styles.map(([x,offset],index) => {
      const [, ,wall,roof] = styles[(index+streets.indexOf(street)+2)%styles.length];
      return [x,street.z+offset,wall,roof,street];
    })
  );
  const missionNames = ['A hora do lanche','Ronda no quarteirão','O bairro em alerta','Ataque surpresa','Operação néctar'];
  const cameraDistance = 1.65;
  const people = [];
  const flowers = streets.flatMap(street => [[-17,street.z+1],[16,street.z-1],[6,street.z+4],[-6,street.z-4]]);
  const firstStreet = streets[0].z, lastStreet = streets.at(-1).z;
  const avenueCenter = (firstStreet+lastStreet)/2;
  const avenueLength = lastStreet-firstStreet+4.5;

  box(0,-.4,avenueCenter,180,.35,avenueLength+150,'627e50');
  for (const x of [-23,23]) {
    box(x,-.06,avenueCenter,4.5,.071,avenueLength,'555956');
    for (let z=firstStreet;z<lastStreet;z+=2.6) {
      if (!streets.some(street => Math.abs(z-street.z)<3.4)) box(x,.016,z,.055,.012,1.17,'ead294');
    }
  }
  for (const {z} of streets) {
    box(0,-.06,z,50.5,.07,4.5,'555956');
    for (const side of [-1,1]) {
      box(0,0,z+side*2.75,41,.12,1.15,'b6ae97');
      box(0,.12,z+side*2.22,41,.045,.13,'ded0b6');
    }
    for(let x=-18;x<19;x+=2.6) box(x,.016,z,1.17,.012,.055,'ead294');
    for(const side of [-1,1]) {
      for(let i=0;i<8;i++) box(side*(18+i*.32),.016,z,.16,.012,3.5,'e2dcc8');
    }
  }

  function house([x,z,wall,roof,street], index) {
    const sign = Math.sign(z-street.z);
    const front = z-sign*3;
    box(x,.005,z,8.5,.045,7.7,'6d8054');
    box(x,.03,z-sign*4,1.65,.09,2.8,'b4a790');
    box(x,.04,z,7.05,.14,6.1,'94806b',true);
    box(x,.18,z,6.75,.023,5.8,'be9d71');
    for(let j=-4;j<=4;j++) box(x+j*.73,.204,z,.014,.004,5.7,'ac8c66');
    box(x,.18,z+sign*3,7,2.8,.19,wall,true);
    for (const side of [-1,1]) box(x+side*3.5,.18,z,.19,2.8,6,wall,true);
    // The door and window are physical openings between wall segments.
    box(x-2.1,.18,front,2.8,2.8,.19,wall,true);
    box(x+.98,.18,front,.56,2.8,.19,wall,true);
    box(x+2.95,.18,front,1.1,2.8,.19,wall,true);
    box(x,.0,front,1.4,.18,.33,'bda58e');
    box(x,2.35,front,1.4,.63,.19,wall,true);
    box(x+1.83,.18,front,1.14,.95,.19,wall,true);
    box(x+1.83,2.13,front,1.14,.85,.19,wall,true);
    box(x+1.83,1.12,front,1.28,.065,.32,'fff0cf',true);
    box(x-.64,.18,front+sign*.59,.095,2.17,1.14,'765943',true);
    box(x-1.93,1.15,front-sign*.105,1.31,.99,.033,'f1e5be');
    box(x-1.93,1.24,front-sign*.129,1.15,.81,.027,'536c64');
    box(x-1.93,1.24,front-sign*.147,.042,.81,.022,'f1e5be');
    box(x-1.93,1.62,front-sign*.147,1.15,.042,.022,'f1e5be');
    box(x,2.98,z,7.1,.12,6.1,wall,true);
    const left = x-3.79, right = x+3.79, near = z-3.34, far = z+3.34;
    triangle([left,3.03,near],[x,4.66,near],[right,3.03,near],roof,.88);
    triangle([left,3.03,far],[x,4.66,far],[right,3.03,far],roof,.72);
    quad([left,3.03,near],[x,4.66,near],[x,4.66,far],[left,3.03,far],roof,1);
    quad([right,3.03,near],[x,4.66,near],[x,4.66,far],[right,3.03,far],roof,.8);
    for (const side of [-1,1]) {
      box(x+side*3.74,2.98,z,.13,.13,6.8,'efe0ba');
      for (let row=1;row<8;row++) box(x+side*row*.46,4.66-row*.198,z,.035,.02,6.65,roof);
    }
    box(x-1.25,3.98,z+1.26,.52,.99,.55,'9a6552');
    box(x-1.25,4.95,z+1.26,.68,.13,.66,'60483d');

    const couch = ['587764','a96150','757ba2'][index%3];
    box(x-2.12,.20,z+sign*1.32,2.23,.42,.94,couch,true);
    box(x-2.12,.60,z+sign*1.65,2.23,.47,.28,couch,true);
    for (const side of [-1,1]) box(x-2.12+side, .59,z+sign*1.24,.23,.18,.8,couch);
    box(x-1.31,.207,z-.25,2.6,.019,1.8,'a66e58');
    box(x-1.31,.227,z-.25,2.37,.012,1.58,'c68b67');
    box(x+2.32,.20,z+sign*1.1,1.45,.65,.85,'856041',true);
    box(x+2.32,.85,z+sign*1.1,1.58,.10,.96,'bd9567',true);
    gem(x+2.28,1.09,z+sign*1.1,.31,.34,.31,'688863');
    people.push({ x, z, street, index, target: index < 4, hit: false, next: 0 });
  }

  houses.forEach(house);

  function tree(x,z,size) {
    const shades = ['416544','688549','547744','7d964d'];
    box(x,0,z,.22*size,1.65*size,.23*size,'685440',true);
    for(let i=0;i<4;i++) {
      const angle=i*Math.PI/2;
      gem(x+Math.cos(angle)*.45*size,1.95*size+random()*.5,z+Math.sin(angle)*.45*size,1.85*size,2.05*size,1.9*size,shades[i],angle);
    }
    box(x,.001,z,2.45*size,.007,1.8*size,'557146');
  }

  for (const {z} of streets) {
    for (const [x,offset,size] of [[-17,7,1.3],[-6,11,1.15],[6,10,1.1],[17,8,1.55],[-17,-8,1.5],[-6,-10,1],[6,-11,1.2],[17,-6,1.3]]) {
      tree(x,z+offset,size);
    }
  }
  for (let i=0;i<92;i++) {
    const x=(random()-.5)*94, z=avenueCenter+(random()-.5)*(avenueLength+48);
    if (Math.abs(x)>27 || z<firstStreet-13 || z>lastStreet+13) tree(x,z,.68+random()*1.2);
  }
  for(const [x,z] of flowers){
    box(x,0,z,1.25,.19,1,'7e5d48',true);
    box(x,.19,z,1.13,.045,.88,'594535');
    for(let i=0;i<10;i++){
      const px=x+(random()-.5)*.98, pz=z+(random()-.5)*.74, h=.17+random()*.22;
      box(px,.22,pz,.027,h,.027,'618944');
      gem(px,.22+h,pz,.19,.17,.18,i%2?'ebae54':'e9dc8a');
    }
  }
  for (const street of streets) for (const x of [-19,-8,8,19]) for (const side of [-1,1]) {
    const z = street.z+side*2.96;
    box(x,.11,z,.085,2.65,.085,'495450');
    box(x,.11,z,.21,.15,.21,'6e7569');
    box(x,2.68,z,.33,.15,.32,'efcf8c');
    box(x,2.83,z,.38,.05,.36,'495450');
  }

  function upload(buffer, usage) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), usage);
    return vertices.length / 6;
  }

  function draw(buffer, count) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    attrs.forEach((location, index) => {
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location,3,gl.FLOAT,false,24,index*12);
    });
    gl.drawArrays(gl.TRIANGLES,0,count);
  }

  const sceneryCount = upload(scenery,gl.STATIC_DRAW);
  const map = get('map').getContext('2d');
  const stage = canvas.parentElement;
  const brief = get('brief');
  const hint = get('hint');
  const crosshair = document.querySelector('.crosshair');
  const keys = new Set();
  const touchDevice = matchMedia('(pointer: coarse)').matches ||
    (window.navigator?.maxTouchPoints > 0 && matchMedia('(any-pointer: coarse) and (max-width: 1024px)').matches);
  const portrait = matchMedia('(orientation: portrait)');
  const touchControls = get('touch-controls');
  const joystick = get('joystick');
  const stick = {pointer:null,x:0,y:0};
  stage.classList.toggle('touch-device',touchDevice);
  document.body.classList.toggle('touch-layout',touchDevice);
  if (touchDevice) get('flight-controls').textContent = 'Joystick para voar · Arraste a tela para mirar';
  const position = [1,1.52,1];
  const velocity = [0,0,0];
  let state = 'intro';
  let worldTime = 8;
  let campaign = Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
  let yaw = 0, pitch = 0, elapsed = 0, score = 0, energy = 100, notice = '', noticeUntil = 0;
  let missionIndex = 0, mission = generateMission(0);
  let cameraFraction = 1;
  let drag = null, last = performance.now();
  const title = brief.querySelector('h1');
  const description = brief.querySelector('p');

  const catalog = {
    species: [
      {id:'culex',name:'Culex',detail:'Corpo verde-oliva e asas claras',cost:0,body:'393e2d',band:'717856',wing:'d3dfac',span:1},
      {id:'aedes',name:'Aedes',detail:'Corpo escuro com faixas brancas',cost:90,body:'272d35',band:'e4e9e7',wing:'c0dbe4',span:1.1},
      {id:'anopheles',name:'Anopheles',detail:'Corpo dourado e asas alongadas',cost:150,body:'875b36',band:'e2b46e',wing:'f2d595',span:1.22}
    ],
    condition: [
      {id:'clean',name:'Sem contaminação',detail:'Aparência natural',cost:0},
      {id:'dengue',name:'Dengue',detail:'Partículas vermelhas · efeito visual',cost:110,tint:'ff7567'},
      {id:'zika',name:'Zika',detail:'Partículas violetas · efeito visual',cost:140,tint:'c68bff'}
    ]
  };
  const mutations = [
    {id:'ghost',name:'Asa Fantasma',detail:'Voe mais rápido sem mudar os controles.'},
    {id:'needle',name:'Agulha de Veludo',detail:'Pique de mais longe, antes de entrar no alcance da mão.'},
    {id:'nocturnal',name:'Sede Lunar',detail:'Gaste menos energia entre 18h e 6h.'},
    {id:'reflex',name:'Reflexo Relâmpago',detail:'Ganhe tempo extra para fugir após cada picada.'},
    {id:'shell',name:'Escudo de Quitina',detail:'Perca menos energia quando levar um tapa.'},
    {id:'nectar',name:'Bomba de Néctar',detail:'Recupere energia mais depressa ao pousar perto das flores.'}
  ];
  const storageKey = 'mosquito-simulator-customization-v1';
  const profile = {gold:0,owned:['culex','clean'],species:'culex',condition:'clean',rewards:{},xp:0,training:{},mutations:[]};
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (Number.isSafeInteger(saved?.gold) && saved.gold>=0) profile.gold = saved.gold;
    if (saved?.rewards && typeof saved.rewards === 'object') {
      profile.rewards = Object.fromEntries(Object.entries(saved.rewards).filter(([id,value]) =>
        /^[a-z0-9]+-[a-z0-9]+$/.test(id) && Number.isSafeInteger(value) && value>=0
      ));
    }
    if (Number.isSafeInteger(saved?.xp) && saved.xp>=0) profile.xp = saved.xp;
    if (Array.isArray(saved?.mutations)) {
      profile.mutations = saved.mutations.filter(id => mutations.some(item => item.id === id)).slice(0,xpLevel()-1);
    }
    if (saved?.training && typeof saved.training === 'object') {
      profile.training = Object.fromEntries(Object.entries(saved.training).filter(([id,mark]) =>
        /^[a-z0-9]+-[a-z0-9]+$/.test(id) && Array.isArray(mark) &&
        mark.length === 2 && mark.every(value => Number.isSafeInteger(value) && value>=0) && mark[1]<=12
      ));
    }
    for (const [category, items] of Object.entries(catalog)) {
      for (const item of items) {
        if (item.cost && Array.isArray(saved?.owned) && saved.owned.includes(item.id)) profile.owned.push(item.id);
      }
      if (items.some(item => item.id === saved?.[category] && profile.owned.includes(item.id))) profile[category] = saved[category];
    }
  } catch { /* The shop can still run for this session. */ }

  function saveProfile() {
    try {
      localStorage.setItem(storageKey,JSON.stringify(profile));
    } catch { /* Keep the current session playable. */ }
    get('gold').textContent = profile.gold;
  }
  get('gold').textContent = profile.gold;

  function xpLevel() {
    return 1+Math.floor((Math.sqrt(9+profile.xp/5)-3)/2);
  }

  const powers = {};
  function syncMutations() {
    for (const item of mutations) {
      const rank = profile.mutations.filter(id => id === item.id).length;
      powers[item.id] = {rank, strength:rank/(rank+2)};
    }
  }

  function syncXp() {
    const level = xpLevel();
    const earned = profile.xp-20*(level-1)*(level+2);
    const required = 80+40*(level-1);
    const pending = level-1-profile.mutations.length;
    get('xp-level').textContent = 'NÍVEL '+level;
    get('xp-count').textContent = earned+' / '+required+' XP';
    const bar = get('xp-bar');
    bar.max = required;
    bar.value = earned;
    get('pending-mutations').hidden = !pending;
    get('pending-mutations').textContent = '+'+pending;
    get('xp-available').hidden = !pending;
  }

  function mutationOffers() {
    const offset = profile.mutations.length*2;
    return Array.from({length:3},(_,index) => mutations[(offset+index)%mutations.length]);
  }

  function chooseMutation(item) {
    if (profile.mutations.length>=xpLevel()-1 || !mutationOffers().includes(item)) return false;
    profile.mutations.push(item.id);
    syncMutations();
    syncXp();
    saveProfile();
    return true;
  }

  function renderMutations() {
    const pending = xpLevel()-1-profile.mutations.length;
    get('mutation-summary').textContent = pending
      ? 'Nível '+xpLevel()+' · Escolha uma das três mutações. Você tem '+pending+' escolha(s).'
      : 'Nível '+xpLevel()+' · Ganhe XP com picadas e missões para liberar a próxima escolha.';
    const list = get('mutation-options');
    list.replaceChildren();
    for (const item of pending ? mutationOffers() : mutations.filter(item => powers[item.id].rank)) {
      const row = document.createElement('div');
      row.className = 'shop-item';
      const label = document.createElement('div');
      const name = document.createElement('strong');
      const detail = document.createElement('span');
      const rank = powers[item.id].rank;
      name.textContent = item.name+(rank ? ' · Grau '+rank : '');
      detail.textContent = item.detail;
      label.append(name,detail);
      row.append(label);
      if (pending) {
        const button = document.createElement('button');
        button.textContent = rank ? 'MELHORAR' : 'ESCOLHER';
        button.setAttribute('aria-label',button.textContent+' '+item.name);
        button.addEventListener('click', () => {
          if (!chooseMutation(item)) return;
          renderMutations();
          get('mutation-status').textContent = item.name+' · Grau '+powers[item.id].rank+' ativado.';
          (list.querySelector('button') ?? get('mutations').querySelector('.shop-close')).focus();
        });
        row.append(button);
      }
      list.append(row);
    }
  }

  function openMutations() {
    const dialog = get('mutations');
    if (state === 'playing' || dialog.open) return;
    get('mutation-status').textContent = '';
    renderMutations();
    dialog.showModal();
  }

  syncMutations();
  syncXp();
  get('open-mutations').addEventListener('click',openMutations);

  function equip(category,item) {
    const owned = profile.owned.includes(item.id);
    if (!owned && profile.gold < item.cost) return false;
    if (!owned) {
      profile.gold -= item.cost;
      profile.owned.push(item.id);
    }
    profile[category] = item.id;
    saveProfile();
    return true;
  }

  function renderShop() {
    get('shop-gold').textContent = profile.gold;
    const list = get('shop-items');
    list.replaceChildren();
    for (const [category,items] of Object.entries(catalog)) {
      const heading = document.createElement('h3');
      heading.textContent = category === 'species' ? 'Espécie' : 'Contaminação';
      list.append(heading);
      for (const item of items) {
        const row = document.createElement('div');
        row.className = 'shop-item';
        const label = document.createElement('div');
        const name = document.createElement('strong');
        const detail = document.createElement('span');
        const button = document.createElement('button');
        name.textContent = item.name;
        detail.textContent = item.detail;
        label.append(name,detail);
        const equipped = profile[category] === item.id;
        const owned = profile.owned.includes(item.id);
        button.textContent = equipped ? 'EQUIPADO' : owned ? 'EQUIPAR' : item.cost+' GOLD';
        button.disabled = equipped || (!owned && profile.gold < item.cost);
        button.setAttribute('aria-label', button.textContent+' · '+item.name);
        button.addEventListener('click', () => {
          if (!equip(category,item)) return;
          renderShop();
          get('shop-status').textContent = item.name+' equipado.';
          list.querySelector('button:not(:disabled)')?.focus();
        });
        row.append(label,button);
        list.append(row);
      }
    }
  }

  get('open-shop').addEventListener('click', () => {
    if (state === 'playing') overlay('paused');
    get('shop-status').textContent = '';
    renderShop();
    get('shop').showModal();
  });

  function missionRules(index) {
    return {
      title: missionNames[index%missionNames.length],
      count: Math.min(12,4+index*2),
      drain: Math.min(.85,.31+index*.16),
      reach: Math.max(.58,.96-index*.13),
      reaction: Math.max(.35,.85-index*.2),
      damage: Math.min(48,28+index*7)
    };
  }

  function generateMission(index, previous = new Set()) {
    const rules = missionRules(index);
    const district = index === 0 ? 4 : 1+Math.floor(Math.random()*(streets.length-2));
    const street = streets[district];
    const candidates = people.filter(person =>
      index === 0 ? person.street === street : Math.abs(person.street.z-street.z)<=28
    ).map(person => person.index);
    if (index > 0) {
      for (let i=candidates.length-1; i>0; i--) {
        const j = Math.floor(Math.random()*(i+1));
        [candidates[i],candidates[j]] = [candidates[j],candidates[i]];
      }
      candidates.sort((a,b) => Number(previous.has(a))-Number(previous.has(b)));
    }
    return {...rules, street, targets:new Set(candidates.slice(0,rules.count))};
  }

  function updateMissionHud() {
    get('mission-number').textContent = String(missionIndex+1).padStart(2,'0');
    get('mission-title').textContent = mission.title;
    get('goal').textContent = String(mission.count).padStart(2,'0');
  }

  const checkpointKey = 'mosquito-simulator-checkpoint-v1';
  const saveControls = get('save-controls');
  const saveButton = get('save-game');
  const loadButton = get('load-game');
  const saveStatus = get('save-status');

  function readCheckpoint() {
    try {
      return JSON.parse(localStorage.getItem(checkpointKey));
    } catch {
      return null;
    }
  }

  function showSaveControls() {
    const checkpoint = readCheckpoint();
    saveControls.hidden = state !== 'paused' && !(state === 'intro' && checkpoint);
    saveButton.hidden = state !== 'paused';
    loadButton.disabled = !checkpoint;
    saveStatus.textContent = '';
  }

  function saveGame() {
    if (state !== 'paused') return;
    const checkpoint = {
      campaign, missionIndex, district:streets.indexOf(mission.street),
      targets:[...mission.targets], position, yaw, pitch, elapsed, energy, worldTime,
      hits:people.filter(person => person.hit).map(person => [person.index,person.next,person.alert])
    };
    try {
      localStorage.setItem(checkpointKey,JSON.stringify(checkpoint));
      loadButton.disabled = false;
      saveStatus.textContent = 'Jogo salvo neste navegador.';
    } catch {
      saveStatus.textContent = 'O navegador não conseguiu salvar o jogo.';
    }
  }

  function loadGame() {
    if (state !== 'intro' && state !== 'paused') return;
    const saved = readCheckpoint();
    const valid = saved && typeof saved.campaign === 'string' && /^[a-z0-9]+-[a-z0-9]+$/.test(saved.campaign) &&
      Number.isSafeInteger(saved.missionIndex) && saved.missionIndex>=0 && Number.isInteger(saved.district) && streets[saved.district] &&
      Array.isArray(saved.targets) && saved.targets.length === missionRules(saved.missionIndex).count &&
      new Set(saved.targets).size === saved.targets.length && saved.targets.every(index => Number.isInteger(index) && people[index]) &&
      Array.isArray(saved.position) && saved.position.length === 3 && saved.position.every(Number.isFinite) &&
      [saved.yaw,saved.pitch,saved.elapsed,saved.energy,saved.worldTime].every(Number.isFinite) &&
      saved.energy>0 && saved.energy<=100 && Array.isArray(saved.hits) && saved.hits.length<saved.targets.length &&
      saved.hits.every(hit => Array.isArray(hit) && saved.targets.includes(hit[0]) && Number.isFinite(hit[1]) && Number.isFinite(hit[2])) &&
      new Set(saved.hits.map(hit => hit[0])).size === saved.hits.length;
    if (!valid) {
      saveStatus.textContent = 'Não foi possível carregar o jogo salvo.';
      return;
    }
    ({campaign,missionIndex,yaw,pitch,elapsed,energy,worldTime} = saved);
    mission = {...missionRules(missionIndex), street:streets[saved.district], targets:new Set(saved.targets)};
    position.splice(0,3,...saved.position);
    score = saved.hits.length;
    noticeUntil = 0;
    cameraFraction = 1;
    const hits = new Map(saved.hits.map(([index,next,alert]) => [index,{next,alert}]));
    for (const person of people) {
      const hit = hits.get(person.index);
      person.target = mission.targets.has(person.index);
      person.hit = Boolean(hit);
      person.next = hit?.next ?? 0;
      person.alert = hit?.alert ?? null;
      person.px = person.x+.87*Math.sin(elapsed*.94+person.index);
      person.pz = person.z+.88*Math.cos(elapsed*.94+person.index);
    }
    updateMissionHud();
    overlay('paused');
    saveStatus.textContent = 'Jogo carregado. Continue o voo quando quiser.';
  }

  saveButton.addEventListener('click',saveGame);
  loadButton.addEventListener('click',loadGame);
  showSaveControls();


  function inform(message) {
    notice = message;
    noticeUntil = elapsed + 2.6;
  }

  let flightAudio;

  function enableFlightAudio() {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    if (!flightAudio) {
      const context = new Audio();
      const wings = context.createOscillator();
      const volume = context.createGain();
      const harmonics = new Float32Array([0,1,.48,.28,.13,.06]);
      wings.setPeriodicWave(context.createPeriodicWave(new Float32Array(harmonics.length),harmonics));
      wings.frequency.value = 420;
      volume.gain.value = 0;
      wings.connect(volume);
      volume.connect(context.destination);
      wings.start();
      flightAudio = {context,wings,volume};
    }
    if (flightAudio.context.state !== 'running') flightAudio.context.resume().catch(() => {});
  }

  function updateFlightAudio(speed) {
    if (!flightAudio) return;
    const {context,wings,volume} = flightAudio;
    const effort = Math.min(1,speed/4.5);
    const audible = speed > .12 ? .025+.035*effort : 0;
    volume.gain.setTargetAtTime(audible,context.currentTime,.035);
    if (audible) wings.frequency.setTargetAtTime(405+effort*70,context.currentTime,.055);
  }

  function overlay(next) {
    state = next;
    keys.clear();
    velocity.fill(0);
    updateFlightAudio(0);
    drag = null;
    resetStick();
    brief.hidden = next === 'playing';
    crosshair.hidden = next !== 'playing';
    hint.hidden = true;
    stage.classList.toggle('playing', next === 'playing');
    touchControls.hidden = !touchDevice || next !== 'playing';
    showSaveControls();
    if (next === 'playing') return;
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    if (next === 'paused') {
      title.innerHTML = 'Voo<br><em>pausado.</em>';
      description.textContent = 'O bairro fica em pausa até você voltar.';
      start.textContent = '▶  CONTINUAR VOO';
    } else if (next === 'cleared') {
      title.innerHTML = 'Missão<br><em>cumprida.</em>';
      description.textContent = lastReward
        ? 'Você ganhou '+lastReward+' Gold. Use o saldo para personalizar o mosquito.'
        : 'A recompensa desta missão já foi recebida.';
      start.textContent = '▶  PRÓXIMA MISSÃO';
    } else if (next === 'lost') {
      title.innerHTML = 'Fim<br><em>do voo.</em>';
      description.textContent = 'Sua energia acabou. Visite as flores para se recuperar e desvie das mãos dos moradores.';
      start.textContent = '↻  TENTAR DE NOVO';
    }
    start.focus({preventScroll:true});
  }

  function play() {
    if (touchDevice && portrait.matches) return;
    enableFlightAudio();
    if (state !== 'paused') {
      if (state === 'cleared') mission = generateMission(++missionIndex,mission.targets);
      position.splice(0,3,0,1.52,mission.street.z+1);
      cameraFraction = 1;
      yaw = pitch = elapsed = score = 0;
      energy = 100;
      noticeUntil = 0;
      for (const person of people) {
        person.target = mission.targets.has(person.index);
        person.hit = false;
        person.next = 0;
        person.alert = null;
      }
      updateMissionHud();
      inform('Procure os alvos marcados no radar.');
    }
    overlay('playing');
    if (!touchDevice && canvas.requestPointerLock) {
      try { canvas.requestPointerLock()?.catch(() => {}); } catch { /* Drag is also available. */ }
    }
  }

  let lastReward = 0;

  function biteDistance(person) {
    const [x,y,z] = position;
    const heightGap = Math.max(.22-y,0,y-1.87);
    const horizontalGap = Math.max(0,Math.hypot(x-(person.px ?? person.x),z-(person.pz ?? person.z))-.24);
    return Math.hypot(horizontalGap,heightGap*2);
  }

  function hasBiteOpening(person) {
    const [x,y,z] = position;
    const dx = (person.px ?? person.x)-x;
    const dy = Math.max(.32,Math.min(1.82,y))-y;
    const dz = (person.pz ?? person.z)-z;
    const distance = Math.hypot(dx,dy,dz);
    const aim = (dx*Math.sin(yaw)+dz*Math.cos(yaw))*Math.cos(pitch)+dy*Math.sin(pitch);
    if (distance>.36 && aim<distance*.5) return false;

    const steps = Math.ceil(distance/.08);
    for (let step=1;step<steps;step++) {
      const fraction = step/steps;
      if (occupied([x+dx*fraction,y+dy*fraction,z+dz*fraction])) return false;
    }
    return true;
  }

  function residentInReach(requireOpening = true) {
    let resident = null;
    let nearest = mission.reach+.75*powers.needle.strength;
    for (const person of people) {
      if (!person.target || person.hit) continue;
      const distance = biteDistance(person);
      if (distance<=nearest && (!requireOpening || hasBiteOpening(person))) {
        resident = person;
        nearest = distance;
      }
    }
    return resident;
  }

  function bite() {
    if (state !== 'playing') return;
    const resident = residentInReach();
    if (!resident) {
      if (residentInReach(false)) {
        inform('Vire para o morador e deixe o caminho livre para picar.');
        return;
      }
      const close = people.find(person => biteDistance(person)<.35);
      inform(close?.hit ? 'Você já picou este morador.' : close ? 'Este morador não é alvo. Procure o marcador verde.' : 'Aproxime-se de um morador marcado em verde.');
      return;
    }
    resident.hit = true;
    resident.alert = elapsed;
    resident.next = elapsed + mission.reaction + .9*powers.reflex.strength;
    score++;
    energy = Math.min(100,energy+12);
    inform('Picada feita! Afaste-se da mão.');
    const cleared = score === mission.count;
    const highestReward = profile.rewards[campaign] ?? -1;
    const [trainedMission,trainedScore] = profile.training[campaign] ?? [-1,0];
    let xp = 0;
    if (missionIndex>highestReward && (missionIndex>trainedMission || (missionIndex===trainedMission && score>trainedScore))) {
      xp = 20;
      profile.training[campaign] = [missionIndex,score];
    }
    lastReward = 0;
    if (cleared && missionIndex>highestReward) {
      xp += 30+mission.count*5;
      lastReward = 50+10*mission.count;
      profile.gold += lastReward;
      profile.rewards[campaign] = missionIndex;
      delete profile.training[campaign];
    }
    if (xp) {
      const previousLevel = xpLevel();
      profile.xp += xp;
      syncXp();
      saveProfile();
      inform(xpLevel()>previousLevel ? 'Subiu de nível! Mutação disponível no menu de pausa.' : 'Picada feita! +'+xp+' XP. Afaste-se da mão.');
    }
    if (cleared) overlay('cleared');
  }

  start.addEventListener('click', play);
  portrait.addEventListener?.('change', event => {
    if (touchDevice && event.matches && state === 'playing') overlay('paused');
  });
  get('pause').addEventListener('click', () => { if (state === 'playing') overlay('paused'); });
  get('touch-bite').addEventListener('click', bite);
  window.addEventListener('keydown', event => {
    if (state !== 'playing') return;
    if (['KeyW','KeyA','KeyS','KeyD','KeyE','Escape'].includes(event.code)) event.preventDefault();
    if (event.code === 'Escape') overlay('paused');
    else if (event.code === 'KeyE' && !event.repeat) bite();
    else keys.add(event.code);
  });
  window.addEventListener('keyup', event => keys.delete(event.code));
  window.addEventListener('blur', () => { if (state === 'playing') overlay('paused'); });
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === canvas) return;
    if (state === 'playing') overlay('paused');
  });

  function look(dx,dy) {
    yaw += dx*.0032;
    pitch = Math.max(-1.45,Math.min(1.45,pitch-dy*.0032));
  }

  document.addEventListener('mousemove', event => {
    if (state === 'playing' && document.pointerLockElement === canvas) look(event.movementX,event.movementY);
  });
  canvas.addEventListener('pointerdown', event => {
    if (state !== 'playing' || drag || document.pointerLockElement === canvas) return;
    drag = {pointer:event.pointerId,x:event.clientX,y:event.clientY};
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', event => {
    if (drag?.pointer !== event.pointerId) return;
    look(event.clientX-drag.x,event.clientY-drag.y);
    drag.x = event.clientX;
    drag.y = event.clientY;
  });

  function resetStick() {
    const pointer = stick.pointer;
    stick.pointer = null;
    stick.x = stick.y = 0;
    joystick.style.removeProperty?.('--stick-x');
    joystick.style.removeProperty?.('--stick-y');
    if (pointer !== null && joystick.hasPointerCapture(pointer)) joystick.releasePointerCapture(pointer);
  }

  function moveStick(event) {
    const rect = joystick.getBoundingClientRect();
    const radius = rect.width*.31;
    const x = event.clientX-rect.left-rect.width/2;
    const y = event.clientY-rect.top-rect.height/2;
    const length = Math.hypot(x,y);
    const travel = Math.min(radius,length);
    const effort = Math.max(0,(travel/radius-.12)/.88);
    const unitX = length ? x/length : 0;
    const unitY = length ? y/length : 0;
    stick.x = unitX*effort;
    stick.y = -unitY*effort;
    joystick.style.setProperty('--stick-x',unitX*travel+'px');
    joystick.style.setProperty('--stick-y',unitY*travel+'px');
  }

  joystick.addEventListener('pointerdown', event => {
    if (state !== 'playing' || stick.pointer !== null) return;
    stick.pointer = event.pointerId;
    joystick.setPointerCapture(event.pointerId);
    moveStick(event);
  });
  joystick.addEventListener('pointermove', event => {
    if (stick.pointer === event.pointerId) moveStick(event);
  });
  for (const event of ['pointerup','pointercancel','lostpointercapture']) {
    canvas.addEventListener(event, input => {
      if (drag?.pointer === input.pointerId) drag = null;
    });
    joystick.addEventListener(event, input => {
      if (stick.pointer === input.pointerId) resetStick();
    });
  }

  function occupied([x,y,z]) {
    const r = .08;
    return walls.some(([l,b,n,right,t,f]) => x+r>l && x-r<right && y+r>b && y-r<t && z+r>n && z-r<f);
  }

  function update(dt) {
    elapsed += dt;
    worldTime = (worldTime+dt*24/180)%24;
    const ahead = +keys.has('KeyW') - +keys.has('KeyS') + stick.y;
    const side = +keys.has('KeyD') - +keys.has('KeyA') + stick.x;
    const speed = 4.5*(1+.45*powers.ghost.strength) / Math.max(1,Math.hypot(ahead,side));
    const level = Math.cos(pitch);
    const sin = Math.sin(yaw), cos = Math.cos(yaw);
    const targetVelocity = [
      (sin*ahead*level+cos*side)*speed,
      Math.sin(pitch)*ahead*speed,
      (cos*ahead*level-sin*side)*speed
    ];
    const response = 1-Math.exp(-22*dt);
    targetVelocity.forEach((target,index) => {
      velocity[index] += (target-velocity[index])*response;
      const old = position[index];
      const min = index === 1 ? .26 : index === 2 ? firstStreet-14 : -cityBounds[index];
      const max = cityBounds[index];
      const next = old+velocity[index]*dt;
      position[index] = Math.max(min,Math.min(max,next));
      if (position[index] !== next) velocity[index] = 0;
      if (occupied(position)) {
        position[index] = old;
        velocity[index] = 0;
      }
    });
    if (dt > 0) {
      const speed = Math.hypot(...velocity);
      updateFlightAudio(speed);
    }
    const [x,y,z] = position;
    const feeding = flowers.some(([fx,fz]) => Math.hypot(x-fx,z-fz)<1 && y<1.25);
    const night = worldTime>=18 || worldTime<6;
    const drain = (mission.drain+(ahead || side ? .22 : 0))*(night ? 1-.8*powers.nocturnal.strength : 1);
    energy = Math.max(0,Math.min(100,energy+(feeding ? 28*(1+powers.nectar.strength) : -drain)*dt));
    for (const person of people) {
      const phase = elapsed*.94+person.index;
      person.px = person.x + .87*Math.sin(phase);
      person.pz = person.z + .88*Math.cos(phase);
      const distance = Math.hypot(x-person.px,(y-1.48)*1.15,z-person.pz);
      if (person.hit && elapsed >= person.next && distance < 1.43) {
        energy = Math.max(0,energy-mission.damage*(1-.8*powers.shell.strength));
        person.alert = elapsed;
        person.next = elapsed + mission.reaction + .3 + .9*powers.reflex.strength;
        inform('Tapa! Fuja para recuperar energia nas flores.');
      }
    }
    if (energy <= 0) return overlay('lost');
    const home = houses.find(([hx,hz]) => Math.abs(x-hx)<3.44 && Math.abs(z-hz)<2.95 && y<3);
    const street = streets[Math.max(0,Math.min(streets.length-1,Math.round((z-firstStreet)/28)))];
    get('location').textContent = home ? 'CASA ' + String(houses.indexOf(home)+1).padStart(2,'0') : street.name.toUpperCase();
    const message = residentInReach() ? (touchDevice ? 'Toque em PICAR' : '[ E ]  PICAR MORADOR') : feeding ? 'Néctar · Recuperando energia' : elapsed < noticeUntil ? notice : '';
    hint.hidden = !message;
    if (hint.textContent !== message) hint.textContent = message;
  }

  function resident(person, time) {
    const {index,hit,alert} = person;
    const x = person.px ?? person.x, z = person.pz ?? person.z;
    const sway = Math.sin(time*5+index);
    const skin = ['d79b72','aa7151','e6b28a'][index%3];
    const shirt = ['bba74d','548c88','b86452','7289a5','9c7793','768b47'][index%6];
    const head = 1.63 + sway*.018;
    box(x,.74,z,.4,.55,.24,shirt);
    box(x,1.25,z,.125,.17,.125,skin);
    gem(x,head,z,.36,.45,.36,skin,.3);
    gem(x-.014,head+.15,z+.035,.36,.23,.35,'4c392e');
    for (const sign of [-1,1]) {
      const foot = z+sign*sway*.10;
      box(x+sign*.108,.26,foot,.16,.51,.19,'465059');
      box(x+sign*.108,.21,foot-.045,.175,.10,.27,'393c39');
      const swat = sign === 1 && alert != null ? Math.max(0,1-(time-alert)*2.7) : 0;
      box(x+sign*(.25+swat*.12),.85+swat*.64,z-sign*sway*.13,.125,.36,.14,skin);
      box(x+sign*.25,1.13,z,.145,.17,.19,shirt);
    }
    if (person.target && !hit) {
      gem(x,2.24+Math.sin(time*3+index)*.05,z,.19,.25,.19,'e7ff81');
    } else if (alert != null && time-alert < .35) {
      gem(x,2.24,z,.24,.31,.24,'ff9e66');
    }
  }

  function mosquito(time, center, scale, right, up, forward) {
    const startVertex = vertices.length;
    const x = 0, y = 0, z = 0;
    const species = catalog.species.find(item => item.id === profile.species);
    const condition = catalog.condition.find(item => item.id === profile.condition);
    gem(x,y,z,.51,.52,.91,species.body);
    gem(x-.04,y-.13,z-.56,.39,.43,1.17,species.body);
    for (let i=0;i<4;i++) gem(x-.04,y-.13,z-.29-i*.155,.43-i*.065,.46-i*.06,.15,species.band);
    gem(x,y+.03,z+.46,.43,.44,.44,'303829');
    for(const sign of [-1,1]){
      gem(x+sign*.16,y+.096,z+.57,.20,.23,.17,'752e25');
      const lift = .27+Math.sin(time*43)*.26;
      const base = [x+sign*.13,y+.10,z];
      const tip = [x+sign*1.45*species.span,y+lift,z-.64];
      const edge = [x+sign*.79,y+lift*.72,z+.17];
      const fold = [x+sign*.57,y+.09,z-.63];
      triangle(base,edge,tip,species.wing,.93);
      triangle(base,tip,fold,'aebc94',.94);
      triangle(base,[edge[0],edge[1]+.006,edge[2]],[tip[0]*.96+x*.04,tip[1]+.006,tip[2]],'e1e8c5',1);
      for(let i=0;i<3;i++){
        const oz=z+.22-i*.22;
        quad([x,y-.10,oz],[x+sign*.64,y-.39,oz-.16],[x+sign*.63,y-.43,oz-.19],[x,y-.14,oz],'3c412d');
        quad([x+sign*.64,y-.39,oz-.16],[x+sign*.85,y-.81,oz-.29],[x+sign*.82,y-.81,oz-.29],[x+sign*.61,y-.43,oz-.19],'414735');
      }
    }
    triangle([x-.045,y,z+.52],[x+.045,y,z+.52],[x,y-.25,z+1.26],'323729',1);
    if (condition.tint) {
      for (let i=0;i<6;i++) {
        const angle = time*4+i*Math.PI/3;
        gem(Math.cos(angle)*.92,Math.sin(angle*2)*.31,-.65-i*.09,.13,.13,.13,condition.tint);
      }
    }
    for (let i=startVertex; i<vertices.length; i+=6) {
      const x = vertices[i], y = vertices[i+1], z = vertices[i+2];
      for (let axis=0; axis<3; axis++) {
        vertices[i+axis] = center[axis]+scale*(x*right[axis]+y*up[axis]+z*forward[axis]);
      }
    }
  }

  function chaseCamera(forward, up, dt) {
    const offset = forward.map((direction,axis) => -direction*cameraDistance+up[axis]*.32);
    const pointAt = fraction => position.map((value,axis) => value+offset[axis]*fraction);
    let clear = 1;
    // Shorten the boom before it crosses a wall or the ground.
    for (let step=1; step<=24; step++) {
      const point = pointAt(step/24);
      if (point[1]<.12 || occupied(point)) {
        clear = (step-1)/24;
        break;
      }
    }
    cameraFraction = Math.min(clear,cameraFraction+(clear-cameraFraction)*(1-Math.exp(-9*dt)));
    return pointAt(cameraFraction);
  }

  function radar() {
    const scaleX = 2.3, scaleZ = 1.32;
    const mapZ = z => 53-(z-position[2])*scaleZ;
    map.fillStyle = '#28372b';
    map.fillRect(0,0,132,106);
    map.fillStyle = '#52604c';
    for (const street of streets) map.fillRect(8,mapZ(street.z)-3,116,6);
    for (const x of [-23,23]) map.fillRect(66+x*scaleX-4,mapZ(lastStreet)-3,8,avenueLength*scaleZ);
    for (const [x,z,,color] of houses) {
      map.fillStyle = '#'+color;
      map.fillRect(66+(x-3.5)*scaleX,mapZ(z+3),7*scaleX,6*scaleZ);
    }
    for (const person of people) {
      if (!person.target) continue;
      map.fillStyle = person.hit ? '#383e31' : '#fff0c1';
      map.fillRect(65+person.x*scaleX,mapZ(person.z)-1,3,3);
    }
    map.fillStyle = '#e7ae61';
    for (const [x,z] of flowers) map.fillRect(65+x*scaleX,mapZ(z)-1,3,3);
    map.save();
    map.translate(66+position[0]*scaleX,53);
    map.rotate(yaw);
    map.fillStyle = '#dfff70';
    map.beginPath();
    map.moveTo(0,-5);
    map.lineTo(3.8,3.5);
    map.lineTo(-3.8,3.5);
    map.closePath();
    map.fill();
    map.restore();
  }

  function frame(now) {
    const dt = Math.min(.033,(now-last)/1000);
    last = now;
    if (state === 'playing') update(dt);
    const intro = state === 'intro';
    const dpr = Math.min(devicePixelRatio, 1.8);
    const width = Math.max(1,Math.round(canvas.clientWidth*dpr));
    const height = Math.max(1,Math.round(canvas.clientHeight*dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0,0,width,height);
    }
    const angle = intro ? -.23+Math.sin(now/6200)*.025 : yaw;
    const elevation = intro ? -.30 : pitch;
    const sin = Math.sin(angle), cos = Math.cos(angle);
    const tilt = Math.sin(elevation), level = Math.cos(elevation);
    const forward = [sin*level,tilt,cos*level];
    const right = [cos,0,-sin];
    const up = [-sin*tilt,level,-cos*tilt];
    gl.uniform3fv(uniforms.eye,intro ? [1.6,9.5,-13.5] : chaseCamera(forward,up,dt));
    gl.uniform3fv(uniforms.forward,forward);
    gl.uniform3fv(uniforms.right,right);
    gl.uniform3fv(uniforms.up,up);
    const lens = width/height < 1 ? 1.10 : 1.38;
    gl.uniform2f(uniforms.lens,lens*height/width,lens);
    const daylight = Math.max(0,Math.min(1,.5+.85*Math.cos((worldTime-12)*Math.PI/12)));
    const sky = [.07+.66*daylight,.10+.66*daylight,.20+.42*daylight];
    gl.clearColor(...sky,1);
    gl.uniform3fv(uniforms.sky,sky);
    gl.uniform3f(uniforms.ambient,.28+.72*daylight,.34+.66*daylight,.52+.48*daylight);
    const hour = Math.floor(worldTime);
    const minute = Math.floor((worldTime-hour)*60);
    const timeLabel = String(hour).padStart(2,'0')+':'+String(minute).padStart(2,'0');
    const clock = get('game-clock');
    if (clock.textContent !== timeLabel) clock.textContent = timeLabel;
    gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    draw(scenery,sceneryCount);
    vertices = [];
    for (const person of people) {
      if (Math.abs(person.z-(intro ? 0 : position[2]))<48) resident(person,elapsed);
    }
    if (intro) {
      mosquito(now/1000,[2.4,6.8+Math.sin(now/500)*.15,-6],1,[1,0,0],[0,1,0],[0,0,1]);
    } else {
      mosquito(elapsed,position,.24*cameraFraction,right,up,forward);
    }
    const count = upload(actors,gl.DYNAMIC_DRAW);
    draw(actors,count);
    get('score').textContent = String(score).padStart(2,'0');
    get('energy').style.width = energy+'%';
    get('percent').textContent = Math.ceil(energy)+'%';
    radar();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
