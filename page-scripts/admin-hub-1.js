      (function () {
        var hasPromise = typeof window.Promise === 'function';
        var hasFetch = typeof window.fetch === 'function';
        if (hasPromise && hasFetch) {
          return;
        }
        var pathname = (window.location && window.location.pathname) || '';
        if (pathname === '/unsupported-browser.html') {
          return;
        }
        var redirectUrl = '/unsupported-browser.html?from=' + encodeURIComponent(pathname || '/');
        window.location.replace(redirectUrl);
      })();
