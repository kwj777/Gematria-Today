import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import handler, {
  CHART_HEIGHT,
  CHART_WIDTH,
  MAX_MATCHES,
  MAX_NAMES,
  MAX_NAME_LETTERS,
  buildChartSvg,
  buildLetterTiles,
  computeChart,
  computeLadderStartY,
  computeTileMetrics,
  escapeXml,
  filterMatches,
  fitDisplayFontSize,
  getPerLetterValues,
  isFullChartAuthorized,
  layoutTitle,
  parseCalculatedOn,
  parseMatches,
  parseNames,
  resolveFontFiles,
  signChartRequest,
  splitTitleLines,
  truncate,
} from '../netlify/functions/name-chart-image.mjs';
import { englishGematria } from '../netlify/functions/englishGematria.mjs';

function params(object) {
  return new URLSearchParams(object);
}

function chartFor(...names) {
  return computeChart(names);
}

// ---------- escapeXml / truncate ----------

test('escapeXml escapes all five XML entities', () => {
  assert.equal(escapeXml(`a & b < c > d " e ' f`), 'a &amp; b &lt; c &gt; d &quot; e &apos; f');
});

test('truncate leaves short strings untouched and ellipsises long ones', () => {
  assert.equal(truncate('SARAH', 10), 'SARAH');
  const clipped = truncate('BARTHOLOMEW', 6);
  assert.equal(clipped.length, 6);
  assert.ok(clipped.endsWith('…'));
});

// ---------- getPerLetterValues ----------

test('getPerLetterValues applies the base-6 cipher', () => {
  assert.deepEqual(getPerLetterValues('abz'), [
    { letter: 'A', value: 6 },
    { letter: 'B', value: 12 },
    { letter: 'Z', value: 156 },
  ]);
});

test('getPerLetterValues drops punctuation so hyphenated names do not get valueless tiles', () => {
  assert.deepEqual(getPerLetterValues("O'BRIEN-SMITH").map((entry) => entry.letter).join(''), 'OBRIENSMITH');
  assert.deepEqual(getPerLetterValues('   '), []);
  assert.deepEqual(getPerLetterValues(null), []);
});

// ---------- parseNames / parseMatches ----------

test('parseNames reads up to three names and drops blanks', () => {
  assert.deepEqual(parseNames(params({ name1: 'Sarah', name2: '  ', name3: 'Morgan' })), ['Sarah', 'Morgan']);
  assert.deepEqual(parseNames(params({})), []);
});

test('parseNames never returns more rows than the chart can lay out', () => {
  const names = parseNames(params({ name1: 'A', name2: 'B', name3: 'C' }));
  assert.ok(names.length <= MAX_NAMES);
});

test('parseMatches splits on commas, trims, and caps the chip count', () => {
  assert.deepEqual(parseMatches(params({ matches: 'ONE, TWO ,, THREE' })), ['ONE', 'TWO', 'THREE']);
  assert.deepEqual(parseMatches(params({})), []);
  const many = parseMatches(params({ matches: Array.from({ length: 20 }, (_, i) => `W${i}`).join(',') }));
  assert.equal(many.length, MAX_MATCHES);
});

test('parseMatches keeps multi-word entries intact', () => {
  assert.deepEqual(parseMatches(params({ matches: 'THE FAITHFUL,OPEN HEAVEN' })), ['THE FAITHFUL', 'OPEN HEAVEN']);
});

// ---------- parseCalculatedOn ----------

test('parseCalculatedOn formats a pinned date so a reprint shows the purchase day', () => {
  assert.equal(parseCalculatedOn('2026-08-19'), '19 August 2026');
});

test('parseCalculatedOn falls back to the supplied default when the input is missing or junk', () => {
  const fallback = new Date('2026-01-02T00:00:00Z');
  assert.equal(parseCalculatedOn('', fallback), '2 January 2026');
  assert.equal(parseCalculatedOn('not-a-date', fallback), '2 January 2026');
});

// ---------- computeChart ----------

test('computeChart sums the per-name subtotals into the full-name total', () => {
  const chart = chartFor('Sarah', 'Jane', 'Morgan');
  assert.deepEqual(chart.rows.map((row) => row.subtotal), [282, 180, 408]);
  assert.equal(chart.total, 870);
});

