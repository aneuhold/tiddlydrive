// ui.js - DOM helpers & small utilities

export function parseStateParam() {
  const url = window.location.href;
  const m = /[?&]state=([^&#]+)/.exec(url);
  if (!m) return null;
  try { return JSON.parse(decodeURIComponent(m[1])); } catch { return null; }
}

export function showToast(msg) {
  if (window.Materialize && window.Materialize.toast) {
    window.Materialize.toast(msg, 2000);
  } else {
    console.log('[toast]', msg);
  }
}

export function showErrorDialog(title, bodyHtml) {
  const titleEl = document.getElementById('dlg-warning-title');
  const bodyEl = document.getElementById('dlg-warning-body');
  if (titleEl && bodyEl) {
    titleEl.textContent = title;
    bodyEl.innerHTML = bodyHtml;
    const modal = document.getElementById('dlg-warning');
    if (window.$ && window.$(modal).modal) window.$(modal).modal('open');
  } else {
    alert(title + '\n' + bodyHtml.replace(/<[^>]*>/g, ''));
  }
}

export function getIframe() {
  return document.getElementById('content');
}
