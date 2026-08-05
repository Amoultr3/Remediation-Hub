const STORAGE_KEY = 'remediationHub.v1';
const SYSTEMS = ['Cardiovascular','Respiratory','Neurological','Endocrine','Gastrointestinal','Renal / Urinary','Musculoskeletal','Integumentary','Hematologic','Immune / Lymphatic','Reproductive','Maternal–Newborn','Pediatrics','Mental Health','Pharmacology','Fundamentals / Safety','Leadership / Management','Other'];
const state = loadState();
let activeFilter = 'all';
let activeSystem = 'all';
let pendingAttachment = null;
let selectedRecordId = state.records[0]?.id || null;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)) || { records: [], session: null };
    saved.records = Array.isArray(saved.records) ? saved.records.map(normalizeRecord) : [];
    return saved;
  } catch {
    return { records: [], session: null };
  }
}

function normalizeRecord(record) {
  const correctAnswers = Array.isArray(record.correctAnswers)
    ? record.correctAnswers.filter(Number.isInteger)
    : (Number.isInteger(record.correctAnswer) ? [record.correctAnswer] : []);
  return {
    ...record,
    primarySystem: record.primarySystem || record.system || inferSystem(`${record.sessionTitle || ''} ${record.sessionTopic || ''} ${record.topic || ''}`),
    sessionTitle: record.sessionTitle || record.sessionTopic || 'Questions without a named session',
    tags: Array.isArray(record.tags) ? record.tags : String(record.tags || '').split(',').map((tag) => tag.trim()).filter(Boolean),
    correctAnswers,
    correctAnswer: correctAnswers.length === 1 ? correctAnswers[0] : (record.correctAnswer ?? null),
    rationale: record.rationale || '',
    remediationNotes: record.remediationNotes || ''
  };
}

function inferSystem(value) {
  const text = String(value).toLowerCase();
  const matches = [
    ['Cardiovascular', /cardiac|cardio|heart|vascular/], ['Respiratory', /respirat|pulmon|lung/],
    ['Neurological', /neuro|brain|spinal|seizure/], ['Endocrine', /endocr|diabet|thyroid|adrenal/],
    ['Gastrointestinal', /gastro|digest|bowel|hepatic|liver/], ['Renal / Urinary', /renal|urinary|kidney/],
    ['Musculoskeletal', /musculo|orthop|bone|joint/], ['Integumentary', /integument|skin|wound|burn/],
    ['Hematologic', /hemat|blood|anemia|coag/], ['Immune / Lymphatic', /immune|lymph|infection/],
    ['Reproductive', /reproduct|gyne|prostate/], ['Maternal–Newborn', /maternal|obstetric|pregnan|newborn/],
    ['Pediatrics', /pediatric|child|infant/], ['Mental Health', /mental|psychiatr/],
    ['Pharmacology', /pharm|medication|drug/], ['Fundamentals / Safety', /fundamental|safety|priority|delegat/]
  ];
  return matches.find(([, pattern]) => pattern.test(text))?.[0] || 'Other';
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    toast('Storage is full. Remove the image or use a smaller file.');
    return false;
  }
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));
}

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function toast(message) {
  const node = $('#toast');
  node.textContent = message;
  node.classList.add('show');
  setTimeout(() => node.classList.remove('show'), 2200);
}

