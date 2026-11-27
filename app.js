const $ = id => document.getElementById(id);
const address = $('reader');
const status = $('status');
const search = $('search');
let rows = [];
const stockFilter = $('stock-filter');
const storeFilter = $('store-filter');
address.value = localStorage.getItem('pfc-reader-url') || '';
$('read-settings').open = !address.value;
$('connect').onsubmit = event => {
  event.preventDefault();
  if (document.documentElement.dataset.pfcExtension !== 'ready') {
    status.textContent = 'Установите расширение ПФЦ 0.6.1 и обновите страницу.';
    return;
  }
  localStorage.setItem('pfc-reader-url', address.value);
  status.textContent = 'Читаем остатки. Если Google запросит вход, подтвердите его в открывшейся вкладке.';
  window.dispatchEvent(new CustomEvent('pfc:connect', {detail: address.value}));
};
function storeName(row) {
  return row[1] === 'С товаром' ? String(row[6]).trim() : '';
}

const unknownStore = 'unknown';
const unknownStoreLabel = 'Магазин не определён';

function storeKey(row) {
  const name = storeName(row);
  return name ? 'store:' + name : unknownStore;
}

function updateStoreFilter() {
  const previous = storeFilter.value;
  const stores = [...new Set(rows.map(storeName).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'ru', {numeric: true}));
  storeFilter.replaceChildren(new Option('Все магазины', ''),
    ...stores.map(name => new Option(name, 'store:' + name)));
  if (rows.some(row => row[1] === 'С товаром' && !storeName(row))) {
    storeFilter.add(new Option(unknownStoreLabel, unknownStore));
  }
  storeFilter.value = [...storeFilter.options].some(option => option.value === previous) ? previous : '';
}

function summarizeStores(stock) {
  const groups = new Map();
  for (const row of stock) {
    if (row[1] !== 'С товаром') continue;
    const key = storeKey(row);
    if (!groups.has(key)) {
      groups.set(key, {key, name: storeName(row) || unknownStoreLabel, locations: new Set(), articles: new Set(), units: 0});
    }
    const group = groups.get(key);
    group.locations.add(row[0]);
    const article = String(row[5]).trim();
    if (/^[1-9]\d*$/.test(article)) group.articles.add(article);
    group.units += Number(row[4]) || 0;
  }
  return [...groups.values()].sort((a, b) => b.units - a.units || a.name.localeCompare(b.name, 'ru'));
}

function showStoreStock(key) {
  search.value = '';
  stockFilter.value = '';
  storeFilter.value = key;
  renderStock();
  if (location.hash !== '#stock-view') history.pushState(null, '', '#stock-view');
  showView();
  $('stock').scrollIntoView();
  storeFilter.focus({preventScroll: true});
}

function labelMobileCells(row, labels) {
  labels.forEach((label, index) => {
    if (label) row.cells[index].dataset.mobileLabel = label;
  });
}

function renderStoreSummary() {
  const groups = summarizeStores(rows);
  const format = new Intl.NumberFormat('ru-RU');
  $('store-summary-status').textContent = groups.length
    ? 'Магазинов: ' + format.format(groups.filter(group => group.key !== unknownStore).length) +
      ' · Один МХ может учитываться у нескольких магазинов.'
    : 'В загруженных остатках нет товаров.';
  $('store-summary-table').hidden = !groups.length;
  const body = document.createDocumentFragment();
  for (const group of groups) {
    const tr = document.createElement('tr');
    
    // Название магазина (кнопка перехода)
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'stock-map-link';
    button.textContent = group.name;
    button.addEventListener('click', () => showStoreStock(group.key));
    tr.insertCell().append(button);
    
    // Цифры
    for (const count of [group.locations.size, group.articles.size, group.units]) {
      tr.insertCell().textContent = format.format(count);
    }
    
    // Кнопка выгрузки
    const exportBtn = document.createElement('button');
    exportBtn.type = 'button';
    exportBtn.className = 'secondary';
    exportBtn.textContent = 'Выгрузить';
    exportBtn.style.marginLeft = '8px';
    exportBtn.style.padding = '4px 10px';
    exportBtn.style.fontSize = '0.85rem';
    exportBtn.addEventListener('click', () => exportStoreByKey(group.key, group.name));
    tr.insertCell().append(exportBtn);
    
    labelMobileCells(tr, ['', 'МХ с товаром', 'Уникальных НМ', 'Всего штук', '']);
    body.append(tr);
  }
  $('store-summary-rows').replaceChildren(body);
}

