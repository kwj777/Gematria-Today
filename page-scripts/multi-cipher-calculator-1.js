import { CIPHERS, calculateAllCiphers, calculateCipher } from '/page-scripts/multi-cipher-engine.mjs';

const form = document.getElementById('multi-cipher-form');
const input = document.getElementById('multi-cipher-input');
const modeRadios = Array.from(document.querySelectorAll('input[name="multi-cipher-mode"]'));
const cipherSelect = document.getElementById('multi-cipher-select');
const singleSelectRow = document.getElementById('multi-cipher-select-row');
const allResult = document.getElementById('multi-cipher-result-all');
const singleResult = document.getElementById('multi-cipher-result-single');
const status = document.getElementById('multi-cipher-status');
const clearButton = document.getElementById('multi-cipher-clear');

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
  const mode = currentMode();
  if (mode === 'single') {
    singleSelectRow.hidden = false;
  } else {
    singleSelectRow.hidden = true;
  }
}

function clearResults() {
  allResult.innerHTML = '';
  singleResult.innerHTML = '';
  status.textContent = '';
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
        ? `<a href="/gematria-results.html?query=${encodeURIComponent(r.total)}" class="fw-semibold">${r.total}</a>`
        : `<span class="fw-semibold">${r.total}</span>`;
      return `
        <tr>
          <th scope="row" class="fw-semibold">${escapeHtml(r.cipherName)}</th>
          <td class="text-end">${valueCell}</td>
          <td class="text-end">${r.digitalRoot}</td>
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
            <th scope="col" class="text-end">Digital root</th>
            <th scope="col">Notes</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderSingleCipher(query, cipherId) {
  const result = calculateCipher(query, cipherId);
  const letterBreakdown = result.perLetter
    .map((p) => `<span class="badge bg-secondary-subtle text-dark me-1 mb-1">${escapeHtml(p.letter)} = ${p.value}</span>`)
    .join('');
  const isSumerian = result.cipherId === 'sumerian';
  const valueDisplay = isSumerian
    ? `<a href="/gematria-results.html?query=${encodeURIComponent(result.total)}" class="display-5 fw-bold text-decoration-none">${result.total}</a>`
    : `<span class="display-5 fw-bold">${result.total}</span>`;

  singleResult.innerHTML = `
    <div class="content-panel p-3 p-lg-4">
      <p class="section-kicker mb-2">${escapeHtml(result.cipherName)}</p>
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
        ? `<p class="small mt-3 mb-0">This is the cipher the rest of the site uses. <a href="/gematria-results.html?query=${encodeURIComponent(result.total)}">See related words for ${result.total} →</a></p>`
        : ''}
    </div>
  `;
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