function formatDate(value) {
  if (!value) return 'Recently added';
  const date = new Date(value);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return sameDay
    ? `Today, ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
    : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function answerText(record, index) {
  return index === null || index === undefined ? 'Not selected' : (record.choices[index] || 'Not selected');
}

function selectedIndexes(record) {
  if (Array.isArray(record.selectedAnswers)) return record.selectedAnswers.filter((index) => Number.isInteger(index));
  return Number.isInteger(record.selectedAnswer) ? [record.selectedAnswer] : [];
}

function selectedAnswerText(record) {
  const indexes = selectedIndexes(record);
  return indexes.length ? indexes.map((index) => record.choices[index]).filter(Boolean).join('; ') : 'Not selected';
}

function correctIndexes(record) {
  if (Array.isArray(record.correctAnswers) && record.correctAnswers.length) return record.correctAnswers.filter(Number.isInteger);
  return Number.isInteger(record.correctAnswer) ? [record.correctAnswer] : [];
}

function gradeState(record) {
  const mine = [...selectedIndexes(record)].sort();
  const key = [...correctIndexes(record)].sort();
  if (!key.length) return 'ungraded';
  if (mine.length === key.length && mine.every((value, index) => value === key[index])) return 'correct';
  return 'incorrect';
}

function statusLabel(record) {
  if (record.status === 'mastered') return 'Remediated';
  return { ungraded: 'Ungraded', correct: 'Correct', incorrect: 'Incorrect' }[gradeState(record)];
}

function sessionGroups() {
  const groups = new Map();
  state.records.forEach((record) => {
    const key = record.sessionId || 'unassigned';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  });
  return [...groups.entries()]
    .map(([id, records]) => {
      const newest = records.reduce((latest, record) => {
        const value = record.updatedAt || record.createdAt || '';
        return String(value) > String(latest) ? String(value) : String(latest);
      }, '');
      const topic = records.find((record) => record.sessionTitle)?.sessionTitle
        || records.find((record) => record.sessionTopic)?.sessionTopic
        || (id === 'unassigned' ? 'Questions without a session' : 'Untitled session');
      return { id, records, newest, topic };
    })
    .sort((a, b) => b.newest.localeCompare(a.newest));
}

function exportLatestSession() {
  const groups = sessionGroups();
  if (!groups.length) return toast('Capture a question before exporting.');
  exportSession(groups[0].id);
}

function safeFilename(value) {
  return String(value || 'session')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'session';
}

function exportSession(sessionId) {
  const group = sessionGroups().find((item) => item.id === sessionId);
  if (!group) return toast('That session could not be found.');
  const payload = {
    format: 'remediation-hub-session-export',
    version: 1,
    exportedAt: new Date().toISOString(),
    session: {
      id: group.id === 'unassigned' ? null : group.id,
      topic: group.topic,
      questionCount: group.records.length,
      latestActivityAt: group.newest
    },
    records: group.records
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `remediation-hub-${safeFilename(group.topic)}-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(`${group.records.length} questions exported.`);
}

function render() {
  const query = $('#searchInput').value.trim().toLowerCase();
  const filtered = state.records.filter((record) => {
    const matchesFilter = activeFilter === 'all' || (activeFilter === 'mastered' ? record.status === 'mastered' : gradeState(record) === activeFilter);
    const matchesSystem = activeSystem === 'all' || record.primarySystem === activeSystem;
    const matchesQuery = !query || `${record.question} ${record.primarySystem} ${record.sessionTitle} ${record.topic} ${(record.tags || []).join(' ')} ${record.notes} ${record.reasoning} ${record.rationale} ${record.remediationNotes}`.toLowerCase().includes(query);
    return matchesFilter && matchesSystem && matchesQuery;
  });

  const reviewTotal = state.records.filter((r) => gradeState(r) !== 'correct' && r.status !== 'mastered').length;
  $('#recordCount').textContent = filtered.length;
  $('#reviewCount').textContent = reviewTotal;
  $('#reviewMessage').textContent = `${reviewTotal} question${reviewTotal === 1 ? '' : 's'} currently need review.`;

  const grouped = new Map();
  filtered.forEach((record) => {
    const key = `${record.primarySystem}|||${record.sessionId || record.sessionTitle}`;
    if (!grouped.has(key)) grouped.set(key, { system: record.primarySystem, title: record.sessionTitle, records: [] });
    grouped.get(key).records.push(record);
  });
  $('#recordsList').innerHTML = [...grouped.values()].map((group) => `
    <section class="record-group">
      <div class="system-heading"><div><span>${escapeHtml(group.system)}</span><h2>${escapeHtml(group.title)}</h2></div><strong>${group.records.length} question${group.records.length === 1 ? '' : 's'}</strong></div>
      ${group.records.map((record, groupIndex) => {
        const label = statusLabel(record);
        const isMastered = record.status === 'mastered';
        return `
      <article class="record-card ${selectedRecordId === record.id ? 'selected' : ''}">
        <button type="button" data-select-id="${record.id}" aria-label="Open ${escapeHtml(record.question)}">
          <span class="record-number">${groupIndex + 1}</span>
          <div class="record-copy">
            <h3>${escapeHtml(record.question)}</h3>
            <div class="record-meta">
              <span>${escapeHtml(record.topic || record.primarySystem)}</span>
              ${(record.tags || []).slice(0, 3).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}
              <span>${formatDate(record.updatedAt || record.createdAt)}</span>
              ${(record.attachments?.length || record.attachment) ? `<span>${record.attachments?.length || 1} image${(record.attachments?.length || 1) === 1 ? '' : 's'}</span>` : ''}
            </div>
          </div>
          <div class="record-status">
            <strong class="${isMastered ? 'mastered' : gradeState(record)}">${label}</strong>
            <span>${escapeHtml(record.clue || (isMastered ? 'Remediation complete' : 'Open to remediate'))}</span>
          </div>
          <span class="card-arrow">›</span>
        </button>
      </article>`;
      }).join('')}
    </section>`).join('');

  const noRecordsAtAll = state.records.length === 0;
  $('#emptyState').classList.toggle('hidden', !noRecordsAtAll || Boolean(query) || activeFilter !== 'all');
  $('#recordsList').classList.toggle('hidden', filtered.length === 0);
  renderSession();
  renderDetail();
}