test('computeChart derives the digital root and base-rooted flag from the total', () => {
  const chart = chartFor('Sarah', 'Jane', 'Morgan');
  assert.equal(chart.digitalRoot, 6);
  assert.equal(chart.isBaseRoot, true);

  const plain = chartFor('Sarah');
  assert.equal(plain.total, 282);
  assert.equal(plain.isBaseRoot, false);
});

test('computeChart labels rows First/Second/Third, matching the form fields', () => {
  // "MIDDLE" would misdescribe the second row whenever someone enters a first
  // and last name only, which the form explicitly allows.
  assert.deepEqual(chartFor('A', 'B', 'C').rows.map((row) => row.label), ['FIRST', 'SECOND', 'THIRD']);
});

test('computeChart upper-cases the printed name', () => {
  assert.equal(chartFor('sarah', 'morgan').fullName, 'SARAH MORGAN');
});

// ---------- letter tiles ----------

test('a name longer than the ladder folds its tail into a "+N" tile so the tiles add up', () => {
  // 22 letters. The ladder used to show the first 20 tiles (summing to less)
  // next to a subtotal computed from all 22.
  const chart = chartFor('Elizabeth Alexandra Mary');
  const [row] = chart.rows;
  assert.equal(row.letters.length, MAX_NAME_LETTERS);
  assert.equal(row.letters.at(-1).letter, '+3');
  assert.equal(row.letters.reduce((sum, { value }) => sum + value, 0), row.subtotal);
  assert.equal(row.subtotal, Number(englishGematria('Elizabeth Alexandra Mary')));
  const svg = buildChartSvg({ chart, matches: [], calculatedOn: 'x' });
  assert.ok(svg.includes('>+3<'));
});

test('buildLetterTiles leaves names that fit untouched', () => {
  assert.deepEqual(buildLetterTiles('Sarah'), getPerLetterValues('Sarah'));
  const exact = 'A'.repeat(MAX_NAME_LETTERS);
  assert.deepEqual(buildLetterTiles(exact), getPerLetterValues(exact));
});

test('the tiles always sum to the row subtotal, whatever the name length', () => {
  for (const length of [1, MAX_NAME_LETTERS - 1, MAX_NAME_LETTERS, MAX_NAME_LETTERS + 1, 200]) {
    const name = 'QWERTYUIOPASDFGHJKLZXCVBNM'.repeat(10).slice(0, length);
    const [row] = chartFor(name).rows;
    assert.ok(row.letters.length <= MAX_NAME_LETTERS, `length ${length}`);
    assert.equal(row.letters.reduce((sum, { value }) => sum + value, 0), row.subtotal, `length ${length}`);
  }
});

// ---------- matching words ----------

test('filterMatches keeps only words whose own value is the full-name total', () => {
  const chart = chartFor('Sarah', 'Jane', 'Morgan');
  // ?matches= arrives from the URL; a hand-edited list must not be able to put
  // arbitrary words under "WORDS SHARING THIS VALUE".
  const genuine = ['A'.repeat(chart.total / 6)];
  assert.equal(Number(englishGematria(genuine[0])), chart.total);
  assert.deepEqual(filterMatches([...genuine, 'antichrist', 'beast'], chart.total), genuine);
  assert.deepEqual(filterMatches([], chart.total), []);
});

// ---------- forgery resistance ----------

test('a total supplied on the query string cannot override the computed one', () => {
  // Once this chart is sold, a buyer must not be able to print any number they
  // like by editing the URL, so nothing numeric is read from searchParams.
  const searchParams = params({ name1: 'Sarah', total: '9999', digitalRoot: '1', isBaseRoot: 'true' });
  const chart = computeChart(parseNames(searchParams));
  assert.equal(chart.total, 282);
  const svg = buildChartSvg({ chart, matches: [], calculatedOn: '19 August 2026' });
  assert.ok(!svg.includes('9999'));
  assert.ok(svg.includes('>282<'));
});

// ---------- title layout ----------

test('fitDisplayFontSize keeps short names at the display size and clamps long ones', () => {
  assert.equal(fitDisplayFontSize('SARAH'), 128);
  assert.ok(fitDisplayFontSize('X'.repeat(200)) >= 44);
  assert.ok(fitDisplayFontSize('X'.repeat(200)) < 128);
});

