// The featured words, grouped and valued, for bible-names-gematria.html. The
// list lives with the functions so the /w/ pages, the words sitemap and this
// page are built from the same entries.
import { FEATURED_GROUPS, FEATURED_WORDS, featuredWordPath } from '../../netlify/functions/_featured-words.mjs';
import { englishGematria } from '../../netlify/edge-functions/lib/og-meta.mjs';

const entries = FEATURED_WORDS.map((entry) => ({
  ...entry,
  value: Number(englishGematria(entry.word)),
  href: featuredWordPath(entry.word),
}));

// Values two or more names on the list share, largest group first.
const byValue = new Map();
for (const entry of entries) {
  byValue.set(entry.value, [...(byValue.get(entry.value) || []), entry]);
}
const sharedValues = [...byValue.entries()]
  .filter(([, names]) => names.length > 1)
  .map(([value, names]) => ({ value, names }))
  .sort((a, b) => b.names.length - a.names.length || a.value - b.value);

export default {
  groups: FEATURED_GROUPS.map((group) => ({
    ...group,
    entries: entries.filter((entry) => entry.group === group.id),
  })),
  sharedValues,
  count: entries.length,
};
