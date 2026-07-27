window.addEventListener('DOMContentLoaded', () => {
  const markdownSource = document.getElementById('markdownSource');
  const guideContent = document.getElementById('guideContent');
  const markdown = markdownSource ? markdownSource.textContent : '';

  if (!window.marked) {
    guideContent.textContent = markdown;
    return;
  }

  // `headerIds` and `mangle` were dropped in marked v7 and are no longer
  // accepted options, so only the two that still exist are set here.
  marked.setOptions({
    gfm: true,
    breaks: false,
  });
  guideContent.innerHTML = marked.parse(markdown);
});
