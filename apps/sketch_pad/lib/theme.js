let mode = null;
const KEY = 'sketchpad-theme';
export function currentTheme() {
  if (!mode) {
    let saved = null;
    try { saved = localStorage.getItem(KEY); } catch (e) { saved = null; }
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    mode = saved === 'dark' || saved === 'light' ? saved : (prefersDark ? 'dark' : 'light');
  }
  return mode;
}
export function applyTheme() {
  const m = currentTheme();
  document.documentElement.dataset.theme = m;
  document.documentElement.style.colorScheme = m;
}
export function setTheme(m) {
  mode = m;
  try { localStorage.setItem(KEY, m); } catch (e) { mode = m; }
  applyTheme();
  window.dispatchEvent(new CustomEvent('sketchpad-theme'));
}
export function toggleTheme() {
  setTheme(currentTheme() === 'dark' ? 'light' : 'dark');
}