function exportStoreByKey(key, name) {
  const filtered = rows.filter(row => row[1] === 'С товаром' && storeKey(row) === key);
  if (!filtered.length) {
    status.textContent = 'Нет данных по магазину «' + name + '».';
    return;
  }
  const headers = ['МХ', 'Баркод', 'Название', 'Количество', 'Артикул WB', 'Магазин WB'];
  const data = filtered.map(row => [
    row[0], row[2], row[3], row[4], row[5], storeName(row)
  ]);
  const csv = [headers, ...data]
  .map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';'))
   .join('\n');
  const blob = new Blob(['\uFEFF' + csv], {type: 'text/csv;charset=utf-8'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `Остатки_${name.replace(/[^\wа-яёА-ЯЁ0-9]+/gi, '_')}_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
  status.textContent = `Выгружено ${filtered.length} позиций магазина «${name}».`;
}

function stockArticleLink(field) {
  const article = String(field).trim();
  if (!/^[1-9]\d*$/.test(article)) return null;
  const link = document.createElement('a');
  link.className = 'stock-article-link';
  link.href = 'https://www.wildberries.ru/catalog/' + article + '/detail.aspx';
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = article;
  return link;
}

function renderStock() {
  const term = search.value.trim().toLocaleLowerCase('ru');
  const found = rows.filter(row => (!stockFilter.value || row[1] === stockFilter.value) &&
    (!storeFilter.value || (row[1] === 'С товаром' && storeKey(row) === storeFilter.value)) &&
    ([0, 2, 3].some(index => String(row[index]).toLocaleLowerCase('ru').includes(term)) ||
      String(row[5]).trim() === term));
  const count = found.reduce((total, row) => total + (Number(row[4]) || 0), 0);
  const locations = new Set(found.map(row => row[0])).size;
  $('count').textContent = 'МХ: ' + locations + ' · Строк: ' + found.length + ' · Всего: ' + count + ' шт.';
  const body = document.createDocumentFragment();
  for (const row of found) {
    const tr = document.createElement('tr');
    row.forEach((field, index) => {
      const cell = tr.insertCell();
      if (index === 0 && /^\d{2}\.\d{2}\.\d{2,3}$/.test(field)) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'stock-map-link';
        button.textContent = field;
        button.setAttribute('aria-label', 'Открыть МХ ' + field + ' на карте склада');
        button.addEventListener('click', () => showStockLocation(field));
        cell.append(button);
        return;
      }
      const link = index === 5 ? stockArticleLink(field) : null;
      if (link) {
        const article = link.textContent;
        const lookup = document.createElement('button');
        lookup.type = 'button';
        lookup.className = 'stock-seller-link';
        lookup.textContent = 'Найти продавца';
        lookup.setAttribute('aria-label', 'Найти продавца по артикулу ' + article);
        lookup.addEventListener('click', () => openSellerDetails(article));
        cell.append(link, lookup);
        return;
      }
      if (index !== 1) {
        cell.textContent = field;
        return;
      }
      const pill = document.createElement('span');
      pill.className = field === 'С товаром' ? 'pill occupied' : 'pill';
      pill.textContent = field;
      cell.append(pill);
    });
    body.append(tr);
  }
  document.querySelector('#stock tbody').replaceChildren(body);
}
search.addEventListener('input', renderStock);
stockFilter.addEventListener('change', renderStock);
storeFilter.addEventListener('change', renderStock);
window.addEventListener('pfc:status', event => { status.textContent = event.detail; });
function acceptStock(data) {
  if (!Array.isArray(data) || !data.every(row => Array.isArray(row) && row.length === 8 &&
      row.every(field => typeof field === 'string' || typeof field === 'number'))) {
    return false;
  }
  rows = data;
  updateStoreFilter();
  renderStoreSummary();
  renderDashboardStores();
  $('stock').hidden = false;
  $('summary').hidden = false;
  status.textContent = 'МХ в отчёте: ' + new Set(rows.map(row => row[0])).size;
  renderSummary();
  mapLoaded = true;
  renderWarehouseMap();
  renderStock();
  return true;
}
window.addEventListener('pfc:result', event => { acceptStock(event.detail); });
$('import-stock').onsubmit = event => {
  event.preventDefault();
  const field = $('stock-data');
  try {
    const packet = JSON.parse(field.value);
    if (packet?.type !== 'pfc-stock-v1' || !acceptStock(packet.rows)) throw new Error();
    field.value = '';
    event.currentTarget.closest('details').open = false;
  } catch {
    status.textContent = 'Формат не распознан. Скопируйте данные целиком со страницы Apps Script.';
  }
};

const writer = $('writer');
const scanAddresses = $('scan-addresses');
scanAddresses.value = localStorage.getItem('pfc-scan-addresses') || '';
writer.value = localStorage.getItem('pfc-writer-url') || '';
writer.addEventListener('change', () => localStorage.setItem('pfc-writer-url', writer.value.trim()));

function renderSummary() {
  const cells = new Map();
  const barcodes = new Set();
  let total = 0;
  let latest = '';
  let latestKey = '';
  for (const [mx, result, barcode, , quantity, , , checkedAt] of rows) {
    cells.set(mx, result);
    if (barcode) barcodes.add(barcode);
    total += Number(quantity) || 0;
    const match = String(checkedAt).match(/^(\d{2})\.(\d{2})\.(\d{4}) (\d{2}:\d{2}:\d{2})$/);
    if (match) {
      const key = match[3] + match[2] + match[1] + match[4];
      if (key > latestKey) { latestKey = key; latest = checkedAt; }
    }
  }
  const occupied = [...cells.values()].filter(result => result === 'С товаром').length;
  const summary = $('summary');
  const transactionsCard = $('transactions-card');
  summary.replaceChildren();
  for (const [name, value] of [['МХ в отчёте', cells.size], ['С товаром', occupied],
    ['Пустых МХ', cells.size - occupied], ['Баркодов', barcodes.size], ['Всего штук', total]]) {
    const card = document.createElement('div');
    const number = document.createElement('strong');
    number.textContent = value.toLocaleString('ru');
    card.append(number, document.createTextNode(name));
    summary.append(card);
  }
  summary.append(transactionsCard);
  if (latest) {
    const time = document.createElement('p');
    time.textContent = 'Последняя проверка по МСК: ' + latest;
    summary.append(time);
  }
}

function sendWarehouse(action, detail) {
  window.dispatchEvent(new CustomEvent(action, {detail}));
}

function showScanError(message) {
  const error = $('scan-error');
  error.textContent = message;
  error.hidden = !message;
}
const scanZone = $('scan-zone');
const savedScanZone = localStorage.getItem('pfc-scan-zone');
scanZone.value = ['warehouse', 'racks', 'pallets', 'custom'].includes(savedScanZone)
  ? savedScanZone : scanAddresses.value.trim() ? 'custom' : 'warehouse';
function updateScanZone() {
  scanAddresses.disabled = scanZone.value !== 'custom';
  $('scan-parallel').disabled = !['custom', 'warehouse'].includes(scanZone.value);
  localStorage.setItem('pfc-scan-zone', scanZone.value);
}
scanZone.addEventListener('change', updateScanZone);
updateScanZone();

function startWarehouse(retry) {
  const zone = scanZone.value;
  showScanError('');
  if (document.documentElement.dataset.pfcWarehouse !== 'ready') {
    $('progress').textContent = 'Установите расширение ПФЦ 0.8.5 и обновите страницу.';
    return;
  }
  if (!address.validity.valid) {
    location.hash = 'settings';
    $('read-settings').open = true;
  }
  if (!writer.value.trim() || !writer.validity.valid) {
    location.hash = 'settings';
    $('scan-settings').open = true;
  }
  if (!address.reportValidity() || !writer.value.trim() || !writer.reportValidity()) {
    $('scan-settings').open = true;
    $('progress').textContent = 'Укажите ссылки чтения и записи Apps Script.';
    return;
  }
  localStorage.setItem('pfc-writer-url', writer.value.trim());
  localStorage.setItem('pfc-reader-url', address.value.trim());
  localStorage.setItem('pfc-scan-addresses', scanAddresses.value);
  const usesCatalog = ['warehouse', 'racks', 'pallets'].includes(zone) && !retry;
  if (usesCatalog && !locationCatalog) {
    showScanError('Сначала загрузите справочник через «Загрузить сохранённые остатки».');
    return;
  }
  const catalog = usesCatalog ? locationCatalog.filter(([mx, active]) => active &&
    (zone === 'warehouse' || (zone === 'pallets') === mx.startsWith('01.01.')))
    .map(([mx]) => mx) : undefined;
  if (catalog && !catalog.length) {
    showScanError('В выбранной зоне нет активных МХ.');
    return;
  }
  $('progress').textContent = 'Запускаем обход…';
  sendWarehouse('pfc:scan', {reader: address.value, writer: writer.value, addresses: scanAddresses.value, zone, catalog, retry, parallel: ['custom', 'warehouse'].includes(zone) && $('scan-parallel').checked});
}
$('scan').onclick = () => startWarehouse(false);
$('retry-scan').onclick = () => startWarehouse(true);
$('retry-save').onclick = () => sendWarehouse('pfc:scan-save', {reader: address.value.trim(), writer: writer.value.trim()});

function pollWarehouse() {
  if (document.documentElement.dataset.pfcWarehouse === 'ready') sendWarehouse('pfc:scan-state');
}
window.addEventListener('pfc:scan-error', event => showScanError(event.detail));
function warehouseEta(job) {
  if (job.phase !== 'scan' || job.checked >= job.total) return '';
  if (job.checked < Math.min(4, job.total) || !Number.isFinite(job.wbMs) || job.wbMs <= 0) {
    return ' · Оцениваем время';
  }
  const remaining = job.total - job.checked;
  const pending = Math.max(0, job.savedCells - (job.committed || 0));
  const writes = job.resumable ? Math.ceil((remaining + pending) / 50) : 1;
  const completedWrites = Math.ceil((job.committed || 0) / 50);
  const writeMs = completedWrites && Number.isFinite(job.googleMs) ? job.googleMs / completedWrites : 0;
  const seconds = Math.ceil((remaining * job.wbMs / job.checked + writes * writeMs) / 1000);
  const minutes = Math.floor(seconds / 60);
  const duration = (minutes ? minutes + ' мин ' : '') + seconds % 60 + ' с';
  return ' · Осталось ≈ ' + duration + (writeMs ? '' : ' до окончания проверки WB');
}

window.addEventListener('pfc:scan-progress', ({detail: job}) => {
  if (!job) return;
  const active = ['scan', 'save'].includes(job.phase);
  $('scan').disabled = active;
  const indicator = $('run-progress');
  indicator.hidden = !active;
  indicator.max = job.total || 1;
  indicator.value = job.checked;
  $('retry-scan').hidden = job.phase !== 'done' || !job.failed.length;
  $('retry-save').hidden = !['error', 'interrupted'].includes(job.phase) || (!job.savedCells && !job.resumable);
  $('retry-save').textContent = job.resumable ? 'Продолжить обход' : 'Повторить запись';
  const percent = job.total > 0 ? Math.floor(100 * job.checked / job.total) : 0;
  const tally = 'Проверено: ' + job.checked + ' из ' + job.total + ' МХ (' + percent + '%)' +
    ' · Успешно: ' + job.savedCells + ' · Проблемных: ' + job.failed.length;
  const label = {
    scan: 'Проверяем ' + (job.current || 'МХ'), save: 'Записываем обход в Google Таблицу',
    done: job.savedCells ? 'Обход записан' : 'Обход завершён. Новых результатов нет', error: 'Операция остановилась', interrupted: 'Обход прерван'
  };
  const seconds = ms => (ms / 1000).toLocaleString('ru-RU', {maximumFractionDigits: 1}) + ' с';
  const timing = Number.isFinite(job.wbMs) && Number.isFinite(job.googleMs)
    ? ' · WB: ' + seconds(job.wbMs) + ' · Google: ' + seconds(job.googleMs) : '';
  $('progress').textContent = label[job.phase] + '. ' + tally + warehouseEta(job) + timing + (job.error ? '. ' + job.error : '');
  const issues = $('issues');
  issues.hidden = !job.failed.length;
  issues.querySelector('ul').replaceChildren(...job.failed.map(item => {
    const li = document.createElement('li');
    li.textContent = item.mx + ' · ' + item.error;
    return li;
  }));
});
setInterval(pollWarehouse, 1500);
pollWarehouse();

function autoLoad() {
  if (!address.value || document.documentElement.dataset.pfcWarehouse !== 'ready') return;
  status.textContent = 'Загружаем последний сохранённый отчёт…';
  sendWarehouse('pfc:connect', {url: address.value, background: true});
}
window.addEventListener('load', autoLoad, {once: true});

function possibleMovement(item) {
  return item.now === item.was &&
    item.cells.some(cell => cell.now > cell.was) &&
    item.cells.some(cell => cell.now < cell.was);
}

function summarizeChanges(products) {
  let gained = 0;
  let lost = 0;
  let moves = 0;
  for (const item of products) {
    const delta = item.now - item.was;
    gained += Math.max(0, delta);
    lost += Math.max(0, -delta);
    if (possibleMovement(item)) moves++;
  }
  return {gained, lost, net: gained - lost, moves};
}

function formatChange(value) {
  const absolute = Math.abs(value).toLocaleString('ru-RU');
  return value > 0 ? '+' + absolute : value < 0 ? '−' + absolute : absolute;
}

let displayedComparison;

function selectChanges(products, search, kind) {
  const query = search.trim().toLocaleLowerCase('ru');
  return products.filter(item => {
    if (kind === 'gain' && item.now <= item.was) return false;
    if (kind === 'loss' && item.now >= item.was) return false;
    if (kind === 'move' && !possibleMovement(item)) return false;
    return [item.barcode, item.name, ...item.cells.map(cell => cell.mx)]
      .some(value => String(value).toLocaleLowerCase('ru').includes(query));
  });
}

function renderChanges(report) {
  displayedComparison = report;
  $('changes-tools').hidden = true;
  $('changes-visible').textContent = '';
  const status = $('changes-status');
  const body = $('changes-rows');
  const missing = $('changes-missing');
  body.replaceChildren();
  $('changes-totals').hidden = true;
  missing.hidden = true;
  $('changes-table').hidden = true;
  if (!report || report.unavailable || report.error) {
    status.textContent = report?.error || (report?.unavailable
      ? 'В журнале пока нет полного обхода с подтверждёнными результатами.'
      : 'Для сравнения обновите расширение и приложение чтения.');
    return;
  }
  status.textContent = (report.manual ? 'Выбранный обход: ' : 'Обход по ') + report.to + ' МСК · Сопоставлено МХ: ' + report.checked +
    (report.from ? (report.manual ? ' · Сравнение с ' : ' · Предыдущие замеры по ') + report.from + ' МСК' : '') +
    ' · Товаров с изменениями: ' + report.products.length;
  missing.hidden = !report.missing.length;
  missing.textContent = 'МХ без пары для сравнения: ' + report.missing.join(', ');
  if (report.checked > 0) {
    const {gained, lost, net, moves} = summarizeChanges(report.products);
    $('changes-gained').textContent = formatChange(gained);
    $('changes-lost').textContent = formatChange(-lost);
    $('changes-net').textContent = formatChange(net);
    $('changes-moves').textContent = moves.toLocaleString('ru-RU');
    $('changes-totals').hidden = false;
  }
  $('changes-tools').hidden = !report.products.length;
  const filtered = selectChanges(report.products, $('changes-search').value, $('changes-kind').value);
  $('changes-visible').textContent = 'Показано: ' + filtered.length + ' из ' + report.products.length;
  $('changes-export').disabled = !filtered.length;
  $('changes-table').hidden = !filtered.length;
  for (const item of filtered) {
    const row = body.insertRow();
    const delta = item.now - item.was;
    for (const value of [item.barcode, item.name, item.was, item.now, delta > 0 ? '+' + delta : delta]) {
      row.insertCell().textContent = value;
    }
    const list = document.createElement('details');
    const title = document.createElement('summary');
    title.textContent = possibleMovement(item) ? 'Возможное перемещение' : 'МХ: ' + item.cells.length;
    list.append(title);
    for (const cell of item.cells) {
      const line = document.createElement('div');
      line.textContent = cell.mx + ' · ' + cell.was + ' → ' + cell.now;
      list.append(line);
    }
    row.insertCell().append(list);
    labelMobileCells(row, ['Баркод', '', 'Было', 'Стало', 'Разница']);
  }
}

function changesCsv(report, products) {
  const escape = value => {
    const text = String(value ?? '');
    const safe = typeof value === 'string' && /^[\s\uFEFF]*[=+@-]|^[\t\r\n]/u.test(text) ? "'" + text : text;
    return '"' + safe.replaceAll('"', '""') + '"';
  };
  const records = [['Ранний замер МСК', 'Поздний замер МСК', 'Баркод', 'Название', 'Было', 'Стало',
    'Разница', 'Изменения по МХ', 'Возможное перемещение']];
  for (const item of products) {
    records.push([report.from, report.to, item.barcode, item.name, item.was, item.now, item.now - item.was,
      item.cells.map(cell => cell.mx + ': ' + cell.was + ' → ' + cell.now).join(', '),
      possibleMovement(item) ? 'Да' : '']);
  }
  return '\uFEFF' + records.map(row => row.map(escape).join(';')).join('\r\n');
}

for (const [id, event] of [['changes-search', 'input'], ['changes-kind', 'change']]) {
  $(id).addEventListener(event, () => renderChanges(displayedComparison));
}
$('changes-export').onclick = () => {
  if (!displayedComparison?.products) return;
  const selected = selectChanges(displayedComparison.products, $('changes-search').value, $('changes-kind').value);
  if (!selected.length) return;
  const file = new Blob([changesCsv(displayedComparison, selected)], {type: 'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'pfc-izmeneniya.csv';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

let automaticReport;
let scanHistory = [];
const historyMode = $('history-mode');
const historyFrom = $('history-from');
const historyTo = $('history-to');

function compareSavedScans(before, after) {
  const previous = new Map(before.cells);
  const latest = new Map(after.cells);
  const scopeFor = (scan, checked) => scan.scope ?? checked.keys();
  const expected = [...new Set([...scopeFor(before, previous), ...scopeFor(after, latest)])];
  const missing = expected.filter(mx => !previous.has(mx) || !latest.has(mx)).sort();
  const products = new Map();
  let checked = 0;
  for (const [mx, current] of latest) {
    if (!previous.has(mx)) continue;
    checked++;
    const oldByCode = new Map(previous.get(mx).map(item => [item[0], item]));
    const newByCode = new Map(current.map(item => [item[0], item]));
    for (const barcode of new Set([...oldByCode.keys(), ...newByCode.keys()])) {
      const oldItem = oldByCode.get(barcode);
      const newItem = newByCode.get(barcode);
      const was = oldItem?.[2] ?? 0;
      const now = newItem?.[2] ?? 0;
      if (!products.has(barcode)) products.set(barcode, {
        barcode, name: (newItem || oldItem)[1], was: 0, now: 0, cells: []
      });
      const product = products.get(barcode);
      product.was += was;
      product.now += now;
      if (was !== now) product.cells.push({mx, was, now});
    }
  }
  const changed = [...products.values()].filter(item => item.cells.length)
    .sort((a, b) => Math.abs(b.now - b.was) - Math.abs(a.now - a.was));
  return {manual: true, from: before.stamp, to: after.stamp, checked, missing, products: changed};
}

function renderHistory() {
  const manual = historyMode.value === 'manual';
  $('history-selection').hidden = !manual;
  if (!manual) {
    renderChanges(automaticReport);
    return;
  }
  const earlier = scanHistory.findIndex(item => item.id === historyFrom.value);
  const later = scanHistory.findIndex(item => item.id === historyTo.value);
  if (later < 0 || earlier <= later) {
    renderChanges({error: 'Выберите два разных обхода. Первый должен быть раньше второго.'});
    return;
  }
  renderChanges(compareSavedScans(scanHistory[earlier], scanHistory[later]));
}

$('history-form').addEventListener('submit', event => event.preventDefault());
for (const field of [historyMode, historyFrom, historyTo]) field.addEventListener('change', renderHistory);
window.addEventListener('pfc:changes', ({detail: report}) => {
  automaticReport = report;
  scanHistory = report?.snapshots ?? [];
  $('history-form').hidden = scanHistory.length < 2;
  if (scanHistory.length < 2) historyMode.value = 'auto';
  for (const [select, fallback] of [[historyFrom, 1], [historyTo, 0]]) {
    const selected = select.value;
    select.replaceChildren(...scanHistory.map(item => {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = item.stamp + (item.scope ? ' · МХ: ' + item.cells.length + '/' + item.scope.length : ' · МХ: ' + item.cells.length);
      return option;
    }));
    select.value = scanHistory.some(item => item.id === selected)
      ? selected : scanHistory[fallback]?.id ?? '';
  }
  renderHistory();
  updateTrendOptions();
  renderTrend();
});

let locationCatalog = null;
const mapZone = $('map-zone');
let mapLoaded = false;
let mapCells = new Map();
const addressPart = number => String(number).padStart(2, '0');

function warehouseGroups() {
  if (locationCatalog) {
    const groups = new Map();
    const pallets = mapZone.value === 'pallets';
    for (const [mx, active] of locationCatalog) {
      if (!active || pallets !== mx.startsWith('01.01.')) continue;
      const [rack, shelf, cell] = mx.split('.');
      const group = pallets ? Math.floor((Number(cell) - 1) / 25) : Number(rack);
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push([mx, pallets ? cell : shelf + '.' + cell]);
    }
    return [...groups].sort(([a], [b]) => a - b).map(([group, locations]) => ({
      title: pallets ? 'Места ' + (group * 25 + 1) + '–' + (group * 25 + 25) : 'Стеллаж ' + addressPart(group),
      locations: locations.sort(([a], [b]) => a.localeCompare(b, 'ru', {numeric: true}))
    }));
  }
  return [];
}

function openMapCell(address) {
  $('map-cell-title').textContent = 'МХ ' + address;
  const entry = mapCells.get(address);
  const state = entry?.state || 'Не проверено';
  $('map-cell-status').textContent = entry?.time ? state + ' · Проверено МСК: ' + entry.time : state;
  const items = entry?.products || [];
  const total = items.reduce((sum, row) => sum + (Number(row[4]) || 0), 0);
  const barcodes = new Set(items.map(row => row[2]).filter(Boolean));
  const format = new Intl.NumberFormat('ru-RU');
  const totals = $('map-cell-totals');
  totals.hidden = items.length === 0;
  totals.textContent = 'Позиций: ' + format.format(items.length) +
    ' · Баркодов: ' + format.format(barcodes.size) +
    ' · Всего: ' + format.format(total) + ' шт.';
  const wrap = $('map-products-table');
  wrap.hidden = items.length === 0;
  $('map-cell-empty').hidden = items.length > 0;
  $('map-cell-empty').textContent = entry ? 'В ячейке нет товара.' : 'Данные проверки этой ячейки ещё не загружены.';
  const body = document.createDocumentFragment();
  for (const row of items) {
    const tr = document.createElement('tr');
    for (const field of [row[3], row[2]]) tr.insertCell().textContent = field || '—';
    const article = tr.insertCell();
    const link = stockArticleLink(row[5]);
    if (link) article.append(link);
    else article.textContent = row[5] || '—';
    tr.insertCell().textContent = storeName(row) || '—';
    tr.insertCell().textContent = format.format(Number(row[4]) || 0);
    labelMobileCells(tr, ['', 'Баркод', 'Артикул WB', 'Магазин WB', 'Количество']);
    body.append(tr);
  }
  $('map-products').replaceChildren(body);
  wrap.scrollTop = 0;
  wrap.scrollLeft = 0;
  $('map-details').showModal();
}

function stockSnapshotTotals(cells, common) {
  let units = 0;
  let occupied = 0;
  for (const [mx, products] of cells) {
    if (common && !common.has(mx)) continue;
    if (products.length) occupied++;
    for (const product of products) units += Number(product[2]) || 0;
  }
  return {units, occupied};
}

function fullTrendScans(history, catalog) {
  const active = new Set((catalog || []).filter(([, enabled]) => enabled).map(([mx]) => mx));
  if (!active.size) return [];
  return history.filter(scan => {
    const scope = new Set(scan.scope);
    const cells = new Map(scan.cells);
    return scope.size === active.size && cells.size === active.size &&
      [...active].every(mx => scope.has(mx) && cells.has(mx));
  }).reverse();
}

function updateTrendOptions() {
  $('trend-comparison').hidden = scanHistory.length < 2;
  for (const [id, fallback] of [['trend-from', 1], ['trend-to', 0]]) {
    const select = $(id);
    const previous = select.value;
    select.replaceChildren(...scanHistory.map(scan =>
      new Option(scan.stamp + ' · МХ: ' + scan.cells.length, scan.id)));
    select.value = scanHistory.some(scan => scan.id === previous) ? previous : scanHistory[fallback]?.id ?? '';
  }
}

function trendPair() {
  const before = scanHistory.findIndex(scan => scan.id === $('trend-from').value);
  const after = scanHistory.findIndex(scan => scan.id === $('trend-to').value);
  return before > after && after >= 0 ? [scanHistory[before], scanHistory[after]] : null;
}

function scanDay(scan) {
  const match = scan.stamp.match(/^(\d{2})\.(\d{2})\.(\d{4}) /);
  if (!match) return NaN;
  const [, day, month, year] = match.map(Number);
  return Date.UTC(year, month - 1, day) / 86400000;
}

function dailyTrendScans(scans) {
  const days = new Map();
  for (const scan of scans) {
    const day = scanDay(scan);
    if (Number.isFinite(day)) days.set(day, scan);
  }
  return days;
}

function drawDashboardScale(plot, low, high, format) {
  const step = Math.max(1, Math.ceil((high - low) / 4));
  const ticks = [...new Set([low, ...[1, 2, 3].map(i => low + step * i).filter(value => value < high), high])];
  for (const value of ticks) {
    const tick = document.createElement('div');
    tick.className = 'dashboard-scale-tick';
    tick.style.top = (10 + 80 * (high - value) / (high - low)) + '%';
    tick.textContent = format.format(value);
    tick.setAttribute('aria-hidden', 'true');
    plot.append(tick);
  }
}

function drawTrend(chart, days, values, format, lastDay, period) {
  const firstDay = lastDay - period + 1;
  const date = day => new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit', month: '2-digit', timeZone: 'UTC'
  }).format(day * 86400000);
  const minimum = values.size ? Math.min(...values.values()) : 0;
  const padding = Math.max(1, Math.ceil((Math.max(0, ...values.values()) - minimum) / 5));
  const low = Math.max(0, minimum - padding);
  const high = Math.max(0, ...values.values()) + padding;
  const plot = chart.querySelector('.trend-plot');
  plot.replaceChildren();
  drawDashboardScale(plot, low, high, format);
  let previous;
  const prior = [...days].filter(([day]) => day < firstDay).at(-1);
  let lastValue = prior ? stockSnapshotTotals(prior[1].cells)[$('trend-metric').value] : undefined;
  let label;
  for (let day = firstDay; day <= lastDay; day++) {
    const value = values.get(day);
    const scan = days.get(day);
    const point = {
      x: 14 + 83 * (day - firstDay) / (period - 1),
      y: scan ? 10 + 80 * (high - value) / (high - low) : 94
    };
    if (previous && scan) {
      const line = document.createElement('span');
      line.className = 'trend-segment';
      line.style.clipPath = 'polygon(' + previous.x + '% ' + (previous.y - 0.5) + '%, ' +
        point.x + '% ' + (point.y - 0.5) + '%, ' +
        point.x + '% ' + (point.y + 0.5) + '%, ' +
        previous.x + '% ' + (previous.y + 0.5) + '%)';
      plot.append(line);
    }
    const delta = lastValue === undefined || !scan ? '' :
      ' · К предыдущему обходу: ' + new Intl.NumberFormat('ru-RU', {signDisplay: 'exceptZero'}).format(value - lastValue);
    const detail = scan ? scan.stamp + ' МСК · ' + format.format(value) + delta : date(day) + ' · Нет полного обхода';
    const dot = dashboardButton('', () => { $('trend-point-value').textContent = detail; });
    dot.className = scan ? 'trend-point' : 'trend-point trend-missing';
    dot.style.left = point.x + '%';
    dot.style.top = point.y + '%';
    dot.title = detail;
    dot.setAttribute('aria-label', detail);
    dot.addEventListener('focus', () => { $('trend-point-value').textContent = detail; });
    plot.append(dot);
    previous = scan ? point : undefined;
    if (scan) {
      lastValue = value;
      label = detail;
    }
  }
  const axis = chart.querySelector('.trend-axis');
  axis.replaceChildren(...[0, ...(period === 7 ? [1, 2, 3, 4, 5] : [7, 14, 21]), period - 1].map(offset => {
    const tick = document.createElement('span');
    tick.textContent = date(firstDay + offset);
    tick.style.left = (14 + 83 * offset / (period - 1)) + '%';
    return tick;
  }));
  $('trend-point-value').textContent = label || 'В выбранном периоде нет полного обхода.';

}

function renderTrend() {
  const metric = $('trend-metric').value;
  const format = new Intl.NumberFormat('ru-RU');
  const days = dailyTrendScans(fullTrendScans(scanHistory, locationCatalog));
  const period = Number($('trend-period').value);
  const lastDay = Math.max(...scanHistory.map(scanDay).filter(Number.isFinite));
  const values = new Map([...days].filter(([day]) => day > lastDay - period && day <= lastDay)
    .map(([day, scan]) => [day, stockSnapshotTotals(scan.cells)[metric]]));
  $('trend-status').textContent = scanHistory.length
    ? 'Последний полный обход каждого дня · время МСК'
    : 'Загрузите историю обходов.';
  const chart = $('trend-chart');
  chart.hidden = !Number.isFinite(lastDay);
  if (!chart.hidden) drawTrend(chart, days, values, format, lastDay, period);
  if (days.size >= 2 && !$('trend-from').dataset.manual) {
    const [before, after] = [...days.values()].slice(-2);
    $('trend-from').value = before.id;
    $('trend-to').value = after.id;
  }
  const pair = trendPair();
  $('trend-open').disabled = !pair;
  const result = $('trend-result');
  if (!pair) {
    result.textContent = 'Выберите два обхода в хронологическом порядке.';
    return;
  }
  const [before, after] = pair;
  const earlier = new Map(before.cells);
  const later = new Map(after.cells);
  const common = new Set([...earlier.keys()].filter(mx => later.has(mx)));
  const expected = new Set([...(before.scope ?? earlier.keys()), ...(after.scope ?? later.keys()), ...earlier.keys(), ...later.keys()]);
  const coverage = 'Сопоставлено ' + common.size + ' из ' + expected.size + ' МХ';
  if (!common.size) {
    result.textContent = coverage + '. Нет общих проверенных МХ.';
    return;
  }
  const was = stockSnapshotTotals(earlier, common)[metric];
  const now = stockSnapshotTotals(later, common)[metric];
  const delta = new Intl.NumberFormat('ru-RU', {signDisplay: 'exceptZero'}).format(now - was);
  result.textContent = coverage + ' · Было: ' + format.format(was) + ' · Стало: ' + format.format(now) + ' · Разница: ' + delta;
}

for (const id of ['trend-period', 'trend-metric', 'trend-from', 'trend-to']) {
  $(id).addEventListener('change', () => {
    if (id === 'trend-from' || id === 'trend-to') $('trend-from').dataset.manual = 'true';
    renderTrend();
  });
}
$('trend-open').addEventListener('click', () => {
  const pair = trendPair();
  if (!pair) return;
  historyMode.value = 'manual';
  historyFrom.value = pair[0].id;
  historyTo.value = pair[1].id;
  renderHistory();
  location.hash = 'changes';
});

function dashboardButton(label, action) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'stock-map-link';
  button.textContent = label;
  button.addEventListener('click', action);
  return button;
}

function dashboardZoneCounts(catalog, cells) {
  const zones = {pallets: [0, 0, 0], racks: [0, 0, 0]};
  for (const [address, active] of catalog) {
    if (!active) continue;
    const state = cells.get(address)?.state;
    zones[address.startsWith('01.01.') ? 'pallets' : 'racks'][
      state === 'С товаром' ? 0 : state === 'Пусто' ? 1 : 2]++;
  }
  return zones;
}

function renderDashboardZones() {
  renderTrend();
  const container = $('dashboard-zones');
  container.replaceChildren();
  const ready = Boolean(locationCatalog) && mapLoaded;
  $('dashboard-zones-status').hidden = ready;
  if (!ready) return;
  const counts = dashboardZoneCounts(locationCatalog, mapCells);
  for (const [zone, label] of [['pallets', 'Паллетные места'], ['racks', 'Стеллажи']]) {
    const values = counts[zone];
    const total = values.reduce((sum, value) => sum + value, 0);
    const line = document.createElement('div');
    line.className = 'dashboard-line';
    const bar = document.createElement('div');
    bar.className = 'dashboard-track';
    bar.setAttribute('aria-hidden', 'true');
    values.forEach((value, index) => {
      const segment = document.createElement('span');
      segment.className = ['dashboard-occupied', 'dashboard-empty', 'dashboard-unknown'][index];
      segment.style.width = (total ? 100 * value / total : 0) + '%';
      bar.append(segment);
    });
    const details = document.createElement('p');
    details.className = 'dashboard-zone-legend';
    for (const [index, name] of ['Занято', 'Пусто', 'Не проверено'].entries()) {
      const item = document.createElement('span');
      item.className = ['zone-occupied', 'zone-empty', 'zone-unknown'][index];
      item.textContent = name + ' ' + values[index];
      details.append(item);
    }
    const header = document.createElement('div');
    header.className = 'dashboard-heading';
    const occupancy = document.createElement('strong');
    occupancy.textContent = total ? Math.round(100 * values[0] / total) + '%' : '—';
    occupancy.title = 'Доля занятых активных МХ';
    header.append(dashboardButton(label, () => {
      mapZone.value = zone;
      renderWarehouseMap();
      location.hash = 'warehouse-map';
    }), occupancy);
    line.append(header, bar, details);
    container.append(line);
  }
}

function renderDashboardStores() {
  const container = $('dashboard-stores');
  container.replaceChildren();
  const byUnits = $('dashboard-metric').value === 'units';
  const metric = group => byUnits ? group.units : group.locations.size;
  const groups = summarizeStores(rows).sort((a, b) => metric(b) - metric(a)).slice(0, 10);
  $('dashboard-stores-status').textContent = groups.length ? 'Показано: ' + groups.length + ' · по убыванию' : 'В загруженных остатках нет товаров.';
  const format = new Intl.NumberFormat('ru-RU');
  for (const group of groups) {
    const line = document.createElement('div');
    line.className = 'dashboard-line';
    const header = document.createElement('div');
    header.className = 'dashboard-heading';
    const count = document.createElement('strong');
    count.textContent = format.format(metric(group)) + (byUnits ? ' шт.' : ' МХ');
    header.append(dashboardButton(group.name, () => showStoreStock(group.key)), count);
    const bar = document.createElement('div');
    bar.className = 'dashboard-track';
    bar.setAttribute('aria-hidden', 'true');
    const fill = document.createElement('span');
    fill.className = 'dashboard-store-fill';
    fill.style.width = (metric(groups[0]) ? 100 * metric(group) / metric(groups[0]) : 0) + '%';
    bar.append(fill);
    line.append(header, bar);
    container.append(line);
  }
}
$('dashboard-metric').addEventListener('change', renderDashboardStores);

function renderWarehouseMap() {
  mapCells = new Map();
  for (const row of rows) {
    const [address, state, , , , , , time] = row;
    if (state !== 'С товаром' && state !== 'Ничего не найдено') continue;
    if (!mapCells.has(address)) mapCells.set(address, {state: 'Пусто', time, products: []});
    const entry = mapCells.get(address);
    if (state === 'С товаром') {
      entry.state = state;
      entry.products.push(row);
    }
  }
  renderDashboardZones();
  const totals = {occupied: 0, empty: 0, unknown: 0};
  const groups = warehouseGroups().map(({title, locations}) => {
    const card = document.createElement('section');
    const heading = document.createElement('h3');
    heading.textContent = title;
    const cells = document.createElement('div');
    cells.className = 'map-cells ' + (mapZone.value === 'pallets' ? 'pallets' : '');
    for (const [address, label] of locations) {
      const state = mapCells.get(address)?.state;
      const color = state === 'С товаром' ? 'occupied' : state === 'Пусто' ? 'empty' : 'unknown';
      totals[color]++;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = color;
      button.dataset.address = address;
      button.textContent = label;
      button.title = address + ' · ' + (state || 'Не проверено');
      button.setAttribute('aria-label', button.title);
      cells.append(button);
    }
    card.append(heading, cells);
    return card;
  });
  $('map-grid').replaceChildren(...groups);
  $('map-status').textContent = mapLoaded
    ? 'С товаром: ' + totals.occupied + ' · Пусто: ' + totals.empty + ' · Не проверено: ' + totals.unknown
    : 'Загрузите остатки, чтобы увидеть занятость.';
}

mapZone.addEventListener('change', renderWarehouseMap);
$('map-grid').addEventListener('click', event => {
  const cell = event.target.closest('button[data-address]');
  if (cell) openMapCell(cell.dataset.address);
});
function findMapButton(address) {
  mapZone.value = address.startsWith('01.01.') ? 'pallets' : 'racks';
  renderWarehouseMap();
  return [...$('map-grid').querySelectorAll('button')].find(button => button.dataset.address === address);
}

function showStockLocation(address) {
  if (location.hash !== '#warehouse-map') history.pushState(null, '', '#warehouse-map');
  showView();
  window.scrollTo(0, 0);
  const input = $('map-address');
  input.value = address;
  input.setCustomValidity('');
  (findMapButton(address) || input).focus();
  openMapCell(address);
}

$('map-find').addEventListener('submit', event => {
  event.preventDefault();
  const input = $('map-address');
  const address = input.value.trim();
  const cell = findMapButton(address);
  if (!cell) {
    input.setCustomValidity('Введите адрес из карты склада, например 02.01.03.');
    input.reportValidity();
    return;
  }
  cell.focus();
  openMapCell(address);
});
$('map-address').addEventListener('input', event => event.target.setCustomValidity(''));
renderWarehouseMap();

const viewLinks = [...document.querySelectorAll('.view-nav a')];
function showView() {
  const current = viewLinks.find(link => link.hash === location.hash) || viewLinks[0];
  for (const tab of document.querySelectorAll('.mobile-tabs a')) {
    if (tab.hash === current.hash) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }
  for (const link of viewLinks) {
    const active = link === current;
    $(link.hash.slice(1)).hidden = !active;
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
}
window.addEventListener('hashchange', () => {
  showView();
  window.scrollTo(0, 0);
});
showView();

function locationAddresses(mode, fields) {
  const numeric = (value, min, max) => /^\d+$/.test(value) && Number(value) >= min && Number(value) <= max;
  if (mode === 'single') {
    const match = fields.single.trim().match(/^(\d{2})\.(\d{2})\.(\d{2,3})$/);
    if (!match || !numeric(match[1], 1, 99) || !numeric(match[2], 1, 99) || !numeric(match[3], 1, 999) ||
        (match[1] === '01' && match[2] !== '01')) throw new Error('Введите МХ вида 11.01.01 или 01.01.351.');
    return [match[1] + '.' + match[2] + '.' + addressPart(Number(match[3]))];
  }
  if (mode === 'pallets') {
    if (!numeric(fields.first, 1, 999) || !numeric(fields.last, Number(fields.first), 999)) {
      throw new Error('Укажите диапазон паллет от 1 до 999.');
    }
    return Array.from({length: Number(fields.last) - Number(fields.first) + 1}, (_, i) =>
      '01.01.' + addressPart(Number(fields.first) + i));
  }
  if (!numeric(fields.rack, 2, 99) || !numeric(fields.shelves, 1, 99) || !numeric(fields.cells, 1, 99) ||
      Number(fields.shelves) * Number(fields.cells) > 999) throw new Error('Проверьте номер стеллажа и размеры. Максимум 999 МХ за раз.');
  return Array.from({length: Number(fields.shelves) * Number(fields.cells)}, (_, i) =>
    [Number(fields.rack), Math.floor(i / Number(fields.cells)) + 1, i % Number(fields.cells) + 1].map(addressPart).join('.'));
}

let locationPreview = [];
function clearLocationPreview() {
  locationPreview = [];
  for (const id of ['locations-preview', 'locations-enable', 'locations-disable']) $(id).hidden = true;
}
function renderLocationCatalog() {
  if (!locationCatalog) return;
  const query = $('locations-search').value.trim();
  const found = locationCatalog.filter(([mx]) => mx.includes(query));
  $('locations-count').textContent = 'Активных: ' + locationCatalog.filter(([, active]) => active).length +
    ' · Всего: ' + locationCatalog.length + ' · В списке: ' + Math.min(30, found.length) + ' из ' + found.length;
  $('locations-list').replaceChildren(...found.slice(0, 30).map(([mx, active]) => {
    const row = document.createElement('li');
    row.textContent = mx + ' · ' + (active ? 'Активен' : 'Отключён');
    return row;
  }));
}
function acceptLocationCatalog(data) {
  if (!Array.isArray(data)) return;
  locationCatalog = data;
  renderLocationCatalog();
  renderWarehouseMap();
}
window.addEventListener('pfc:locations', ({detail}) => {
  if (detail.error) {
    locationCatalog = null;
    renderDashboardZones();
    $('locations-status').textContent = detail.error;
  } else acceptLocationCatalog(detail.rows);
});
$('locations-search').addEventListener('input', renderLocationCatalog);
$('location-mode').addEventListener('change', () => {
  for (const element of document.querySelectorAll('[data-location-mode]')) {
    element.hidden = element.dataset.locationMode !== $('location-mode').value;
  }
});
$('locations-form').addEventListener('input', clearLocationPreview);
$('locations-form').onsubmit = event => {
  event.preventDefault();
  try {
    const fields = Object.fromEntries(['single','rack','shelves','cells','first','last']
      .map(key => [key, $('location-' + key).value]));
    locationPreview = locationAddresses($('location-mode').value, fields);
    $('locations-status').textContent = 'Адресов в списке: ' + locationPreview.length;
    $('locations-preview').textContent = locationPreview.join(', ');
    for (const id of ['locations-preview', 'locations-enable', 'locations-disable']) $(id).hidden = false;
  } catch (error) {
    clearLocationPreview();
    $('locations-status').textContent = error.message;
  }
};
for (const [id, active] of [['locations-enable', true], ['locations-disable', false]]) {
  $(id).onclick = () => {
    if (document.documentElement.dataset.pfcLocations !== 'ready') {
      $('locations-status').textContent = 'Обновите расширение ПФЦ до 0.8.5.';
      return;
    }
    if (!writer.value.trim() || !writer.validity.valid) {
      $('scan-settings').open = true;
      writer.focus();
      $('locations-status').textContent = 'Укажите ссылку /exec для записи.';
      return;
    }
    if (!locationPreview.length) return;
    for (const key of ['locations-enable', 'locations-disable']) $(key).disabled = true;
    $('locations-status').textContent = 'Сохраняем справочник…';
    window.dispatchEvent(new CustomEvent('pfc:locations-save', {
      detail: {writer: writer.value.trim(), request: {addresses: locationPreview, active}}
    }));
  };
}
window.addEventListener('pfc:locations-saved', ({detail}) => {
  for (const id of ['locations-enable', 'locations-disable']) $(id).disabled = false;
  if (!detail.error) {
    acceptLocationCatalog(detail.rows);
    clearLocationPreview();
  }
  $('locations-status').textContent = detail.error || 'Справочник сохранён.';
});

let sellerRequestId = 0;
function openSellerDetails(article) {
  const dialog = $('seller-details');
  const requestId = ++sellerRequestId;
  $('seller-fields').hidden = true;
  $('seller-title').textContent = 'Продавец · ' + article;
  dialog.showModal();
  if (document.documentElement.dataset.pfcSeller !== 'ready') {
    $('seller-status').textContent = 'Обновите расширение ПФЦ до 0.9.1 и перезагрузите страницу.';
    return;
  }
  $('seller-status').textContent = 'Ищем продавца на Wildberries и сохраняем в Google Таблицу…';
  window.dispatchEvent(new CustomEvent('pfc:seller-find', {detail: {article, requestId, writer: writer.value.trim()}}));
}

window.addEventListener('pfc:seller-result', event => {
  const {requestId, seller, saved, saveError, error} = event.detail;
  if (requestId !== sellerRequestId || !$('seller-details').open) return;
  $('seller-status').textContent = error || (saved ? 'Записано в лист «Продавцы WB».' : 'Продавец найден. Ошибка записи: ' + (saveError || 'обновите расширение.'));
  if (!seller || !/^[1-9]\d*$/.test(seller.id)) return;
  const store = $('seller-store');
  store.href = 'https://www.wildberries.ru/seller/' + seller.id;
  store.textContent = seller.name || 'Открыть витрину WB';
  $('seller-legal').textContent = seller.legalName || 'Не указано на WB';
  $('seller-email').textContent = seller.email || 'Не указана на WB';
  $('seller-fields').hidden = false;
});

function requestSellerBatchArticle(article, writerAddress) {
  const requestId = crypto.randomUUID();
  return new Promise(resolve => {
    function receive(event) {
      if (event.detail.requestId !== requestId) return;
      window.removeEventListener('pfc:seller-result', receive);
      clearTimeout(timeout);
      resolve(event.detail);
    }
    const timeout = setTimeout(() => {
      window.removeEventListener('pfc:seller-result', receive);
      resolve({saveError: 'Расширение не ответило вовремя.'});
    }, 90000);
    window.addEventListener('pfc:seller-result', receive);
    window.dispatchEvent(new CustomEvent('pfc:seller-find', {detail: {article, requestId, writer: writerAddress}}));
  });
}

const sellerResumeKey = 'pfc-seller-resume-122';
const sellerBatchButton = $('seller-all');
function updateSellerBatchButton() {
  sellerBatchButton.textContent = sessionStorage.getItem(sellerResumeKey)
    ? 'Продолжить проверку поставщиков' : 'Проверить поставщиков по занятым МХ';
}
updateSellerBatchButton();
sellerBatchButton.addEventListener('click', async event => {
  const button = event.currentTarget;
  const status = $('seller-batch-status');
  const errors = $('seller-batch-errors');
  const list = errors.querySelector('ul');
  status.hidden = false;
  errors.hidden = true;
  list.replaceChildren();
  if (document.documentElement.dataset.pfcSeller !== 'ready') {
    status.textContent = 'Обновите расширение ПФЦ до 0.9.1 и перезагрузите страницу.';
    return;
  }
  if (!locationCatalog || !writer.value.trim() || !writer.reportValidity()) {
    status.textContent = 'Загрузите сохранённые остатки со справочником МХ и проверьте ссылку записи в настройках.';
    return;
  }
  const active = new Set(locationCatalog.filter(([, enabled]) => enabled).map(([mx]) => mx));
  const articles = [...new Set(rows.filter(row => active.has(row[0]) && row[1] === 'С товаром')
    .map(row => String(row[5]).trim()).filter(value => /^[1-9]\d{0,15}$/.test(value)))];
  if (!articles.length) {
    status.textContent = 'В сохранённых остатках активных МХ нет артикулов WB.';
    return;
  }
  const writerAddress = writer.value.trim();
  const manual = $('seller-start-article').value.trim();
  const checkpoint = sessionStorage.getItem(sellerResumeKey);
  const start = manual || checkpoint;
  const first = start ? articles.indexOf(start) : 0;
  if (first < 0) {
    status.textContent = 'Артикул ' + start + ' отсутствует в текущем списке активных МХ.';
    if (!manual) sessionStorage.removeItem(sellerResumeKey);
    updateSellerBatchButton();
    return;
  }
  $('seller-start-article').value = '';
  sessionStorage.setItem(sellerResumeKey, articles[first]);
  const remaining = articles.slice(first);
  button.disabled = true;
  let saved = 0;
  let checked = 0;
  let pausedOnWrite = false;
  try {
    for (const [index, article] of remaining.entries()) {
      sessionStorage.setItem(sellerResumeKey, article);
      status.textContent = 'Проверяем НМ ' + article + ' · ' + (first + index + 1) + ' из ' + articles.length;
      let result = await requestSellerBatchArticle(article, writerAddress);
      for (const delay of [2000, 5000]) {
        if (result.saved || !result.saveError) break;
        status.textContent = 'Ошибка записи НМ ' + article + ' · повтор через ' + delay / 1000 + ' с';
        await new Promise(resolve => setTimeout(resolve, delay));
        const retry = await requestSellerBatchArticle(article, writerAddress);
        if (retry.saved || retry.saveError) result = retry;
        else break;
      }
      checked++;
      if (result.saved) {
        saved++;
        continue;
      }
      const li = document.createElement('li');
      li.textContent = article + ' · ' + (result.saveError || result.error || 'Запись не подтверждена.').replace(/ и нажмите «Продолжить обход»/, '');
      list.append(li);
      errors.hidden = false;
      if (result.saveError) {
        pausedOnWrite = true;
        break;
      }
    }
    const blocked = pausedOnWrite;
    if (!blocked) sessionStorage.removeItem(sellerResumeKey);
    status.textContent = 'Проверено за этот запуск: ' + checked + ' из ' + remaining.length + ' · Записано: ' + saved +
      ' · Проблемных: ' + (checked - saved) +
      (blocked ? ' · Проверьте ссылку записи /exec. Затем нажмите «Продолжить проверку поставщиков».' : '');
  } finally {
    button.disabled = false;
    updateSellerBatchButton();
  }
});

const transactionsButton = $('transactions-refresh');
const transactionsStatus = $('transactions-status');
let transactionsTimeout;
let shipmentHistory;
function refreshTransactions() {
  if (transactionsButton.disabled) return;
  $('transactions-prepared').textContent = '—';
  if (document.documentElement.dataset.pfcTransactions !== 'ready') {
    transactionsStatus.textContent = 'Обновите расширение ПФЦ до 1.0.0 и перезагрузите страницу.';
    return;
  }
  transactionsButton.disabled = true;
  transactionsStatus.textContent = 'Открываем «Все транзакции» в фоне…';
  transactionsTimeout = setTimeout(() => {
    transactionsStatus.textContent = 'Расширение не ответило. Повторите чтение.';
    transactionsButton.disabled = false;
  }, 60000);
  sendWarehouse('pfc:transactions', {writer: writer.value.trim()});
}

transactionsButton.addEventListener('click', refreshTransactions);


window.addEventListener('pfc:transactions-result', ({detail}) => {
  if (!transactionsButton.disabled) return;
  clearTimeout(transactionsTimeout);
  transactionsButton.disabled = false;
  if (!detail?.ok) {
    transactionsStatus.textContent = detail?.error || 'Не удалось прочитать транзакции.';
    return;
  }
  const {totals, history, saved, wbError, sheetError} = detail.data;
  const now = new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'Europe/Moscow'
  }).formatToParts(new Date());
  const today = now.filter(part => ['day', 'month', 'year'].includes(part.type))
    .map(part => Number(part.value)).join('.');
  shipmentHistory = {today, history: saved ?? history ?? {}, saved: Boolean(saved)};
  renderShipmentChart(shipmentHistory);
  const prepared = saved?.[today]?.prepared ?? totals?.prepared;
  $('transactions-prepared').textContent = Number.isFinite(prepared)
    ? prepared.toLocaleString('ru-RU') + ' шт.' : '—';
  transactionsStatus.textContent = [wbError, sheetError && 'Google Таблица: ' + sheetError,
    Number.isFinite(prepared) ? (saved ? 'Данные из Google Таблицы' : 'По загруженным строкам WB') : 'Итог за сегодня отсутствует.']
    .filter(Boolean).join(' · ');
});

const transactionsRoot = document.documentElement;
if (window.matchMedia('(max-width: 720px)').matches) {
  // Mobile metrics are supplied by the authenticated reader.
} else if (transactionsRoot.dataset.pfcTransactions === 'ready') {
  refreshTransactions();
} else {
  transactionsStatus.textContent = 'Ждём подключения расширения для чтения транзакций…';
  const ready = new MutationObserver(() => {
    if (transactionsRoot.dataset.pfcTransactions !== 'ready') return;
    ready.disconnect();
    clearTimeout(readyTimeout);
    refreshTransactions();
  });
  const readyTimeout = setTimeout(() => {
    ready.disconnect();
    transactionsStatus.textContent = 'Расширение для транзакций не подключилось. Проверьте версию 0.11.5 и обновите страницу.';
  }, 8000);
  ready.observe(transactionsRoot, {attributes: true, attributeFilter: ['data-pfc-transactions']});
}

function shipmentPeriodTotals(days) {
  let covered = 0;
  let total = 0;
  let peak;
  for (const day of days) {
    if (!Number.isFinite(day.value)) continue;
    covered++;
    total += day.value;
    if (!peak || day.value > peak.value) peak = day;
  }
  return {covered, total, peak};
}

function shipmentPeriodChange(current, previous, format) {
  if (current === undefined || previous === undefined || (previous === 0 && current !== 0)) {
    return {text: '—', tone: 'neutral'};
  }
  const delta = previous ? 100 * (current - previous) / previous : 0;
  const rounded = Math.round(Math.abs(delta) * 10) / 10;
  if (!rounded) return {text: '0%', tone: 'neutral'};
  return {text: (delta > 0 ? '↑ ' : '↓ ') + format.format(rounded) + '%',
    tone: delta > 0 ? 'up' : 'down'};
}

function renderShipmentTotals(days, previousDays) {
  const {covered, total, peak} = shipmentPeriodTotals(days);
  const format = new Intl.NumberFormat('ru-RU', {maximumFractionDigits: 1});
  const previous = shipmentPeriodTotals(previousDays);
  const incomplete = covered < days.length || previous.covered < previousDays.length;
  const coverage = 'Дней с данными: ' + covered + ' из ' + days.length +
    ' в текущем периоде, ' + previous.covered + ' из ' + previousDays.length + ' в предыдущем.';
  const compare = (current, prior) => shipmentPeriodChange(
    covered ? current : undefined, previous.covered ? prior : undefined, format);
  const units = value => format.format(value) + ' шт.';
  const totals = $('shipment-totals');
  const metrics = [
    ['Всего за период', covered ? units(total) : '—', compare(total, previous.total)],
    ['Среднее за день с данными', covered ? units(total / covered) : '—',
      compare(total / covered, previous.total / previous.covered)],
    ['Пик отгрузок', peak ? peak.label + ' · ' + units(peak.value) : '—'],
    ['Дней с данными', covered + ' из ' + days.length]
  ];
  totals.replaceChildren(...metrics.map(([name, value, change]) => {
    const card = document.createElement('div');
    const label = document.createElement('dt');
    const number = document.createElement('dd');
    label.textContent = name;
    number.textContent = value;
    card.append(label, number);
    if (change) {
      const badge = document.createElement('span');
      badge.className = 'shipment-change shipment-change-' + change.tone;
      badge.textContent = change.text;
      badge.title = 'К предыдущим ' + days.length + ' дням. ' + coverage;
      badge.setAttribute('aria-label', badge.title + ' ' + change.text);
      number.append(badge);
      if (incomplete) {
        const note = document.createElement('small');
        note.className = 'shipment-coverage';
        note.textContent = 'Неполные данные';
        note.title = coverage;
        card.append(note);
      }
    }
    return card;
  }));
  totals.hidden = false;
}

function renderShipmentChart({today, history, saved}) {
  const status = $('shipment-status');
  if (!today || !history) {
    status.textContent = 'Для графика обновите расширение до 1.0.0.';
    return;
  }
  const [day, month, year] = today.split('.').map(Number);
  const end = Date.UTC(year, month - 1, day);
  const period = Number($('shipment-period').value);
  const periodDays = offset => Array.from({length: period}, (_, index) => {
    const date = new Date(end - (offset + period - 1 - index) * 86400000);
    const d = date.getUTCDate();
    const m = date.getUTCMonth() + 1;
    return {label: d + '.' + String(m).padStart(2, '0'),
      value: history[[d, m, date.getUTCFullYear()].join('.')]?.prepared};
  });
  const days = periodDays(0);
  renderShipmentTotals(days, periodDays(period));
  const max = Math.max(1, ...days.map(day => day.value ?? 0));
  status.textContent = 'Последние ' + period + ' дней по МСК · штуки · ' + (saved ? 'Google Таблица' : 'загруженные строки WB');
  const plot = document.createElement('div');
  plot.className = 'trend-plot shipment-plot';
  plot.setAttribute('role', 'group');
  plot.setAttribute('aria-label', 'Подготовлено к отгрузке по дням');
  const axis = document.createElement('div');
  axis.className = 'trend-axis';
  const detail = $('shipment-point');
  const x = index => 14 + 83 * index / (days.length - 1);
  drawDashboardScale(plot, 0, max, new Intl.NumberFormat('ru-RU'));
  const windowValues = [];
  let previous;
  let latest;
  for (const [index, day] of days.entries()) {
    if (index === 0 || index === days.length - 1 || index === Math.floor(days.length / 2)) {
      const tick = document.createElement('span');
      tick.textContent = day.label;
      tick.style.left = x(index) + '%';
      axis.append(tick);
    }
    if (!Number.isFinite(day.value)) {
      previous = undefined;
      windowValues.length = 0;
      continue;
    }
    const dailyY = 90 - 80 * day.value / max;
    const column = document.createElement('span');
    column.className = 'shipment-column';
    column.style.left = x(index) + '%';
    column.style.top = dailyY + '%';
    column.style.width = Math.min(7, 62 / period) + '%';
    column.setAttribute('aria-hidden', 'true');
    plot.append(column);

    windowValues.push(day.value);
    if (windowValues.length > 7) windowValues.shift();
    const average = windowValues.reduce((sum, value) => sum + value, 0) / windowValues.length;
    const point = {x: x(index), y: 90 - 80 * average / max};
    if (previous) {
      const line = document.createElement('span');
      line.className = 'trend-segment shipment-average';
      line.style.clipPath = `polygon(${previous.x}% ${previous.y - .6}%, ${point.x}% ${point.y - .6}%, ${point.x}% ${point.y + .6}%, ${previous.x}% ${previous.y + .6}%)`;
      plot.append(line);
    }
    latest = day.label + ' · ' + day.value.toLocaleString('ru-RU') + ' шт.';
    const label = latest + ' · Среднее за ' + windowValues.length + ' дн.: ' +
      average.toLocaleString('ru-RU', {maximumFractionDigits: 1}) + ' шт.';
    const dot = dashboardButton('', () => { detail.textContent = label; });
    dot.className = 'trend-point shipment-value';
    dot.style.left = point.x + '%';
    dot.style.top = dailyY + '%';
    dot.title = label;
    dot.setAttribute('aria-label', label);
    dot.addEventListener('focus', () => { detail.textContent = label; });
    plot.append(dot);
    previous = point;
  }
  $('shipment-chart').replaceChildren(plot, axis);
  detail.textContent = latest || 'За выбранный период нет данных.';
  if (days.some(day => day.value == null)) status.textContent += ' · разрыв — нет данных';
}

$('shipment-period').addEventListener('change', () => {
  if (shipmentHistory) renderShipmentChart(shipmentHistory);
});

function mobileReaderAddress(value) {
  const url = new URL(value.trim());
  if (url.origin !== 'https://script.google.com' ||
      !/^\/macros\/s\/[\w-]+\/exec\/?$/.test(url.pathname) || url.username || url.password) {
    throw new Error('Укажите ссылку /exec из проекта Apps Script чтения.');
  }
  url.hash = '';
  url.search = '';
  return url;
}

const mobileAccess = $('mobile-access');
const mobileReaderInput = $('mobile-reader-url');
const mobileDevice = window.matchMedia('(max-width: 720px)');
const mobileStatus = $('mobile-reader-status');
const mobileForm = $('mobile-reader-form');
let pendingMobileRead;
function showMobileAccess() {
  mobileAccess.hidden = !mobileDevice.matches;
}
mobileDevice.addEventListener('change', showMobileAccess);
showMobileAccess();
mobileReaderInput.value = address.value;

mobileForm.addEventListener('submit', event => {
  event.preventDefault();
  if (pendingMobileRead) return;
  let url;
  try {
    url = mobileReaderAddress(mobileReaderInput.value);
  } catch {
    mobileStatus.textContent = 'Укажите ссылку /exec из проекта Apps Script чтения.';
    return;
  }
  const nonce = crypto.randomUUID();
  url.searchParams.set('mobileBridge', nonce);
  const popup = window.open(url.href, '_blank', 'popup,width=480,height=620');
  if (!popup) {
    mobileStatus.textContent = 'Разрешите открытие окна Google и нажмите кнопку ещё раз.';
    return;
  }
  const button = mobileForm.querySelector('button');
  button.disabled = true;
  address.value = url.origin + url.pathname;
  try { localStorage.setItem('pfc-reader-url', address.value); } catch {}
  mobileStatus.textContent = 'Войдите в открывшемся окне Google. Данные появятся здесь.';
  const expires = Date.now() + 120000;
  const timeout = setInterval(() => {
    const expired = Date.now() >= expires;
    if (!popup.closed && !expired) return;
    clearInterval(timeout);
    pendingMobileRead = undefined;
    button.disabled = false;
    mobileStatus.textContent = expired
      ? 'Google не передал данные за 2 минуты. Закройте окно входа и повторите загрузку.'
      : 'Окно Google закрыто. Для загрузки нажмите кнопку ещё раз.';
  }, 750);
  pendingMobileRead = {nonce, popup, timeout, button};
});

window.addEventListener('message', event => {
  const pending = pendingMobileRead;
  const message = event.data;
  if (!pending || message?.type !== 'pfc-mobile-data' || message.nonce !== pending.nonce ||
      !/^https:\/\/(?:script\.google\.com|[a-z0-9-]+-script\.googleusercontent\.com|script\.googleusercontent\.com)$/.test(event.origin) ||
      event.source?.top !== pending.popup) return;
  clearInterval(pending.timeout);
  pendingMobileRead = undefined;
  pending.button.disabled = false;
  pending.popup.close();
  if (message.error) {
    mobileStatus.textContent = message.error;
    return;
  }
  const data = message.data;
  if (!data || !Array.isArray(data.locations) || !acceptStock(data.rows)) {
    mobileStatus.textContent = 'Не удалось загрузить данные склада.';
    return;
  }
  acceptLocationCatalog(data.locations);
  if (data.changes) window.dispatchEvent(new CustomEvent('pfc:changes', {detail: data.changes}));
  const today = new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'Europe/Moscow'
  }).formatToParts(new Date()).filter(part => ['day', 'month', 'year'].includes(part.type))
    .map(part => Number(part.value)).join('.');
  shipmentHistory = {today, history: data.history || {}, saved: true};
  renderShipmentChart(shipmentHistory);
  const prepared = data.history?.[today]?.prepared;
  $('transactions-prepared').textContent = Number.isFinite(prepared) ? prepared.toLocaleString('ru-RU') + ' шт.' : '—';
  transactionsStatus.textContent = '';
  mobileStatus.textContent = 'Данные из Google Таблицы загружены.';
  pending.button.textContent = 'Обновить данные';
  mobileAccess.classList.add('mobile-connected');
});

const dashboardModules = $('dashboard-modules');
const dashboardEdit = $('dashboard-edit');
const dashboardReset = $('dashboard-reset');
const dashboardLayoutStatus = $('dashboard-layout-status');
const dashboardMobile = window.matchMedia('(max-width: 720px)');
const dashboardCards = [...dashboardModules.children];
const dashboardControls = new Map();
let dashboardEditing = false;
let draggedDashboardCard;
const dashboardHeights = [['compact', 'Компактный'], ['normal', 'Обычный'],
  ['tall', 'Большой'], ['extra', 'Очень большой']];

function fitDashboardCard(card) {
  const height = card.getBoundingClientRect().height;
  if (!height || dashboardMobile.matches) {
    card.style.removeProperty('grid-row-end');
    return;
  }
  card.style.gridRowEnd = 'span ' + Math.ceil((height + 14) / 2);
}

const dashboardResize = new ResizeObserver(entries => {
  for (const {target} of entries) fitDashboardCard(target);
});
for (const card of dashboardCards) dashboardResize.observe(card);

function dashboardLayoutKey() {
  return 'pfc-dashboard-layout-' + (dashboardMobile.matches ? 'mobile' : 'desktop');
}

function restoreDashboardLayout() {
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(dashboardLayoutKey()));
  } catch {
    saved = null;
  }
  const order = new Set(Array.isArray(saved) ? saved.map(item => item?.id) : []);
  for (const card of dashboardCards) order.add(card.dataset.dashboardModule);
  for (const id of order) {
    const card = dashboardCards.find(module => module.dataset.dashboardModule === id);
    if (!card) continue;
    const settings = Array.isArray(saved) ? saved.find(item => item?.id === id) : null;
    const defaultWidth = !dashboardMobile.matches && id !== 'trend' ? 'half' : 'full';
    card.dataset.width = ['half', 'full'].includes(settings?.width) ? settings.width : defaultWidth;
    card.dataset.height = dashboardHeights.some(([key]) => key === settings?.height) ? settings.height : 'normal';
    dashboardModules.append(card);
  }
  requestAnimationFrame(() => dashboardCards.forEach(fitDashboardCard));
  refreshDashboardControls();
}

function saveDashboardLayout(message) {
  const layout = [...dashboardModules.children].map(card => ({
    id: card.dataset.dashboardModule,
    width: card.dataset.width,
    height: card.dataset.height
  }));
  try {
    localStorage.setItem(dashboardLayoutKey(), JSON.stringify(layout));
  } catch {
    message += ' Раскладка сохранится только до закрытия страницы.';
  }
  dashboardLayoutStatus.textContent = message;
  refreshDashboardControls();
}

function refreshDashboardControls() {
  for (const [card, controls] of dashboardControls) {
    controls.bar.hidden = !dashboardEditing;
    controls.previous.disabled = !card.previousElementSibling;
    controls.next.disabled = !card.nextElementSibling;
    controls.width.textContent = card.dataset.width === 'half' ? 'На всю ширину' : 'На полширины';
    controls.height.value = card.dataset.height;
  }
}

function moveDashboardCard(card, target, after) {
  if (after) target.after(card);
  else target.before(card);
  saveDashboardLayout('Модуль «' + card.querySelector('h2').textContent + '» перемещён.');
}

for (const card of dashboardCards) {
  const bar = document.createElement('div');
  bar.className = 'dashboard-module-tools';
  const name = card.querySelector('h2').textContent;
  bar.setAttribute('role', 'group');
  bar.setAttribute('aria-label', 'Настройка модуля «' + name + '»');

  const previous = document.createElement('button');
  const next = document.createElement('button');
  const width = document.createElement('button');
  const height = document.createElement('select');
  const handle = document.createElement('button');
  for (const button of [previous, next, width, handle]) {
    button.type = 'button';
    button.className = 'secondary';
    bar.append(button);
  }
  height.setAttribute('aria-label', 'Размер: ' + name);
  height.replaceChildren(...dashboardHeights.map(([value, label]) => new Option(label, value)));
  handle.before(height);
  previous.textContent = '↑ Раньше';
  next.textContent = '↓ Позже';
  handle.textContent = 'Перетащить';
  handle.draggable = true;
  previous.onclick = () => {
    if (card.previousElementSibling) moveDashboardCard(card, card.previousElementSibling, false);
    (previous.disabled ? next : previous).focus();
  };
  next.onclick = () => {
    if (card.nextElementSibling) moveDashboardCard(card, card.nextElementSibling, true);
    (next.disabled ? previous : next).focus();
  };
  width.onclick = () => {
    card.dataset.width = card.dataset.width === 'half' ? 'full' : 'half';
    saveDashboardLayout('Ширина модуля изменена.');
  };
  height.onchange = () => {
    card.dataset.height = height.value;
    saveDashboardLayout('Высота модуля изменена.');
  };
  handle.addEventListener('dragstart', event => {
    draggedDashboardCard = card;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', name);
  });
  handle.addEventListener('dragend', () => {
    draggedDashboardCard = undefined;
    dashboardModules.querySelector('.drop-target')?.classList.remove('drop-target');
  });
  card.addEventListener('dragover', event => {
    if (!draggedDashboardCard || draggedDashboardCard === card) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    card.classList.add('drop-target');
  });
  card.addEventListener('dragleave', event => {
    if (!card.contains(event.relatedTarget)) card.classList.remove('drop-target');
  });
  card.addEventListener('drop', event => {
    if (!draggedDashboardCard || draggedDashboardCard === card) return;
    event.preventDefault();
    card.classList.remove('drop-target');
    const order = [...dashboardModules.children];
    moveDashboardCard(draggedDashboardCard, card, order.indexOf(draggedDashboardCard) < order.indexOf(card));
  });

  card.prepend(bar);
  dashboardControls.set(card, {bar, previous, next, width, height});
}

dashboardEdit.onclick = () => {
  dashboardEditing = !dashboardEditing;
  dashboardEdit.textContent = dashboardEditing ? 'Готово' : 'Настроить';
  dashboardEdit.setAttribute('aria-pressed', String(dashboardEditing));
  dashboardReset.hidden = !dashboardEditing;
  dashboardModules.classList.toggle('is-editing', dashboardEditing);
  refreshDashboardControls();
};
dashboardReset.onclick = () => {
  try {
    localStorage.removeItem(dashboardLayoutKey());
  } catch {
    // Reset the current view even when browser storage is unavailable.
  }
  restoreDashboardLayout();
  dashboardLayoutStatus.textContent = 'Восстановлена стандартная раскладка.';
};
dashboardMobile.addEventListener('change', restoreDashboardLayout);
restoreDashboardLayout();
console.log('app.js загружен');
