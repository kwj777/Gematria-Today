// Behaviour for the definition page that netlify/functions/wordnikDefinition.mjs
// renders. That page is served with the site CSP, which allows no inline
// script, so what used to be two inline blocks lives here. The server puts
// both paths on <body> after sanitizing them.
(() => {
  const { canonicalPath, returnPath } = document.body.dataset;

  if (canonicalPath && window.location.pathname.startsWith('/.netlify/functions/wordnikDefinition')) {
    window.history.replaceState({}, '', canonicalPath);
  }

  const closeButton = document.getElementById('close-definition-button');
  if (!closeButton) return;

  closeButton.addEventListener('click', () => {
    window.close();
    setTimeout(() => {
      if (!window.closed) {
        window.location.assign(returnPath || '/');
      }
    }, 100);
  });
})();
