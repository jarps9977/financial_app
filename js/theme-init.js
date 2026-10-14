// Runs before first paint to avoid a light/dark flash
(function () {
  try {
    var s = JSON.parse(localStorage.getItem('ngern.settings') || '{}');
    if (s.theme === 'light' || s.theme === 'dark') document.documentElement.dataset.theme = s.theme;
  } catch (e) { /* storage unavailable */ }
})();
