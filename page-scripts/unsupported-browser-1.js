// Best-effort browser identification so the user knows which app to update.
// Prefers User-Agent Client Hints (Chrome / Edge), falls back to UA-string
// sniffing for Firefox / Safari / older browsers. Silently no-ops if no
// recognizable signal is available. Plain ES5 because by definition the
// visitor's browser may not support modern features.
(function () {
  var target = document.getElementById('unsupportedBrowserDetected');
  if (!target) return;

  function show(name, version) {
    target.textContent = 'You appear to be on ' + name + (version ? ' ' + version : '') + '.';
    target.hidden = false;
  }

  try {
    var data = navigator.userAgentData;
    if (data && data.brands && data.brands.length) {
      var brand = null;
      for (var i = 0; i < data.brands.length; i += 1) {
        var b = data.brands[i];
        if (/chrome|edge|firefox|safari|opera/i.test(b.brand)) { brand = b; break; }
      }
      if (!brand) {
        for (var j = 0; j < data.brands.length; j += 1) {
          var c = data.brands[j];
          if (!/not.?a.?brand|brand/i.test(c.brand)) { brand = c; break; }
        }
      }
      if (brand) { show(brand.brand, brand.version); return; }
    }
    var ua = navigator.userAgent || '';
    var m;
    if ((m = ua.match(/Edg\/([\d.]+)/)))     { show('Edge', m[1]); return; }
    if ((m = ua.match(/OPR\/([\d.]+)/)))     { show('Opera', m[1]); return; }
    if ((m = ua.match(/Firefox\/([\d.]+)/))) { show('Firefox', m[1]); return; }
    if ((m = ua.match(/Chrome\/([\d.]+)/)))  { show('Chrome', m[1]); return; }
    if (/Safari\//.test(ua)) {
      m = ua.match(/Version\/([\d.]+)/);
      show('Safari', m ? m[1] : '');
      return;
    }
    if (/MSIE |Trident\//.test(ua)) { show('Internet Explorer', ''); return; }
  } catch (e) { /* swallow -- diagnostic only */ }
})();