test('splitTitleLines balances the two halves on word boundaries', () => {
  assert.deepEqual(splitTitleLines('BARTHOLOMEW CHRISTOPHER FEATHERSTONEHAUGH'), [
    'BARTHOLOMEW CHRISTOPHER',
    'FEATHERSTONEHAUGH',
  ]);
});

test('splitTitleLines leaves a single unsplittable word alone', () => {
  assert.deepEqual(splitTitleLines('FEATHERSTONEHAUGH'), ['FEATHERSTONEHAUGH']);
  assert.deepEqual(splitTitleLines(''), []);
});

test('layoutTitle keeps a normal name on one line', () => {
  const title = layoutTitle('SARAH JANE MORGAN');
  assert.equal(title.lines.length, 1);
  assert.equal(title.baselines.length, 1);
});

test('layoutTitle wraps a long name rather than shrinking it to illegibility', () => {
  const title = layoutTitle('BARTHOLOMEW CHRISTOPHER FEATHERSTONEHAUGH');
  assert.equal(title.lines.length, 2);
  assert.equal(title.baselines.length, 2);
  assert.ok(title.baselines[1] > title.baselines[0]);
  // Both lines must clear the rule the ladder hangs from.
  assert.ok(title.baselines[1] < 600);
});

// ---------- ladder geometry ----------

test('computeLadderStartY leaves the first row clear of the header rule', () => {
  for (const rowCount of [1, 2, 3]) {
    // The row draws its label 92px above its anchor; the rule sits at y=600.
    assert.ok(computeLadderStartY(rowCount) - 92 > 600, `row count ${rowCount} collides with the header`);
  }
});

test('computeLadderStartY keeps the last row clear of the total medallion', () => {
  for (const rowCount of [1, 2, 3]) {
    const lastRowBottom = computeLadderStartY(rowCount) + (rowCount - 1) * 300 + 154;
    assert.ok(lastRowBottom <= 1540, `row count ${rowCount} overlaps the medallion`);
  }
});

test('computeTileMetrics shrinks the tiles so a long name still fits the row', () => {
  const short = computeTileMetrics(chartFor('ANN').rows);
  const long = computeTileMetrics(chartFor('FEATHERSTONEHAUGH').rows);
  assert.equal(short.width, 116);
  assert.ok(long.width < short.width);
  assert.ok(long.width >= 48);
  // Tiles must not overlap: each one has to sit inside its own column.
  assert.ok(long.width <= long.step);
});

test('computeTileMetrics scales the tile type down with the tile', () => {
  const long = computeTileMetrics(chartFor('FEATHERSTONEHAUGH').rows);
  assert.ok(long.letterFontSize >= 26);
  assert.ok(long.valueFontSize >= 18);
  assert.ok(long.valueFontSize < long.letterFontSize);
});

// ---------- buildChartSvg ----------

