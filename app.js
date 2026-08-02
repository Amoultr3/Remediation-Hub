const STORAGE_KEY = 'remediationHub.v1';
const state = loadState();
let activeFilter = 'all';
let pendingAttachment = null;
let selectedRecordId = state.records[0]?.id || null;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { records: [], session: null };
  } catch {
    return { records: [], session: null };
  }
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

function render() {
  const query = $('#searchInput').value.trim().toLowerCase();
  const filtered = state.records.filter((record) => {
    const matchesFilter = activeFilter === 'all' || record.status === activeFilter;
    const matchesQuery = !query || `${record.question} ${record.topic} ${record.notes} ${record.reasoning}`.toLowerCase().includes(query);
    return matchesFilter && matchesQuery;
  });

  const reviewTotal = state.records.filter((r) => r.status === 'review').length;
  $('#recordCount').textContent = filtered.length;
  $('#reviewCount').textContent = reviewTotal;
  $('#reviewMessage').textContent = `${reviewTotal} question${reviewTotal === 1 ? '' : 's'} currently need review.`;

  $('#recordsList').innerHTML = filtered.map((record) => {
    const originalIndex = state.records.findIndex((item) => item.id === record.id);
    const isMastered = record.status === 'mastered';
    return `
      <article class="record-card ${selectedRecordId === record.id ? 'selected' : ''}">
        <button type="button" data-select-id="${record.id}" aria-label="Open ${escapeHtml(record.question)}">
          <span class="record-number">${state.records.length - originalIndex}</span>
          <div class="record-copy">
            <h3>${escapeHtml(record.question)}</h3>
            <div class="record-meta">
              <span>${escapeHtml(record.topic || 'Uncategorized')}</span>
              <span>${formatDate(record.updatedAt || record.createdAt)}</span>
              <span>${escapeHtml(record.confidence || 'medium')} confidence</span>
              ${record.attachment ? '<span>Image</span>' : ''}
            </div>
          </div>
          <div class="record-status">
            <strong class="${isMastered ? 'mastered' : ''}">${isMastered ? 'Mastered' : 'Needs review'}</strong>
            <span>${escapeHtml(record.clue || (isMastered ? 'Remediated' : 'Add the missed clue'))}</span>
          </div>
          <span class="card-arrow">›</span>
        </button>
      </article>`;
  }).join('');

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

  const selectedCorrect = record.selectedAnswer !== null && record.selectedAnswer === record.correctAnswer;
  const recordNumber = state.records.length - state.records.findIndex((item) => item.id === record.id);
  $('#detailContent').innerHTML = `
    <div class="detail-topline">
      <button type="button" class="mobile-back" data-close-detail aria-label="Close question details">←</button>
      <strong>Question ${recordNumber}</strong>
      <div class="detail-actions"><button type="button" data-edit-selected>Edit</button><button type="button" aria-label="More options">⋮</button></div>
    </div>
    <span class="detail-topic">${escapeHtml(record.topic || 'Uncategorized')}</span>
    <h2 class="detail-question">${escapeHtml(record.question)}</h2>
    <div class="answer-list">
      ${record.choices.map((choice, index) => `
        <div class="answer-choice ${record.selectedAnswer === index ? 'mine' : ''} ${record.correctAnswer === index ? 'correct' : ''}">
          <span class="answer-letter">${String.fromCharCode(65 + index)}</span><span>${escapeHtml(choice || 'Blank choice')}</span>
        </div>`).join('')}
    </div>
    <hr class="detail-rule">
    <section class="detail-section">
      <label>Your answer</label>
      <div class="answer-box ${selectedCorrect ? 'right' : 'wrong'}">${escapeHtml(answerText(record, record.selectedAnswer))}<strong>${selectedCorrect ? 'Correct' : 'Incorrect'}</strong></div>
    </section>
    <section class="detail-section">
      <label>Correct answer</label>
      <div class="answer-box right">${escapeHtml(answerText(record, record.correctAnswer))}<strong>Answer key</strong></div>
    </section>
    <section class="detail-section">
      <label>Why I chose it</label>
      <div class="note-box ${record.reasoning ? '' : 'empty-note'}">${escapeHtml(record.reasoning || 'No reasoning added yet.')}</div>
    </section>
    <section class="detail-section">
      <label>Missed clue</label>
      <div class="note-box ${record.clue ? '' : 'empty-note'}">${escapeHtml(record.clue || 'No missed clue added yet.')}</div>
    </section>
    ${record.notes ? `<section class="detail-section"><label>Additional notes</label><div class="note-box">${escapeHtml(record.notes)}</div></section>` : ''}
    ${record.attachment ? `<section class="detail-section"><label>Attached image or diagram</label><img class="detail-image" src="${record.attachment}" alt="Question attachment"></section>` : ''}
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
  const row = document.createElement('div');
  row.className = 'choice-row';
  row.innerHTML = `
    <input type="radio" name="selectedChoice" value="${index}" ${selected ? 'checked' : ''} aria-label="My answer">
    <input type="radio" name="correctChoice" value="${index}" ${correct ? 'checked' : ''} aria-label="Correct answer">
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
    row.querySelectorAll('input[type="radio"]').forEach((input) => input.value = index);
    row.querySelector('input[type="text"]').placeholder = `Choice ${String.fromCharCode(65 + index)}`;
  });
}

