const STORAGE_KEY = 'sanko-packing-list:v1';
const PREFS_KEY = 'sanko-packing-list:prefs';
const NEW_CATEGORY = '__new__';

const WHEN = {
  all: { label: '毎回（日帰り・小屋泊）', badge: '' },
  day: { label: '日帰りのみ', badge: '日帰り' },
  hut: { label: '小屋泊のみ', badge: '小屋泊' },
  selfMeal: { label: '小屋泊・食事なしのとき', badge: '自炊' },
  noBedding: { label: '小屋泊・寝具なしのとき', badge: '寝具なし' },
};

const SEED = [
  ['装備', 'all', ['ザック', 'ザックカバー', '登山靴', 'トレッキングポール', 'ヘッドライト', '予備電池', '熊鈴', 'スタッフバッグ・防水袋']],
  ['ウェア', 'all', ['レインウェア（上下）', '防寒着（フリース・ダウン）', '帽子', '手袋', 'サングラス', '着替え（下山後用）']],
  ['ウェア', 'hut', ['着替え（下着・靴下）', '小屋での部屋着']],
  ['ナビ・連絡', 'all', ['スマホ', 'モバイルバッテリー', '充電ケーブル', '地図（紙）', 'コンパス', '腕時計', '登山計画書（提出）']],
  ['飲食', 'all', ['水・飲み物', '行動食', '昼食', '非常食']],
  ['飲食', 'hut', ['2日目の行動食・昼食']],
  ['安全・衛生', 'all', ['ファーストエイドキット', '常備薬', 'エマージェンシーシート', '日焼け止め', 'ティッシュ・トイレットペーパー', 'ゴミ袋', 'タオル・手ぬぐい']],
  ['貴重品', 'all', ['財布・現金（小銭も）', '健康保険証（コピー可）']],
  ['小屋泊', 'hut', ['小屋の予約確認', '宿泊費（現金多め）', '洗面用具（歯ブラシ等）', '耳栓・アイマスク', 'インナーシーツ', 'ウェットティッシュ']],
  ['自炊', 'selfMeal', ['バーナー（ストーブ）', 'ガス缶', 'クッカー', 'ライター', 'カトラリー・箸', '夕食', '朝食', '食器拭きペーパー']],
  ['寝具', 'noBedding', ['寝袋（シュラフ）', 'スリーピングマット', 'エアピロー']],
];

function newId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function defaultItems() {
  return SEED.flatMap(([category, when, names]) =>
    names.map((name) => ({ id: newId(), name, category, when, once: false })));
}

function readJSON(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable (private mode etc.): keep working in memory
  }
}

function loadState() {
  const s = readJSON(STORAGE_KEY);
  if (!s || !Array.isArray(s.items)) {
    return { items: defaultItems(), trip: { type: 'day', meals: true, bedding: true }, checked: {} };
  }
  return {
    items: s.items
      .filter((i) => i && typeof i.name === 'string')
      .map((i) => ({
        id: String(i.id || newId()),
        name: i.name,
        category: i.category || 'その他',
        when: WHEN[i.when] ? i.when : 'all',
        once: !!i.once,
      })),
    trip: {
      type: s.trip?.type === 'hut' ? 'hut' : 'day',
      meals: s.trip?.meals !== false,
      bedding: s.trip?.bedding !== false,
    },
    checked: s.checked && typeof s.checked === 'object' ? s.checked : {},
  };
}

let state = loadState();
const prefs = { hideChecked: false, ...readJSON(PREFS_KEY) };
let editMode = false;
let editingId = null;

function commit() {
  writeJSON(STORAGE_KEY, state);
  render();
}

function applies(item, trip) {
  switch (item.when) {
    case 'day': return trip.type === 'day';
    case 'hut': return trip.type === 'hut';
    case 'selfMeal': return trip.type === 'hut' && !trip.meals;
    case 'noBedding': return trip.type === 'hut' && !trip.bedding;
    default: return true;
  }
}

function categories() {
  return [...new Set(state.items.map((i) => i.category))];
}

const $ = (id) => document.getElementById(id);

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  for (const child of children) if (child != null) node.append(child);
  return node;
}

function badges(item) {
  const out = [];
  if (WHEN[item.when].badge) out.push(el('span', { className: `badge badge-${item.when}`, textContent: WHEN[item.when].badge }));
  if (item.once) out.push(el('span', { className: 'badge badge-once', textContent: '今回のみ' }));
  return out;
}

function checkRow(item) {
  const checked = !!state.checked[item.id];
  const input = el('input', { type: 'checkbox', checked });
  input.addEventListener('change', () => {
    if (input.checked) state.checked[item.id] = true;
    else delete state.checked[item.id];
    commit();
  });
  return el('li', { className: checked ? 'item checked' : 'item' },
    el('label', {}, input, el('span', { className: 'name', textContent: item.name }), ...badges(item)));
}

function editRow(item, isActive) {
  const btn = el('button', { type: 'button', className: 'edit-row' },
    el('span', { className: 'name', textContent: item.name }),
    ...badges(item),
    el('span', { className: 'chevron', textContent: '›' }));
  btn.addEventListener('click', () => openDialog(item));
  return el('li', { className: isActive ? 'item' : 'item inactive' }, btn);
}

