// ─────────────────────────────────────────────
//  STATE
// ─────────────────────────────────────────────
let cards  = [];
let topics = [];
let isDirty = false;        // unsaved changes flag

// ─────────────────────────────────────────────
//  PERSISTENCE  (localStorage)
// ─────────────────────────────────────────────
const LS_KEY = 'flashcards_save';

function markDirty() {
  isDirty = true;
  document.querySelector('.save-dot').classList.add('dirty');
}
function markClean() {
  isDirty = false;
  document.querySelector('.save-dot').classList.remove('dirty');
}

function saveToLocalStorage() {
  const payload = {
    version: 1,
    savedAt: new Date().toISOString(),
    sliderMin,
    sliderMax,
    catView,
    topics: topics.map(t => ({
      id:      t.id,
      name:    t.name,
      version: t.version || 1,
      enabled: t.enabled,
      cards:   cards.filter(c => t.cardIds.includes(c.id)).map(c => ({
        id: c.id, head: c.head, answer: c.answer, difficulty: c.difficulty
      }))
    }))
  };
  localStorage.setItem(LS_KEY, JSON.stringify(payload));
  markClean();
  showToast('💾 Saved!');
}

function loadFromLocalStorage() {
  const raw = localStorage.getItem(LS_KEY);
  if (!raw) return false;
  try {
    const payload = JSON.parse(raw);
    ingestPayload(payload);
    if (payload.sliderMin) sliderMin = payload.sliderMin;
    if (payload.sliderMax) sliderMax = payload.sliderMax;
    if (payload.catView)   catView   = payload.catView;
    return true;
  } catch { return false; }
}

function ingestPayload(payload) {
  cards  = [];
  topics = [];
  (payload.topics || []).forEach(t => {
    const cardIds = [];
    (t.cards || []).forEach(c => {
      cards.push({ id: c.id, head: c.head, answer: c.answer, difficulty: c.difficulty });
      cardIds.push(c.id);
    });
    topics.push({ id: t.id, name: t.name, version: t.version || 1, enabled: !!t.enabled, cardIds });
  });
}

// ─────────────────────────────────────────────
//  DEFAULT DATA  — all topics come from topics/ folder
// ─────────────────────────────────────────────
function loadDefaults() {
  cards  = [];
  topics = [];
}

// ─────────────────────────────────────────────
//  EXPORT / IMPORT
// ─────────────────────────────────────────────
// Export a single topic as a topics/-compatible JSON file
function exportTopic(topic) {
  const payload = {
    id:      topic.id,
    name:    topic.name,
    version: topic.version || 1,
    cards:   cards.filter(c => topic.cardIds.includes(c.id)).map(c => ({
      id: c.id, head: c.head, answer: c.answer, difficulty: c.difficulty
    }))
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type:'application/json' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `${topic.id}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast(`📦 Exported "${topic.name}"!`);
}

// Export ALL topics as a full backup
document.getElementById('btnExport').addEventListener('click', () => {
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    sliderMin, sliderMax,
    topics: topics.map(t => ({
      id: t.id, name: t.name, version: t.version || 1, enabled: t.enabled,
      cards: cards.filter(c => t.cardIds.includes(c.id)).map(c => ({
        id: c.id, head: c.head, answer: c.answer, difficulty: c.difficulty
      }))
    }))
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type:'application/json' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `flashcards_export_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast('📦 Exported all topics!');
});