function renderDetail() {
  const record = state.records.find((item) => item.id === selectedRecordId);
  $('#detailEmpty').classList.toggle('hidden', Boolean(record));
  $('#detailContent').classList.toggle('hidden', !record);
  if (!record) return;

  const selected = selectedIndexes(record);
  const grade = gradeState(record);
  const recordNumber = state.records.length - state.records.findIndex((item) => item.id === record.id);
  $('#detailContent').innerHTML = `
    <div class="detail-topline">
      <button type="button" class="mobile-back" data-close-detail aria-label="Close question details">←</button>
      <strong>Question ${recordNumber}</strong>
      <div class="detail-actions"><button type="button" data-edit-selected>Edit</button><button type="button" aria-label="More options">⋮</button></div>
    </div>
    <span class="detail-topic">${escapeHtml(record.primarySystem)} · ${escapeHtml(record.sessionTitle)}</span>
    ${(record.tags || []).length ? `<div class="detail-tags">${record.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}</div>` : ''}
    <h2 class="detail-question">${escapeHtml(record.question)}</h2>
    <div class="answer-list">
      ${record.choices.map((choice, index) => `
        <div class="answer-choice ${selected.includes(index) ? 'mine' : ''} ${correctIndexes(record).includes(index) ? 'correct' : ''}">
          <span class="answer-letter">${String.fromCharCode(65 + index)}</span><span>${escapeHtml(choice || 'Blank choice')}</span>
        </div>
        ${record.optionNotes?.[index] ? `<div class="note-box"><strong>${selected.includes(index) ? 'Why I selected it' : 'Why I did not select it'}:</strong> ${escapeHtml(record.optionNotes[index])}</div>` : ''}`).join('')}
    </div>
    <hr class="detail-rule">
    <section class="detail-section">
      <label>Your answer</label>
      <div class="answer-box ${grade === 'correct' ? 'right' : grade === 'incorrect' ? 'wrong' : ''}">${escapeHtml(selectedAnswerText(record))}<strong>${statusLabel(record)}</strong></div>
    </section>
    <section class="detail-section">
      <label>Correct answer</label>
      <div class="answer-box right">${escapeHtml(correctIndexes(record).length ? correctIndexes(record).map((index) => record.choices[index]).join('; ') : 'Not entered yet')}<strong>${correctIndexes(record).length ? 'Answer key' : 'Add during remediation'}</strong></div>
    </section>
    <section class="detail-section">
      <label>Why I chose it</label>
      <div class="note-box ${record.reasoning ? '' : 'empty-note'}">${escapeHtml(record.reasoning || 'No reasoning added yet.')}</div>
    </section>
    <section class="detail-section">
      <label>Kaplan rationale</label>
      <div class="note-box ${record.rationale ? '' : 'empty-note'}">${escapeHtml(record.rationale || 'No rationale added yet.')}</div>
    </section>
    <section class="detail-section">
      <label>Missed clue</label>
      <div class="note-box ${record.clue ? '' : 'empty-note'}">${escapeHtml(record.clue || 'No missed clue added yet.')}</div>
    </section>
    <section class="detail-section">
      <label>Remediation notes</label>
      <div class="note-box ${record.remediationNotes ? '' : 'empty-note'}">${escapeHtml(record.remediationNotes || 'No remediation notes added yet.')}</div>
    </section>
    ${record.notes ? `<section class="detail-section"><label>Additional notes</label><div class="note-box">${escapeHtml(record.notes)}</div></section>` : ''}
    ${(record.attachments?.length || record.attachment) ? `<section class="detail-section"><label>Attached images or diagrams</label>${(record.attachments?.length ? record.attachments.map((item) => item.dataUrl || item) : [record.attachment]).map((src, index) => `<img class="detail-image" src="${src}" alt="Question attachment ${index + 1}">`).join('')}</section>` : ''}
    <div class="detail-footer">
      <button type="button" class="primary" data-edit-selected>Edit record</button>
      <button type="button" class="secondary" data-toggle-mastery>${record.status === 'mastered' ? 'Return to review' : '✓ Mark remediated'}</button>
    </div>`;
}

