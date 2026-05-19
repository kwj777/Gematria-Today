      (function () {
        function isBlogDetailView() {
          if (/^\/blog\/[^/?#]+/i.test(window.location.pathname)) return true;
          try {
            var params = new URLSearchParams(window.location.search);
            if (params.get('post')) return true;
            if (params.get('postId')) return true;
          } catch (e) {}
          return false;
        }
        if (isBlogDetailView()) {
          document.documentElement.classList.add('blog-detail-view');
        }
      })();