// ─────────────────────────────────────────────
//  TOPIC FILE MERGE  (shared by import UI & topics/ folder loader)
// ─────────────────────────────────────────────
// Accepts a parsed topic-file object (single topic: { id, name, cards[] }
// OR a legacy full-export: { topics[] }).  Merges into global state.
// Returns the number of topics that were added or updated.
function mergeTopicPayload(payload, { silent = false } = {}) {
  // Normalise: a single-topic file has an `id` at the root;
  // a full export wraps everything under `topics`.
  const incoming = payload.topics
    ? payload.topics
    : (payload.id ? [payload] : []);

  let touched = 0;
  incoming.forEach(inTopic => {
    const existing = topics.find(t => t.id === inTopic.id);
    if (existing) {
      // Only update enabled when the caller set it explicitly (full exports carry it)
      if (typeof inTopic.enabled === 'boolean') existing.enabled = inTopic.enabled;
      (inTopic.cards || []).forEach(ic => {
        if (!cards.find(c => c.id === ic.id)) {
          cards.push(ic);
          existing.cardIds.push(ic.id);
        }
      });
    } else {
      const cardIds = [];
      (inTopic.cards || []).forEach(ic => {
        if (!cards.find(c => c.id === ic.id)) cards.push(ic);
        cardIds.push(ic.id);
      });
      topics.push({
        id:      inTopic.id,
        name:    inTopic.name,
        version: inTopic.version || 1,
        enabled: typeof inTopic.enabled === 'boolean' ? inTopic.enabled : false,
        cardIds
      });
    }
    touched++;
  });
  return touched;
}

document.getElementById('btnImport').addEventListener('click', () => {
  document.getElementById('importFileInput').click();
});
document.getElementById('importFileInput').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const payload = JSON.parse(ev.target.result);
      const n = mergeTopicPayload(payload);
      if (n === 0) { showToast('⚠️ Nothing to import'); return; }
      markDirty();
      renderCatalogue();
      renderDojoSetup();
      showToast('📥 Imported!');
    } catch { showToast('⚠️ Invalid file'); }
  };
  reader.readAsText(file);
  e.target.value = '';
});

document.getElementById('btnSave').addEventListener('click', saveToLocalStorage);

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────
function diffColor(d) {
  if (d <= 3) return { bg:'rgba(52,211,153,0.15)',  fg:'#34d399' };
  if (d <= 6) return { bg:'rgba(251,191,36,0.15)',  fg:'#fbbf24' };
  return             { bg:'rgba(248,113,113,0.15)', fg:'#f87171' };
}
function getActiveCards() {
  const ids = new Set();
  topics.filter(t => t.enabled).forEach(t => t.cardIds.forEach(id => ids.add(id)));
  return cards.filter(c => ids.has(c.id));
}
function getCardsInRange(mn, mx) {
  return getActiveCards().filter(c => c.difficulty >= mn && c.difficulty <= mx);
}
function countByDiff() {
  const active = getActiveCards();
  const counts = Array(10).fill(0);
  active.forEach(c => { if (c.difficulty >= 1 && c.difficulty <= 10) counts[c.difficulty-1]++; });
  return counts;
}
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length-1; i > 0; i--) { const j = Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}
function genId(prefix) {
  return prefix + '_' + Math.random().toString(36).slice(2,8);
}

// ─────────────────────────────────────────────
//  TOAST
// ─────────────────────────────────────────────
let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

