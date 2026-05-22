import { CIPHERS, blogUrlForCipher, buildSearchPayload, calculateAllCiphers, calculateCipher } from '/page-scripts/multi-cipher-engine.mjs';

const FREE_MEMBERSHIP_SAVE_LIMIT = 7;
const MEMBER_DASHBOARD_SYNC_KEY = 'memberDashboardUpdate';

const form = document.getElementById('multi-cipher-form');
const input = document.getElementById('multi-cipher-input');
const modeRadios = Array.from(document.querySelectorAll('input[name="multi-cipher-mode"]'));
const cipherSelect = document.getElementById('multi-cipher-select');
const singleSelectRow = document.getElementById('multi-cipher-select-row');
const allResult = document.getElementById('multi-cipher-result-all');
const singleResult = document.getElementById('multi-cipher-result-single');
const status = document.getElementById('multi-cipher-status');
const clearButton = document.getElementById('multi-cipher-clear');
const saveButton = document.getElementById('multi-cipher-save-button');
const saveHintRow = document.getElementById('multi-cipher-save-hint-row');
const memberSaveShell = document.getElementById('member-save-shell');
const memberSaveMeta = document.getElementById('member-save-meta');
const memberLink = document.getElementById('member-link');

let memberSession = null;
let currentSearchPayload = null;
let lastSavedSearchPayload = null;
let saveHistoryPopover = null;

const memberDashboardSyncChannel = typeof window.BroadcastChannel === 'function'
  ? new window.BroadcastChannel('member-dashboard-sync')
  : null;

function currentMode() {
  const checked = modeRadios.find((r) => r.checked);
  return checked ? checked.value : 'all';
}

function populateCipherSelect() {
  cipherSelect.innerHTML = '';
  for (const cipher of CIPHERS) {
    const option = document.createElement('option');
    option.value = cipher.id;
    option.textContent = cipher.name;
    cipherSelect.appendChild(option);
  }
}

function updateModeVisibility() {
  singleSelectRow.hidden = currentMode() !== 'single';
}

