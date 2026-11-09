/*
 * Mail Mutuelle — fonctions partagées
 * Chargé par : le script injecté (content.js), la page de réglages (options.js)
 * et le service worker (background.js).
 */
(function (g) {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Valeurs par défaut                                                  */
  /* ------------------------------------------------------------------ */

  const DEFAULT_SETTINGS = {
    // Adresses du logiciel médical où le bouton doit apparaître (motifs Chrome)
    siteMatches: [],
    // Sélecteur CSS de l'élément après lequel insérer la barre (vide = barre flottante)
    anchorSelector: '',
    // Sélecteurs CSS facultatifs pour forcer la lecture d'un champ
    selectors: { nom: '', prenom: '', dateNaissance: '', nir: '', mutuelle: '' },
    // Compte Gmail à utiliser (adresse ou numéro 0, 1, 2…) — vide = compte par défaut
    gmailAccount: '',
    centreNom: '',
    signature: 'Le secrétariat\n{{nom_centre}}',
    // CRM (facultatif) : formulaires à préremplir — { id, nom (texte du bouton dans la barre), url, bouton (texte du bouton qui ouvre le formulaire) }
    crmTargets: [],
    // Fonctions activables dans les réglages
    features: { mailMutuelle: true, mailPatient: true, myDentalLab: false },
    v: 2
  };

  const DEFAULT_TEMPLATES = [
    {
      id: 'tpl-pec',
      dest: 'mutuelle',
      nom: 'Demande de prise en charge',
      objet: 'Demande de prise en charge — {{nom}} {{prenom}} — NIR {{nir}}',
      cc: '',
      corps:
        'Madame, Monsieur,\n\n' +
        'Nous vous prions de bien vouloir nous transmettre votre accord de prise en charge pour les soins prévus pour votre adhérent(e) :\n\n' +
        '- Nom : {{nom}}\n' +
        '- Prénom : {{prenom}}\n' +
        '- Date de naissance : {{date_naissance}}\n' +
        '- N° de sécurité sociale : {{nir}}\n' +
        '- Organisme complémentaire : {{mutuelle}}\n\n' +
        'Le devis correspondant est joint à ce message.\n\n' +
        'Dans l\'attente de votre retour, nous vous prions d\'agréer, Madame, Monsieur, nos salutations distinguées.\n\n' +
        '{{signature}}'
    },
    {
      id: 'tpl-devis',
      dest: 'mutuelle',
      nom: 'Envoi de devis',
      objet: 'Devis — {{nom}} {{prenom}} — NIR {{nir}}',
      cc: '',
      corps:
        'Madame, Monsieur,\n\n' +
        'Veuillez trouver ci-joint le devis établi le {{date_du_jour}} pour votre adhérent(e) :\n\n' +
        '- Nom : {{nom}}\n' +
        '- Prénom : {{prenom}}\n' +
        '- Date de naissance : {{date_naissance}}\n' +
        '- N° de sécurité sociale : {{nir}}\n\n' +
        'Nous vous remercions de nous indiquer le montant de votre participation.\n\n' +
        'Bien cordialement,\n\n' +
        '{{signature}}'
    },
    {
      id: 'tpl-droits',
      dest: 'mutuelle',
      nom: 'Régularisation de droits',
      objet: 'Régularisation de droits — {{nom}} {{prenom}} — NIR {{nir}}',
      cc: '',
      corps:
        'Madame, Monsieur,\n\n' +
        'Le tiers payant de votre adhérent(e) ci-dessous a été rejeté pour absence ou fin de droits :\n\n' +
        '- Nom : {{nom}}\n' +
        '- Prénom : {{prenom}}\n' +
        '- Date de naissance : {{date_naissance}}\n' +
        '- N° de sécurité sociale : {{nir}}\n' +
        '- Organisme complémentaire : {{mutuelle}}\n' +
        '- Date des soins : [à compléter]\n\n' +
        'Pourriez-vous vérifier sa situation et régulariser ses droits, ou nous indiquer l\'organisme compétent ?\n\n' +
        'Bien cordialement,\n\n' +
        '{{signature}}'
    }
  ];

  // Modèles adressés au patient (email lu sur la fiche)
  const DEFAULT_PATIENT_TEMPLATES = [
    {
      id: 'tpl-pat-devis',
      dest: 'patient',
      nom: 'Patient — Envoi de devis',
      objet: 'Votre devis — {{nom_centre}}',
      cc: '',
      corps:
        'Bonjour {{civilite}} {{nom}},\n\n' +
        'Suite à votre consultation, veuillez trouver ci-joint votre devis.\n\n' +
        'Nous vous conseillons de le transmettre à votre mutuelle afin de connaître sa participation. ' +
        'N\'hésitez pas à nous contacter pour toute question.\n\n' +
        'Bien cordialement,\n\n' +
        '{{signature}}'
    },
    {
      id: 'tpl-pat-mutuelle',
      dest: 'patient',
      nom: 'Patient — Demande d\'attestation de mutuelle',
      objet: 'Votre attestation de mutuelle — {{nom_centre}}',
      cc: '',
      corps:
        'Bonjour {{civilite}} {{nom}},\n\n' +
        'Afin de mettre à jour votre dossier et de pratiquer le tiers payant, pourriez-vous nous transmettre ' +
        'une copie de votre attestation de mutuelle en cours de validité (recto verso) en réponse à ce message ?\n\n' +
        'Merci par avance.\n\n' +
        'Bien cordialement,\n\n' +
        '{{signature}}'
    }
  ];

  // Noms courants : les adresses sont à renseigner par le centre dans les réglages.
  // « Mutuelle Exemple » sert uniquement à la page de démonstration (domaine fictif).
  const DEFAULT_MUTUELLES = [
    ['mut-exemple', 'Mutuelle Exemple', ['exemple', 'mutuelle exemple demo'], 'prise-en-charge@mutuelle-exemple.example'],
    ['mut-mgen', 'MGEN', ['mutuelle generale de l education nationale'], ''],
    ['mut-harmonie', 'Harmonie Mutuelle', ['harmonie'], ''],
    ['mut-malakoff', 'Malakoff Humanis', ['malakoff', 'humanis', 'malakoff mederic'], ''],
    ['mut-ag2r', 'AG2R La Mondiale', ['ag2r'], ''],
    ['mut-mutgen', 'La Mutuelle Générale', ['mutuelle generale'], ''],
    ['mut-axa', 'AXA', ['axa sante'], ''],
    ['mut-allianz', 'Allianz', ['allianz sante'], ''],
    ['mut-groupama', 'Groupama', ['groupama gan', 'gan sante'], ''],
    ['mut-swisslife', 'Swiss Life', ['swisslife'], ''],
    ['mut-alan', 'Alan', [], ''],
    ['mut-apivia', 'Apivia', ['apivia macif'], ''],
    ['mut-macif', 'Macif', [], ''],
    ['mut-maaf', 'MAAF', ['maaf sante'], ''],
    ['mut-matmut', 'Matmut', [], ''],
    ['mut-klesia', 'Klesia', [], ''],
    ['mut-probtp', 'PRO BTP', ['probtp'], ''],
    // Opérateurs de tiers payant : souvent affichés comme AMC à la place de la mutuelle
    ['op-almerys', 'Almerys', [], ''],
    ['op-viamedis', 'Viamedis', [], ''],
    ['op-isante', 'iSanté', ['isante'], ''],
    ['op-spsante', 'SP Santé', ['sp sante', 'spsante'], ''],
    ['op-kalixia', 'Kalixia', ['kalivia'], ''],
    ['op-santeclair', 'Santéclair', ['santeclair'], ''],
    ['op-carteblanche', 'Carte Blanche Partenaires', ['carte blanche'], '']
  ].map(([id, nom, alias, email]) => ({ id, nom, alias, email }));

  const PLACEHOLDERS = [
    { key: 'nom', label: 'Nom' },
    { key: 'prenom', label: 'Prénom' },
    { key: 'date_naissance', label: 'Date de naissance' },
    { key: 'nir', label: 'N° INSEE (NIR)' },
    { key: 'mutuelle', label: 'Mutuelle' },
    { key: 'date_du_jour', label: 'Date du jour' },
    { key: 'civilite', label: 'Civilité' },
    { key: 'email_patient', label: 'Email patient' },
    { key: 'nom_centre', label: 'Nom du centre' },
    { key: 'signature', label: 'Signature' }
  ];

  const SAMPLE_PATIENT = {
    nom: 'MARTIN',
    prenom: 'Claire',
    dateNaissance: '12/05/1985',
    nir: '2 85 05 78 006 084 41',
    mutuelle: 'Mutuelle Exemple',
    civilite: 'Madame',
    email: 'claire.martin@exemple.fr'
  };

  /* ------------------------------------------------------------------ */
  /* Texte                                                               */
  /* ------------------------------------------------------------------ */

  function clean(s) {
    return String(s == null ? '' : s).normalize('NFC').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
  }

  function normalize(s) {
    return clean(s)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function uid(prefix) {
    return (prefix || 'id') + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  /* ------------------------------------------------------------------ */
  /* NIR (numéro INSEE)                                                  */
  /* ------------------------------------------------------------------ */

  // Clé = 97 - (numéro sur 13 caractères modulo 97), Corse : 2A -> 19, 2B -> 18 puis -1 000 000 / -2 000 000
  function nirKey(n13) {
    const dep = n13.slice(5, 7).toUpperCase();
    let num;
    if (dep === '2A') num = BigInt(n13.slice(0, 5) + '19' + n13.slice(7)) - 1000000n;
    else if (dep === '2B') num = BigInt(n13.slice(0, 5) + '18' + n13.slice(7)) - 2000000n;
    else num = BigInt(n13);
    return Number(97n - (num % 97n));
  }

  /**
   * Lit un NIR (avec ou sans espaces/points/tirets).
   * Retourne { compact, formatted, hasKey, keyValid } ou null si le format est faux.
   */
  function parseNir(raw) {
    const compact = String(raw || '').toUpperCase().replace(/[\s.\- ]/g, '');
    const m = /^([1-478])(\d{2})(\d{2})(\d{2}|2A|2B)(\d{3})(\d{3})(\d{2})?$/.exec(compact);
    if (!m) return null;
    const n13 = compact.slice(0, 13);
    const hasKey = !!m[7];
    const keyValid = hasKey ? nirKey(n13) === Number(m[7]) : null;
    const formatted = [m[1], m[2], m[3], m[4], m[5], m[6], m[7]].filter(Boolean).join(' ');
    return { compact, formatted, hasKey, keyValid };
  }

  /* ------------------------------------------------------------------ */
  /* Dates                                                               */
  /* ------------------------------------------------------------------ */

  const MOIS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];

  /** Ramène une date au format JJ/MM/AAAA, ou '' si illisible. */
  function normalizeDate(raw) {
    const s = clean(raw);
    let d, mo, y, m;
    if ((m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})\b/.exec(s))) [, d, mo, y] = m;
    else if ((m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s))) [, y, mo, d] = m;
    else if ((m = /^(\d{1,2})(?:er)?\s+([a-zéû]+)\.?\s+(\d{4})$/i.exec(s))) {
      const idx = MOIS.findIndex(x => x.startsWith(normalize(m[2]).slice(0, 3)));
      if (idx < 0) return '';
      d = m[1]; mo = idx + 1; y = m[3];
    } else return '';
    d = Number(d); mo = Number(mo); y = Number(y);
    const dt = new Date(y, mo - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return '';
    if (y < 1890 || dt > new Date()) return '';
    return String(d).padStart(2, '0') + '/' + String(mo).padStart(2, '0') + '/' + y;
  }

  function today() {
    return new Date().toLocaleDateString('fr-FR');
  }

  /* ------------------------------------------------------------------ */
  /* Annuaire des mutuelles                                              */
  /* ------------------------------------------------------------------ */

  const STOP = new Set(['mutuelle', 'mutuelles', 'sante', 'assurance', 'assurances', 'groupe', 'la', 'le', 'les', 'de', 'du', 'des', 'et', 'sa', 'mutualiste', 'complementaire', 'prevoyance']);

  function keyTokens(s) {
    return normalize(s).split(' ').filter(t => t && !STOP.has(t));
  }

  /**
   * Trouve la mutuelle de l'annuaire qui correspond au nom lu sur la fiche.
   * Retourne { mutuelle, score } ou null.
   */
  function matchMutuelle(nameOnFile, mutuelles) {
    const target = normalize(nameOnFile);
    if (!target) return null;
    const padded = ' ' + target + ' ';
    const targetTokens = keyTokens(nameOnFile);
    let best = null;

    for (const mut of mutuelles || []) {
      const names = [mut.nom].concat(mut.alias || []).map(normalize).filter(Boolean);
      let score = 0;
      for (const n of names) {
        if (n === target) score = Math.max(score, 100);
        else if (n.length >= 3 && padded.includes(' ' + n + ' ')) score = Math.max(score, 70 + Math.min(n.length, 25));
        else if (target.length >= 3 && (' ' + n + ' ').includes(' ' + target + ' ')) score = Math.max(score, 60 + Math.min(target.length, 20));
        else {
          const nt = keyTokens(n);
          if (nt.length && targetTokens.length) {
            const common = nt.filter(t => targetTokens.includes(t)).length;
            const jac = common / new Set(nt.concat(targetTokens)).size;
            if (jac >= 0.5) score = Math.max(score, Math.round(50 * jac + 10));
          }
        }
      }
      if (score > (best ? best.score : 0)) best = { mutuelle: mut, score };
    }
    return best && best.score >= 35 ? best : null;
  }

  /* ------------------------------------------------------------------ */
  /* Modèles & Gmail                                                     */
  /* ------------------------------------------------------------------ */

  const MISSING = '[à compléter]';

  function buildVars(patient, settings) {
    const base = {
      civilite: clean(patient.civilite),
      email_patient: clean(patient.email),
      nom: clean(patient.nom),
      prenom: clean(patient.prenom),
      date_naissance: clean(patient.dateNaissance),
      nir: clean(patient.nir),
      mutuelle: clean(patient.mutuelle),
      date_du_jour: today(),
      nom_centre: clean(settings.centreNom)
    };
    base.signature = fillTemplate(settings.signature || '', base, { keepEmpty: true }).replace(/\n+$/, '');
    return base;
  }

  /** Remplace les {{variables}} ; une variable inconnue est laissée telle quelle. */
  function fillTemplate(text, vars, opts) {
    const keepEmpty = opts && opts.keepEmpty;
    return String(text || '').replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (whole, key) => {
      key = key.toLowerCase();
      if (!(key in vars)) return whole;
      const v = vars[key];
      if (v) return v;
      return keepEmpty || ['signature', 'nom_centre', 'civilite'].includes(key) ? '' : MISSING;
    }).replace(/([^\s]) {2,}/g, '$1 ') // « Bonjour  DUPONT » quand la civilité est absente
      .replace(/ [—–-] *$/gm, '');        // « Votre devis — » quand le nom du centre est vide
  }

  function buildGmailUrl({ to, cc, subject, body, account }) {
    const acct = clean(account).replace(/[^\w.@+\-]/g, '');
    const parts = ['view=cm', 'fs=1', 'tf=1'];
    if (to) parts.push('to=' + encodeURIComponent(to));
    if (cc) parts.push('cc=' + encodeURIComponent(cc));
    parts.push('su=' + encodeURIComponent(subject || ''));
    parts.push('body=' + encodeURIComponent(body || ''));
    return 'https://mail.google.com/mail/' + (acct ? 'u/' + acct + '/' : '') + '?' + parts.join('&');
  }

  function isValidEmailList(s) {
    const list = String(s || '').split(/[,;]/).map(x => x.trim()).filter(Boolean);
    return list.every(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  }

  /* ------------------------------------------------------------------ */
  /* Adresses du logiciel (motifs Chrome)                                */
  /* ------------------------------------------------------------------ */

  function isValidMatchPattern(p) {
    return /^(https?|\*):\/\/(\*|\*\.[^\/*:]+|[^\/*:]+)(:\d+)?\/.*$/.test(String(p || ''));
  }

  /** « app.logiciel.fr » ou « https://app.logiciel.fr/patients/12 » -> « https://app.logiciel.fr/* » */
  function toMatchPattern(input) {
    let s = clean(input);
    if (!s) return '';
    if (s.includes('*') && isValidMatchPattern(s)) return s; // motif déjà écrit à la main
    // Une adresse de page -> tout le site (les pages d'une app web changent sans recharger)
    if (!/^[a-z*]+:\/\//i.test(s)) s = 'https://' + s;
    try {
      const u = new URL(s.replace('://*.', '://wildcard-placeholder.'));
      const host = u.host.replace('wildcard-placeholder.', '*.');
      return u.protocol + '//' + host + '/*';
    } catch (e) {
      return '';
    }
  }

  /* ------------------------------------------------------------------ */
  /* Stockage (chrome.storage.sync, un élément par clé pour le quota)     */
  /* ------------------------------------------------------------------ */

  const ITEM_MAX = 8000; // marge sous la limite de 8 192 octets par élément

  function itemSize(key, value) {
    return new TextEncoder().encode(key + JSON.stringify(value)).length;
  }

  function mergeSettings(saved) {
    const s = Object.assign({}, DEFAULT_SETTINGS, saved || {});
    s.selectors = Object.assign({}, DEFAULT_SETTINGS.selectors, (saved && saved.selectors) || {});
    s.siteMatches = Array.isArray(s.siteMatches) ? s.siteMatches : [];
    s.crmTargets = Array.isArray(s.crmTargets) ? s.crmTargets.filter(t => t && t.url) : [];
    s.features = Object.assign({}, DEFAULT_SETTINGS.features, (saved && saved.features) || {});
    s.v = (saved && saved.v) || 1; // absent = réglages d'une version antérieure (migration)
    return s;
  }

  /** Réglages propres au poste (chrome.storage.sync). */
  async function loadLocal() {
    const all = await chrome.storage.sync.get(null);
    return {
      initialized: !!all.settings,
      rawSettings: all.settings || null,
      settings: mergeSettings(all.settings),
      templates: (all.tplIndex || []).map(id => all['tpl_' + id]).filter(Boolean),
      mutuelles: (all.mutIndex || []).map(id => all['mut_' + id]).filter(Boolean)
    };
  }

  /** Configuration du centre envoyée par la console Google / stratégie Chrome (lecture seule). */
  async function loadManaged() {
    try {
      const m = await chrome.storage.managed.get(null);
      const active = !!m && ['settings', 'templates', 'mutuelles', 'adminEmail'].some(k => m[k] != null);
      return active ? m : null;
    } catch (e) {
      return null; // pas de configuration du centre sur ce poste
    }
  }

  const strArr = a => (Array.isArray(a) ? a.filter(x => typeof x === 'string') : []);

  /**
   * Fusion « centre » + « poste » :
   * - les réglages présents dans la configuration du centre sont imposés (verrouillés) ;
   * - modèles et mutuelles du centre sont en lecture seule, le poste peut seulement en AJOUTER
   *   (et renseigner l'adresse d'une mutuelle du centre qui n'en a pas).
   */
  async function loadAll() {
    const local = await loadLocal();
    const man = await loadManaged();
    if (!man) {
      return Object.assign(local, {
        managed: null,
        templates: local.templates.map(t => Object.assign({}, t, { origin: 'local' })),
        mutuelles: local.mutuelles.map(m => Object.assign({}, m, { origin: 'local' }))
      });
    }
    const ms = (man.settings && typeof man.settings === 'object') ? man.settings : {};
    const lockedSettings = Object.keys(ms);
    const settings = mergeSettings(Object.assign({}, local.rawSettings || {}, ms, { v: (local.rawSettings && local.rawSettings.v) || 2 }));
    if (ms.features) settings.features = Object.assign({}, DEFAULT_SETTINGS.features, ms.features);
    const allowMut = man.allowLocalMutuelles !== false;
    const allowTpl = man.allowLocalTemplates !== false;

    let templates;
    if (Array.isArray(man.templates)) {
      const centre = man.templates.filter(t => t && t.id).map(t => ({
        id: String(t.id), dest: t.dest === 'patient' ? 'patient' : 'mutuelle', nom: String(t.nom || ''), objet: String(t.objet || ''),
        cc: String(t.cc || ''), corps: String(t.corps || ''), origin: 'centre'
      }));
      const ids = new Set(centre.map(t => t.id));
      const extra = allowTpl ? local.templates.filter(t => !ids.has(t.id)).map(t => Object.assign({}, t, { origin: 'local' })) : [];
      templates = centre.concat(extra);
    } else {
      templates = local.templates.map(t => Object.assign({}, t, { origin: 'local' }));
    }

    let mutuelles;
    if (Array.isArray(man.mutuelles)) {
      const byId = new Map(local.mutuelles.map(m => [m.id, m]));
      const centre = man.mutuelles.filter(m => m && m.nom).map(m => {
        const c = { id: String(m.id || ('c-' + normalize(m.nom).replace(/ /g, '-'))), nom: String(m.nom), alias: strArr(m.alias),
          email: String(m.email || ''), origin: 'centre', centreEmail: String(m.email || '') };
        const l = byId.get(c.id);
        if (allowMut && !c.email && l && l.email) { c.email = l.email; c.localEmail = true; } // adresse renseignée sur le poste
        return c;
      });
      const ids = new Set(centre.map(m => m.id));
      const names = new Set(centre.map(m => normalize(m.nom)));
      const extra = allowMut
        ? local.mutuelles.filter(m => !ids.has(m.id) && !names.has(normalize(m.nom))).map(m => Object.assign({}, m, { origin: 'local' }))
        : [];
      mutuelles = centre.concat(extra);
    } else {
      mutuelles = local.mutuelles.map(m => Object.assign({}, m, { origin: 'local' }));
    }

    return {
      initialized: local.initialized,
      settings, templates, mutuelles,
      managed: {
        lockedSettings,
        templatesLocked: Array.isArray(man.templates),
        mutuellesLocked: Array.isArray(man.mutuelles),
        allowLocalMutuelles: allowMut,
        allowLocalTemplates: allowTpl,
        adminEmail: typeof man.adminEmail === 'string' ? man.adminEmail : ''
      }
    };
  }

  /** Ce que le poste enregistre lui-même : uniquement ses ajouts (jamais les entrées du centre). */
  function localPart(kind, items) {
    const strip = o => { const c = Object.assign({}, o); delete c.origin; delete c.centreEmail; delete c.localEmail; return c; };
    if (kind === 'tpl') return items.filter(t => t.origin !== 'centre').map(strip);
    return items.filter(m => m.origin !== 'centre').map(strip)
      .concat(items.filter(m => m.origin === 'centre' && !m.centreEmail && m.email)
        .map(m => ({ id: m.id, nom: m.nom, alias: [], email: m.email })));
  }

  /**
   * Configuration au format attendu par la console Google
   * (Appareils > Chrome > Applications et extensions > « Règle pour les extensions »).
   */
  function toAdminConsolePolicy({ settings, templates, mutuelles, adminEmail, allowLocalMutuelles, allowLocalTemplates }) {
    const pick = (o, keys) => keys.reduce((r, k) => (o[k] !== undefined ? Object.assign(r, { [k]: o[k] }) : r), {});
    const st = pick(settings, ['siteMatches', 'anchorSelector', 'selectors', 'gmailAccount', 'centreNom', 'signature', 'crmTargets', 'features']);
    const value = {
      adminEmail: adminEmail || '',
      allowLocalMutuelles: allowLocalMutuelles !== false,
      allowLocalTemplates: allowLocalTemplates !== false,
      settings: st,
      templates: templates.map(t => pick(t, ['id', 'dest', 'nom', 'objet', 'cc', 'corps'])),
      mutuelles: mutuelles.map(m => ({ id: m.id, nom: m.nom, alias: m.alias || [], email: m.email || '' }))
    };
    const wrapped = {};
    for (const [k, v] of Object.entries(value)) wrapped[k] = { Value: v };
    return wrapped;
  }

  async function saveCollection(kind, items) {
    const idxKey = kind + 'Index';
    const old = (await chrome.storage.sync.get(idxKey))[idxKey] || [];
    const ids = items.map(i => i.id);
    const payload = { [idxKey]: ids };
    for (const it of items) {
      const k = kind + '_' + it.id;
      if (itemSize(k, it) > ITEM_MAX) {
        throw new Error('« ' + (it.nom || it.id) + ' » est trop long pour être enregistré (limite Chrome d\'environ 8 000 caractères par élément).');
      }
      payload[k] = it;
    }
    await chrome.storage.sync.set(payload);
    const toRemove = old.filter(id => !ids.includes(id)).map(id => kind + '_' + id);
    if (toRemove.length) await chrome.storage.sync.remove(toRemove);
  }

  async function saveSettings(settings) {
    await chrome.storage.sync.set({ settings: mergeSettings(settings) });
  }

  async function ensureDefaults() {
    const man = await loadManaged();
    const loc = await loadLocal();
    if (man && !loc.initialized) {
      // Poste géré par le centre : rien à recopier, le poste ne garde que ses propres ajouts
      await saveCollection('tpl', Array.isArray(man.templates) ? [] : DEFAULT_TEMPLATES.concat(DEFAULT_PATIENT_TEMPLATES));
      await saveCollection('mut', Array.isArray(man.mutuelles) ? [] : DEFAULT_MUTUELLES);
      await saveSettings(DEFAULT_SETTINGS);
      return loadAll();
    }
    const data = await loadAll();
    if (data.initialized) {
      // Réglages créés par une version précédente : on ajoute les nouveautés sans rien écraser
      if ((loc.settings.v || 1) < 2) {
        if (!loc.templates.some(t => t.dest === 'patient') && !(man && Array.isArray(man.templates))) {
          await saveCollection('tpl', loc.templates.concat(DEFAULT_PATIENT_TEMPLATES.filter(t => !loc.templates.some(x => x.id === t.id))));
        }
        await saveSettings(Object.assign({}, loc.settings, { v: 2 }));
        return loadAll();
      }
      return data;
    }
    await saveCollection('tpl', DEFAULT_TEMPLATES.concat(DEFAULT_PATIENT_TEMPLATES));
    await saveCollection('mut', DEFAULT_MUTUELLES);
    await saveSettings(DEFAULT_SETTINGS);
    return loadAll();
  }

  g.MailMutuelle = {
    DEFAULT_SETTINGS, DEFAULT_TEMPLATES, DEFAULT_PATIENT_TEMPLATES, DEFAULT_MUTUELLES, PLACEHOLDERS, SAMPLE_PATIENT, MISSING,
    clean, normalize, uid, parseNir, nirKey, normalizeDate, today,
    matchMutuelle, buildVars, fillTemplate, buildGmailUrl, isValidEmailList,
    isValidMatchPattern, toMatchPattern,
    loadAll, loadLocal, loadManaged, localPart, toAdminConsolePolicy, saveCollection, saveSettings, ensureDefaults, mergeSettings, itemSize, ITEM_MAX
  };
})(globalThis);