// ─────────────────────────────────────────────
//  VIEW MANAGER
// ─────────────────────────────────────────────
const viewIds = ['viewDojoSetup','viewDojoGame','viewDojoComplete','viewCatalogue'];
function showView(id) {
  viewIds.forEach(v => document.getElementById(v).classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

// ─────────────────────────────────────────────
//  TABS
// ─────────────────────────────────────────────
document.getElementById('tabDojo').addEventListener('click', () => {
  document.getElementById('tabDojo').classList.add('active');
  document.getElementById('tabCatalogue').classList.remove('active');
  showView('viewDojoSetup');
  renderDojoSetup();
});
document.getElementById('tabCatalogue').addEventListener('click', () => {
  document.getElementById('tabCatalogue').classList.add('active');
  document.getElementById('tabDojo').classList.remove('active');
  showView('viewCatalogue');
  renderCatalogue();
});

// ─────────────────────────────────────────────
//  CUSTOM DUAL RANGE SLIDER
// ─────────────────────────────────────────────
let sliderMin = 1, sliderMax = 10;

const thumbMin   = document.getElementById('thumbMin');
const thumbMax   = document.getElementById('thumbMax');
const sliderFill = document.getElementById('sliderFill');
const container  = document.getElementById('sliderContainer');

function valToPct(v) { return ((v - 1) / 9) * 100; }
function pxToVal(px, trackW) {
  const raw = (px / trackW) * 9 + 1;
  return Math.round(Math.min(10, Math.max(1, raw)));
}

function updateSliderUI() {
  const pMin = valToPct(sliderMin);
  const pMax = valToPct(sliderMax);
  thumbMin.style.left    = pMin + '%';
  thumbMax.style.left    = pMax + '%';
  sliderFill.style.left  = pMin + '%';
  sliderFill.style.width = (pMax - pMin) + '%';
  document.getElementById('rangeLabel').textContent =
    sliderMin === sliderMax ? `${sliderMin}` : `${sliderMin} – ${sliderMax}`;
  const inRange = getCardsInRange(sliderMin, sliderMax);
  document.getElementById('sliderCardCount').textContent = inRange.length;
  document.getElementById('startBtn').disabled = inRange.length === 0;
  const merged = sliderMin === sliderMax;
  thumbMin.style.zIndex = '2';
  thumbMax.style.zIndex = merged ? '3' : '2';
  thumbMin.classList.toggle('merged', merged);
  thumbMax.classList.toggle('merged', merged);
  renderBarChart();
}

function renderBarChart() {
  const counts   = countByDiff();
  const maxCount = Math.max(...counts, 1);
  const chart    = document.getElementById('barChart');
  chart.innerHTML = '';
  counts.forEach((count, i) => {
    const diff = i + 1;
    const wrap = document.createElement('div'); wrap.className = 'bar-wrap';
    const bar  = document.createElement('div'); bar.className  = 'bar';
    if (count === 0) { bar.classList.add('zero'); bar.style.height = '3px'; }
    else { bar.style.height = Math.max(10, (count/maxCount)*100)+'%'; bar.classList.add(diff >= sliderMin && diff <= sliderMax ? 'in-range' : 'out-range'); }
    wrap.appendChild(bar); chart.appendChild(wrap);
  });
}

// Drag logic — merged: swipe left = move MIN, swipe right = move MAX
function makeDraggable(thumb, role) {
  thumb.addEventListener('pointerdown', function onPointerDown(e) {
    e.preventDefault();
    thumb.setPointerCapture(e.pointerId);
    thumb.classList.add('dragging');
    const trackRect  = container.getBoundingClientRect();
    const trackLeft  = trackRect.left;
    const trackWidth = trackRect.width;
    const startX     = e.clientX;
    const merged     = sliderMin === sliderMax;
    let activeRole   = merged ? null : role;
    let resolved     = !merged;

    function onMove(e) {
      const px  = Math.min(Math.max(e.clientX - trackLeft, 0), trackWidth);
      const val = pxToVal(px, trackWidth);
      if (!resolved) {
        const delta = e.clientX - startX;
        if (Math.abs(delta) < 3) return;
        activeRole = delta < 0 ? 'min' : 'max';
        resolved   = true;
      }
      if (activeRole === 'min') sliderMin = Math.min(val, sliderMax);
      else                      sliderMax = Math.max(val, sliderMin);
      updateSliderUI();
    }
    function onUp() {
      thumb.classList.remove('dragging');
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    }
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  });
}
makeDraggable(thumbMin, 'min');
makeDraggable(thumbMax, 'max');

// ─────────────────────────────────────────────
//  DOJO SETUP
// ─────────────────────────────────────────────
function renderDojoSetup() {
  const row = document.getElementById('dojoTopicsRow');
  row.innerHTML = '';
  const active   = topics.filter(t =>  t.enabled);
  const inactive = topics.filter(t => !t.enabled);
  const ordered  = [...active, ...inactive];
  const chips = ordered.map(t => {
    const chip = document.createElement('div');
    chip.className = 'topic-chip' + (t.enabled ? ' active-chip' : '');
    chip.textContent = t.name;
    chip.dataset.enabled = t.enabled ? '1' : '0';
    row.appendChild(chip);
    return chip;
  });
  requestAnimationFrame(() => {
    const rowTop = row.getBoundingClientRect().top;
    let hiddenActive = 0, hiddenInactive = 0;
    chips.forEach((chip, i) => {
      if (chip.getBoundingClientRect().top > rowTop + 2) {
        chip.style.display = 'none';
        if (ordered[i].enabled) hiddenActive++; else hiddenInactive++;
      }
    });
    if (hiddenActive > 0)   { const b = document.createElement('div'); b.className='overflow-chip ov-active';   b.textContent=`+${hiddenActive}`;   row.appendChild(b); }
    if (hiddenInactive > 0) { const b = document.createElement('div'); b.className='overflow-chip ov-inactive'; b.textContent=`+${hiddenInactive}`; row.appendChild(b); }
  });
  updateSliderUI();
}
document.getElementById('startBtn').addEventListener('click', startGame);

// ─────────────────────────────────────────────
//  GAME
// ─────────────────────────────────────────────
let deck = [], deckIndex = 0, correctCount = 0, incorrectCount = 0, answered = false, failedCardIds = [];

function startGame() {
  deck = shuffle(getCardsInRange(sliderMin, sliderMax));
  deckIndex = 0; correctCount = 0; incorrectCount = 0; failedCardIds = []; answered = false;
  showView('viewDojoGame');
  renderGameCard();
  updateGameScore();
}

function renderGameCard() {
  if (deckIndex >= deck.length) { endGame(); return; }
  const card = deck[deckIndex];
  document.getElementById('studyCard').classList.remove('flipped');
  document.getElementById('cardHead').textContent   = card.head;
  document.getElementById('cardAnswer').textContent = card.answer;
  const col = diffColor(card.difficulty);
  ['diffBadgeFront','diffBadgeBack'].forEach(id => {
    const el = document.getElementById(id);
    el.textContent = `D${card.difficulty}`; el.style.background = col.bg; el.style.color = col.fg;
  });
  document.getElementById('cntDone').textContent      = deckIndex;
  document.getElementById('cntLeft').textContent      = deck.length - deckIndex;
  document.getElementById('progressFill').style.width = (deckIndex / deck.length * 100) + '%';
  answered = false;
  updateGameButtons();
  setTimeout(() => {
    const inner = document.getElementById('cardInner');
    const faces = inner.querySelectorAll('.card-face');
    let maxH = 200;
    faces.forEach(f => { maxH = Math.max(maxH, f.scrollHeight); });
    inner.style.minHeight = (maxH + 8) + 'px';
    faces.forEach(f => { f.style.minHeight = (maxH + 8) + 'px'; });
  }, 20);
}

function updateGameScore() {
  document.getElementById('gameCorrect').textContent   = correctCount;
  document.getElementById('gameIncorrect').textContent = incorrectCount;
  const total = correctCount + incorrectCount;
  document.getElementById('gameAccuracy').textContent  = total ? Math.round(correctCount/total*100)+'%' : '0%';
}
function updateGameButtons() {
  document.getElementById('correctBtn').disabled   = answered;
  document.getElementById('incorrectBtn').disabled = answered;
  document.getElementById('nextBtn').disabled      = !answered;
}

document.getElementById('studyCard').addEventListener('click', function(e) {
  if (e.target.closest('.pencil-btn')) return;
  this.classList.toggle('flipped');
});
document.getElementById('correctBtn').addEventListener('click', () => {
  if (answered) return; correctCount++; answered = true; updateGameScore(); updateGameButtons();
});
document.getElementById('incorrectBtn').addEventListener('click', () => {
  if (answered) return;
  incorrectCount++; failedCardIds.push(deck[deckIndex].id);
  answered = true; updateGameScore(); updateGameButtons();
});
document.getElementById('nextBtn').addEventListener('click', () => {
  if (!answered) return; deckIndex++; renderGameCard();
});
document.getElementById('exitBtn').addEventListener('click', () => {
  document.getElementById('tabDojo').classList.add('active');
  document.getElementById('tabCatalogue').classList.remove('active');
  showView('viewDojoSetup'); renderDojoSetup();
});

function endGame() {
  showView('viewDojoComplete');
  const total = correctCount + incorrectCount;
  const pct   = total ? Math.round(correctCount/total*100) : 0;
  document.getElementById('fcCorrect').textContent   = correctCount;
  document.getElementById('fcIncorrect').textContent = incorrectCount;
  document.getElementById('fcAccuracy').textContent  = pct + '%';
  document.getElementById('progressFill').style.width = '100%';
  document.getElementById('completeSubtitle').textContent =
    pct >= 80 ? '🎉 Excellent work!' : pct >= 50 ? '💪 Keep grinding!' : '📖 Review and retry!';
  document.getElementById('redoBtn').disabled = failedCardIds.length === 0;
}
document.getElementById('replayBtn').addEventListener('click', startGame);
document.getElementById('redoBtn').addEventListener('click', () => {
  const failed = cards.filter(c => failedCardIds.includes(c.id));
  if (!failed.length) return;
  deck = shuffle(failed); deckIndex = 0; correctCount = 0; incorrectCount = 0; failedCardIds = []; answered = false;
  showView('viewDojoGame'); renderGameCard(); updateGameScore();
});

// ─────────────────────────────────────────────
//  EDIT CARD MODAL
// ─────────────────────────────────────────────
let editingCardId = null;

document.getElementById('pencilBtn').addEventListener('click', () => { openEditModal(deck[deckIndex].id); });

function openEditModal(cardId) {
  const card = cards.find(c => c.id === cardId);
  if (!card) return;
  editingCardId = cardId;
  document.getElementById('editHead').value   = card.head;
  document.getElementById('editAnswer').value = card.answer;
  document.getElementById('editDiff').value   = card.difficulty;
  document.getElementById('editDiffVal').textContent = card.difficulty;
  document.getElementById('editDiffBig').textContent = card.difficulty;
  document.getElementById('editModal').classList.add('visible');
}
document.getElementById('editDiff').addEventListener('input', function() {
  document.getElementById('editDiffVal').textContent = this.value;
  document.getElementById('editDiffBig').textContent = this.value;
});
document.getElementById('modalCancel').addEventListener('click', () => {
  document.getElementById('editModal').classList.remove('visible');
});
document.getElementById('editModal').addEventListener('click', function(e) {
  if (e.target === this) this.classList.remove('visible');
});
document.getElementById('modalSave').addEventListener('click', () => {
  const card = cards.find(c => c.id === editingCardId);
  if (!card) return;
  card.head       = document.getElementById('editHead').value.trim()   || card.head;
  card.answer     = document.getElementById('editAnswer').value.trim() || card.answer;
  card.difficulty = parseInt(document.getElementById('editDiff').value);
  document.getElementById('editModal').classList.remove('visible');
  markDirty();
  if (!document.getElementById('viewDojoGame').classList.contains('hidden'))  renderGameCard();
  if (!document.getElementById('viewCatalogue').classList.contains('hidden')) renderCatalogue();
  updateSliderUI();
});

// ─────────────────────────────────────────────
//  CATALOGUE
// ─────────────────────────────────────────────
let catView = 'list';

document.getElementById('btnViewList').addEventListener('click', () => setCatView('list'));
document.getElementById('btnViewTile').addEventListener('click', () => setCatView('tile'));

function setCatView(v) {
  catView = v;
  document.getElementById('btnViewList').classList.toggle('active', v === 'list');
  document.getElementById('btnViewTile').classList.toggle('active', v === 'tile');
  renderCatalogue();
}

function showCatPanel(panel) {
  document.getElementById('catListView').classList.toggle('hidden',   panel !== 'list');
  document.getElementById('catTileView').classList.toggle('hidden',   panel !== 'tile');
  document.getElementById('catDetailView').classList.toggle('hidden', panel !== 'detail');
}

function renderCatalogue() {
  if (catView === 'list') { showCatPanel('list'); renderListView(); }
  else                    { showCatPanel('tile'); renderTileView(); }
}

function renderListView() {
  const list = document.getElementById('topicList');
  list.innerHTML = '';
  topics.forEach(topic => {
    const topicCards = cards.filter(c => topic.cardIds.includes(c.id));
    const row = document.createElement('div');
    row.className = 'topic-row' + (topic.enabled ? ' enabled' : '');
    row.innerHTML = `
      <div class="topic-header">
        <div class="topic-toggle ${topic.enabled ? 'on' : ''}" data-tid="${topic.id}"></div>
        <div class="topic-name">${topic.name}</div>
        <div class="topic-meta">${topicCards.length} card${topicCards.length!==1?'s':''}</div>
        <button class="list-export-btn" title="Export topic">⬆</button>
        <div class="topic-chevron">▼</div>
      </div>
      <div class="topic-cards">
        ${topicCards.map(c => {
          const col = diffColor(c.difficulty);
          return `<div class="topic-card-item">
            <span class="tci-diff" style="background:${col.bg};color:${col.fg}">D${c.difficulty}</span>
            <span class="tci-head">${c.head}</span>
            <button class="tci-edit" data-cid="${c.id}">✏️ Edit</button>
          </div>`;
        }).join('')}
      </div>`;
    row.querySelector('.topic-toggle').addEventListener('click', e => {
      e.stopPropagation(); topic.enabled = !topic.enabled;
      markDirty(); renderCatalogue(); renderDojoSetup();
    });
    row.querySelector('.list-export-btn').addEventListener('click', e => {
      e.stopPropagation(); exportTopic(topic);
    });
    row.querySelector('.topic-header').addEventListener('click', e => {
      if (e.target.closest('.topic-toggle') || e.target.closest('.list-export-btn')) return;
      row.classList.toggle('open');
    });
    row.querySelectorAll('.tci-edit').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); openEditModal(btn.dataset.cid); });
    });
    list.appendChild(row);
  });
}

