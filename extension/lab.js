/* Mail Mutuelle — My Dental Lab : remplit le champ « Patient » d'une nouvelle fiche.
   Le nom est transmis par le service worker (jamais dans l'adresse de la page).
   Rien n'est validé automatiquement : la secrétaire choisit le praticien, le produit, puis valide. */
(() => {
  'use strict';
  if (window.top !== window || globalThis.__mailMutuelleLab) return;
  globalThis.__mailMutuelleLab = true;

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const visible = el => !!(el && el.getClientRects().length);
  const clean = s => String(s || '').replace(/\s+/g, ' ').trim();

  function toast(text, err) {
    const host = document.createElement('div');
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = '<style>.t{position:fixed;right:18px;bottom:18px;z-index:2147483647;max-width:420px;font:13px/1.45 system-ui,sans-serif;' +
      'background:#fff;color:#1f2937;border:1px solid ' + (err ? '#fecaca' : '#99f6e4') + ';border-left:5px solid ' + (err ? '#b91c1c' : '#0f766e') +
      ';border-radius:9px;padding:10px 32px 10px 12px;box-shadow:0 6px 20px rgba(15,23,42,.15);white-space:pre-line}' +
      '.x{position:absolute;top:4px;right:8px;cursor:pointer;border:0;background:none;font-size:16px;color:#64748b}</style>' +
      '<div class="t"><button class="x" title="Fermer">×</button><span></span></div>';
    root.querySelector('span').textContent = 'Mail Mutuelle — ' + text;
    root.querySelector('.x').addEventListener('click', () => host.remove());
    document.body.append(host);
    if (!err) setTimeout(() => host.remove(), 8000);
  }

  // Champ « Patient » : d'abord par son nom/id, sinon par le libellé « Patient: » qui le précède
  function findPatientInput() {
    const inputs = Array.from(document.querySelectorAll('input[type=text],input:not([type])')).filter(visible);
    const byAttr = inputs.find(i => /patient/i.test((i.id || '') + ' ' + (i.name || '') + ' ' + (i.placeholder || '')));
    if (byAttr) return byAttr;
    for (const el of document.querySelectorAll('label,span,div,td,th,b,strong,p')) {
      if (!visible(el)) continue;
      let own = '';
      for (const n of el.childNodes) if (n.nodeType === 3) own += n.nodeValue;
      if (!/^patient\s*:?$/i.test(clean(own))) continue;
      if (el.htmlFor) { const c = document.getElementById(el.htmlFor); if (c) return c; }
      const next = inputs.find(i => el.compareDocumentPosition(i) & Node.DOCUMENT_POSITION_FOLLOWING);
      if (next) return next;
    }
    return null;
  }

  async function run() {
    let res = null;
    for (let i = 0; i < 2 && !(res && res.patient); i++) {
      if (i) await sleep(1500); // l'onglet vient peut-être d'être créé
      try { res = await chrome.runtime.sendMessage({ type: 'labPending' }); } catch (e) { return; }
    }
    if (!res || !res.patient) return;
    const p = res.patient;
    const name = clean(clean(p.nom).toUpperCase() + ' ' + clean(p.prenom));
    if (!name) return;

    let input = null;
    for (let t = 0; t < 40 && !input; t++) { input = findPatientInput(); if (!input) await sleep(250); }
    if (!input) {
      toast('champ « Patient » introuvable. Êtes-vous connecté(e) à My Dental Lab ?\nNom à saisir : ' + name, true);
      return;
    }
    if (clean(input.value)) { toast('le champ « Patient » était déjà rempli, il n\'a pas été modifié.', true); return; }
    input.focus();
    input.value = name;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
    input.blur();
    toast('patient rempli : ' + name + '.\nChoisissez le praticien et le produit, puis validez la commande.');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  else run();
})();
