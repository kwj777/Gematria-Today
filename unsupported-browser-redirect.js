      (function () {
        var hasPromise = typeof window.Promise === 'function';
        var hasFetch = typeof window.fetch === 'function';
        var userAgent = ((window.navigator && window.navigator.userAgent) || '').toLowerCase();
        var isBot = /bot|crawl|spider|slurp|bingpreview|google web preview|facebookexternalhit|whatsapp|telegrambot|linkedinbot|twitterbot/.test(userAgent);
        if ((hasPromise && hasFetch) || isBot) {
          return;
        }

        var pathname = (window.location && window.location.pathname) || '';
        if (pathname === '/unsupported-browser.html') {
          return;
        }

        var redirectUrl = '/unsupported-browser.html?from=' + encodeURIComponent(pathname || '/');
        window.location.replace(redirectUrl);
      })();