function renderTileView() {
  const grid = document.getElementById('tileGrid');
  grid.innerHTML = '';
  topics.forEach(topic => {
    const topicCards = cards.filter(c => topic.cardIds.includes(c.id));
    const tile = document.createElement('div');
    tile.className = 'topic-tile' + (topic.enabled ? ' enabled' : '');
    tile.innerHTML = `
      <div class="tile-name">${topic.name}</div>
      <div class="tile-count">${topicCards.length} card${topicCards.length!==1?'s':''}</div>
      <span class="tile-badge ${topic.enabled ? 'on' : 'off'}">${topic.enabled ? 'Active' : 'Inactive'}</span>
      <div class="tile-actions">
        <button class="tile-export-btn" title="Export topic">⬆</button>
        <span class="tile-arrow">→</span>
      </div>`;
    tile.querySelector('.tile-export-btn').addEventListener('click', e => {
      e.stopPropagation();
      exportTopic(topic);
    });
    tile.addEventListener('click', () => openTopicDetail(topic.id));
    grid.appendChild(tile);
  });
}

function openTopicDetail(topicId) {
  const topic      = topics.find(t => t.id === topicId);
  const topicCards = cards.filter(c => topic.cardIds.includes(c.id));
  document.getElementById('detailTitle').textContent = topic.name;

  const tog   = document.getElementById('detailToggle');
  const label = document.getElementById('detailToggleLabel');
  const syncToggle = () => {
    tog.className     = 'topic-toggle' + (topic.enabled ? ' on' : '');
    label.textContent = topic.enabled ? 'Active' : 'Inactive';
    label.style.color = topic.enabled ? 'var(--accent)' : 'var(--muted)';
  };
  syncToggle();
  tog.onclick = () => {
    topic.enabled = !topic.enabled;
    syncToggle(); markDirty(); updateSliderUI(); renderDojoSetup();
  };

  const list = document.getElementById('detailCardList');
  list.innerHTML = '';
  topicCards.forEach(c => {
    const col  = diffColor(c.difficulty);
    const item = document.createElement('div');
    item.className = 'detail-card';
    item.innerHTML = `
      <span class="tci-diff" style="background:${col.bg};color:${col.fg}">D${c.difficulty}</span>
      <div class="detail-card-body">
        <div class="detail-card-q">${c.head}</div>
        <div class="detail-card-a">${c.answer}</div>
      </div>
      <button class="tci-edit" data-cid="${c.id}">✏️</button>`;
    item.querySelector('.tci-edit').addEventListener('click', e => {
      e.stopPropagation(); openEditModal(c.id);
    });
    list.appendChild(item);
  });

  // Add card button inside detail
  const addBtn = document.createElement('button');
  addBtn.className   = 'detail-add-card';
  addBtn.textContent = '+ Add card to this topic';
  addBtn.addEventListener('click', () => openNewTopicModal(topic.id));
  list.appendChild(addBtn);

  showCatPanel('detail');
}