test('buildChartSvg emits a print-sized SVG document', () => {
  const svg = buildChartSvg({ chart: chartFor('Sarah'), matches: [], calculatedOn: '19 August 2026' });
  assert.ok(svg.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.ok(svg.includes(`width="${CHART_WIDTH}" height="${CHART_HEIGHT}"`));
  assert.ok(svg.includes(`viewBox="0 0 ${CHART_WIDTH} ${CHART_HEIGHT}"`));
  assert.ok(svg.trim().endsWith('</svg>'));
});

test('buildChartSvg renders the ladder, subtotals, and per-letter values', () => {
  const svg = buildChartSvg({ chart: chartFor('Sarah'), matches: [], calculatedOn: '19 August 2026' });
  assert.ok(svg.includes('>SARAH<'));
  assert.ok(svg.includes('>282<'));
  assert.ok(svg.includes('>114<'), 'S should be printed as 114');
  assert.ok(svg.includes('>48<'), 'H should be printed as 48');
});

test('buildChartSvg carries the cipher legend, the date, and the brand mark', () => {
  const svg = buildChartSvg({ chart: chartFor('Sarah'), matches: [], calculatedOn: '19 August 2026' });
  assert.ok(svg.includes('A=6'));
  assert.ok(svg.includes('Z=156'));
  assert.ok(svg.includes('Calculated 19 August 2026'));
  assert.ok(svg.includes('gematria.today'));
});

test('buildChartSvg renders a chip per matching word', () => {
  const svg = buildChartSvg({ chart: chartFor('Sarah'), matches: ['discernment', 'watchtower'], calculatedOn: 'x' });
  assert.ok(svg.includes('>DISCERNMENT<'));
  assert.ok(svg.includes('>WATCHTOWER<'));
});

test('buildChartSvg says so plainly when no word shares the value', () => {
  const svg = buildChartSvg({ chart: chartFor('Sarah'), matches: [], calculatedOn: 'x' });
  assert.ok(svg.includes('No catalogued words share this value yet.'));
});

test('buildChartSvg only stamps PREVIEW when the watermark is requested', () => {
  const clean = buildChartSvg({ chart: chartFor('Sarah'), matches: [], calculatedOn: 'x' });
  const marked = buildChartSvg({ chart: chartFor('Sarah'), matches: [], calculatedOn: 'x', watermark: true });
  assert.ok(!clean.includes('PREVIEW'));
  assert.ok(marked.includes('PREVIEW'));
});

test('buildChartSvg escapes markup arriving through names, matches, and the date', () => {
  // Every one of these is attacker-controlled via the query string and lands
  // inside an SVG <text> element.
  const chart = computeChart(['<script>x</script>', 'A&B']);
  const svg = buildChartSvg({
    chart,
    matches: ['</text><rect width="9"/>'],
    calculatedOn: '<script>y</script>',
  });
  assert.ok(!svg.includes('<script>'));
  assert.ok(!svg.includes('</text><rect'));
  assert.ok(svg.includes('&lt;SCRIPT&gt;'));
  assert.ok(svg.includes('&amp;'));
});

// ---------- resolveFontFiles ----------

test('resolveFontFiles returns nothing for a directory that does not exist', () => {
  assert.deepEqual(resolveFontFiles('no/such/font/directory'), []);
});

test('resolveFontFiles ignores woff2, which resvg cannot read', () => {
  const directory = mkdtempSync(join(tmpdir(), 'chart-fonts-'));
  try {
    writeFileSync(join(directory, 'face.woff2'), '');
    writeFileSync(join(directory, 'face.ttf'), '');
    assert.deepEqual(resolveFontFiles(directory, '/'), [join(directory, 'face.ttf')]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('resolveFontFiles finds the bundled Fraunces and Inter cuts', () => {
  const names = resolveFontFiles('assets/fonts').map((file) => file.split('/').pop());
  assert.ok(names.some((name) => /^fraunces-.*\.ttf$/.test(name)), names.join(', '));
  assert.ok(names.some((name) => /^inter-.*\.ttf$/.test(name)), names.join(', '));
});

// ---------- handler ----------

function request(query) {
  return new Request(`https://gematria.today/api/name-chart-image?${query}`);
}

test('the handler rejects a request with no name', async () => {
  const response = await handler(request('foo=bar'));
  assert.equal(response.status, 400);
});

test('the handler returns a PNG for the print chart', async () => {
  const response = await handler(request('name1=Sarah&name2=Jane&name3=Morgan&calculatedOn=2026-08-19'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/png');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  const bytes = new Uint8Array(await response.arrayBuffer());
  // PNG magic number.
  assert.deepEqual(Array.from(bytes.slice(0, 4)), [0x89, 0x50, 0x4e, 0x47]);
});

async function withEnv(values, run) {
  const prior = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  Object.assign(process.env, values);
  try {
    return await run();
  } finally {
    for (const [key, value] of Object.entries(prior)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

const SIGNING_SECRET = 'test-name-chart-secret';

test('the preview render is smaller than the signed print render', async () => {
  const sig = signChartRequest({ names: ['Sarah'], calculatedOn: '2026-08-19' }, SIGNING_SECRET);
  const [print, preview] = await withEnv({ NAME_CHART_SIGNING_SECRET: SIGNING_SECRET }, () => Promise.all([
    handler(request(`name1=Sarah&calculatedOn=2026-08-19&sig=${sig}`)),
    handler(request('name1=Sarah&calculatedOn=2026-08-19&preview=1')),
  ]));
  const printBytes = (await print.arrayBuffer()).byteLength;
  const previewBytes = (await preview.arrayBuffer()).byteLength;
  assert.ok(previewBytes < printBytes, 'the free preview must not match the paid resolution');
});

test('dropping preview=1 does not unlock the unmarked print', async () => {
  // There is no purchase flow yet; editing the preview URL used to download
  // the full-resolution, unwatermarked chart for free.
  const [unsigned, preview] = await withEnv({ NAME_CHART_SIGNING_SECRET: SIGNING_SECRET }, () => Promise.all([
    handler(request('name1=Sarah&calculatedOn=2026-08-19')),
    handler(request('name1=Sarah&calculatedOn=2026-08-19&preview=1')),
  ]));
  assert.equal(unsigned.status, 200);
  assert.deepEqual(new Uint8Array(await unsigned.arrayBuffer()), new Uint8Array(await preview.arrayBuffer()));
});

test('isFullChartAuthorized needs a configured secret and a signature over these names and date', () => {
  const sig = signChartRequest({ names: ['Sarah'], calculatedOn: '2026-08-19' }, SIGNING_SECRET);
  const signed = params({ name1: 'Sarah', calculatedOn: '2026-08-19', sig });
  assert.equal(isFullChartAuthorized(signed, ['Sarah'], SIGNING_SECRET), true);
  assert.equal(isFullChartAuthorized(signed, ['Sarah'], ''), false);
  assert.equal(isFullChartAuthorized(signed, ['Sarah'], 'another-secret'), false);
  assert.equal(isFullChartAuthorized(signed, ['Sara'], SIGNING_SECRET), false);
  assert.equal(isFullChartAuthorized(params({ name1: 'Sarah', calculatedOn: '2026-08-20', sig }), ['Sarah'], SIGNING_SECRET), false);
  assert.equal(isFullChartAuthorized(params({ name1: 'Sarah', sig: 'abc' }), ['Sarah'], SIGNING_SECRET), false);
});

test('the name calculator does not promise a print nobody can get', () => {
  // The page advertised "an unmarked 8x10 at 300 DPI" with no button, link or
  // checkout anywhere -- a dead end for anyone who wanted it.
  const page = readFileSync('src/name-calculator.html', 'utf8');
  const script = readFileSync('page-scripts/name-calculator-1.js', 'utf8');
  assert.doesNotMatch(page, /the full chart is an unmarked/i);
  assert.doesNotMatch(script, /the printable chart is unmarked and print resolution/i);
  assert.match(page, /not available to order yet/);
});

// ---------- abuse protection ----------

test('the protection kill switch turns the renderer off before any work', async () => {
  const response = await withEnv({ DISABLE_EXPENSIVE_PUBLIC_ENDPOINTS: 'true' }, () => handler(request('name1=Sarah&preview=1')));
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

// Stand-in for Neon's HTTP endpoint: every statement succeeds empty except the
// rate-limit upsert, which reports this client as blocked.
async function withBlockedRateLimit(run) {
  const priorFetch = globalThis.fetch;
  const scopes = [];
  const answer = (query) => {
    if (!/INSERT INTO request_rate_limits/.test(query.query)) return { fields: [], rows: [] };
    scopes.push(query.params[0]);
    const fields = ['count', 'window_started_at', 'blocked_until'].map((name) => ({ name, dataTypeID: 25 }));
    return { fields, rows: [['999', new Date().toISOString(), new Date(Date.now() + 60_000).toISOString()]] };
  };
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    const payload = Array.isArray(body.queries) ? { results: body.queries.map(answer) } : answer(body);
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const response = await withEnv({ DATABASE_URL: 'postgres://user:pass@db.example.test/neondb' }, run);
    return { response, scopes };
  } finally {
    globalThis.fetch = priorFetch;
  }
}

test('a client over the per-IP limit gets a 429 instead of a render', async () => {
  const { response, scopes } = await withBlockedRateLimit(() => handler(request('name1=Sarah&preview=1')));
  assert.equal(response.status, 429);
  assert.ok(Number(response.headers.get('retry-after')) > 0);
  assert.deepEqual(scopes, ['name-chart-image-ip']);
});
