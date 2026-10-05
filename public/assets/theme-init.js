try {
  var t = localStorage.getItem('svara.theme');
  if (t === 'dark' || t === 'light') document.documentElement.setAttribute('data-theme', t);
} catch (e) { /* storage unavailable */ }