document.getElementById('detailBackBtn').addEventListener('click', () => { showCatPanel('tile'); });

// ─────────────────────────────────────────────
//  NEW TOPIC MODAL
// ─────────────────────────────────────────────
// Can be opened with a topicId to add a card to an existing topic,
// or with no argument to create a brand-new topic.
let newTopicTargetId = null; // if set, we're adding cards to this topic

document.getElementById('btnAddTopic').addEventListener('click', () => openNewTopicModal(null));

function openNewTopicModal(existingTopicId) {
  newTopicTargetId = existingTopicId || null;
  const modal     = document.getElementById('newTopicModal');
  const nameWrap  = document.getElementById('newTopicNameWrap');
  const title     = document.getElementById('newTopicModalTitle');

  if (existingTopicId) {
    const t = topics.find(t => t.id === existingTopicId);
    title.textContent    = `Add cards to "${t.name}"`;
    nameWrap.style.display = 'none';
  } else {
    title.textContent    = 'New Topic';
    nameWrap.style.display = '';
    document.getElementById('newTopicName').value = '';
  }

  // Reset card rows
  const cardRows = document.getElementById('newTopicCardRows');
  cardRows.innerHTML = '';
  addNewCardRow(cardRows);

  modal.classList.add('visible');
}

function addNewCardRow(container) {
  const row = document.createElement('div');
  row.className = 'new-card-row';
  const uid = Math.random().toString(36).slice(2,7);
  row.innerHTML = `
    <button class="new-card-remove" title="Remove">✕</button>
    <label>Question</label>
    <textarea rows="2" placeholder="e.g. What is photosynthesis?" class="nc-head-${uid}"></textarea>
    <label>Answer</label>
    <textarea rows="2" placeholder="e.g. The process by which plants..." class="nc-ans-${uid}"></textarea>
    <div class="new-card-diff-row">
      <label>Difficulty</label>
      <input type="range" min="1" max="10" value="5" class="nc-diff-${uid}">
      <span class="new-card-diff-val nc-dval-${uid}">5</span>
    </div>`;
  row.querySelector(`.nc-diff-${uid}`).addEventListener('input', function() {
    row.querySelector(`.nc-dval-${uid}`).textContent = this.value;
  });
  row.querySelector('.new-card-remove').addEventListener('click', () => {
    row.remove();
  });
  container.appendChild(row);
}