function renderSession() {
  const active = Boolean(state.session);
  $('#sessionBanner').classList.toggle('hidden', !active);
  $('#sessionBtn').textContent = active ? 'Add to session' : 'Start session';
  if (active) {
    const count = state.records.filter((r) => r.sessionId === state.session.id).length;
    $('#sessionQuestionCount').textContent = `${count} question${count === 1 ? '' : 's'} added`;
  }
}

function setView(viewName) {
  $$('.view').forEach((view) => view.classList.remove('active'));
  $$('.nav-item[data-view]').forEach((item) => item.classList.toggle('active', item.dataset.view === viewName));
  $(`#${viewName}View`).classList.add('active');
  $('#detailPanel').classList.toggle('hidden', viewName !== 'records');
}

function selectRecord(id) {
  selectedRecordId = id;
  render();
  $('#detailPanel').classList.add('open');
}

function addChoice(value = '', selected = false, correct = false) {
  const index = $$('.choice-row').length;
  const type = $('#selectAllInput').checked ? 'checkbox' : 'radio';
  const row = document.createElement('div');
  row.className = 'choice-row';
  row.innerHTML = `
    <input type="${type}" name="selectedChoice" value="${index}" ${selected ? 'checked' : ''} aria-label="My answer">
    <input type="${type}" name="correctChoice" value="${index}" ${correct ? 'checked' : ''} aria-label="Correct answer">
    <input type="text" value="${escapeHtml(value)}" placeholder="Choice ${String.fromCharCode(65 + index)}" aria-label="Answer choice ${index + 1}">
    <button type="button" class="remove-choice" aria-label="Remove choice">×</button>`;
  row.querySelector('.remove-choice').addEventListener('click', () => {
    if ($$('.choice-row').length <= 2) return toast('Keep at least two answer choices.');
    row.remove();
    reindexChoices();
  });
  $('#choicesEditor').append(row);
}

function reindexChoices() {
  $$('.choice-row').forEach((row, index) => {
    row.querySelectorAll('input[name="selectedChoice"], input[name="correctChoice"]').forEach((input) => input.value = index);
    row.querySelector('input[type="text"]').placeholder = `Choice ${String.fromCharCode(65 + index)}`;
  });
}

function openQuestion(record = null) {
  $('#questionForm').reset();
  $('#choicesEditor').innerHTML = '';
  pendingAttachment = record?.attachment || null;
  $('#questionId').value = record?.id || '';
  $('#dialogTitle').textContent = record ? 'Edit question' : 'Add a question';
  $('#selectAllInput').checked = Boolean(record?.selectAll || selectedIndexes(record || {}).length > 1 || correctIndexes(record || {}).length > 1);
  $('#systemInput').value = record?.primarySystem || state.session?.primarySystem || 'Other';
  $('#sessionTitleInput').value = record?.sessionTitle || state.session?.title || '';
  $('#tagsInput').value = (record?.tags || state.session?.tags || []).join(', ');
  $('#topicInput').value = record?.topic || '';
  $('#questionInput').value = record?.question || '';
  $('#reasoningInput').value = record?.reasoning || '';
  $('#rationaleInput').value = record?.rationale || '';
  $('#clueInput').value = record?.clue || '';
  $('#remediationInput').value = record?.remediationNotes || '';
  $('#notesInput').value = record?.notes || '';
  const choices = record?.choices?.length ? record.choices : ['', '', '', ''];
  choices.forEach((choice, index) => addChoice(choice, selectedIndexes(record || {}).includes(index), correctIndexes(record || {}).includes(index)));
  $('#deleteQuestionBtn').classList.toggle('hidden', !record);
  renderAttachment();
  $('#questionDialog').showModal();
}

