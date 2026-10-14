// Runs before first paint so the saved theme never flashes
(function () {
  try {
    var theme = JSON.parse(localStorage.getItem('ngern.settings') || '{}').theme;
    if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
  } catch (e) { /* fall back to system theme */ }
})();
