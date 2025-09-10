// main.js - entry point
import { getAccessToken, initAuth } from './auth.js';
import { loadFileIntoIframe, saveContent } from './drive.js';
import { parseStateParam } from './ui.js';

function readCookie(name) {
  const nameEQ = name + '=';
  const parts = document.cookie.split(';');
  for (let c of parts) {
    while (c.charAt(0) === ' ') c = c.substring(1);
    if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length);
  }
  return null;
}

function createCookie(name, value, days) {
  let expires = '';
  if (days) {
    const date = new Date();
    date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
    expires = '; expires=' + date.toUTCString();
  }
  document.cookie = name + '=' + value + expires + '; path=/';
}

function initSettingsUI() {
  const autosave = document.getElementById('enable-autosave');
  const hotkey = document.getElementById('enable-hotkey-save');
  const disableSave = document.getElementById('disable-save');
  if (autosave) {
    autosave.checked = readCookie('enableautosave') !== 'false';
    autosave.addEventListener('change', () => createCookie('enableautosave', autosave.checked, 364));
  }
  if (hotkey) {
    hotkey.checked = readCookie('enablehotkeysave') !== 'false';
    hotkey.addEventListener('change', () => createCookie('enablehotkeysave', hotkey.checked, 364));
  }
  if (disableSave) {
    disableSave.checked = readCookie('disablesave') === 'true';
    disableSave.addEventListener('change', () => createCookie('disablesave', disableSave.checked, 364));
  }
}

function registerTiddlySaver(iframe) {
  try {
    const tw = iframe.contentWindow.$tw;
    if (!tw || !tw.saverHandler || !tw.saverHandler.savers) {
      setTimeout(() => registerTiddlySaver(iframe), 800);
      return;
    }
    const disableSave = () => document.getElementById('disable-save')?.checked;
    const autosaveEnabled = () => document.getElementById('enable-autosave')?.checked;
    const saver = async (text, method, callback) => {
      if (disableSave()) return false;
      if (!autosaveEnabled() && method === 'autosave') return false;
      try {
        await saveContent(text, { autosave: method === 'autosave' });
        tw.saverHandler.numChanges = 0;
        tw.saverHandler.updateDirtyStatus();
      } catch (e) {
        callback && callback(e.message || 'Save failed');
      }
      return true;
    };
    tw.saverHandler.savers.push({
      info: { name: 'tiddly-drive-2', priority: 5000, capabilities: ['save', 'autosave'] },
      save: saver
    });
    // Hotkey save (Ctrl+S)
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && document.getElementById('enable-hotkey-save')?.checked) {
        e.preventDefault();
        try {
          iframe.contentWindow.$tw.saverHandler.saveWiki();
        } catch {}
      }
    });
    // Title sync
    const titleEl = iframe.contentWindow.document.querySelector('title');
    if (titleEl) {
      const obs = new MutationObserver(() => {
        const top = document.getElementById('top-title');
        if (top) top.textContent = titleEl.textContent;
      });
      obs.observe(titleEl, { characterData: true, childList: true });
      const top = document.getElementById('top-title');
      if (top) top.textContent = titleEl.textContent;
    }
  } catch (e) {
    setTimeout(() => registerTiddlySaver(iframe), 800);
  }
}

function initMaterializeShell() {
  // Initialize Materialize components if library loaded
  if (window.$) {
    window.$('.modal').modal({
      ready: function() {
        if (window.$('ul.tabs').tabs) window.$('ul.tabs').tabs('select_tab', 'options');
      }
    });
    if (window.$('ul.tabs').tabs) window.$('ul.tabs').tabs();
    const hideFab = document.getElementById('hide-fab');
    if (hideFab) hideFab.addEventListener('click', () => {
      const btn = document.getElementById('open-settings');
      if (btn) btn.style.display = 'none';
    });
  }
  // Auth button triggers interactive token fetch
  const authBtn = document.getElementById('auth');
  if (authBtn) authBtn.addEventListener('click', () => getAccessToken({ interactive: true }));
}

async function bootstrap() {
  const iframe = document.getElementById('content');
  const loader = document.getElementById('loader');
  const noFileMsg = document.getElementById('nofile-msg');
  const errorMsg = document.getElementById('error-msg');
  const state = parseStateParam();
  initMaterializeShell();
  try {
    await initAuth();
    if (!state) {
      loader.style.display = 'none';
      noFileMsg.style.display = 'block';
      iframe.style.display = 'none';
      return;
    }
    await getAccessToken({ interactive: true });
  await loadFileIntoIframe(iframe);
    loader.style.display = 'none';
  // After load, attempt saver registration
  registerTiddlySaver(iframe);
  initSettingsUI();
  } catch (e) {
    console.error(e);
    loader.style.display = 'none';
    errorMsg.style.display = 'block';
  }

  // Attach save now button
  const saveBtn = document.getElementById('save-now');
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      try {
        const doc = iframe.contentWindow.document;
        const html = '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
        await saveContent(html, { silent: false });
      } catch (e) { console.error(e); }
    });
  }
}

window.addEventListener('load', bootstrap);