function renderAttachment() {
  const preview = $('#attachmentPreview');
  if (!pendingAttachment) {
    preview.classList.add('hidden');
    preview.innerHTML = '';
    return;
  }
  preview.classList.remove('hidden');
  preview.innerHTML = `<img src="${pendingAttachment}" alt="Question attachment"><br><button type="button" class="text-button" id="removeAttachmentBtn">Remove image</button>`;
  $('#removeAttachmentBtn').addEventListener('click', () => { pendingAttachment = null; renderAttachment(); });
}

function readAttachment(file) {
  if (!file) return;
  if (file.size > 1.5 * 1024 * 1024) return toast('Please choose an image smaller than 1.5 MB.');
  const reader = new FileReader();
  reader.onload = () => { pendingAttachment = reader.result; renderAttachment(); };
  reader.readAsDataURL(file);
}

function saveQuestion() {
  const id = $('#questionId').value || uid();
  const selectedNodes = $$('input[name="selectedChoice"]:checked');
  const correctNodes = $$('input[name="correctChoice"]:checked');
  const choices = $$('.choice-row input[type="text"]').map((input) => input.value.trim());
  if (choices.filter(Boolean).length < 2) return toast('Enter at least two answer choices.');
  if (!selectedNodes.length) return toast('Select your answer before saving.');
  const selectedAnswers = selectedNodes.map((node) => Number(node.value));
  const correctAnswers = correctNodes.map((node) => Number(node.value));
  const existingIndex = state.records.findIndex((r) => r.id === id);
  const existing = existingIndex >= 0 ? state.records[existingIndex] : null;
  const record = {
    id,
    primarySystem: $('#systemInput').value,
    sessionTitle: $('#sessionTitleInput').value.trim() || state.session?.title || 'Questions without a named session',
    tags: $('#tagsInput').value.split(',').map((tag) => tag.trim()).filter(Boolean),
    topic: $('#topicInput').value.trim(),
    question: $('#questionInput').value.trim(),
    choices,
    selectedAnswer: selectedAnswers.length === 1 ? selectedAnswers[0] : null,
    selectedAnswers,
    selectAll: $('#selectAllInput').checked,
    correctAnswer: correctAnswers.length === 1 ? correctAnswers[0] : null,
    correctAnswers,
    status: existing?.status || 'review',
    reasoning: $('#reasoningInput').value.trim(),
    rationale: $('#rationaleInput').value.trim(),
    clue: $('#clueInput').value.trim(),
    remediationNotes: $('#remediationInput').value.trim(),
    notes: $('#notesInput').value.trim(),
    attachment: pendingAttachment,
    attachments: existing?.attachments || [],
    sessionId: existing?.sessionId || state.session?.id || null,
    sessionTopic: $('#sessionTitleInput').value.trim() || state.session?.title || null,
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  if (state.session && !state.session.title) {
    state.session.title = record.sessionTitle;
    state.session.primarySystem = record.primarySystem;
    state.session.tags = record.tags;
  }
  if (gradeState(record) === 'incorrect') record.status = 'review';
  if (existingIndex >= 0) state.records[existingIndex] = record; else state.records.unshift(record);
  if (!saveState()) return;
  selectedRecordId = id;
  $('#questionDialog').close();
  toast(existing ? 'Question updated.' : 'Question saved.');
  render();
}

function deleteQuestion() {
  const id = $('#questionId').value;
  const record = state.records.find((r) => r.id === id);
  if (!record || !confirm('Delete this question record?')) return;
  state.records = state.records.filter((r) => r.id !== id);
  if (selectedRecordId === id) selectedRecordId = state.records[0]?.id || null;
  saveState();
  $('#questionDialog').close();
  toast('Question deleted.');
  render();
}

function toggleMastery() {
  const record = state.records.find((item) => item.id === selectedRecordId);
  if (!record) return;
  record.status = record.status === 'mastered' ? 'review' : 'mastered';
  record.updatedAt = new Date().toISOString();
  saveState();
  toast(record.status === 'mastered' ? 'Marked remediated.' : 'Returned to review.');
  render();
}

function startSession() {
  if (!state.session) {
    state.session = { id: uid(), startedAt: new Date().toISOString() };
    saveState();
    toast('Session started.');
  }
  openQuestion();
}

function importExtensionRecord(payload) {
  if (!payload || payload.source !== 'remediation-hub-extension' || !payload.externalId) return;
  const existingIndex = state.records.findIndex((record) => record.externalId === payload.externalId);
  const existing = existingIndex >= 0 ? state.records[existingIndex] : null;

  const question = String(payload.question || '').trim();
  const choices = Array.isArray(payload.choices)
    ? payload.choices.map((choice) => String(choice || '').trim()).slice(0, 8)
    : [];
  if (!question || choices.filter(Boolean).length < 2) return;

  const selectedAnswer = Number.isInteger(payload.selectedAnswer) && payload.selectedAnswer < choices.length
    ? payload.selectedAnswer
    : null;
  const selectedAnswers = Array.isArray(payload.selectedAnswers)
    ? [...new Set(payload.selectedAnswers.filter((index) => Number.isInteger(index) && index >= 0 && index < choices.length))]
    : (selectedAnswer === null ? [] : [selectedAnswer]);
  const correctAnswer = Number.isInteger(payload.correctAnswer) && payload.correctAnswer < choices.length
    ? payload.correctAnswer
    : null;
  const id = existing?.id || uid();
  const now = new Date().toISOString();
  const record = {
    id,
    externalId: payload.externalId,
    source: 'chrome-extension',
    primarySystem: String(payload.primarySystem || payload.system || existing?.primarySystem || 'Other').trim(),
    sessionTitle: String(payload.sessionTitle || payload.sessionTopic || existing?.sessionTitle || 'Questions without a named session').trim(),
    tags: Array.isArray(payload.tags) ? payload.tags.map((tag) => String(tag).trim()).filter(Boolean) : (existing?.tags || []),
    topic: String(payload.topic || '').trim(),
    question,
    choices,
    selectedAnswer: selectedAnswers.length === 1 ? selectedAnswers[0] : null,
    selectedAnswers,
    selectAll: Boolean(payload.selectAll),
    correctAnswer,
    correctAnswers: Array.isArray(payload.correctAnswers) ? payload.correctAnswers.filter((index) => Number.isInteger(index) && index >= 0 && index < choices.length) : (correctAnswer === null ? [] : [correctAnswer]),
    status: existing?.status || 'review',
    reasoning: String(payload.reasoning || '').trim(),
    rationale: String(payload.rationale || '').trim(),
    optionNotes: Array.isArray(payload.optionNotes) ? payload.optionNotes.slice(0, choices.length).map((note) => String(note || '').trim()) : [],
    clue: String(payload.clue || '').trim(),
    remediationNotes: String(payload.remediationNotes || '').trim(),
    notes: String(payload.notes || '').trim(),
    attachment: null,
    attachments: Array.isArray(payload.attachments)
      ? payload.attachments.slice(0, 8).filter((item) => item && typeof item.dataUrl === 'string' && item.dataUrl.startsWith('data:image/')).map((item) => ({ dataUrl: item.dataUrl, name: String(item.name || 'Captured image'), type: String(item.type || 'image/jpeg') }))
      : [],
    sessionId: String(payload.sessionId || '').trim() || state.session?.id || null,
    sessionTopic: String(payload.sessionTopic || '').trim() || null,
    createdAt: existing?.createdAt || payload.createdAt || now,
    updatedAt: now
  };

  if (existingIndex >= 0) state.records[existingIndex] = record; else state.records.unshift(record);
  if (!saveState()) return;
  selectedRecordId = id;
  setView('records');
  render();
  $('#detailPanel').classList.add('open');
  toast(existing ? 'Remediation updated from Chrome.' : 'Question captured from Chrome.');
  window.postMessage({ type: 'REMEDIATION_IMPORT_COMPLETE', externalId: payload.externalId }, window.location.origin);
}

window.addEventListener('message', (event) => {
  if (event.source !== window || event.origin !== window.location.origin) return;
  if (event.data?.type === 'REMEDIATION_EXTENSION_RECORD') importExtensionRecord(event.data.record);
});

function endSession() {
  if (!state.session) return;
  const sessionRecords = state.records.filter((r) => r.sessionId === state.session.id);
  const graded = sessionRecords.filter((r) => gradeState(r) !== 'ungraded');
  const correct = graded.filter((r) => gradeState(r) === 'correct').length;
  const needsReview = sessionRecords.filter((r) => gradeState(r) === 'incorrect' && r.status !== 'mastered').length;
  $('#gradeSummary').innerHTML = `
    <div class="grade-stat"><span>Questions captured</span><strong>${sessionRecords.length}</strong></div>
    <div class="grade-stat"><span>Correct</span><strong>${correct} / ${graded.length}</strong></div>
    <div class="grade-stat"><span>Sent to review</span><strong>${needsReview}</strong></div>`;
  state.session = null;
  saveState();
  render();
  $('#gradeDialog').showModal();
}

$$('.nav-item[data-view]').forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)));
$$('[data-view-link]').forEach((button) => button.addEventListener('click', () => setView(button.dataset.viewLink)));
$('#newQuestionBtn').addEventListener('click', () => openQuestion());
$$('[data-open-question]').forEach((button) => button.addEventListener('click', () => openQuestion()));
$('#sessionBtn').addEventListener('click', startSession);
$('#exportSessionBtn').addEventListener('click', exportLatestSession);
$('#endSessionBtn').addEventListener('click', endSession);
$('#addChoiceBtn').addEventListener('click', () => addChoice());
$('#selectAllInput').addEventListener('change', () => {
  const values = $$('.choice-row input[type="text"]').map((input) => input.value);
  const selected = new Set($$('input[name="selectedChoice"]:checked').map((input) => Number(input.value)));
  const correct = new Set($$('input[name="correctChoice"]:checked').map((input) => Number(input.value)));
  $('#choicesEditor').innerHTML = '';
  values.forEach((value, index) => addChoice(value, selected.has(index), correct.has(index)));
});
$('#closeDialogBtn').addEventListener('click', () => $('#questionDialog').close());
$('#cancelDialogBtn').addEventListener('click', () => $('#questionDialog').close());
$('#deleteQuestionBtn').addEventListener('click', deleteQuestion);
$('#questionForm').addEventListener('submit', (event) => { event.preventDefault(); saveQuestion(); });
$('#attachmentInput').addEventListener('change', (event) => readAttachment(event.target.files[0]));
$('#searchInput').addEventListener('input', render);
$('#statusFilter').addEventListener('change', (event) => { activeFilter = event.target.value; render(); });
$('#systemFilter').addEventListener('change', (event) => { activeSystem = event.target.value; render(); });
$('#recordsList').addEventListener('click', (event) => {
  const button = event.target.closest('[data-select-id]');
  if (button) selectRecord(button.dataset.selectId);
});
$('#detailContent').addEventListener('click', (event) => {
  if (event.target.closest('[data-edit-selected]')) openQuestion(state.records.find((record) => record.id === selectedRecordId));
  if (event.target.closest('[data-toggle-mastery]')) toggleMastery();
  if (event.target.closest('[data-close-detail]')) $('#detailPanel').classList.remove('open');
});
$$('[data-close-grade]').forEach((button) => button.addEventListener('click', () => $('#gradeDialog').close()));
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
      .then((registration) => registration.update())
      .catch(() => {});
  });
}
const systemOptions = SYSTEMS.map((system) => `<option value="${escapeHtml(system)}">${escapeHtml(system)}</option>`).join('');
$('#systemInput').innerHTML = systemOptions;
$('#systemFilter').insertAdjacentHTML('beforeend', systemOptions);
render();
window.postMessage({ type: 'REMEDIATION_HUB_READY' }, window.location.origin);
