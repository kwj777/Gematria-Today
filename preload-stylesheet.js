(function () {
  function promote(link) {
    if (link.rel !== 'stylesheet') link.rel = 'stylesheet';
  }
  var links = document.querySelectorAll('link[data-promote-stylesheet]');
  for (var i = 0; i < links.length; i++) {
    (function (link) {
      link.addEventListener('load', function self() {
        link.removeEventListener('load', self);
        promote(link);
      });
    })(links[i]);
  }
  function promoteAll() {
    var remaining = document.querySelectorAll('link[data-promote-stylesheet]');
    for (var i = 0; i < remaining.length; i++) promote(remaining[i]);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', promoteAll, { once: true });
  } else {
    promoteAll();
  }
})();
