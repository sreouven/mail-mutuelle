/* Mail Mutuelle — service worker */
importScripts('shared.js');
const M = self.MailMutuelle;
const SCRIPT_ID = 'mail-mutuelle-sites';
const CRM_SCRIPT_ID = 'mail-mutuelle-crm';
const CRM_PENDING_MS = 3 * 60 * 1000;

/* Injection du script sur les adresses du logiciel choisies dans les réglages.
   Les appels sont mis en file pour éviter deux enregistrements simultanés. */
let queue = Promise.resolve();
function syncRegistration() {
  queue = queue.then(doSync).catch(err => console.warn('[Mail Mutuelle] enregistrement :', err));
  return queue;
}

async function doSync() {
  const { settings } = await M.loadAll();
  // Desmos (*.juxta.cloud) est déjà couvert par le manifeste : on ne l'injecte pas une deuxième fois
  const patterns = settings.siteMatches.filter(p => M.isValidMatchPattern(p) && !/juxta\.cloud\//.test(p));
  const granted = [];
  for (const p of patterns) {
    if (await chrome.permissions.contains({ origins: [p] })) granted.push(p);
  }
  const toRegister = [];
  if (granted.length) {
    toRegister.push({ id: SCRIPT_ID, matches: granted, js: ['shared.js', 'content.js'], runAt: 'document_idle',
      allFrames: true, matchOriginAsFallback: true, persistAcrossSessions: true });
  }
  const crmPatterns = [];
  for (const t of settings.crmTargets) {
    const p = M.toMatchPattern(t.url);
    if (p && !crmPatterns.includes(p) && await chrome.permissions.contains({ origins: [p] })) crmPatterns.push(p);
  }
  if (crmPatterns.length) {
    toRegister.push({ id: CRM_SCRIPT_ID, matches: crmPatterns, js: ['shared.js', 'crm.js'], runAt: 'document_idle',
      allFrames: false, persistAcrossSessions: true });
  }
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID, CRM_SCRIPT_ID] });
  if (existing.length) await chrome.scripting.unregisterContentScripts({ ids: existing.map(s => s.id) });
  if (toRegister.length) await chrome.scripting.registerContentScripts(toRegister);
}

/* Ouverture du CRM : les données patient restent dans la mémoire de session de l'extension
   (jamais dans l'adresse), le temps que la page du CRM les récupère. */
async function openCrm(patient, targetId, sender) {
  const { settings } = await M.loadAll();
  const target = settings.crmTargets.find(t => t.id === targetId);
  if (!target || !/^https:\/\//.test(target.url || '')) return { ok: false, error: 'Formulaire CRM non réglé.' };
  const props = { url: target.url, active: true };
  if (sender.tab) { props.index = sender.tab.index + 1; props.openerTabId = sender.tab.id; props.windowId = sender.tab.windowId; }
  const tab = await chrome.tabs.create(props);
  await chrome.storage.session.set({ ['crm_' + tab.id]: { patient, bouton: target.bouton || '', ts: Date.now() } });
  return { ok: true };
}

async function crmPending(sender) {
  if (!sender.tab) return null;
  const key = 'crm_' + sender.tab.id;
  const item = (await chrome.storage.session.get(key))[key];
  if (!item) return null;
  await chrome.storage.session.remove(key);
  if (Date.now() - item.ts > CRM_PENDING_MS) return null;
  return { patient: item.patient, settings: { crmButtonText: item.bouton } };
}

chrome.runtime.onInstalled.addListener(async details => {
  await M.ensureDefaults();
  await syncRegistration();
  if (details.reason === 'install') chrome.runtime.openOptionsPage();
});
chrome.runtime.onStartup.addListener(syncRegistration);
chrome.permissions.onAdded.addListener(syncRegistration);
chrome.permissions.onRemoved.addListener(syncRegistration);
chrome.storage.onChanged.addListener((changes, area) => {
  if ((area === 'sync' && changes.settings) || area === 'managed') syncRegistration();
});

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'openGmail' && typeof msg.url === 'string' && msg.url.startsWith('https://mail.google.com/')) {
    const props = { url: msg.url, active: true };
    if (sender.tab) {
      props.index = sender.tab.index + 1;
      props.openerTabId = sender.tab.id;
      props.windowId = sender.tab.windowId;
    }
    chrome.tabs.create(props).then(() => sendResponse({ ok: true }), e => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  if (msg && msg.type === 'openCrm' && msg.patient && typeof msg.patient === 'object') {
    const patient = {};
    for (const k of ['nom', 'prenom', 'dateNaissance', 'nir', 'mutuelle', 'mutuelleAnnuaire']) {
      if (typeof msg.patient[k] === 'string') patient[k] = msg.patient[k].slice(0, 100);
    }
    openCrm(patient, String(msg.targetId || ''), sender).then(sendResponse, e => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  if (msg && msg.type === 'crmPending') {
    crmPending(sender).then(sendResponse, () => sendResponse(null));
    return true;
  }
  if (msg && msg.type === 'openOptions') {
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
  }
  return false;
});