document.getElementById('addCardRowBtn').addEventListener('click', () => {
  addNewCardRow(document.getElementById('newTopicCardRows'));
});

document.getElementById('newTopicCancel').addEventListener('click', () => {
  document.getElementById('newTopicModal').classList.remove('visible');
});
document.getElementById('newTopicModal').addEventListener('click', function(e) {
  if (e.target === this) this.classList.remove('visible');
});

document.getElementById('newTopicSave').addEventListener('click', () => {
  const cardRows = document.getElementById('newTopicCardRows');
  const rows     = cardRows.querySelectorAll('.new-card-row');

  // Collect cards from rows
  const newCards = [];
  let valid = true;
  rows.forEach(row => {
    const headEl = row.querySelector('textarea:nth-of-type(1)');
    const ansEl  = row.querySelector('textarea:nth-of-type(2)');
    const diffEl = row.querySelector('input[type=range]');
    const head   = headEl.value.trim();
    const answer = ansEl.value.trim();
    if (!head || !answer) { valid = false; headEl.style.borderColor = head ? '' : 'var(--red)'; ansEl.style.borderColor = answer ? '' : 'var(--red)'; return; }
    headEl.style.borderColor = ''; ansEl.style.borderColor = '';
    newCards.push({ id: genId('uc'), head, answer, difficulty: parseInt(diffEl.value) });
  });

  if (!valid) { showToast('⚠️ Fill in all fields'); return; }
  if (!newCards.length) { showToast('⚠️ Add at least one card'); return; }

  if (newTopicTargetId) {
    // Add cards to existing topic
    const topic = topics.find(t => t.id === newTopicTargetId);
    newCards.forEach(c => { cards.push(c); topic.cardIds.push(c.id); });
  } else {
    // Create new topic
    const nameInput = document.getElementById('newTopicName').value.trim();
    if (!nameInput) { document.getElementById('newTopicName').style.borderColor='var(--red)'; showToast('⚠️ Topic needs a name'); return; }
    document.getElementById('newTopicName').style.borderColor = '';
    const topicId = nameInput.toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'');
    const safeId  = topics.find(t=>t.id===topicId) ? topicId + '_' + Date.now() : topicId;
    newCards.forEach(c => cards.push(c));
    topics.push({ id: safeId, name: nameInput, version: 1, enabled: true, cardIds: newCards.map(c=>c.id) });
  }

  document.getElementById('newTopicModal').classList.remove('visible');
  markDirty();
  renderCatalogue();
  renderDojoSetup();
  showToast(newTopicTargetId ? '✅ Cards added!' : '✅ Topic created!');
});


