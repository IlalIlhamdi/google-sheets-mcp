export function escapeHtml(text) {
  return String(text ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const ICON_SHEET = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="2.5" y="2.5" width="15" height="15" rx="2.5"/><path d="M2.5 7.5h15M8 7.5v10M2.5 12.5h15"/></svg>';
const ICON_COPY = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="5" y="5" width="8.5" height="8.5" rx="1.5"/><path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5"/></svg>';
const ICON_CHECK = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3.2 8.4 6.4 11.6 12.8 4.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_THEME = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="8" cy="8" r="5.5"/><path d="M8 2.5a5.5 5.5 0 0 0 0 11z" fill="currentColor" stroke="none"/></svg>';
const ICON_EXTERNAL = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M6 3.5h6.5V10M12.5 3.5 4.5 11.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const BASE_CSS = `
  :root {
    --bg: #FAF9F5;
    --surface: #FFFFFF;
    --surface-alt: #F1EFE8;
    --code-bg: #F1EFE8;
    --code-text: #17211C;
    --ink: #141916;
    --muted: #45524B;
    --muted-alt: #3F4B44;
    --accent: #136F3A;
    --accent-hover: #0E562C;
    --accent-ink: #FFFFFF;
    --accent-link: #116334;
    --pill-bg: #E6F4EC;
    --pill-text: #0E522B;
    --warn-bg: #FFFBEB;
    --warn-text: #6E3507;
    --warn-border: #B45309;
    --err-bg: #FEF2F2;
    --err-text: #881B1B;
    --err-border: #B91C1C;
    --rule: #D2D8D3;
    --control-border: #6F7E75;
    --focus: #0B4F28;
    --card-shadow: 0 2px 10px rgba(20, 25, 22, 0.06);
  }

  :root[data-theme="dark"] {
    --bg: #0D1310;
    --surface: #151E19;
    --surface-alt: #1D2822;
    --code-bg: #0B100D;
    --code-text: #E4ECE7;
    --ink: #F0F4F1;
    --muted: #B5C2BA;
    --muted-alt: #C2CEC7;
    --accent: #4ADE80;
    --accent-hover: #38C86E;
    --accent-ink: #062111;
    --accent-link: #6EE7A0;
    --pill-bg: #132A1C;
    --pill-text: #86EFAC;
    --warn-bg: #2A1F08;
    --warn-text: #FDE68A;
    --warn-border: #D97706;
    --err-bg: #2D1214;
    --err-text: #FECACA;
    --err-border: #F87171;
    --rule: #2C3A31;
    --control-border: #64766B;
    --focus: #86EFAC;
    --card-shadow: 0 2px 12px rgba(0, 0, 0, 0.28);
  }

  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --bg: #0D1310;
      --surface: #151E19;
      --surface-alt: #1D2822;
      --code-bg: #0B100D;
      --code-text: #E4ECE7;
      --ink: #F0F4F1;
      --muted: #B5C2BA;
      --muted-alt: #C2CEC7;
      --accent: #4ADE80;
      --accent-hover: #38C86E;
      --accent-ink: #062111;
      --accent-link: #6EE7A0;
      --pill-bg: #132A1C;
      --pill-text: #86EFAC;
      --warn-bg: #2A1F08;
      --warn-text: #FDE68A;
      --warn-border: #D97706;
      --err-bg: #2D1214;
      --err-text: #FECACA;
      --err-border: #F87171;
      --rule: #2C3A31;
      --control-border: #64766B;
      --focus: #86EFAC;
      --card-shadow: 0 2px 12px rgba(0, 0, 0, 0.28);
    }
  }

  *, *::before, *::after { box-sizing: border-box; }
  html { scroll-behavior: smooth; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--ink);
    font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: clamp(0.95rem, 0.9rem + 0.2vw, 1.03rem);
    line-height: 1.6;
  }

  a[href], button, summary, [role="tab"] { cursor: pointer; }
  :disabled, [aria-disabled="true"] { cursor: not-allowed; opacity: 0.7; }
  [hidden] { display: none !important; }

  :focus-visible {
    outline: 3px solid var(--focus);
    outline-offset: 2px;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
  }

  .skip-link {
    position: absolute;
    top: -64px;
    left: 16px;
    z-index: 100;
    background: var(--accent);
    color: var(--accent-ink);
    padding: 10px 16px;
    border-radius: 8px;
    font-weight: 700;
    text-decoration: none;
  }
  .skip-link:focus { top: 12px; }

  .container {
    width: 100%;
    max-width: 1120px;
    margin: 0 auto;
    padding: 0 18px;
  }
  .container-narrow { max-width: 780px; }

  .topbar {
    border-bottom: 1px solid var(--rule);
    background: var(--surface);
  }
  .topbar-inner {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px 16px;
    padding: 14px 0;
  }
  .brand-group {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px 12px;
  }
  .brand-link {
    display: inline-flex;
    align-items: center;
    gap: 9px;
    color: var(--ink);
    text-decoration: none;
    font-weight: 700;
    font-size: 1.02rem;
    min-height: 44px;
  }
  .brand-mark {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: var(--pill-bg);
    color: var(--pill-text);
    border: 1px solid var(--control-border);
    flex-shrink: 0;
  }
  .status-pill {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 4px 11px;
    border-radius: 6px;
    background: var(--pill-bg);
    color: var(--pill-text);
    border: 1px solid var(--control-border);
    font-size: 0.84rem;
    font-weight: 600;
  }
  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: currentColor;
    flex-shrink: 0;
  }
  .topnav {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 14px;
  }
  .topnav a {
    color: var(--accent-link);
    text-decoration: none;
    font-weight: 600;
    font-size: 0.92rem;
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    padding: 0 4px;
  }
  .topnav a:hover { text-decoration: underline; }

  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 44px;
    max-width: 100%;
    padding: 9px 15px;
    border-radius: 8px;
    border: 1px solid var(--control-border);
    font-family: inherit;
    font-size: 0.92rem;
    font-weight: 600;
    text-decoration: none;
    text-align: center;
    line-height: 1.25;
  }
  .icon-copy, .icon-check { display: inline-flex; align-items: center; flex-shrink: 0; }
  .btn-primary {
    background: var(--accent);
    color: var(--accent-ink);
    border-color: var(--accent);
  }
  .btn-primary:hover:not(:disabled) {
    background: var(--accent-hover);
    border-color: var(--accent-hover);
  }
  .btn-secondary {
    background: var(--surface);
    color: var(--ink);
    border-color: var(--control-border);
  }
  .btn-secondary:hover:not(:disabled) {
    background: var(--surface-alt);
  }
  .btn:active:not(:disabled) { transform: translateY(1px); }
  .btn.is-copied {
    background: var(--pill-bg);
    color: var(--pill-text);
    border-color: var(--accent-link);
  }

  main { padding: 28px 0 44px; }
  section { margin-top: 40px; }
  section:first-child { margin-top: 0; }

  h1 {
    margin: 0 0 12px;
    font-size: clamp(1.7rem, 1.35rem + 1.5vw, 2.35rem);
    line-height: 1.18;
    letter-spacing: -0.015em;
  }
  h2 {
    margin: 0 0 10px;
    font-size: clamp(1.22rem, 1.1rem + 0.45vw, 1.5rem);
    line-height: 1.25;
  }
  h3 {
    margin: 0 0 8px;
    font-size: 1.05rem;
    line-height: 1.3;
  }
  p { margin: 0 0 12px; }
  .muted { color: var(--muted); }

  code, pre, .mono-input {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.88em;
  }
  code {
    background: var(--code-bg);
    color: var(--code-text);
    padding: 2px 6px;
    border-radius: 5px;
    border: 1px solid var(--rule);
    word-break: break-word;
  }

  .hero-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 24px;
    align-items: start;
  }
  .hero-copy, .workbench, [role="tabpanel"], .code-block { min-width: 0; }

  .endpoint-box {
    margin: 18px 0;
    padding: 14px;
    background: var(--surface);
    border: 1px solid var(--control-border);
    border-radius: 10px;
  }
  .endpoint-box label {
    display: block;
    font-size: 0.86rem;
    font-weight: 700;
    margin-bottom: 8px;
    color: var(--muted);
  }
  .endpoint-row {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .mono-input {
    width: 100%;
    min-height: 44px;
    padding: 10px 12px;
    border-radius: 8px;
    border: 1px solid var(--control-border);
    background: var(--code-bg);
    color: var(--code-text);
  }

  .meta-strip {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
    margin: 16px 0 0;
    padding: 14px;
    background: var(--surface-alt);
    border: 1px solid var(--rule);
    border-radius: 10px;
  }
  .meta-strip div { display: flex; flex-direction: column; gap: 2px; }
  .meta-strip dt { font-size: 0.82rem; font-weight: 700; color: var(--muted-alt); }
  .meta-strip dd { margin: 0; font-size: 0.92rem; font-weight: 600; word-break: break-word; }

  .workbench {
    background: var(--surface);
    border: 1px solid var(--control-border);
    border-radius: 12px;
    padding: 20px;
    box-shadow: var(--card-shadow);
  }
  .workbench-head { margin-bottom: 14px; }
  .workbench-head p { margin: 0; font-size: 0.93rem; color: var(--muted); }

  .client-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding-bottom: 14px;
    margin-bottom: 16px;
    border-bottom: 1px solid var(--rule);
  }
  .tab-btn {
    min-height: 44px;
    padding: 8px 14px;
    border-radius: 8px;
    border: 1px solid var(--control-border);
    background: var(--surface-alt);
    color: var(--ink);
    font-family: inherit;
    font-size: 0.9rem;
    font-weight: 600;
  }
  .tab-btn:hover { background: var(--pill-bg); color: var(--pill-text); }
  .tab-btn[aria-selected="true"] {
    background: var(--accent);
    color: var(--accent-ink);
    border-color: var(--accent);
  }

  .sub-switch {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 8px 0 12px;
  }
  .os-btn {
    min-height: 44px;
    padding: 7px 13px;
    border-radius: 8px;
    border: 1px solid var(--control-border);
    background: var(--surface-alt);
    color: var(--ink);
    font-family: inherit;
    font-size: 0.88rem;
    font-weight: 600;
  }
  .os-btn[aria-pressed="true"] {
    background: var(--pill-bg);
    color: var(--pill-text);
    border-color: var(--accent-link);
  }

  .steps-list {
    margin: 10px 0 14px;
    padding-left: 20px;
  }
  .steps-list li { margin-bottom: 7px; }

  .code-block {
    margin: 12px 0;
    border: 1px solid var(--control-border);
    border-radius: 8px;
    background: var(--code-bg);
    overflow: hidden;
  }
  .code-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--rule);
    background: var(--surface-alt);
    font-size: 0.84rem;
    font-weight: 700;
    color: var(--muted-alt);
  }
  .code-block pre {
    margin: 0;
    padding: 12px;
    overflow-x: auto;
    color: var(--code-text);
    line-height: 1.5;
  }
  .action-row {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin: 12px 0;
  }

  .rail-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 14px;
    margin-top: 14px;
  }
  .rail-step {
    background: var(--surface);
    border: 1px solid var(--rule);
    border-left: 4px solid var(--accent-link);
    border-radius: 8px;
    padding: 16px;
  }
  .step-num {
    display: inline-block;
    font-variant-numeric: tabular-nums;
    font-size: 0.82rem;
    font-weight: 700;
    color: var(--pill-text);
    background: var(--pill-bg);
    padding: 2px 8px;
    border-radius: 5px;
    margin-bottom: 8px;
  }

  .callout-warn {
    margin-top: 16px;
    padding: 14px 16px;
    border-radius: 8px;
    background: var(--warn-bg);
    color: var(--warn-text);
    border: 1px solid var(--warn-border);
  }
  .callout-warn p { margin: 0; }

  .health-box {
    margin-top: 16px;
    padding: 14px 16px;
    border-radius: 8px;
    border: 1px solid var(--control-border);
    background: var(--surface);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .status-box {
    padding: 10px 12px;
    border-radius: 6px;
    border: 1px solid var(--rule);
    background: var(--surface-alt);
    color: var(--muted-alt);
    font-size: 0.91rem;
  }
  .status-box[data-state="ok"] {
    background: var(--pill-bg);
    color: var(--pill-text);
    border-color: var(--accent-link);
  }
  .status-box[data-state="error"] {
    background: var(--err-bg);
    color: var(--err-text);
    border-color: var(--err-border);
  }

  .ledger-wrap {
    margin-top: 14px;
    border: 1px solid var(--control-border);
    border-radius: 10px;
    background: var(--surface);
    overflow: hidden;
  }
  .ledger-table {
    width: 100%;
    border-collapse: collapse;
    text-align: left;
  }
  .ledger-table th,
  .ledger-table td {
    padding: 12px 14px;
    border-bottom: 1px solid var(--rule);
    vertical-align: top;
  }
  .ledger-table thead th {
    background: var(--surface-alt);
    color: var(--muted-alt);
    font-size: 0.85rem;
    font-weight: 700;
  }
  .ledger-table tbody tr:last-child td { border-bottom: 0; }
  .row-idx {
    font-variant-numeric: tabular-nums;
    color: var(--muted);
    font-weight: 700;
    width: 44px;
  }
  .state-tag {
    display: inline-block;
    padding: 2px 9px;
    border-radius: 5px;
    font-size: 0.82rem;
    font-weight: 700;
    background: var(--pill-bg);
    color: var(--pill-text);
    border: 1px solid var(--rule);
    white-space: nowrap;
  }
  .state-tag-off {
    background: var(--surface-alt);
    color: var(--muted-alt);
  }

  .faq-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 12px;
  }
  .faq-list details {
    background: var(--surface);
    border: 1px solid var(--control-border);
    border-radius: 8px;
    padding: 4px 14px;
  }
  .faq-list summary {
    min-height: 44px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    font-weight: 600;
    padding: 8px 0;
  }
  .faq-list details p {
    margin: 4px 0 12px;
    color: var(--muted);
  }

  .legal-card {
    background: var(--surface);
    border: 1px solid var(--control-border);
    border-radius: 12px;
    padding: 24px;
  }
  .legal-card a { color: var(--accent-link); font-weight: 600; }

  .site-footer {
    border-top: 1px solid var(--rule);
    background: var(--surface);
    padding: 18px 0;
  }
  .footer-inner {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 10px 18px;
    font-size: 0.9rem;
    color: var(--muted);
  }
  .footer-links {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 16px;
  }
  .footer-links a {
    color: var(--accent-link);
    text-decoration: none;
    font-weight: 600;
    min-height: 44px;
    display: inline-flex;
    align-items: center;
  }
  .footer-links a:hover { text-decoration: underline; }

  @media (max-width: 639px) {
    .ledger-table thead { display: none; }
    .ledger-table, .ledger-table tbody, .ledger-table tr, .ledger-table td { display: block; width: 100%; }
    .ledger-table tr { padding: 10px 12px; border-bottom: 1px solid var(--rule); }
    .ledger-table tr:last-child { border-bottom: 0; }
    .ledger-table td { padding: 4px 0; border: 0; }
    .ledger-table td::before {
      content: attr(data-label) ": ";
      font-weight: 700;
      color: var(--muted-alt);
    }
    .ledger-table td.row-idx { width: auto; }
  }

  @media (min-width: 640px) {
    .endpoint-row { flex-direction: row; align-items: stretch; }
    .meta-strip { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .rail-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .health-box { flex-direction: row; align-items: center; justify-content: space-between; }
    .status-box { flex: 1; }
  }

  @media (min-width: 960px) {
    .hero-grid {
      grid-template-columns: minmax(320px, 0.9fr) minmax(0, 1.35fr);
      gap: 28px;
    }
    .rail-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  }

  @media (prefers-reduced-motion: no-preference) {
    .btn, .tab-btn, .os-btn { transition: background-color 140ms ease, border-color 140ms ease, color 140ms ease; }
  }
`;

function renderDocument({ title, lang, bodyHtml, footerLinksHtml, headerRightHtml = '', statusLabel = '', containerClass = 'container', scriptHtml = '' }) {
  return `<!doctype html>
<html lang="${escapeHtml(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${BASE_CSS}</style>
</head>
<body>
<a href="#main-content" class="skip-link">${lang === 'id' ? 'Lewati ke konten utama' : 'Skip to main content'}</a>
<header class="topbar">
  <div class="container topbar-inner">
    <div class="brand-group">
      <a href="/" class="brand-link">
        <span class="brand-mark">${ICON_SHEET}</span>
        <span>Google Sheets MCP</span>
      </a>
      ${statusLabel ? `<span class="status-pill"><span class="status-dot" aria-hidden="true"></span>${escapeHtml(statusLabel)}</span>` : ''}
    </div>
    ${headerRightHtml}
  </div>
</header>
<main id="main-content" tabindex="-1">
  <div class="${escapeHtml(containerClass)}">
    ${bodyHtml}
  </div>
</main>
<footer class="site-footer">
  <div class="container footer-inner">
    <span>Google Sheets MCP Server (OAuth 2.1 + PKCE)</span>
    <nav class="footer-links" aria-label="Footer">
      ${footerLinksHtml}
    </nav>
  </div>
</footer>
${scriptHtml}
</body>
</html>`;
}

function buildPortalScript(nonce) {
  return `<script nonce="${escapeHtml(nonce)}">
(() => {
  const root = document.documentElement;
  const announcer = document.getElementById('sr-announcer');
  const announce = (msg) => {
    if (!announcer) return;
    announcer.textContent = '';
    requestAnimationFrame(() => { announcer.textContent = msg; });
  };

  // Theme initialization & toggle
  const themeBtn = document.getElementById('theme-toggle');
  const themeLabel = document.getElementById('theme-toggle-label');
  const readSavedTheme = () => {
    try { return localStorage.getItem('gs-mcp-theme'); } catch { return null; }
  };
  const writeSavedTheme = (val) => {
    try { localStorage.setItem('gs-mcp-theme', val); } catch {}
  };
  const applyTheme = (mode) => {
    root.dataset.theme = mode;
    if (themeBtn && themeLabel) {
      const isDark = mode === 'dark';
      themeBtn.setAttribute('aria-pressed', String(isDark));
      themeLabel.textContent = isDark ? 'Mode Terang' : 'Mode Gelap';
    }
  };
  const initialTheme = readSavedTheme()
    || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  applyTheme(initialTheme);
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      writeSavedTheme(next);
      announce(next === 'dark' ? 'Mode gelap diaktifkan' : 'Mode terang diaktifkan');
    });
  }

  // Copy helpers
  const copyToClipboard = async (text) => {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return;
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  };
  document.querySelectorAll('.copy-btn').forEach((btn) => {
    let timer = 0;
    btn.addEventListener('click', async () => {
      const target = document.getElementById(btn.dataset.copyTarget || '');
      if (!target) return;
      const text = 'value' in target ? target.value : target.textContent;
      const labelEl = btn.querySelector('.copy-label');
      const copyIcon = btn.querySelector('.icon-copy');
      const okIcon = btn.querySelector('.icon-check');
      try {
        await copyToClipboard(text);
        if (labelEl) labelEl.textContent = 'Tersalin';
        if (copyIcon) copyIcon.setAttribute('hidden', '');
        if (okIcon) okIcon.removeAttribute('hidden');
        btn.classList.add('is-copied');
        announce('Konfigurasi disalin ke clipboard');
        clearTimeout(timer);
        timer = setTimeout(() => {
          if (labelEl) labelEl.textContent = btn.dataset.defaultLabel || 'Salin';
          if (okIcon) okIcon.setAttribute('hidden', '');
          if (copyIcon) copyIcon.removeAttribute('hidden');
          btn.classList.remove('is-copied');
        }, 1800);
      } catch {
        announce('Gagal menyalin otomatis. Silakan blok teks dan salin manual.');
      }
    });
  });

  // WAI-ARIA client switcher tabs
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  const activateTab = (tab, moveFocus) => {
    tabs.forEach((t) => {
      const selected = t === tab;
      t.setAttribute('aria-selected', String(selected));
      t.tabIndex = selected ? 0 : -1;
      const panel = document.getElementById(t.getAttribute('aria-controls') || '');
      if (panel) panel.hidden = !selected;
    });
    if (moveFocus) tab.focus();
  };
  tabs.forEach((tab, idx) => {
    tab.addEventListener('click', () => activateTab(tab, false));
    tab.addEventListener('keydown', (e) => {
      let nextIdx = -1;
      if (e.key === 'ArrowRight') nextIdx = (idx + 1) % tabs.length;
      else if (e.key === 'ArrowLeft') nextIdx = (idx - 1 + tabs.length) % tabs.length;
      else if (e.key === 'Home') nextIdx = 0;
      else if (e.key === 'End') nextIdx = tabs.length - 1;
      if (nextIdx >= 0) {
        e.preventDefault();
        activateTab(tabs[nextIdx], true);
      }
    });
  });

  // Antigravity OS switcher
  const osButtons = [...document.querySelectorAll('.os-btn')];
  osButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const os = btn.dataset.os;
      osButtons.forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      const winBox = document.getElementById('ag-os-win');
      const unixBox = document.getElementById('ag-os-unix');
      if (winBox) winBox.hidden = os !== 'win';
      if (unixBox) unixBox.hidden = os !== 'unix';
    });
  });

  // Live /healthz check with empty/loading/success/error states
  const checkBtn = document.getElementById('check-health-btn');
  const healthBox = document.getElementById('health-result');
  if (checkBtn && healthBox) {
    checkBtn.addEventListener('click', async () => {
      checkBtn.disabled = true;
      checkBtn.textContent = 'Memeriksa...';
      healthBox.dataset.state = 'loading';
      healthBox.textContent = 'Sedang menghubungi /healthz...';
      try {
        const res = await fetch('/healthz', { headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        healthBox.dataset.state = 'ok';
        const mode = data.writesEnabled ? 'Baca & Tulis' : 'Baca saja';
        healthBox.textContent = '[ONLINE] Server aktif: status=' + data.status
          + ', authMode=' + data.authMode
          + ', akses=' + mode
          + ', koneksiGoogle=' + data.googleConnection + '.';
      } catch (err) {
        healthBox.dataset.state = 'error';
        const msg = err && err.message ? err.message : 'Koneksi gagal';
        healthBox.textContent = '[ERROR] Gagal terhubung ke /healthz (' + msg + '). Coba muat ulang halaman atau cek jaringan Anda.';
      } finally {
        checkBtn.disabled = false;
        checkBtn.textContent = 'Cek Status Server';
      }
    });
  }
})();
</script>`;
}

function renderCopyButton(targetId, label) {
  return `<button type="button" class="btn btn-secondary copy-btn" data-copy-target="${escapeHtml(targetId)}" data-default-label="${escapeHtml(label)}">
    <span class="icon-copy">${ICON_COPY}</span><span class="icon-check" hidden>${ICON_CHECK}</span><span class="copy-label">${escapeHtml(label)}</span>
  </button>`;
}

export function renderLandingPage({ config, publicUrl, nonce = '' }) {
  const endpoint = config.publicUrl;
  const endpointEsc = escapeHtml(endpoint);
  const hostEsc = escapeHtml(publicUrl.hostname);
  const accessLabel = config.writes ? 'Baca & Tulis (Read & Write)' : 'Baca saja (Read-only)';
  const driveStatus = config.driveListEnabled ? 'Aktif (Spreadsheet + Daftar Drive)' : 'ID / URL Spreadsheet langsung';
  const driveConsentText = config.driveListEnabled ? ' dan daftar file Google Drive (readonly)' : '';

  const cursorConfigB64 = Buffer.from(JSON.stringify({ url: endpoint }), 'utf8').toString('base64');
  const cursorDeeplink = `cursor://anysphere.cursor-deeplink/mcp/install?name=google-sheets&config=${encodeURIComponent(cursorConfigB64)}`;
  const genericHttpJson = JSON.stringify({ mcpServers: { 'google-sheets': { url: endpoint } } }, null, 2);
  const agWinCmd = `agy mcp add --type stdio google-sheets "C:\\Program Files\\nodejs\\npx.cmd" -- -y mcp-remote ${endpoint}`;
  const agWinJson = JSON.stringify({ mcpServers: { 'google-sheets': { command: 'C:\\Program Files\\nodejs\\npx.cmd', args: ['-y', 'mcp-remote', endpoint] } } }, null, 2);
  const agUnixCmd = `agy mcp add --type stdio google-sheets npx -- -y mcp-remote ${endpoint}`;
  const agUnixJson = JSON.stringify({ mcpServers: { 'google-sheets': { command: 'npx', args: ['-y', 'mcp-remote', endpoint] } } }, null, 2);
  const claudeCodeCmd = `claude mcp add --scope user --transport http google-sheets ${endpoint}`;
  const samplePrompt = 'Tampilkan daftar Google Sheets saya atau baca sel A1:D10 dari spreadsheet tersebut.';

  const headerRightHtml = `<nav class="topnav" aria-label="Navigasi cepat">
    <a href="#panduan-google">Login Google</a>
    <a href="#daftar-tool">Daftar Tool</a>
    <a href="#bantuan">Bantuan</a>
    <button type="button" id="theme-toggle" class="btn btn-secondary" aria-pressed="false">
      ${ICON_THEME}<span id="theme-toggle-label">Mode Gelap</span>
    </button>
  </nav>`;

  const tools = [
    ['list_spreadsheets', 'Baca', 'Menampilkan daftar spreadsheet Google Sheets di akun Anda.', true],
    ['list_tabs', 'Baca', 'Melihat daftar nama tab beserta ukuran baris dan kolom di satu file.', true],
    ['read_sheet', 'Baca', 'Membaca isi sel atau rentang (misalnya A1:D20) dalam format ringkas.', true],
    ['write_cells', 'Tulis', 'Menulis atau memperbarui nilai sel pada rentang tertentu (butuh konfirmasi).', config.writes],
    ['append_rows', 'Tulis', 'Menambahkan baris data baru di bawah tabel yang sudah ada.', config.writes],
    ['create_tab', 'Tulis', 'Membuat tab lembar kerja baru di dalam spreadsheet Anda.', config.writes],
    ['set_formula', 'Tulis', 'Memasukkan formula Google Sheets (SUM, IF, VLOOKUP, dll.) ke sel.', config.writes]
  ];

  const toolRowsHtml = tools.map(([name, kind, desc, active], i) => `
    <tr>
      <td class="row-idx" data-label="No">${i + 1}</td>
      <td data-label="Tool"><code>${name}</code></td>
      <td data-label="Jenis">${kind}</td>
      <td data-label="Fungsi">${desc}</td>
      <td data-label="Status"><span class="state-tag ${active ? '' : 'state-tag-off'}">${active ? 'Aktif' : 'Nonaktif'}</span></td>
    </tr>`).join('');

  const bodyHtml = `
    <div id="sr-announcer" class="sr-only" aria-live="polite" aria-atomic="true"></div>

    <section class="hero-grid" aria-labelledby="hero-title">
      <div class="hero-copy">
        <h1 id="hero-title">Hubungkan Google Sheets ke AI dalam 1 Menit</h1>
        <p class="muted">Server MCP publik berbasis OAuth 2.1 + PKCE. Setiap pengguna cukup login memakai akun Google masing-masing dari aplikasi AI pilihan, tanpa konfigurasi API key manual.</p>

        <div class="endpoint-box">
          <label for="mcp-endpoint-input">Alamat Server MCP (Streamable HTTP)</label>
          <div class="endpoint-row">
            <input id="mcp-endpoint-input" class="mono-input" type="url" readonly value="${endpointEsc}">
            <button type="button" class="btn btn-primary copy-btn" data-copy-target="mcp-endpoint-input" data-default-label="Salin URL">
              <span class="icon-copy">${ICON_COPY}</span><span class="icon-check" hidden>${ICON_CHECK}</span><span class="copy-label">Salin URL</span>
            </button>
          </div>
        </div>

        <dl class="meta-strip">
          <div><dt>Mode Akses</dt><dd>${escapeHtml(accessLabel)}</dd></div>
          <div><dt>Autentikasi</dt><dd>OAuth 2.1 Per-User (DCR &amp; CIMD)</dd></div>
          <div><dt>Pencarian File</dt><dd>${escapeHtml(driveStatus)}</dd></div>
        </dl>
      </div>

      <div class="workbench">
        <div class="workbench-head">
          <h2>Pilih Aplikasi AI Anda</h2>
          <p>Gunakan tab di bawah untuk langsung memasang atau menyalin konfigurasi sesuai aplikasi yang Anda pakai.</p>
        </div>

        <div class="client-tabs" role="tablist" aria-label="Pilih aplikasi AI">
          <button type="button" role="tab" id="tab-chatgpt" class="tab-btn" aria-selected="true" aria-controls="panel-chatgpt" tabindex="0">ChatGPT</button>
          <button type="button" role="tab" id="tab-claude" class="tab-btn" aria-selected="false" aria-controls="panel-claude" tabindex="-1">Claude</button>
          <button type="button" role="tab" id="tab-cursor" class="tab-btn" aria-selected="false" aria-controls="panel-cursor" tabindex="-1">Cursor</button>
          <button type="button" role="tab" id="tab-antigravity" class="tab-btn" aria-selected="false" aria-controls="panel-antigravity" tabindex="-1">Antigravity</button>
          <button type="button" role="tab" id="tab-claudecode" class="tab-btn" aria-selected="false" aria-controls="panel-claudecode" tabindex="-1">Claude Code</button>
          <button type="button" role="tab" id="tab-other" class="tab-btn" aria-selected="false" aria-controls="panel-other" tabindex="-1">MCP Lainnya</button>
        </div>

        <div role="tabpanel" id="panel-chatgpt" aria-labelledby="tab-chatgpt">
          <h3>Cara Menghubungkan di ChatGPT (Web Custom Connector)</h3>
          <ol class="steps-list">
            <li>Salin alamat server MCP di atas menggunakan tombol <strong>Salin URL</strong>.</li>
            <li>Di ChatGPT, buka <strong>Settings &gt; Connectors &gt; Advanced settings</strong>, lalu nyalakan <strong>Developer mode</strong>.</li>
            <li>Kembali ke <strong>Connectors</strong>, klik <strong>Create</strong>, isi Name: <code>Google Sheets</code>, tempel URL endpoint, dan pilih Authentication: <strong>OAuth</strong>.</li>
            <li>Klik <strong>Create</strong> lalu login dengan akun Google Anda saat layar izin muncul.</li>
          </ol>
          <div class="code-block">
            <div class="code-bar"><span>Prompt Uji Pertama</span>${renderCopyButton('chatgpt-prompt', 'Salin Prompt')}</div>
            <pre id="chatgpt-prompt">${escapeHtml(samplePrompt)}</pre>
          </div>
        </div>

        <div role="tabpanel" id="panel-claude" aria-labelledby="tab-claude" hidden>
          <h3>Cara Menghubungkan di Claude (Web &amp; Claude Desktop)</h3>
          <ol class="steps-list">
            <li>Buka menu <strong>Settings &gt; Connectors</strong> (atau buka halaman <code>claude.ai/customize/connectors</code>).</li>
            <li>Klik tombol <strong>+ Add custom connector</strong>.</li>
            <li>Masukkan Name: <code>Google Sheets</code> dan tempel URL endpoint <code>${endpointEsc}</code>.</li>
            <li>Klik <strong>Add</strong>, lalu tekan <strong>Connect</strong> untuk menyelesaikan login Google OAuth Anda.</li>
          </ol>
          <div class="action-row">
            ${renderCopyButton('mcp-endpoint-input', 'Salin URL Endpoint')}
          </div>
        </div>

        <div role="tabpanel" id="panel-cursor" aria-labelledby="tab-cursor" hidden>
          <h3>Pasang Langsung atau Salin Konfigurasi Cursor</h3>
          <p class="muted">Tombol di bawah membuka Cursor dan menyiapkan server <code>google-sheets</code> secara otomatis.</p>
          <div class="action-row">
            <a class="btn btn-primary" href="${escapeHtml(cursorDeeplink)}">Pasang Sekali Klik di Cursor ${ICON_EXTERNAL}</a>
          </div>
          <div class="code-block">
            <div class="code-bar"><span>Manual: .cursor/mcp.json</span>${renderCopyButton('cursor-json-code', 'Salin JSON')}</div>
            <pre id="cursor-json-code">${escapeHtml(genericHttpJson)}</pre>
          </div>
        </div>

        <div role="tabpanel" id="panel-antigravity" aria-labelledby="tab-antigravity" hidden>
          <h3>Konfigurasi Antigravity IDE</h3>
          <p class="muted">Antigravity terhubung memakai jembatan <code>mcp-remote</code> agar OAuth berjalan lewat browser Anda.</p>
          <div class="sub-switch" role="group" aria-label="Pilih sistem operasi Antigravity">
            <button type="button" class="os-btn" data-os="win" aria-pressed="true">Windows</button>
            <button type="button" class="os-btn" data-os="unix" aria-pressed="false">macOS / Linux</button>
          </div>
          <div id="ag-os-win">
            <div class="code-block">
              <div class="code-bar"><span>Perintah Terminal (PowerShell / CMD)</span>${renderCopyButton('ag-win-cmd', 'Salin Perintah')}</div>
              <pre id="ag-win-cmd">${escapeHtml(agWinCmd)}</pre>
            </div>
            <div class="code-block">
              <div class="code-bar"><span>Atau isi ke ~/.gemini/config/mcp_config.json</span>${renderCopyButton('ag-win-json', 'Salin JSON')}</div>
              <pre id="ag-win-json">${escapeHtml(agWinJson)}</pre>
            </div>
          </div>
          <div id="ag-os-unix" hidden>
            <div class="code-block">
              <div class="code-bar"><span>Perintah Terminal (macOS / Linux)</span>${renderCopyButton('ag-unix-cmd', 'Salin Perintah')}</div>
              <pre id="ag-unix-cmd">${escapeHtml(agUnixCmd)}</pre>
            </div>
            <div class="code-block">
              <div class="code-bar"><span>Atau isi ke ~/.gemini/config/mcp_config.json</span>${renderCopyButton('ag-unix-json', 'Salin JSON')}</div>
              <pre id="ag-unix-json">${escapeHtml(agUnixJson)}</pre>
            </div>
          </div>
          <ol class="steps-list">
            <li>Buka menu <strong>Customizations &gt; Installed &gt; MCP Servers</strong> di sidebar kiri Antigravity (muat ulang jika belum tampil).</li>
            <li>Klik <strong>Authenticate / Connect</strong> pada baris <code>google-sheets</code> untuk membuka login Google di browser.</li>
          </ol>
        </div>

        <div role="tabpanel" id="panel-claudecode" aria-labelledby="tab-claudecode" hidden>
          <h3>Pasang di Claude Code CLI</h3>
          <div class="code-block">
            <div class="code-bar"><span>Perintah Terminal (Global User Scope)</span>${renderCopyButton('cc-cli-cmd', 'Salin Perintah')}</div>
            <pre id="cc-cli-cmd">${escapeHtml(claudeCodeCmd)}</pre>
          </div>
          <ol class="steps-list">
            <li>Jalankan perintah di atas pada terminal Anda.</li>
            <li>Buka <code>claude</code>, ketik <code>/mcp</code>, pilih <code>google-sheets</code>, lalu selesaikan login Google di browser.</li>
          </ol>
        </div>

        <div role="tabpanel" id="panel-other" aria-labelledby="tab-other" hidden>
          <h3>Klien MCP Lainnya (Streamable HTTP + OAuth 2.1)</h3>
          <div class="code-block">
            <div class="code-bar"><span>Konfigurasi JSON Umum</span>${renderCopyButton('other-json-code', 'Salin JSON')}</div>
            <pre id="other-json-code">${escapeHtml(genericHttpJson)}</pre>
          </div>
          <p class="muted">Discovery metadata tersedia di <code>${escapeHtml(publicUrl.origin)}/.well-known/oauth-protected-resource</code> dan <code>/.well-known/oauth-authorization-server</code> dengan dukungan PKCE <code>S256</code>, DCR, dan CIMD.</p>
        </div>
      </div>
    </section>

    <section id="panduan-google" aria-labelledby="panduan-title">
      <h2 id="panduan-title">Panduan Saat Layar Login Google Muncul</h2>
      <p class="muted">Ketika pertama kali menekan Connect di aplikasi AI, browser akan membuka halaman izin Google resmi.</p>

      <div class="rail-grid">
        <div class="rail-step">
          <span class="step-num">LANGKAH 01</span>
          <h3>Pilih Akun Google Anda</h3>
          <p class="muted">Masuk ke akun Google yang memiliki atau diberi akses ke file Google Sheets tujuan Anda.</p>
        </div>
        <div class="rail-step">
          <span class="step-num">LANGKAH 02</span>
          <h3>Lewati Layar Peringatan</h3>
          <p class="muted">Jika muncul layar <strong>"Google hasn't verified this app"</strong>, klik <strong>Advanced</strong> di kiri bawah, lalu klik <strong>Go to ${hostEsc} (unsafe)</strong>.</p>
        </div>
        <div class="rail-step">
          <span class="step-num">LANGKAH 03</span>
          <h3>Centang Izin &amp; Continue</h3>
          <p class="muted">Centang kotak izin akses Google Sheets${escapeHtml(driveConsentText)}, lalu klik <strong>Continue</strong> hingga kembali ke aplikasi AI.</p>
        </div>
      </div>

      <div class="callout-warn" role="note">
        <p><strong>Penting:</strong> Layar <em>"Google hasn't verified this app"</em> muncul karena aplikasi OAuth ini belum melewati verifikasi publik Google. Anda tetap dapat memakainya dengan aman menggunakan tombol <strong>Advanced &gt; Go to ${hostEsc}</strong>.</p>
      </div>

      <div class="health-box">
        <button type="button" id="check-health-btn" class="btn btn-secondary">Cek Status Server</button>
        <div id="health-result" class="status-box" data-state="idle" aria-live="polite">
          Belum diperiksa pada sesi ini. Klik "Cek Status Server" untuk menguji kesiapan endpoint <code>/healthz</code>.
        </div>
      </div>
    </section>

    <section id="daftar-tool" aria-labelledby="tools-title">
      <h2 id="tools-title">Kemampuan Server (7 MCP Tools)</h2>
      <p class="muted">Status aktif mengikuti konfigurasi server saat ini (${escapeHtml(accessLabel)}).</p>
      <div class="ledger-wrap">
        <table class="ledger-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Nama Tool</th>
              <th>Jenis</th>
              <th>Kegunaan</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>${toolRowsHtml}</tbody>
        </table>
      </div>
    </section>

    <section id="bantuan" aria-labelledby="faq-title">
      <h2 id="faq-title">Pertanyaan Umum Koneksi MCP</h2>
      <div class="faq-list">
        <details>
          <summary>Apakah pengguna lain bisa membaca file Google Sheets milik saya?</summary>
          <p>Tidak bisa. Server ini memakai autentikasi OAuth per pengguna. Token sesi Anda dienkripsi (AES-256-GCM) terpisah per akun, dan setiap panggilan tool hanya mengakses spreadsheet milik akun yang login pada sesi tersebut.</p>
        </details>
        <details>
          <summary>Saya sudah menambahkan ke Antigravity, tapi tombol Connect belum muncul?</summary>
          <p>Buka panel <strong>Customizations &gt; Installed &gt; MCP Servers</strong> lalu muat ulang daftar server atau tutup dan buka kembali Antigravity agar berkas <code>mcp_config.json</code> terbaca ulang. Pastikan perintah <code>npx.cmd</code> (Windows) atau <code>npx</code> (macOS/Linux) tersedia di PATH.</p>
        </details>
        <details>
          <summary>Bagaimana cara memutuskan koneksi atau mencabut izin Google saya?</summary>
          <p>Anda dapat mencabut izin kapan saja lewat halaman <a href="https://myaccount.google.com/permissions" rel="noreferrer">Google Account Permissions</a> atau mencabut token klien MCP melalui endpoint <code>/revoke</code>.</p>
        </details>
      </div>
    </section>`;

  const footerLinksHtml = `
    <a href="/">Portal Koneksi</a>
    <a href="/privacy">Privacy Policy</a>
    <a href="/terms">Terms of Service</a>
    <a href="/healthz">Status JSON</a>`;

  return renderDocument({
    title: 'Google Sheets MCP Server - Portal Koneksi',
    lang: 'id',
    statusLabel: `Online · Multi-User OAuth 2.1 · ${config.writes ? 'Baca & Tulis' : 'Baca saja'}`,
    headerRightHtml,
    bodyHtml,
    footerLinksHtml,
    scriptHtml: buildPortalScript(nonce)
  });
}

export function renderPrivacyPage({ config, publicUrl }) {
  const origin = escapeHtml(publicUrl.origin);
  const scopes = config.driveListEnabled
    ? '<code>openid</code>, <code>email</code>, Google Sheets (<code>spreadsheets</code>), and Google Drive metadata (<code>drive.metadata.readonly</code>)'
    : '<code>openid</code>, <code>email</code>, and Google Sheets (<code>spreadsheets</code>)';

  const bodyHtml = `<article class="legal-card">
    <h1>Privacy Policy</h1>
    <p><strong>Service:</strong> Google Sheets MCP Server (<code>${origin}</code>)</p>
    <h2>1. Information Accessed</h2>
    <p>When you sign in with Google OAuth 2.0, this server receives your Google account identifier, email address, and OAuth tokens for ${scopes} solely to execute MCP tool requests you initiate from your connected AI client.</p>
    <h2>2. Data Usage and Storage</h2>
    <ul>
      <li>Spreadsheet contents read or written through MCP tools are processed in memory per request and are not permanently stored in a server database.</li>
      <li>Your Google OAuth tokens are stored on this server encrypted at rest (AES-256-GCM) so your authorized MCP client sessions can access your Google Sheets on your behalf.</li>
      <li>We do not sell, rent, or transfer your Google user data to third parties or use it for advertising.</li>
    </ul>
    <h2>3. Revocation and Deletion</h2>
    <p>You may disconnect this service at any time by revoking access in your <a href="https://myaccount.google.com/permissions" rel="noreferrer">Google Account Permissions</a> or through your MCP client token revocation flow (<code>/revoke</code>).</p>
    <h2>4. Contact</h2>
    <p>For questions about this deployment, contact the operator listed on the Google OAuth consent screen for <code>${escapeHtml(publicUrl.hostname)}</code>.</p>
  </article>`;

  return renderDocument({
    title: 'Privacy Policy - Google Sheets MCP',
    lang: 'en',
    containerClass: 'container container-narrow',
    bodyHtml,
    footerLinksHtml: '<a href="/">Home</a><a href="/privacy">Privacy Policy</a><a href="/terms">Terms of Service</a>'
  });
}

export function renderTermsPage({ publicUrl }) {
  const origin = escapeHtml(publicUrl.origin);
  const bodyHtml = `<article class="legal-card">
    <h1>Terms of Service</h1>
    <p><strong>Service:</strong> Google Sheets MCP Server (<code>${origin}</code>)</p>
    <h2>1. Acceptable Use</h2>
    <p>This service acts as an OAuth 2.1 Model Context Protocol (MCP) bridge between your chosen AI client and your own Google account. You are solely responsible for all read and write operations executed through your authorized sessions.</p>
    <h2>2. Authorization and Security</h2>
    <p>Each user authenticates directly with Google and can only access spreadsheets permitted by their own Google account. Do not share issued MCP tokens with untrusted parties.</p>
    <h2>3. Availability and Warranty</h2>
    <p>This service is provided &ldquo;as is&rdquo; without warranty of uninterrupted availability. The operator may suspend, rate-limit, or terminate access to protect service stability and security.</p>
  </article>`;

  return renderDocument({
    title: 'Terms of Service - Google Sheets MCP',
    lang: 'en',
    containerClass: 'container container-narrow',
    bodyHtml,
    footerLinksHtml: '<a href="/">Home</a><a href="/privacy">Privacy Policy</a><a href="/terms">Terms of Service</a>'
  });
}