function render() {
  const { trip } = state;
  document.querySelectorAll('[data-type]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.type === trip.type)));
  $('hutOptions').hidden = trip.type !== 'hut';
  $('optMeals').checked = trip.meals;
  $('optBedding').checked = trip.bedding;
  $('hideChecked').checked = prefs.hideChecked;
  $('editToggle').textContent = editMode ? '完了' : '編集';
  $('editToggle').setAttribute('aria-pressed', String(editMode));
  document.body.classList.toggle('editing', editMode);

  const active = state.items.filter((i) => applies(i, trip));
  const done = active.filter((i) => state.checked[i.id]).length;
  $('progressText').textContent = `${done} / ${active.length} 準備OK`;
  $('progressBar').style.width = active.length ? `${(done / active.length) * 100}%` : '0%';
  $('doneMsg').hidden = active.length === 0 || done < active.length;

  const shown = editMode ? state.items : active.filter((i) => !(prefs.hideChecked && state.checked[i.id]));
  const list = $('list');
  list.replaceChildren();
  for (const cat of categories()) {
    const items = shown.filter((i) => i.category === cat);
    if (!items.length) continue;
    const catActive = active.filter((i) => i.category === cat);
    const catDone = catActive.filter((i) => state.checked[i.id]).length;
    const heading = el('h2', {}, el('span', { textContent: cat }),
      editMode ? null : el('span', { className: 'count', textContent: `${catDone}/${catActive.length}` }));
    const ul = el('ul');
    for (const item of items) ul.append(editMode ? editRow(item, active.includes(item)) : checkRow(item));
    list.append(el('section', { className: 'category' }, heading, ul));
  }
}

function syncNewCategoryField() {
  const form = $('itemForm');
  const isNew = form.elements.category.value === NEW_CATEGORY;
  $('newCategoryField').hidden = !isNew;
  form.elements.newCategory.required = isNew;
}

function openDialog(item = null) {
  editingId = item?.id ?? null;
  const form = $('itemForm');
  form.reset();
  $('dialogTitle').textContent = item ? 'アイテムを編集' : 'アイテムを追加';
  const cats = categories();
  form.elements.category.replaceChildren(
    ...cats.map((c) => el('option', { value: c, textContent: c })),
    el('option', { value: NEW_CATEGORY, textContent: '＋ 新しいカテゴリ…' }));
  form.elements.itemName.value = item?.name ?? '';
  form.elements.category.value = item?.category ?? cats[0] ?? NEW_CATEGORY;
  form.elements.when.value = item?.when ?? 'all';
  form.elements.once.checked = item?.once ?? false;
  $('deleteBtn').hidden = !item;
  syncNewCategoryField();
  $('itemDialog').showModal();
}

function setup() {
  $('itemForm').elements.when.replaceChildren(
    ...Object.entries(WHEN).map(([value, { label }]) => el('option', { value, textContent: label })));

  document.querySelectorAll('[data-type]').forEach((b) => b.addEventListener('click', () => {
    state.trip.type = b.dataset.type;
    commit();
  }));
  $('optMeals').addEventListener('change', (e) => { state.trip.meals = e.target.checked; commit(); });
  $('optBedding').addEventListener('change', (e) => { state.trip.bedding = e.target.checked; commit(); });
  $('hideChecked').addEventListener('change', (e) => {
    prefs.hideChecked = e.target.checked;
    writeJSON(PREFS_KEY, prefs);
    render();
  });
  $('editToggle').addEventListener('click', () => { editMode = !editMode; render(); });
  $('addBtn').addEventListener('click', () => openDialog());
  $('itemForm').elements.category.addEventListener('change', syncNewCategoryField);

  $('itemForm').addEventListener('submit', (e) => {
    if (e.submitter?.value !== 'save') return;
    const f = e.target.elements;
    const name = f.itemName.value.trim();
    const category = (f.category.value === NEW_CATEGORY ? f.newCategory.value : f.category.value).trim();
    if (!name || !category) {
      e.preventDefault();
      return;
    }
    const data = { name, category, when: f.when.value, once: f.once.checked };
    const existing = state.items.find((i) => i.id === editingId);
    if (existing) Object.assign(existing, data);
    else state.items.push({ id: newId(), ...data });
    commit();
  });

  $('deleteBtn').addEventListener('click', () => {
    const item = state.items.find((i) => i.id === editingId);
    if (!item || !confirm(`「${item.name}」を削除しますか？`)) return;
    state.items = state.items.filter((i) => i.id !== editingId);
    delete state.checked[editingId];
    $('itemDialog').close();
    commit();
  });

  $('resetBtn').addEventListener('click', () => {
    if (!confirm('すべてのチェックを外して、次の山行の準備を始めますか？\n「今回のみ」のアイテムは削除されます。')) return;
    state.checked = {};
    state.items = state.items.filter((i) => !i.once);
    commit();
  });

  $('restoreBtn').addEventListener('click', () => {
    if (!confirm('アイテムを初期リストに戻しますか？\n追加・編集した内容は失われます。')) return;
    state.items = defaultItems();
    state.checked = {};
    commit();
  });

  render();
}

setup();
