(function () {
  // Single source of truth for learning-path level numbering, shared by the
  // calculator and name-calculator pages. If a new level is added, update
  // this map — both calculators read through it.
  const LEVEL_BY_PATHNAME = Object.freeze({
    '/gematria-basics.html': 1,
    '/gematria-pattern-grouping.html': 2,
    '/gematria-name-analysis.html': 3,
  });

  function getLevel(pathname) {
    const normalizedPath = String(pathname || '').toLowerCase();
    return Object.prototype.hasOwnProperty.call(LEVEL_BY_PATHNAME, normalizedPath)
      ? LEVEL_BY_PATHNAME[normalizedPath]
      : null;
  }

  window.gematriaLearningPath = Object.freeze({ getLevel });
})();