function openQuestion(record = null) {
  $('#questionForm').reset();
  $('#choicesEditor').innerHTML = '';
  pendingAttachment = record?.attachment || null;
  $('#questionId').value = record?.id || '';
  $('#dialogTitle').textContent = record ? 'Edit question' : 'Add a question';
  $('#topicInput').value = record?.topic || '';
  $('#questionInput').value = record?.question || '';
  $('#confidenceInput').value = record?.confidence || 'medium';
  $('#statusInput').value = record?.status || 'review';
  $('#reasoningInput').value = record?.reasoning || '';
  $('#clueInput').value = record?.clue || '';
  $('#notesInput').value = record?.notes || '';
  const choices = record?.choices?.length ? record.choices : ['', '', '', ''];
  choices.forEach((choice, index) => addChoice(choice, record?.selectedAnswer === index, record?.correctAnswer === index));
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
  const selectedNode = $('input[name="selectedChoice"]:checked');
  const correctNode = $('input[name="correctChoice"]:checked');
  const choices = $$('.choice-row input[type="text"]').map((input) => input.value.trim());
  if (choices.filter(Boolean).length < 2) return toast('Enter at least two answer choices.');
  const existingIndex = state.records.findIndex((r) => r.id === id);
  const existing = existingIndex >= 0 ? state.records[existingIndex] : null;
  const record = {
    id,
    topic: $('#topicInput').value.trim(),
    question: $('#questionInput').value.trim(),
    choices,
    selectedAnswer: selectedNode ? Number(selectedNode.value) : null,
    correctAnswer: correctNode ? Number(correctNode.value) : null,
    confidence: $('#confidenceInput').value,
    status: $('#statusInput').value,
    reasoning: $('#reasoningInput').value.trim(),
    clue: $('#clueInput').value.trim(),
    notes: $('#notesInput').value.trim(),
    attachment: pendingAttachment,
    sessionId: existing?.sessionId || state.session?.id || null,
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  if (record.correctAnswer !== null && record.selectedAnswer !== null && record.correctAnswer !== record.selectedAnswer) record.status = 'review';
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
  if (state.records.some((record) => record.externalId === payload.externalId)) {
    window.postMessage({ type: 'REMEDIATION_IMPORT_COMPLETE', externalId: payload.externalId }, window.location.origin);
    return;
  }

  const question = String(payload.question || '').trim();
  const choices = Array.isArray(payload.choices)
    ? payload.choices.map((choice) => String(choice || '').trim()).filter(Boolean).slice(0, 8)
    : [];
  if (!question || choices.length < 2) return;

  const selectedAnswer = Number.isInteger(payload.selectedAnswer) && payload.selectedAnswer < choices.length
    ? payload.selectedAnswer
    : null;
  const correctAnswer = Number.isInteger(payload.correctAnswer) && payload.correctAnswer < choices.length
    ? payload.correctAnswer
    : null;
  const id = uid();
  const now = new Date().toISOString();
  const record = {
    id,
    externalId: payload.externalId,
    source: 'chrome-extension',
    topic: String(payload.topic || '').trim(),
    question,
    choices,
    selectedAnswer,
    correctAnswer,
    confidence: ['low', 'medium', 'high'].includes(payload.confidence) ? payload.confidence : 'medium',
    status: 'review',
    reasoning: String(payload.reasoning || '').trim(),
    clue: String(payload.clue || '').trim(),
    notes: String(payload.notes || '').trim(),
    attachment: null,
    sessionId: state.session?.id || null,
    createdAt: payload.createdAt || now,
    updatedAt: now
  };

  state.records.unshift(record);
  if (!saveState()) return;
  selectedRecordId = id;
  setView('records');
  render();
  $('#detailPanel').classList.add('open');
  toast('Question captured from Chrome.');
  window.postMessage({ type: 'REMEDIATION_IMPORT_COMPLETE', externalId: payload.externalId }, window.location.origin);
}

window.addEventListener('message', (event) => {
  if (event.source !== window || event.origin !== window.location.origin) return;
  if (event.data?.type === 'REMEDIATION_EXTENSION_RECORD') importExtensionRecord(event.data.record);
});

function endSession() {
  if (!state.session) return;
  const sessionRecords = state.records.filter((r) => r.sessionId === state.session.id);
  const graded = sessionRecords.filter((r) => r.selectedAnswer !== null && r.correctAnswer !== null);
  const correct = graded.filter((r) => r.selectedAnswer === r.correctAnswer).length;
  const needsReview = sessionRecords.filter((r) => r.status === 'review').length;
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
$('#endSessionBtn').addEventListener('click', endSession);
$('#addChoiceBtn').addEventListener('click', () => addChoice());
$('#closeDialogBtn').addEventListener('click', () => $('#questionDialog').close());
$('#cancelDialogBtn').addEventListener('click', () => $('#questionDialog').close());
$('#deleteQuestionBtn').addEventListener('click', deleteQuestion);
$('#questionForm').addEventListener('submit', (event) => { event.preventDefault(); saveQuestion(); });
$('#attachmentInput').addEventListener('change', (event) => readAttachment(event.target.files[0]));
$('#searchInput').addEventListener('input', render);
$('#statusFilter').addEventListener('change', (event) => { activeFilter = event.target.value; render(); });
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

if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js'));
render();
window.postMessage({ type: 'REMEDIATION_HUB_READY' }, window.location.origin);