// ─────────────────────────────────────────────
//  AI GENERATE MODAL
// ─────────────────────────────────────────────
document.getElementById('btnAI').addEventListener('click', () => {
  document.getElementById('aiModal').classList.add('visible');
});
document.getElementById('aiModalClose').addEventListener('click', () => {
  document.getElementById('aiModal').classList.remove('visible');
});
document.getElementById('aiModal').addEventListener('click', function(e) {
  if (e.target === this) this.classList.remove('visible');
});
document.getElementById('aiCopyBtn').addEventListener('click', () => {
  const text = document.getElementById('aiPromptBox').textContent;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('aiCopyBtn');
    btn.textContent = '✓ Copied!';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = 'Copy prompt'; btn.classList.remove('copied'); }, 2000);
  });
});

// ─────────────────────────────────────────────
//  TOPICS FOLDER LOADER
// ─────────────────────────────────────────────
// Fetches every *.json file found in the topics/ directory and merges
// them into the running state.  A topic file must have the shape:
//   { "id": "...", "name": "...", "cards": [ { id, head, answer, difficulty } ] }
// Placing a new .json file in topics/ is identical to using Import.
//
// Discovery: the app reads topics/index.json (an array of filenames)
// so the server doesn't need directory listing support.
// If that file is missing we fall back to a hardcoded manifest.
const TOPICS_MANIFEST_FALLBACK = ['study_science.json'];

async function loadTopicsFolder() {
  let manifest = TOPICS_MANIFEST_FALLBACK;
  try {
    const res = await fetch('topics/index.json');
    if (res.ok) manifest = await res.json();
  } catch { /* use fallback */ }

  let anyNew = false;
  await Promise.all(manifest.map(async filename => {
    try {
      const res = await fetch(`topics/${filename}`);
      if (!res.ok) return;
      const payload = await res.json();
      const n = mergeTopicPayload(payload, { silent: true });
      if (n > 0) anyNew = true;
    } catch { /* skip malformed files */ }
  }));
  return anyNew;
}

// ─────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────
(async function init() {
  if (!loadFromLocalStorage()) loadDefaults();
  // Always layer the topics/ folder on top so file-based topics
  // are never stale even when a localStorage save exists.
  const gotNew = await loadTopicsFolder();
  renderDojoSetup();
  if (gotNew) markDirty();  // prompt user to save the merged state
})();