function clearResults() {
  allResult.innerHTML = '';
  singleResult.innerHTML = '';
  status.textContent = '';
  currentSearchPayload = null;
  updateMemberSaveState();
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderAllCiphers(query) {
  const results = calculateAllCiphers(query);
  const letterCount = results[0]?.letterCount ?? 0;
  const rows = results
    .map((r) => {
      const isSumerian = r.cipherId === 'sumerian';
      const valueCell = isSumerian
        ? `<a href="/gematria-results.html?gematria=${encodeURIComponent(r.total)}" class="fw-semibold">${r.total}</a>`
        : `<span class="fw-semibold">${r.total}</span>`;
      const blogHref = blogUrlForCipher(r.cipherId);
      const nameCell = blogHref
        ? `<a href="${escapeHtml(blogHref)}" class="fw-semibold">${escapeHtml(r.cipherName)}</a>`
        : `<span class="fw-semibold">${escapeHtml(r.cipherName)}</span>`;
      return `
        <tr>
          <th scope="row">${nameCell}</th>
          <td class="text-end">${valueCell}</td>
          <td class="text-center">${r.digitalRoot}</td>
          <td class="small text-muted">${escapeHtml(r.description)}</td>
        </tr>`;
    })
    .join('');
  allResult.innerHTML = `
    <div class="mb-2 small text-muted">
      Showing all 7 ciphers for <strong>${escapeHtml(query)}</strong>
      (${letterCount} letter${letterCount === 1 ? '' : 's'} counted).
      The Sumerian value links to related words in our database.
    </div>
    <div class="table-responsive">
      <table class="table table-sm align-middle mb-0">
        <thead>
          <tr>
            <th scope="col">Cipher</th>
            <th scope="col" class="text-end">Value</th>
            <th scope="col" class="text-center">Digital root</th>
            <th scope="col">Notes</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
  currentSearchPayload = buildSearchPayload({ query, mode: 'all', cipherId: null, allResults: results });
  updateMemberSaveState();
}

function renderSingleCipher(query, cipherId) {
  const result = calculateCipher(query, cipherId);
  const letterBreakdown = result.perLetter
    .map((p) => `<span class="badge bg-secondary-subtle text-dark me-1 mb-1">${escapeHtml(p.letter)} = ${p.value}</span>`)
    .join('');
  const isSumerian = result.cipherId === 'sumerian';
  const valueDisplay = isSumerian
    ? `<a href="/gematria-results.html?gematria=${encodeURIComponent(result.total)}" class="display-5 fw-bold text-decoration-none">${result.total}</a>`
    : `<span class="display-5 fw-bold">${result.total}</span>`;
  const blogHref = blogUrlForCipher(result.cipherId);
  const cipherHeading = blogHref
    ? `<a href="${escapeHtml(blogHref)}">${escapeHtml(result.cipherName)}</a>`
    : escapeHtml(result.cipherName);
  singleResult.innerHTML = `
    <div class="content-panel p-3 p-lg-4">
      <p class="section-kicker mb-2">${cipherHeading}</p>
      <p class="mb-1">Word/phrase: <strong>${escapeHtml(query)}</strong></p>
      <div class="d-flex align-items-baseline gap-3 mb-3 flex-wrap">
        <div>${valueDisplay}</div>
        <div class="small text-muted">
          Digital root: <strong>${result.digitalRoot}</strong> ·
          Letters counted: <strong>${result.letterCount}</strong>
        </div>
      </div>
      ${result.perLetter.length ? `<div class="d-flex flex-wrap">${letterBreakdown}</div>` : ''}
      ${isSumerian
        ? `<p class="small mt-3 mb-0">This is the cipher the rest of the site uses. <a href="/gematria-results.html?gematria=${encodeURIComponent(result.total)}">See related words for ${result.total} →</a></p>`
        : ''}
    </div>
  `;
  const allResults = calculateAllCiphers(query);
  currentSearchPayload = buildSearchPayload({ query, mode: 'single', cipherId, allResults });
  updateMemberSaveState();
}

async function requestMemberSession() {
  try {
    const response = await fetch('/api/member-session', { credentials: 'same-origin' });
    if (!response.ok) {
      memberSession = null;
      return null;
    }
    memberSession = await response.json();
    return memberSession;
  } catch {
    memberSession = null;
    return null;
  }
}

function showMembersOnlySaveMessage() {
  if (!memberSaveMeta) return;
  memberSaveMeta.textContent = '';
  memberSaveMeta.append('Only registered members can save searches. ');
  const joinLink = document.createElement('a');
  joinLink.href = '/member.html#authSection';
  joinLink.textContent = 'Join';
  memberSaveMeta.append(joinLink, '.');
}

function destroyMembersOnlyPopover() {
  if (!saveHistoryPopover) return;
  saveHistoryPopover.dispose();
  saveHistoryPopover = null;
}

function syncSaveHint() {
  if (!saveHintRow) return;
  const needsCalc = saveButton.disabled && saveButton.textContent === 'Save result';
  saveHintRow.hidden = !needsCalc;
}

function updateMemberSaveState() {
  if (!memberSession?.authenticated) {
    if (memberSaveShell) memberSaveShell.classList.remove('d-none');
    if (memberSaveMeta && !memberSaveMeta.textContent) {
      memberSaveMeta.textContent = 'Join for free to save searches across all seven ciphers.';
    }
    if (saveButton) {
      saveButton.disabled = false;
      saveButton.textContent = 'Save result';
      saveButton.classList.add('member-save-button--guest');
    }
    syncSaveHint();
    return;
  }
  saveButton.classList.remove('member-save-button--guest');
  if (memberLink) {
    memberLink.href = '/member.html';
    memberLink.textContent = 'Go to My Dashboard';
    memberLink.classList.remove('btn-primary');
    memberLink.classList.add('btn-outline-primary');
  }
  destroyMembersOnlyPopover();
  if (currentSearchPayload && currentSearchPayload === lastSavedSearchPayload) {
    saveButton.textContent = 'Saved';
    saveButton.disabled = true;
  } else {
    saveButton.textContent = 'Save result';
    saveButton.disabled = !currentSearchPayload;
  }
  const memberName = memberSession.member?.displayName || memberSession.member?.username || 'member';
  const freeTierSuffix = memberSession.member?.membershipLevel === 'free'
    ? ` Free memberships can save up to ${FREE_MEMBERSHIP_SAVE_LIMIT} searches.`
    : '';
  if (memberSaveMeta) {
    memberSaveMeta.textContent = currentSearchPayload
      ? `Signed in as ${memberName}. Save this result to history.${freeTierSuffix}`
      : `Signed in as ${memberName}. Run a calculation to save it.${freeTierSuffix}`;
  }
  syncSaveHint();
}

function notifyDashboardUpdate() {
  const update = { kind: 'history', at: Date.now() };
  try {
    window.localStorage.setItem(MEMBER_DASHBOARD_SYNC_KEY, JSON.stringify(update));
  } catch {
    // localStorage may be unavailable; BroadcastChannel still wakes live tabs when present.
  }
  memberDashboardSyncChannel?.postMessage(update);
}

async function saveCurrentSearch(noteText = '') {
  if (!currentSearchPayload) {
    memberSaveMeta.textContent = 'Run a calculation before saving history.';
    return;
  }
  if (!memberSession?.authenticated) {
    memberSaveMeta.textContent = 'Sign in on the membership page before saving history.';
    return;
  }
  saveButton.disabled = true;
  memberSaveMeta.textContent = 'Saving search to your account...';
  const requestBody = { ...currentSearchPayload, note: String(noteText ?? '').trim() };
  const response = await fetch('/api/member-history', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(requestBody),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    saveButton.disabled = !currentSearchPayload;
    throw new Error(payload.error || 'Unable to save search history.');
  }
  memberSaveMeta.textContent = memberSession?.member?.membershipLevel === 'free'
    ? `Saved to your account history. Free memberships can store up to ${FREE_MEMBERSHIP_SAVE_LIMIT} saved searches.`
    : 'Saved to your account history.';
  notifyDashboardUpdate();
  lastSavedSearchPayload = currentSearchPayload;
  saveButton.textContent = 'Saved';
  saveButton.disabled = true;
  syncSaveHint();
}

function getSaveNoteModal() {
  const modalElement = document.getElementById('multi-cipher-save-note-modal');
  if (!modalElement || !window.bootstrap?.Modal) return null;
  return window.bootstrap.Modal.getOrCreateInstance(modalElement);
}

async function performSaveWithNote(noteText) {
  try {
    await saveCurrentSearch(noteText);
  } catch (error) {
    memberSaveMeta.textContent = error.message || 'Unable to save search history.';
  }
}

function handleSubmit(event) {
  event.preventDefault();
  const query = input.value.trim();
  clearResults();
  if (!query) {
    status.textContent = 'Enter a word or phrase to calculate.';
    return;
  }
  try {
    if (currentMode() === 'single') {
      renderSingleCipher(query, cipherSelect.value);
    } else {
      renderAllCiphers(query);
    }
  } catch (error) {
    status.textContent = `Could not calculate: ${error.message}`;
  }
}

populateCipherSelect();
updateModeVisibility();
updateMemberSaveState();
modeRadios.forEach((radio) => radio.addEventListener('change', () => {
  updateModeVisibility();
  clearResults();
}));
form.addEventListener('submit', handleSubmit);
clearButton.addEventListener('click', () => {
  input.value = '';
  clearResults();
  input.focus();
});

['mouseenter', 'focus'].forEach((eventName) => {
  saveButton.addEventListener(eventName, () => {
    if (!memberSession?.authenticated) {
      showMembersOnlySaveMessage();
      if (!saveHistoryPopover && window.createMembersOnlySavePopover) {
        saveHistoryPopover = window.createMembersOnlySavePopover(saveButton);
      }
      saveHistoryPopover?.show();
    }
  });
});

saveButton.addEventListener('click', (event) => {
  if (!memberSession?.authenticated) {
    event.preventDefault();
    showMembersOnlySaveMessage();
    if (!saveHistoryPopover && window.createMembersOnlySavePopover) {
      saveHistoryPopover = window.createMembersOnlySavePopover(saveButton);
    }
    saveHistoryPopover?.show();
    return;
  }
  if (!currentSearchPayload) {
    memberSaveMeta.textContent = 'Run a calculation before saving history.';
    return;
  }
  const modal = getSaveNoteModal();
  const noteInput = document.getElementById('multi-cipher-save-note-input');
  if (noteInput) noteInput.value = '';
  if (modal) {
    modal.show();
  } else {
    performSaveWithNote('');
  }
});

document.addEventListener('click', async (event) => {
  const target = event.target.closest('#multi-cipher-save-note-confirm');
  if (!target) return;
  const noteInput = document.getElementById('multi-cipher-save-note-input');
  const noteText = noteInput?.value ?? '';
  getSaveNoteModal()?.hide();
  await performSaveWithNote(noteText);
});

window.addEventListener('DOMContentLoaded', async () => {
  await requestMemberSession().catch(() => null);
  updateMemberSaveState();
});
