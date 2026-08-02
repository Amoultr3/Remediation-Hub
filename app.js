const STORAGE_KEY = 'remediationHub.v1';
const state = loadState();
let activeFilter = 'all';
let pendingAttachment = null;

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

function render() {
  const query = $('#searchInput').value.trim().toLowerCase();
  const filtered = state.records.filter((record) => {
    const matchesFilter = activeFilter === 'all' || record.status === activeFilter;
    const matchesQuery = !query || `${record.question} ${record.topic} ${record.notes}`.toLowerCase().includes(query);
    return matchesFilter && matchesQuery;
  });

  $('#recordCount').textContent = state.records.length;
  $('#reviewCount').textContent = state.records.filter((r) => r.status === 'review').length;
  $('#allStat').textContent = state.records.length;
  $('#missedStat').textContent = state.records.filter((r) => r.status === 'review').length;
  $('#masteredStat').textContent = state.records.filter((r) => r.status === 'mastered').length;
  $('#reviewMessage').textContent = `${state.records.filter((r) => r.status === 'review').length} question${state.records.filter((r) => r.status === 'review').length === 1 ? '' : 's'} currently need review.`;

  $('#recordsList').innerHTML = filtered.map((record) => `
    <article class="record-card">
      <button type="button" data-edit-id="${record.id}">
        <div>
          <div class="record-meta">
            <span>${escapeHtml(record.topic || 'Uncategorized')}</span>
            <span class="status-pill ${record.status}">${record.status === 'mastered' ? 'Mastered' : 'Needs review'}</span>
            <span>${escapeHtml(record.confidence)} confidence</span>
            ${record.attachment ? '<span>Image attached</span>' : ''}
          </div>
          <h3>${escapeHtml(record.question)}</h3>
          <p>${record.selectedAnswer === null ? 'Your answer not selected' : `Your answer: ${escapeHtml(record.choices[record.selectedAnswer] || '')}`}</p>
        </div>
        <span class="card-arrow">›</span>
      </button>
    </article>`).join('');

  const noRecordsAtAll = state.records.length === 0;
  $('#emptyState').classList.toggle('hidden', !noRecordsAtAll || Boolean(query) || activeFilter !== 'all');
  $('#recordsList').classList.toggle('hidden', noRecordsAtAll);
  renderSession();
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
  $$('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.view === viewName));
  $(`#${viewName}View`).classList.add('active');
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
  $('#questionDialog').close();
  toast(existing ? 'Question updated.' : 'Question saved.');
  render();
}

function deleteQuestion() {
  const id = $('#questionId').value;
  const record = state.records.find((r) => r.id === id);
  if (!record || !confirm('Delete this question record?')) return;
  state.records = state.records.filter((r) => r.id !== id);
  saveState();
  $('#questionDialog').close();
  toast('Question deleted.');
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

$$('.nav-item').forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)));
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
$('#recordsList').addEventListener('click', (event) => {
  const button = event.target.closest('[data-edit-id]');
  if (button) openQuestion(state.records.find((record) => record.id === button.dataset.editId));
});
$$('.filter').forEach((button) => button.addEventListener('click', () => {
  activeFilter = button.dataset.filter;
  $$('.filter').forEach((item) => item.classList.toggle('active', item === button));
  render();
}));
$$('[data-close-grade]').forEach((button) => button.addEventListener('click', () => $('#gradeDialog').close()));

if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js'));
render();
