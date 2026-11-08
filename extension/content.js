/* Mail Mutuelle — barre injectée dans le dossier patient */
(() => {
  'use strict';
  if (globalThis.__mailMutuelleLoaded) return;
  // Les cadres intégrés (iframes) lisent leur contenu et l'envoient à la page principale,
  // qui fusionne tout et affiche une seule barre.
  const IS_TOP = window.top === window;
  const FRAME_ID = Math.random().toString(36).slice(2);
  globalThis.__mailMutuelleLoaded = true;
  const M = globalThis.MailMutuelle;
  if (!M) return;

  const FIELDS = ['civilite', 'nom', 'prenom', 'dateNaissance', 'nir', 'mutuelle', 'email'];
  const CORE = ['nom', 'prenom', 'dateNaissance', 'nir'];           // indispensables pour tout message
  const OPTIONAL = ['civilite'];                                     // jamais signalé comme manquant
  const NAME_FIELDS = ['nom', 'prenom'];
  const FIELD_LABELS = {
    civilite: 'Civilité', nom: 'Nom', prenom: 'Prénom', dateNaissance: 'Date de naissance', nir: 'N° INSEE (NIR)',
    mutuelle: 'Mutuelle', email: 'Email patient'
  };
  // Noms d'éditeurs / logiciels : jamais un nom de patient
  const BRAND_RX = /\b(intellio|[ée]diteurs?|desmos|juxta|doctolib|logiciel|software|sas|sarl)\b/i;
  const SOURCE_LABELS = { reglage: 'réglage', champ: 'champ', libelle: 'libellé', entete: 'en-tête', texte: 'texte', saisie: 'corrigé' };
  const SOURCE_RANK = { reglage: 5, champ: 4, libelle: 3, entete: 2, texte: 1 };

  /* ================================================================== */
  /* 1. Lecture de la fiche                                              */
  /* ================================================================== */

  const LABEL_RX = {
    nom: /^(nom|nom\s+(de\s+naissance|d['’]usage|de\s+famille|patronymique|usuel|utilis[ée])|last\s*name)$/i,
    prenom: /^(pr[ée]noms?|pr[ée]nom\(s\)|pr[ée]nom\s+(usuel|utilis[ée])|1\s*er\s+pr[ée]nom|(1\s*er\s+)?pr[ée]nom(s|\(s\))?\s+de\s+naissance|first\s*name)$/i,
    dateNaissance: /^(date\s+de\s+naissance|n[ée]e?\s*(\(e\))?\s+le|ddn|naissance|date\s+naiss\.?)$/i,
    nir: /^(nir|n[°ºo]?\s*insee|num[ée]ro\s+insee|n[°ºo]?\s*(de\s+)?s[ée]cu(rit[ée]\s+sociale)?|num[ée]ro\s+(de\s+)?s[ée]cu(rit[ée]\s+sociale)?|n[°ºo]?\s*ss|n[°ºo]?\s*immatriculation|immatriculation|matricule)$/i,
    mutuelle: /^(mutuelle|compl[ée]mentaire(\s+sant[ée])?|organisme\s+compl[ée]mentaire|assurance\s+compl[ée]mentaire|amc|oc|mutuelle\s*\/\s*amc)$/i,
    civilite: /^(civilit[ée])$/i,
    email: /^(e-?mail|courriel|mail|adresse\s+(e-?mail|mail|[ée]lectronique))$/i,
    identite: /^(patient\s*(\(e\)|e)?|identit[ée]|nom\s*(et|-|\/)?\s*pr[ée]noms?|n[ée]e?|n[ée]\(e\))$/i
  };

  const OTHER_LABEL_RX = /^(civilit[ée]|sexe|genre|adresse|code\s+postal.*|ville|pays|lieu-dit.*|t[ée]l[ée]phone.*|portable|e-?mail|courriel|rang|amo|amc\d|r[ée]gime|caisse|code\s+lieu.*|lieu\s+de\s+naissance|m[ée]decin.*|praticien.*|d[ée]claration|coordonn[ée]es|[âa]ge)$/i;
  const PLACEHOLDER_RX = /^(\+\s*)?(saisir|ajouter|s[ée]lectionner|choisir|renseigner|non\s+renseign|aucune?\b|inconnue?\b|[àa]\s+compl[ée]ter|nom\s+pr[ée]nom)/i;
  function isLabelLike(v) {
    const t = cleanLabel(v);
    return OTHER_LABEL_RX.test(t) || Object.values(LABEL_RX).some(rx => rx.test(t));
  }

  const NAME_EXCLUDE = ['medecin', 'praticien', 'user', 'utilisateur', 'mutuelle', 'organisme', 'caisse', 'centre', 'contact', 'urgence', 'assure', 'traitant', 'label', 'titre', 'editeur', 'editor', 'societe', 'company', 'logiciel', 'cabinet', 'structure', 'app', 'brand', 'logo', 'compte', 'account'];
  // t = jetons séparés par des espaces (« patient nom »). Mot court = jeton entier ; mot long = peut être collé (« datenaissance »).
  const has = (t, ...words) => words.some(w => t.includes(' ' + w + ' ') || (w.length >= 5 && t.includes(w)));
  const ATTR_TEST = {
    nom: t => !has(t, 'prenom', ...NAME_EXCLUDE) && (has(t, 'nom', 'lastname', 'surname', 'patronyme', 'familyname') || (has(t, 'last') && has(t, 'name'))),
    prenom: t => !has(t, ...NAME_EXCLUDE) && (has(t, 'prenom', 'firstname', 'givenname') || (has(t, 'first') && has(t, 'name'))),
    dateNaissance: t => has(t, 'dob', 'ddn', 'birthdate', 'birthday', 'datenaissance') || (has(t, 'date') && has(t, 'naissance')) || (has(t, 'birth') && has(t, 'date')),
    nir: t => has(t, 'nir', 'insee', 'secu', 'securite', 'numss', 'ssn', 'matricule', 'immatriculation'),
    mutuelle: t => has(t, 'mutuelle', 'complementaire', 'amc', 'insurer'),
    civilite: t => has(t, 'civilite', 'salutation'),
    email: t => has(t, 'email', 'courriel', 'mail') && !has(t, 'user', 'utilisateur', 'praticien', 'medecin', 'account', 'compte',
      'centre', 'cabinet', 'structure', 'editeur', 'support', 'login', 'connexion', 'expediteur', 'sender')
  };

  const VALID = {
    nom: v => /^[\p{L}][\p{L}'’ .\-]{0,59}$/u.test(v),
    prenom: v => /^[\p{L}][\p{L}'’ .\-]{0,59}$/u.test(v),
    dateNaissance: v => !!M.normalizeDate(v),
    nir: v => !!M.parseNir(v),
    mutuelle: v => v.length >= 2 && v.length <= 80 && !/^(aucune?|non|n[ée]ant|sans|-+|\/|n\.?\s*c\.?)$/i.test(v),
    civilite: v => /^(monsieur|madame|mademoiselle|m\.?|mr\.?|mme\.?|mlle\.?)$/i.test(v),
    email: v => v.length <= 100 && /^[^\s@<>()]+@[^\s@<>()]+\.[a-z]{2,}$/i.test(v)
  };

  const FORMAT = {
    nom: v => M.clean(v),
    prenom: v => M.clean(v),
    dateNaissance: v => M.normalizeDate(v),
    nir: v => M.parseNir(v).formatted,
    // « ALMERYS (Soins et Devis) » -> « ALMERYS »
    mutuelle: v => M.clean(v).replace(/\s*\([^)]*\)\s*$/, '') || M.clean(v),
    civilite: v => /^(mme|madame)/i.test(v) ? 'Madame' : /^(mlle|mademoiselle)/i.test(v) ? 'Mademoiselle' : 'Monsieur',
    email: v => M.clean(v).toLowerCase()
  };

  let host = null; // élément hôte de la barre (à ignorer pendant la lecture)
  const isOurs = el => host && (el === host || host.contains(el));

  function cleanLabel(t) {
    return M.clean(t).replace(/\s*[:*]+\s*$/, '').trim();
  }

  function ownText(el) {
    let t = '';
    for (const n of el.childNodes) if (n.nodeType === 3) t += n.nodeValue;
    return M.clean(t);
  }

  function readValue(el) {
    if (!el) return '';
    if (el instanceof HTMLInputElement) {
      if (['checkbox', 'radio', 'button', 'submit', 'password'].includes(el.type)) return '';
      return el.value;
    }
    if (el instanceof HTMLTextAreaElement) return el.value;
    if (el instanceof HTMLSelectElement) return el.selectedOptions[0] ? el.selectedOptions[0].text : '';
    return el.innerText || el.textContent || '';
  }

  const isVisible = el => !!(el && el.getClientRects && el.getClientRects().length);
  const stripColon = v => M.clean(v).replace(/^[:\-–]\s*/, '');

  function safeQueryAll(sel) {
    try { return Array.from(document.querySelectorAll(sel)); } catch (e) { return []; }
  }

  /** Valeur située après un libellé (même élément, input associé, éléments ou textes suivants). */
  function valueAfterLabel(el, depth) {
    if (el.tagName === 'LABEL' && el.htmlFor) {
      const target = document.getElementById(el.htmlFor);
      if (target) return readValue(target);
    }
    const inner = el.querySelector('input,select,textarea');
    if (inner) return readValue(inner);

    let n = el.nextSibling;
    for (let hops = 0; n && hops < 5; hops++, n = n.nextSibling) {
      if (n.nodeType === 3) {
        const v = stripColon(n.nodeValue);
        if (v) return v;
      } else if (n.nodeType === 1 && !isOurs(n)) {
        const v = stripColon(readValue(n));
        if (v) return v;
      }
    }
    // Libellé enveloppé seul dans un conteneur : on regarde après le conteneur
    if (!depth && el.parentElement && el.parentElement.childElementCount === 1 && !ownText(el.parentElement)) {
      return valueAfterLabel(el.parentElement, 1);
    }
    return '';
  }

  let leavesCache = null;
  function leaves() {
    if (leavesCache) return leavesCache;
    leavesCache = [];
    for (const el of document.body.querySelectorAll('*')) {
      if (isOurs(el) || /^(SCRIPT|STYLE|NOSCRIPT|SVG|PATH)$/i.test(el.tagName)) continue;
      const ctrl = /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName);
      if (!ctrl && !ownText(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width && r.height) leavesCache.push({ el, r });
    }
    return leavesCache;
  }

  function valueRightOf(label) {
    const lr = label.getBoundingClientRect();
    if (!lr.width || !lr.height) return null;
    const cy = (lr.top + lr.bottom) / 2;
    let best = null, bestD = Infinity;
    for (const { el, r } of leaves()) {
      if (el === label || el.contains(label) || label.contains(el)) continue;
      if (r.left < lr.right - 2) continue;
      if (Math.abs((r.top + r.bottom) / 2 - cy) > Math.max(6, Math.min(lr.height, r.height) / 2)) continue;
      const d = r.left - lr.right;
      if (d < 400 && d < bestD) { bestD = d; best = el; }
    }
    return best ? { value: readValue(best), el: best } : null;
  }

  function byLabel(rx) {
    const out = [];
    const els = document.querySelectorAll('label,th,td,dt,dd,span,div,strong,b,i,a,p,li,small,em,font,h1,h2,h3,h4,h5,h6,legend');
    for (const el of els) {
      if (isOurs(el)) continue;
      const own = ownText(el);
      if (!own || own.length > 80) continue;

      // « Nom : DUPONT » dans un même élément
      const colon = own.indexOf(':');
      if (colon > 0 && rx.test(cleanLabel(own.slice(0, colon)))) {
        let v = M.clean(own.slice(colon + 1));
        const ctrl = !v && el.querySelector('input,select,textarea');
        if (ctrl) v = M.clean(readValue(ctrl));
        if (!v) {
          const full = M.clean(el.innerText || el.textContent);
          const c2 = full.indexOf(':');
          if (full.length < 120 && c2 >= 0) v = M.clean(full.slice(c2 + 1));
        }
        if (!v) v = valueAfterLabel(el, 0);
        if (v) out.push({ value: v, el });
        const right = !M.clean(own.slice(colon + 1)) && valueRightOf(el);
        if (right) out.push(right);
        continue;
      }
      if (rx.test(cleanLabel(own))) {
        // Libellé dont la valeur est dans un enfant : <p>Nom <b>DUPONT</b></p>
        const ctrl = el.querySelector('input,select,textarea');
        if (ctrl) { out.push({ value: readValue(ctrl), el }); continue; }
        const full = M.clean(el.innerText || el.textContent);
        let v = '';
        if (full.length < 120 && full.length > own.length) {
          v = stripColon(full.slice(full.indexOf(own) + own.length));
        }
        if (!v || v === own) v = valueAfterLabel(el, 0);
        if (v) out.push({ value: v, el });
        const right = valueRightOf(el);
        if (right) out.push(right);
      }
    }
    return out;
  }

  function tokensOf(el) {
    const raw = [el.id, el.getAttribute('name'), el.getAttribute('data-field'), el.getAttribute('data-name'),
      el.getAttribute('data-testid'), el.getAttribute('formcontrolname'), el.getAttribute('ng-model'), el.getAttribute('v-model')]
      .filter(Boolean).join(' ');
    return raw.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .split(/[^a-z0-9]+/).filter(Boolean).join(' ');
  }

  function byAttribute(field, formOnly) {
    const out = [];
    const sel = formOnly
      ? 'input,select,textarea'
      : '[id],[name],[data-field],[data-name],[data-testid],[formcontrolname]';
    for (const el of document.querySelectorAll(sel)) {
      if (isOurs(el)) continue;
      if (!formOnly && /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) continue;
      const t = ' ' + tokensOf(el) + ' ';
      let ok = t.trim() && ATTR_TEST[field](t);
      // aria-label / placeholder sur un champ de saisie
      if (!ok && formOnly) {
        const lab = cleanLabel(el.getAttribute('aria-label') || el.getAttribute('placeholder') || '');
        ok = lab && LABEL_RX[field].test(lab);
      }
      if (!ok) continue;
      if (!formOnly && el.childElementCount > 3) continue;
      const v = M.clean(readValue(el));
      if (v && v.length <= 80) out.push({ value: v, el });
    }
    return out;
  }

  function pick(field, candidates, source, allowHidden) {
    let fallback = null;
    for (const c of candidates) {
      let v = M.clean(c.value);
      if (field === 'dateNaissance') v = v.replace(/\s*\(.*$/, ''); // « 12/05/1985 (40 ans) »
      if (!v || isLabelLike(v) || PLACEHOLDER_RX.test(v)) continue; // libellé ou texte d'invite
      if (!VALID[field](v)) continue;
      if (NAME_FIELDS.includes(field) && BRAND_RX.test(v)) continue;
      const res = { value: FORMAT[field](v), source };
      if (isVisible(c.el)) return res;
      if (allowHidden && !fallback && !NAME_FIELDS.includes(field)) fallback = res;
    }
    return fallback;
  }

  function splitIdentity(text) {
    const words = M.clean(text).replace(/^(m\.|mr|mme|mlle|monsieur|madame|mademoiselle|dr)\s+/i, '').split(' ').filter(Boolean);
    if (words.length < 2) return null;
    const upper = words.filter(w => w.length > 1 && w === w.toUpperCase() && /\p{L}/u.test(w));
    if (upper.length && upper.length < words.length) {
      return { nom: upper.join(' '), prenom: words.filter(w => !upper.includes(w)).join(' ') };
    }
    return { nom: words[0], prenom: words.slice(1).join(' ') };
  }

  /** Contrôle croisé avec l'en-tête : un nom absent de l'en-tête et non lu à côté de son libellé est écarté. */
  function applyHeader(r) {
    const h = r.entete;
    if (!h) return r;
    const head = ' ' + M.normalize(h.nom + ' ' + h.prenom) + ' ';
    for (const f of NAME_FIELDS) {
      const c = r[f];
      const inHeader = c && c.value && head.includes(' ' + M.normalize(c.value) + ' ');
      const trusted = c && (c.source === 'libelle' || c.source === 'reglage');
      if (!c || !c.value || (!inHeader && !trusted)) r[f] = { value: h[f], source: 'entete' };
    }
    return r;
  }

  function extract(settings) {
    leavesCache = null;
    const result = {};
    // ordre : réglage > champ de saisie > libellé > attribut ; la date est aussi cherchée dans « Né(e) le … »
    for (const f of FIELDS) {
      const sel = settings.selectors[f];
      const strategies = [
        () => sel ? [safeQueryAll(sel).map(el => ({ value: readValue(el), el })), 'reglage'] : null,
        () => [byAttribute(f, true), 'champ'],
        () => [byLabel(LABEL_RX[f]), 'libelle'],
        () => [byAttribute(f, false), 'champ']
      ];
      const cache = [];
      result[f] = null;
      // 1er passage : uniquement ce qui est affiché à l'écran ; 2e passage : éléments masqués
      for (const allowHidden of [false, true]) {
        for (let i = 0; i < strategies.length && !result[f]; i++) {
          if (cache[i] === undefined) cache[i] = strategies[i]();
          if (cache[i]) result[f] = pick(f, cache[i][0], cache[i][1], allowHidden);
        }
        if (result[f]) break;
      }
    }

    // En-tête « Né SELLAM Reouven » / « Patient : MARTIN Claire »
    for (const c of byLabel(LABEL_RX.identite)) {
      const parts = splitIdentity(c.value);
      if (parts && VALID.nom(parts.nom) && VALID.prenom(parts.prenom) && !BRAND_RX.test(c.value) &&
          !isLabelLike(c.value) && !PLACEHOLDER_RX.test(c.value) && isVisible(c.el)) {
        result.entete = { nom: parts.nom, prenom: parts.prenom };
        break;
      }
    }
    applyHeader(result);

    const text = ((document.body && document.body.innerText) || '').normalize('NFC');
    const current = result.nir && M.parseNir(result.nir.value);
    if (!current || !current.hasKey) {
      // NIR complet avec clé dans le texte (la clé est parfois affichée dans un élément séparé)
      const rx = /\b([12])[ \t.]?(\d{2})[ \t.]?(\d{2})[ \t.]?(\d{2}|2[AB])[ \t.]?(\d{3})[ \t.]?(\d{3})\s*(\d{2})\b/gi;
      let m;
      while ((m = rx.exec(text))) {
        const p = M.parseNir(m[0].replace(/\s+/g, ' '));
        if (p && p.keyValid && (!current || p.compact.startsWith(current.compact))) {
          result.nir = { value: p.formatted, source: current ? result.nir.source : 'texte' };
          break;
        }
      }
    }
    if (!result.dateNaissance) {
      const m = /n[ée]e?\s*(?:\(e\))?\s+le\s*:?\s*(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{4})/i.exec(text);
      if (m && M.normalizeDate(m[1])) result.dateNaissance = { value: M.normalizeDate(m[1]), source: 'texte' };
    }
    return result;
  }

  /* ================================================================== */
  /* 2. Barre d'action                                                   */
  /* ================================================================== */

  const LOGO = 'data:image/png;base64,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';
  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif; }
    .wrap { font-size: 13px; color: #1f2937; background: #fff; border: 1px solid #cbd5e1; border-radius: 10px;
            box-shadow: 0 4px 18px rgba(15, 23, 42, .12); width: 100%; max-width: 760px; overflow: hidden; }
    .wrap.floating { position: fixed; right: 18px; bottom: 18px; width: max-content; min-width: 440px; max-width: calc(100vw - 36px);
            max-height: calc(100vh - 36px); overflow: auto; z-index: 2147483646; }
    .wrap.inline { margin: 8px 0; box-shadow: none; }
    .bar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 8px; background: #f0fdfa; border-bottom: 1px solid #ccfbf1; }
    .bar .end { display: flex; gap: 6px; margin-left: auto; }
    .logo { width: 28px; height: 28px; border-radius: 7px; flex: none; display: block; }
    .crms { display: contents; }
    .cube { all: unset; box-sizing: border-box; cursor: pointer; width: 48px; height: 48px; border-radius: 13px; display: grid; place-items: center; position: relative;
            background: #fff; border: 1px solid #cbd5e1; box-shadow: 0 4px 16px rgba(15, 23, 42, .22); transition: transform .12s ease; }
    .cube:hover { transform: scale(1.08); }
    .cube:focus-visible { outline: 3px solid #5eead4; }
    .cube img { width: 40px; height: 40px; border-radius: 9px; display: block; }
    .cube.floating { position: fixed; right: 18px; bottom: 18px; z-index: 2147483646; }
    .cube .dot { position: absolute; top: -4px; right: -4px; width: 12px; height: 12px; border-radius: 50%; background: #f59e0b; border: 2px solid #fff; }
    select, input { font-size: 13px; color: #1f2937; border: 1px solid #cbd5e1; border-radius: 6px; padding: 5px 7px; background: #fff; min-width: 0; }
    select:focus, input:focus { outline: 2px solid #5eead4; outline-offset: 0; border-color: #0f766e; }
    .tpl { width: 230px; max-width: 100%; }
    button { font-size: 13px; cursor: pointer; border-radius: 6px; border: 1px solid #cbd5e1; background: #fff; color: #1f2937; padding: 5px 9px; white-space: nowrap; }
    button:hover { background: #f1f5f9; }
    button.go { background: #0f766e; border-color: #0f766e; color: #fff; font-weight: 600; }
    button.go:hover { background: #115e59; }
    button.icon { padding: 5px 8px; }
    button.crm { border-color: #0f766e; color: #0f766e; font-weight: 600; }
    button.crm:hover { background: #f0fdfa; }
    .status { padding: 6px 10px; font-size: 12px; color: #334155; display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: center; }
    .status .who { font-weight: 600; }
    .status .to { color: #0f766e; overflow-wrap: anywhere; }
    .warn { color: #b45309; }
    .err { color: #b91c1c; }
    .details { padding: 4px 10px 10px; border-top: 1px dashed #e2e8f0; }
    .grid { display: grid; grid-template-columns: 120px minmax(0, 1fr) 72px; gap: 6px 8px; align-items: center; margin-top: 6px; }
    .grid label { color: #475569; font-size: 12px; }
    .src { justify-self: start; white-space: nowrap; font-size: 11px; color: #64748b; background: #f1f5f9; border-radius: 10px; padding: 1px 7px; }
    .src.missing { background: #fef3c7; color: #92400e; }
    .src.edited { background: #e0f2fe; color: #075985; }
    .foot { display: flex; justify-content: space-between; gap: 8px; margin-top: 10px; }
    .link { background: none; border: none; color: #0f766e; padding: 0; text-decoration: underline; }
    .warnings { margin: 8px 0 0; padding-left: 18px; font-size: 12px; }
    .hidden-by-cube { display: none !important; }
    [hidden] { display: none !important; }
  `;

  let state = null;          // { settings, templates, mutuelles }
  let extracted = {};        // dernier résultat de lecture
  let edits = {};            // corrections manuelles de la secrétaire
  let mutOverride = '';      // mutuelle choisie à la main dans l'annuaire
  let ui = null;
  let detailsOpen = false;
  let minimized = true; // toujours en petit cube à l'ouverture de la page
  let lastTemplateId = '';

  const destOf = t => (t && t.dest === 'patient' ? 'patient' : 'mutuelle');
  function enabledTemplates() {
    const f = state.settings.features;
    return state.templates.filter(t => destOf(t) === 'patient' ? f.mailPatient : f.mailMutuelle);
  }
  function currentTemplate() {
    const list = enabledTemplates();
    return list.find(t => t.id === (ui && ui.tpl.value)) || list.find(t => t.id === lastTemplateId) || list[0] || null;
  }
  const activeCrm = () => state.settings.crmTargets.filter(t => t.actif !== false);

  function patient() {
    const p = {};
    for (const f of FIELDS) p[f] = edits[f] != null ? edits[f] : (extracted[f] ? extracted[f].value : '');
    return p;
  }

  function recipient(p) {
    if (mutOverride) {
      const m = state.mutuelles.find(x => x.id === mutOverride);
      if (m) return { mutuelle: m, score: 100, manual: true };
    }
    return M.matchMutuelle(p.mutuelle, state.mutuelles);
  }

  function warnings(p, rec, tpl) {
    const w = [];
    const dest = tpl ? destOf(tpl) : null;
    const needed = CORE.concat(dest === 'mutuelle' ? ['mutuelle'] : dest === 'patient' ? ['email'] : []);
    const missing = needed.filter(f => !p[f]).map(f => FIELD_LABELS[f]);
    if (missing.length) w.push('Non trouvé sur la fiche : ' + missing.join(', ') + '.');
    if (p.nir) {
      const n = M.parseNir(p.nir);
      if (!n) w.push('Le NIR n\'a pas un format valide.');
      else if (n.keyValid === false) w.push('La clé du NIR est incorrecte : vérifiez le numéro.');
      else if (!n.hasKey) w.push('NIR sans clé (13 chiffres).');
      if (n && p.dateNaissance) {
        const [, mm, yyyy] = p.dateNaissance.split('/');
        const yy = n.compact.slice(1, 3), mo = n.compact.slice(3, 5);
        if (yy !== yyyy.slice(2) || (Number(mo) <= 12 && mo !== mm)) w.push('Le NIR ne correspond pas à la date de naissance.');
      }
    }
    if (dest === 'mutuelle') {
      if (p.mutuelle && !rec) w.push('Mutuelle « ' + p.mutuelle + ' » absente de l\'annuaire : choisissez-la ci-dessous ou ajoutez-la dans les réglages.');
      if (rec && !rec.mutuelle.email) w.push('Aucune adresse email enregistrée pour ' + rec.mutuelle.nom + '.');
    }
    if (dest === 'patient' && p.email && !VALID.email(p.email)) w.push('L\'email du patient semble incorrect.');
    return w;
  }

  function el(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') e.className = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids.flat()) if (k != null) e.append(k.nodeType ? k : document.createTextNode(String(k)));
    return e;
  }

  function buildUi() {
    document.querySelectorAll('#mail-mutuelle-host').forEach(n => n.remove());
    host = document.createElement('div');
    host.id = 'mail-mutuelle-host';
    const root = host.attachShadow({ mode: 'open' });
    root.append(el('style', {}, CSS));

    const tpl = el('select', { class: 'tpl', title: 'Modèle de message', 'aria-label': 'Modèle de message' });
    tpl.addEventListener('change', () => {
      lastTemplateId = tpl.value;
      chrome.storage.local.set({ lastTemplateId }).catch(() => {});
    });
    tpl.addEventListener('change', () => render());
    const go = el('button', { class: 'go', title: 'Ouvrir un nouveau message Gmail prérempli', onclick: openGmail }, '✉ Ouvrir dans Gmail');
    const crms = el('span', { class: 'crms' });
    const more = el('button', { class: 'icon', title: 'Vérifier / corriger les données lues', 'aria-expanded': 'false', onclick: () => { detailsOpen = !detailsOpen; render(); } }, '▾');
    const setMin = v => { minimized = v; render(); };
    const min = el('button', { class: 'icon', title: 'Réduire en petit cube', onclick: () => setMin(true) }, '–');
    const cube = el('button', { class: 'cube', title: 'Mail Mutuelle — ouvrir la barre', 'aria-label': 'Ouvrir la barre Mail Mutuelle', onclick: () => setMin(false) },
      el('img', { src: LOGO, alt: '' }));

    const status = el('div', { class: 'status' });
    const grid = el('div', { class: 'grid' });
    const inputs = {};
    const srcTags = {};
    for (const f of FIELDS) {
      const input = el('input', { type: 'text', 'aria-label': FIELD_LABELS[f] });
      input.addEventListener('input', () => {
        edits[f] = input.value;
        if (f === 'mutuelle') mutOverride = '';
        render(true);
      });
      inputs[f] = input;
      srcTags[f] = el('span', { class: 'src' });
      grid.append(el('label', {}, FIELD_LABELS[f]), input, srcTags[f]);
    }
    const mutSelect = el('select', { 'aria-label': 'Mutuelle destinataire' });
    mutSelect.addEventListener('change', () => { mutOverride = mutSelect.value; render(); });
    const toTag = el('span', { class: 'src' });
    const mutLabel = el('label', {}, 'Mutuelle destinataire');
    grid.append(mutLabel, mutSelect, toTag);

    const warnList = el('ul', { class: 'warnings' });
    const foot = el('div', { class: 'foot' },
      el('button', { class: 'link', onclick: () => chrome.runtime.sendMessage({ type: 'openOptions' }).catch(() => {}) }, 'Réglages (modèles, mutuelles)'),
      el('button', { onclick: () => { edits = {}; mutOverride = ''; refresh(true); } }, '↻ Relire la fiche')
    );
    const details = el('div', { class: 'details' }, grid, warnList, foot);
    const wrap = el('div', { class: 'wrap' },
      el('div', { class: 'bar' }, el('img', { class: 'logo', src: LOGO, alt: '' }), tpl, go, crms, el('span', { class: 'end' }, more, min)),
      status, details);
    root.append(wrap, cube);
    ui = { root, wrap, cube, tpl, go, crms, more, min, status, details, inputs, srcTags, mutSelect, toTag, mutLabel, warnList, grid };
  }

  function placeHost() {
    const sel = state.settings.anchorSelector;
    let anchor = null;
    if (sel) { try { anchor = document.querySelector(sel); } catch (e) { anchor = null; } }
    if (anchor && !isOurs(anchor)) {
      if (host.previousElementSibling !== anchor) anchor.after(host);
      ui.wrap.classList.add('inline'); ui.wrap.classList.remove('floating'); ui.cube.classList.remove('floating');
    } else {
      if (host.parentNode !== document.body) document.body.append(host);
      ui.wrap.classList.add('floating'); ui.wrap.classList.remove('inline'); ui.cube.classList.add('floating');
    }
  }

  function render(fromInput) {
    if (!ui) return;
    const p = patient();
    const rec = recipient(p);

    // Modèles (selon les fonctions activées), groupés par destinataire
    const list = enabledTemplates();
    const ids = list.map(t => t.id + ':' + destOf(t) + ':' + t.nom).join('|');
    if (ui.tpl.dataset.ids !== ids) {
      const keep = ui.tpl.value || lastTemplateId;
      const group = (label, dest) => {
        const items = list.filter(t => destOf(t) === dest);
        return items.length ? el('optgroup', { label }, items.map(t => el('option', { value: t.id }, t.nom))) : null;
      };
      ui.tpl.replaceChildren(...[group('À la mutuelle', 'mutuelle'), group('Au patient', 'patient')].filter(Boolean));
      ui.tpl.dataset.ids = ids;
      if (keep && list.some(t => t.id === keep)) ui.tpl.value = keep;
    }
    const tpl = currentTemplate();
    const dest = tpl ? destOf(tpl) : null;
    ui.tpl.hidden = ui.go.hidden = !list.length;

    // Ligne d'état
    const who = [p.nom, p.prenom].filter(Boolean).join(' ') || 'Patient non identifié';
    const st = [el('span', { class: 'who' }, who)];
    if (dest === 'patient') {
      if (p.email) st.push(el('span', { class: 'to' }, '→ ' + p.email));
      else st.push(el('span', { class: 'warn' }, '⚠ email du patient non trouvé'));
    } else if (dest === 'mutuelle') {
      if (p.mutuelle) st.push(el('span', {}, p.mutuelle));
      if (rec && rec.mutuelle.email) st.push(el('span', { class: 'to' }, '→ ' + rec.mutuelle.email));
      else if (rec) st.push(el('span', { class: 'warn' }, '⚠ adresse de ' + rec.mutuelle.nom + ' à renseigner'));
      else if (p.mutuelle) st.push(el('span', { class: 'warn' }, '⚠ mutuelle non reconnue'));
      else st.push(el('span', { class: 'warn' }, '⚠ mutuelle non trouvée'));
    }
    const w = warnings(p, rec, tpl);
    if (w.length && !detailsOpen) st.push(el('button', { class: 'link', onclick: () => { detailsOpen = true; render(); } }, w.length + ' point(s) à vérifier'));
    ui.status.replaceChildren(...st);

    // Détails
    ui.details.hidden = !detailsOpen;
    ui.more.textContent = detailsOpen ? '▴' : '▾';
    ui.more.setAttribute('aria-expanded', String(detailsOpen));
    for (const f of FIELDS) {
      const input = ui.inputs[f];
      if (!fromInput || ui.root.activeElement !== input) input.value = p[f];
      const tag = ui.srcTags[f];
      if (edits[f] != null) { tag.textContent = SOURCE_LABELS.saisie; tag.className = 'src edited'; }
      else if (extracted[f]) { tag.textContent = SOURCE_LABELS[extracted[f].source]; tag.className = 'src'; }
      else if (OPTIONAL.includes(f)) { tag.textContent = '—'; tag.className = 'src'; }
      else { tag.textContent = 'manquant'; tag.className = 'src missing'; }
    }
    const showMut = dest === 'mutuelle';
    ui.mutLabel.hidden = ui.mutSelect.hidden = ui.toTag.hidden = !showMut;
    const opts = [el('option', { value: '' }, rec && !rec.manual ? 'Auto : ' + rec.mutuelle.nom : '— Choisir dans l\'annuaire —')]
      .concat(state.mutuelles.slice().sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
        .map(m => el('option', { value: m.id }, m.nom + (m.email ? '' : ' (sans adresse)'))));
    ui.mutSelect.replaceChildren(...opts);
    ui.mutSelect.value = mutOverride || '';
    ui.toTag.textContent = rec && rec.mutuelle.email ? 'adresse ✓' : 'sans adresse';
    ui.toTag.title = rec && rec.mutuelle.email ? rec.mutuelle.email : '';
    ui.toTag.className = rec && rec.mutuelle.email ? 'src' : 'src missing';
    ui.warnList.replaceChildren(...w.map(x => el('li', { class: 'warn' }, x)));

    // Mode « petit cube » : seule l'icône reste ; un point orange signale un point à vérifier
    ui.wrap.classList.toggle('hidden-by-cube', minimized);
    ui.cube.classList.toggle('hidden-by-cube', !minimized);
    const dot = ui.cube.querySelector('.dot');
    if (w.length && !dot) ui.cube.append(el('span', { class: 'dot' }));
    if (!w.length && dot) dot.remove();
    ui.cube.title = 'Mail Mutuelle — ' + who + (w.length ? ' (' + w.length + ' point(s) à vérifier)' : '');
    // Boutons CRM (un par formulaire réglé)
    const crmList = activeCrm();
    const tKey = JSON.stringify(crmList.map(t => [t.id, t.nom]));
    if (ui.crms.dataset.key !== tKey) {
      ui.crms.replaceChildren(...crmList.map(t =>
        el('button', { class: 'crm', title: 'Ouvrir « ' + (t.nom || 'CRM') + ' » et préremplir la fiche avec ce patient', onclick: () => openCrm(t.id) }, '＋ ' + (t.nom || 'CRM'))));
      ui.crms.dataset.key = tKey;
    }
    ui.go.disabled = !tpl;
  }

  function openCrm(targetId) {
    const p = patient();
    if (!p.nom && !p.nir) { window.alert('Mail Mutuelle : aucun patient lu sur cette page.'); return; }
    const rec = recipient(p);
    const payload = Object.assign({}, p, { mutuelleAnnuaire: rec ? rec.mutuelle.nom : '' });
    try {
      chrome.runtime.sendMessage({ type: 'openCrm', targetId, patient: payload }).then(r => {
        if (!r || !r.ok) window.alert('Mail Mutuelle : ' + ((r && r.error) || 'impossible d\'ouvrir le CRM.') + '\nVérifiez le formulaire CRM dans les réglages.');
      }, () => {});
    } catch (e) {
      window.alert('Mail Mutuelle : rechargez la page (extension mise à jour).');
    }
  }

  function openGmail() {
    const tpl = currentTemplate();
    if (!tpl) return;
    const p = patient();
    const rec = recipient(p);
    const w = warnings(p, rec, tpl);
    if (w.length && !window.confirm('Mail Mutuelle — points à vérifier :\n\n• ' + w.join('\n• ') + '\n\nOuvrir le message quand même ?')) {
      detailsOpen = true; render(); return;
    }
    const vars = M.buildVars(p, state.settings);
    const url = M.buildGmailUrl({
      to: destOf(tpl) === 'patient' ? (p.email || '') : (rec && rec.mutuelle.email ? rec.mutuelle.email : ''),
      cc: tpl.cc || '',
      subject: M.fillTemplate(tpl.objet, vars),
      body: M.fillTemplate(tpl.corps, vars),
      account: state.settings.gmailAccount
    });
    const fallback = () => window.open(url, '_blank', 'noopener');
    try {
      chrome.runtime.sendMessage({ type: 'openGmail', url }).then(r => { if (!r || !r.ok) fallback(); }, fallback);
    } catch (e) {
      fallback(); // extension rechargée : on ouvre quand même
    }
  }

  /* ================================================================== */
  /* 3. Cycle de vie                                                     */
  /* ================================================================== */

  const sameData = (a, b) => FIELDS.every(f => ((a[f] && a[f].value) || '') === ((b[f] && b[f].value) || ''));
  const identity = r => ((r.nir && r.nir.value) || '') + '|' + ((r.nom && r.nom.value) || '') + '|' + ((r.prenom && r.prenom.value) || '');

  /* Données reçues des cadres intégrés, par fenêtre de cadre : un nouveau document dans le même cadre remplace l'ancien */
  const frames = new Map();
  let lastPosted = '';

  function merge(own) {
    const sources = [own];
    for (const [win, f] of frames) {
      if (!win || win.closed) { frames.delete(win); continue; }
      sources.push(f.data);
    }
    // Le dossier patient = la source qui a le plus de champs trouvés directement (hors en-tête / texte libre)
    const strength = d => FIELDS.filter(k => d[k] && d[k].value && SOURCE_RANK[d[k].source] >= 3).length;
    sources.sort((a, b) => strength(b) - strength(a));
    const out = Object.assign({}, sources[0]);
    if (!out.entete) { const s2 = sources.find(d => d.entete); if (s2) out.entete = s2.entete; }
    for (const k of FIELDS) {
      if (out[k] && out[k].value) continue;
      for (const d of sources.slice(1)) {
        const c = d[k];
        if (c && c.value && (!out[k] || (SOURCE_RANK[c.source] || 0) > (SOURCE_RANK[out[k].source] || 0))) out[k] = c;
      }
    }
    return applyHeader(out);
  }

  function postToTop(data) {
    const clean = {};
    for (const k of FIELDS) if (data[k]) clean[k] = { value: String(data[k].value), source: data[k].source };
    if (data.entete) clean.entete = { nom: String(data.entete.nom), prenom: String(data.entete.prenom) };
    const json = JSON.stringify(clean);
    if (json === lastPosted) return;
    lastPosted = json;
    try { window.top.postMessage({ __mailMutuelle: 1, frameId: FRAME_ID, data: clean }, '*'); } catch (e) { /* rien */ }
  }

  function onFrameMessage(e) {
    const d = e.data;
    if (!d || d.__mailMutuelle !== 1 || e.source === window || typeof d.frameId !== 'string' || !d.data || typeof d.data !== 'object') return;
    const data = {};
    for (const k of FIELDS) {
      const c = d.data[k];
      if (c && typeof c.value === 'string' && c.value.length <= 100 && SOURCE_RANK[c.source]) data[k] = { value: c.value, source: c.source };
    }
    const h = d.data.entete;
    if (h && typeof h.nom === 'string' && typeof h.prenom === 'string' && h.nom.length < 80 && h.prenom.length < 80) data.entete = { nom: h.nom, prenom: h.prenom };
    frames.set(e.source, { data });
    schedule();
  }

  function askFramesToResend(win) {
    for (let i = 0; i < win.frames.length; i++) {
      try { win.frames[i].postMessage({ __mailMutuelleHello: 1 }, '*'); askFramesToResend(win.frames[i]); } catch (e) { /* rien */ }
    }
  }

  function refresh(force) {
    if (!state || !document.body) return;
    if (!IS_TOP) { postToTop(extract(state.settings)); return; }
    const next = merge(extract(state.settings));
    const found = next.nir || (next.nom && (next.prenom || next.dateNaissance));
    if (!found) {
      if (host && host.isConnected) host.remove();
      extracted = next;
      return;
    }
    if (identity(next) !== identity(extracted)) { edits = {}; mutOverride = ''; } // autre patient
    const changed = force || !sameData(next, extracted) || !host || !host.isConnected;
    extracted = next;
    if (!ui) buildUi();
    placeHost();
    if (changed) render();
  }

  let timer = null;
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(() => refresh(false), 700);
  }

  async function loadState() {
    const data = await M.loadAll();
    state = { settings: data.settings, templates: data.templates, mutuelles: data.mutuelles };
  }

  async function start() {
    try {
      await loadState();
      const local = await chrome.storage.local.get(['lastTemplateId']);
      lastTemplateId = local.lastTemplateId || '';
    } catch (e) {
      return; // extension indisponible
    }
    if (IS_TOP) {
      window.addEventListener('message', onFrameMessage);
      askFramesToResend(window);
    } else {
      // La page principale, une fois prête, demande aux cadres de renvoyer leurs données
      window.addEventListener('message', e => {
        if (e.source === window.top && e.data && e.data.__mailMutuelleHello === 1) { lastPosted = ''; refresh(true); }
      });
    }
    refresh(true);
    new MutationObserver(muts => {
      if (muts.every(m => isOurs(m.target))) return;
      schedule();
    }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['value', 'class', 'hidden', 'style'] });
    document.addEventListener('input', e => { if (!isOurs(e.target)) schedule(); }, true);
    document.addEventListener('change', e => { if (!isOurs(e.target)) schedule(); }, true);
    chrome.storage.onChanged.addListener(async (changes, area) => {
      if (area !== 'sync' && area !== 'managed') return;
      await loadState();
      lastPosted = '';
      refresh(true);
    });
  }

  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start, { once: true });
})();
