import test from 'node:test';
import assert from 'node:assert/strict';

import handler, {
  CHART_HEIGHT,
  CHART_WIDTH,
  MAX_MATCHES,
  MAX_NAMES,
  buildChartSvg,
  computeChart,
  computeLadderStartY,
  computeTileMetrics,
  escapeXml,
  fitDisplayFontSize,
  getPerLetterValues,
  layoutTitle,
  parseCalculatedOn,
  parseMatches,
  parseNames,
  resolveFontFiles,
  splitTitleLines,
  truncate,
} from '../netlify/functions/name-chart-image.mjs';

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
  // assets/fonts currently ships woff2 only; picking those up would hand resvg
  // files it silently fails to parse.
  assert.deepEqual(resolveFontFiles('assets/fonts'), []);
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

test('the preview render is smaller than the print render', async () => {
  const [print, preview] = await Promise.all([
    handler(request('name1=Sarah&calculatedOn=2026-08-19')),
    handler(request('name1=Sarah&calculatedOn=2026-08-19&preview=1')),
  ]);
  const printBytes = (await print.arrayBuffer()).byteLength;
  const previewBytes = (await preview.arrayBuffer()).byteLength;
  assert.ok(previewBytes < printBytes, 'the free preview must not match the paid resolution');
});
