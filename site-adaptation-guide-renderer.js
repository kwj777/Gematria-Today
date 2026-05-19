window.addEventListener('DOMContentLoaded', () => {
  const markdownSource = document.getElementById('markdownSource');
  const guideContent = document.getElementById('guideContent');
  const markdown = markdownSource ? markdownSource.textContent : '';

  if (!window.marked) {
    guideContent.textContent = markdown;
    return;
  }

  marked.setOptions({
    gfm: true,
    breaks: false,
    headerIds: true,
    mangle: false,
  });
  guideContent.innerHTML = marked.parse(markdown);
});
