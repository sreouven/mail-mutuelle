/* Mail Mutuelle — préremplissage du formulaire du CRM (ex. volet « Nouveau devis » d'une app Base44).
   Les données patient sont transmises par le service worker (jamais dans l'adresse de la page).
   Rien n'est enregistré automatiquement : la secrétaire complète et valide elle-même. */
(() => {
  'use strict';
  if (window.top !== window || globalThis.__mailMutuelleCrm) return;
  globalThis.__mailMutuelleCrm = true;
  const M = globalThis.MailMutuelle;
  if (!M) return;

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const visible = el => !!(el && el.getClientRects().length);
  const labelText = s => M.clean(s).replace(/\s*\*+\s*$/, '').replace(/\s*:\s*$/, '');

  const LABELS = {
    nom: /^nom(\s+(de\s+famille|de\s+naissance|d['’]usage|du\s+patient))?$/i,
    prenom: /^pr[ée]nom(\s+du\s+patient)?$/i,
    nir: /^(n[°ºo]?\s*(de\s+)?s[ée]cu(rit[ée]\s+sociale)?|nir|n[°ºo]?\s*insee|num[ée]ro\s+(de\s+)?s[ée]cu(rit[ée]\s+sociale)?)$/i,
    dateNaissance: /^(date\s+de\s+naissance|ddn|n[ée]\(e\)\s+le)$/i,
    mutuelle: /^(mutuelle|compl[ée]mentaire(\s+sant[ée])?|amc)$/i
  };
  const FIELD_NAMES = { nom: 'Nom', prenom: 'Prénom', nir: 'N° sécurité sociale', dateNaissance: 'Date de naissance', mutuelle: 'Mutuelle' };

  async function waitFor(fn, timeout) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      const v = fn();
      if (v) return v;
      await sleep(250);
    }
    return null;
  }

  /* ---------- petit message en bas de l'écran ---------- */
  let toastHost = null;
  function toast(text, kind) {
    if (!toastHost) {
      toastHost = document.createElement('div');
      const root = toastHost.attachShadow({ mode: 'open' });
      root.innerHTML = '<style>.t{position:fixed;right:18px;bottom:18px;z-index:2147483647;max-width:420px;font:13px/1.45 system-ui,sans-serif;' +
        'background:#fff;color:#1f2937;border:1px solid #99f6e4;border-left:5px solid #0f766e;border-radius:9px;padding:10px 32px 10px 12px;box-shadow:0 6px 20px rgba(15,23,42,.15);white-space:pre-line}' +
        '.t.err{border-color:#fecaca;border-left-color:#b91c1c}.x{position:absolute;top:4px;right:8px;cursor:pointer;border:0;background:none;font-size:16px;color:#64748b}</style>' +
        '<div class="t"><button class="x" title="Fermer">×</button><span></span></div>';
      root.querySelector('.x').addEventListener('click', () => toastHost.remove());
      document.body.append(toastHost);
    }
    const box = toastHost.shadowRoot.querySelector('.t');
    box.className = 't' + (kind === 'err' ? ' err' : '');
    box.querySelector('span').textContent = 'Mail Mutuelle — ' + text;
    if (!toastHost.isConnected) document.body.append(toastHost);
  }

  /* ---------- repérage des champs par leur libellé ---------- */
  function findLabel(rx, root) {
    for (const el of root.querySelectorAll('label,span,div,p,dt,th,legend')) {
      if (!visible(el)) continue;
      let own = '';
      for (const n of el.childNodes) if (n.nodeType === 3) own += n.nodeValue;
      own = labelText(own);
      if (own && own.length < 50 && rx.test(own)) return el;
    }
    return null;
  }

  function controlFor(label) {
    if (label.htmlFor) {
      const c = document.getElementById(label.htmlFor);
      if (c) return c;
    }
    const SEL = 'input:not([type=hidden]):not([type=checkbox]):not([type=radio]),textarea,select,[role="combobox"]';
    let node = label;
    for (let i = 0; i < 4 && node; i++) {
      node = node.parentElement;
      if (!node) break;
      const ctrl = Array.from(node.querySelectorAll(SEL)).find(c =>
        visible(c) && (label.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING));
      if (ctrl) return ctrl;
    }
    return null;
  }

  function setInput(el, value) {
    el.focus();
    el.value = value; // dans le monde isolé de l'extension, c'est le setter natif : React détecte bien le changement
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.blur();
  }

  const C2S_RX = /\b(cmu|c2s|css)\b|compl[ée]mentaire\s+sant[ée]\s+solidaire/i;
  const GENERIC = new Set(['mutuelle', 'avec mutuelle', 'oui', 'amc', 'complementaire']);

  function bestOption(texts, wanted, isMutuelle) {
    const dir = texts.map((t, i) => ({ id: String(i), nom: t, alias: [] }))
      .filter(d => !/^(choisir|s[ée]lectionner|--)/i.test(d.nom.trim()));
    let best = null;
    for (const w of wanted.filter(Boolean)) {
      const r = M.matchMutuelle(w, dir);
      if (r && (!best || r.score > best.score)) best = r;
    }
    if (best) return Number(best.mutuelle.id);
    if (!isMutuelle) return -1;
    // Liste générique (« Mutuelle », « Sans mutuelle », « CMU »…) : on choisit la catégorie
    const raw = wanted.filter(Boolean).join(' ');
    if (!raw) return -1;
    const isC2S = C2S_RX.test(raw);
    const hit = dir.find(d => isC2S ? C2S_RX.test(d.nom) : GENERIC.has(M.normalize(d.nom)));
    return hit ? Number(hit.id) : -1;
  }

  function pointerClick(el) {
    const opts = { bubbles: true, cancelable: true, button: 0, pointerType: 'mouse', isPrimary: true };
    el.dispatchEvent(new PointerEvent('pointerdown', opts));
    el.dispatchEvent(new MouseEvent('mousedown', opts));
    el.dispatchEvent(new PointerEvent('pointerup', opts));
    el.dispatchEvent(new MouseEvent('mouseup', opts));
    el.click();
  }

  async function chooseOption(ctrl, wanted) {
    if (ctrl.tagName === 'SELECT') {
      const opts = Array.from(ctrl.options);
      const i = bestOption(opts.map(o => o.text), wanted, true);
      if (i < 0) return false;
      ctrl.value = opts[i].value;
      ctrl.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    // Liste déroulante « maison » (Radix / shadcn…) : on l'ouvre, on choisit, sinon on la referme
    pointerClick(ctrl);
    const options = await waitFor(() => {
      const o = Array.from(document.querySelectorAll('[role="option"]')).filter(visible);
      return o.length ? o : null;
    }, 3000);
    if (!options) return false;
    const i = bestOption(options.map(o => M.clean(o.innerText || o.textContent)), wanted, true);
    if (i < 0) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      (document.activeElement || document.body).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return false;
    }
    pointerClick(options[i]);
    return true;
  }

  function toIsoDate(d) {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(d || '');
    return m ? m[3] + '-' + m[2] + '-' + m[1] : '';
  }

  /* ---------- déroulé ---------- */
  async function run() {
    let res = null;
    for (let i = 0; i < 2 && !(res && res.patient); i++) {
      if (i) await sleep(1500); // l'onglet vient peut-être d'être créé
      try { res = await chrome.runtime.sendMessage({ type: 'crmPending' }); } catch (e) { return; }
    }
    if (!res || !res.patient) return;
    const p = res.patient;
    const settings = res.settings || {};

    const formOpen = () => findLabel(LABELS.nom, document) && findLabel(LABELS.prenom, document);
    if (!formOpen()) {
      const wantedBtn = M.normalize(settings.crmButtonText || '');
      toast('ouverture du formulaire « ' + (settings.crmButtonText || '') + ' »…');
      const btn = await waitFor(() => wantedBtn && Array.from(document.querySelectorAll('button,a,[role="button"]'))
        .find(b => visible(b) && M.normalize(b.innerText || b.textContent).includes(wantedBtn)), 20000);
      if (!btn) {
        toast('bouton « ' + settings.crmButtonText + ' » introuvable sur cette page.\nÊtes-vous connecté(e) au CRM ? Vous pouvez aussi l\'ouvrir puis cliquer à nouveau sur « Devis CRM » dans Desmos.', 'err');
        return;
      }
      btn.click();
    }
    if (!(await waitFor(formOpen, 10000))) {
      toast('le formulaire ne s\'est pas ouvert.', 'err');
      return;
    }
    await sleep(400);

    const anyLabel = findLabel(LABELS.nom, document);
    const root = (anyLabel && anyLabel.closest('[role="dialog"],form,aside')) || document;
    const filled = [], skipped = [];

    for (const field of ['nom', 'prenom', 'nir', 'dateNaissance', 'mutuelle']) {
      const label = findLabel(LABELS[field], root);
      const ctrl = label && controlFor(label);
      const value = p[field];
      if (!ctrl) continue;                       // champ absent du formulaire : rien à signaler
      if (!value) { skipped.push(FIELD_NAMES[field] + ' (non lu dans Desmos)'); continue; }

      if (field === 'mutuelle') {
        const ok = await chooseOption(ctrl, [p.mutuelle, p.mutuelleAnnuaire]);
        (ok ? filled : skipped).push(ok ? FIELD_NAMES[field] : 'Mutuelle « ' + p.mutuelle + ' » absente de la liste du CRM');
        continue;
      }
      let v = value;
      if (field === 'nir') {
        const n = M.parseNir(value);
        const wants13 = /13/.test(ctrl.getAttribute('placeholder') || '') || ctrl.maxLength === 13;
        v = n ? (wants13 ? n.compact.slice(0, 13) : n.compact) : value.replace(/\s/g, '');
      }
      if (field === 'dateNaissance' && ctrl.type === 'date') v = toIsoDate(value);
      if (ctrl.tagName === 'SELECT' || ctrl.getAttribute('role') === 'combobox') continue;
      if (ctrl.value && ctrl.value.trim()) { skipped.push(FIELD_NAMES[field] + ' (déjà rempli, non modifié)'); continue; }
      setInput(ctrl, v);
      filled.push(FIELD_NAMES[field]);
    }

    toast('formulaire prérempli : ' + (filled.join(', ') || 'aucun champ') + '.' +
      (skipped.length ? '\nÀ faire à la main : ' + skipped.join(' ; ') + '.' : '') +
      '\nComplétez le reste, vérifiez, puis enregistrez.', skipped.length ? 'err' : '');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  else run();
})();
