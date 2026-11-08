/* Mail Mutuelle — page de réglages */
(() => {
  'use strict';
  const M = globalThis.MailMutuelle;
  const $ = id => document.getElementById(id);

  let settings, templates, mutuelles;
  let managed = null;       // configuration du centre (null = poste libre)
  let localRaw = {};        // réglages propres au poste
  const isLocked = key => !!(managed && managed.lockedSettings.includes(key));
  const canAddMut = () => !managed || !managed.mutuellesLocked || managed.allowLocalMutuelles;
  const canAddTpl = () => !managed || !managed.templatesLocked || managed.allowLocalTemplates;
  let currentTpl = null;
  let dirty = false;
  let ignoreChangesUntil = 0; // nos propres enregistrements ne doivent pas recharger la page

  const SEL_LABELS = { nom: 'Nom', prenom: 'Prénom', dateNaissance: 'Date de naissance', nir: 'N° INSEE (NIR)', mutuelle: 'Mutuelle' };

  /* ---------------- état « modifié / enregistré » ---------------- */

  function setStatus(text, cls) {
    const s = $('saveStatus');
    s.textContent = text;
    s.className = 'save-status ' + (cls || '');
  }

  function markDirty() {
    dirty = true;
    $('saveBtn').disabled = false;
    setStatus('Modifications non enregistrées', 'dirty');
  }

  window.addEventListener('beforeunload', e => {
    if (dirty) { e.preventDefault(); e.returnValue = ''; }
  });

  /* ---------------- onglets ---------------- */

  document.querySelectorAll('.tabs button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-selected', String(b === btn)));
      document.querySelectorAll('.tab').forEach(t => { t.hidden = t.id !== 'tab-' + btn.dataset.tab; });
      if (btn.dataset.tab === 'logiciel') renderSites();
      if (btn.dataset.tab === 'sauvegarde') renderQuota();
    });
  });

  /* ---------------- modèles ---------------- */

  function renderTplList() {
    const ul = $('tplList');
    ul.replaceChildren();
    for (const t of templates) {
      const li = document.createElement('li');
      li.textContent = t.nom || '(sans nom)';
      const tag = document.createElement('span');
      tag.className = 'dest';
      tag.textContent = t.dest === 'patient' ? '→ patient' : '→ mutuelle';
      li.append(tag);
      if (managed) {
        const o = document.createElement('span');
        o.className = 'orig' + (t.origin === 'centre' ? '' : ' local');
        o.textContent = t.origin === 'centre' ? 'Centre' : 'Poste';
        li.append(o);
      }
      if (currentTpl && t.id === currentTpl.id) li.className = 'active';
      li.addEventListener('click', () => { currentTpl = t; renderTplList(); renderTplEditor(); });
      ul.append(li);
    }
  }

  function renderTplEditor() {
    const on = !!currentTpl;
    $('tplEditor').style.opacity = on ? '1' : '.4';
    const ro = on && currentTpl.origin === 'centre';
    ['tplNom', 'tplDest', 'tplObjet', 'tplCc', 'tplCorps', 'tplUp', 'tplDown', 'tplDel'].forEach(id => { $(id).disabled = !on || ro; });
    $('tplDup').disabled = !on || !canAddTpl();
    $('tplAdd').disabled = !canAddTpl();
    $('chips').querySelectorAll('button').forEach(b => { b.disabled = !on || ro; });
    $('tplLockNote').hidden = !ro;
    $('tplPropose').hidden = !(managed && on && !ro);
    $('tplNom').value = on ? currentTpl.nom : '';
    $('tplDest').value = on && currentTpl.dest === 'patient' ? 'patient' : 'mutuelle';
    $('tplObjet').value = on ? currentTpl.objet : '';
    $('tplCc').value = on ? (currentTpl.cc || '') : '';
    $('tplCorps').value = on ? currentTpl.corps : '';
    $('tplCc').classList.toggle('invalid', on && !!currentTpl.cc && !M.isValidEmailList(currentTpl.cc));
    renderPreview();
  }

  function renderPreview() {
    if (!currentTpl) { $('pvObjet').textContent = ''; $('pvCorps').textContent = ''; return; }
    const vars = M.buildVars(M.SAMPLE_PATIENT, readSettingsFromForm());
    $('pvObjet').textContent = M.fillTemplate(currentTpl.objet, vars);
    $('pvCorps').textContent = M.fillTemplate(currentTpl.corps, vars);
  }

  $('tplDest').addEventListener('change', () => {
    if (!currentTpl) return;
    currentTpl.dest = $('tplDest').value;
    renderTplList(); markDirty();
  });

  [['tplNom', 'nom'], ['tplObjet', 'objet'], ['tplCc', 'cc'], ['tplCorps', 'corps']].forEach(([id, key]) => {
    $(id).addEventListener('input', () => {
      if (!currentTpl) return;
      currentTpl[key] = $(id).value;
      if (key === 'nom') renderTplList();
      if (key === 'cc') $('tplCc').classList.toggle('invalid', !!currentTpl.cc && !M.isValidEmailList(currentTpl.cc));
      renderPreview();
      markDirty();
    });
  });

  // Insertion d'une variable à l'endroit du curseur (dans l'objet ou le message)
  let lastField = 'tplCorps';
  ['tplObjet', 'tplCorps'].forEach(id => $(id).addEventListener('focus', () => { lastField = id; }));
  for (const p of M.PLACEHOLDERS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = p.label;
    b.title = '{{' + p.key + '}}';
    b.addEventListener('mousedown', e => e.preventDefault()); // garde le curseur dans le champ
    b.addEventListener('click', () => {
      if (!currentTpl) return;
      const f = $(lastField);
      const ins = '{{' + p.key + '}}';
      const s = f.selectionStart ?? f.value.length, e = f.selectionEnd ?? f.value.length;
      f.value = f.value.slice(0, s) + ins + f.value.slice(e);
      f.focus();
      f.setSelectionRange(s + ins.length, s + ins.length);
      f.dispatchEvent(new Event('input'));
    });
    $('chips').append(b);
  }

  $('tplAdd').addEventListener('click', () => {
    currentTpl = { origin: 'local', id: M.uid('tpl'), dest: 'mutuelle', nom: 'Nouveau modèle', objet: '{{nom}} {{prenom}} — NIR {{nir}}', cc: '', corps: 'Madame, Monsieur,\n\n\n\nBien cordialement,\n\n{{signature}}' };
    templates.push(currentTpl);
    renderTplList(); renderTplEditor(); markDirty();
    $('tplNom').select();
  });
  $('tplDup').addEventListener('click', () => {
    if (!currentTpl) return;
    currentTpl = Object.assign({}, currentTpl, { id: M.uid('tpl'), nom: currentTpl.nom + ' (copie)', origin: 'local' });
    templates.push(currentTpl);
    renderTplList(); renderTplEditor(); markDirty();
  });
  $('tplDel').addEventListener('click', () => {
    if (!currentTpl || !confirm('Supprimer le modèle « ' + currentTpl.nom + ' » ?')) return;
    const i = templates.indexOf(currentTpl);
    templates.splice(i, 1);
    currentTpl = templates[Math.min(i, templates.length - 1)] || null;
    renderTplList(); renderTplEditor(); markDirty();
  });
  function moveTpl(d) {
    const i = templates.indexOf(currentTpl), j = i + d;
    if (i < 0 || j < 0 || j >= templates.length) return;
    [templates[i], templates[j]] = [templates[j], templates[i]];
    renderTplList(); markDirty();
  }
  $('tplUp').addEventListener('click', () => moveTpl(-1));
  $('tplDown').addEventListener('click', () => moveTpl(1));

  /* ---------------- mutuelles ---------------- */

  function renderMutuelles() {
    const q = M.normalize($('mutSearch').value);
    const body = $('mutBody');
    body.replaceChildren();
    const list = mutuelles.filter(m => !q || M.normalize([m.nom].concat(m.alias || []).join(' ') + ' ' + m.email).includes(q));
    for (const m of list) {
      const tr = document.createElement('tr');
      if (!m.email) tr.className = 'no-email';
      const centre = m.origin === 'centre';
      const cell = (value, placeholder, onInput, type, disabled) => {
        const td = document.createElement('td');
        const inp = document.createElement('input');
        inp.type = type || 'text';
        inp.value = value;
        inp.placeholder = placeholder;
        inp.disabled = !!disabled;
        inp.addEventListener('input', () => { onInput(inp); markDirty(); });
        td.append(inp);
        return td;
      };
      tr.append(
        cell(m.nom, 'Nom', inp => { m.nom = inp.value; inp.classList.toggle('invalid', !inp.value.trim()); }, 'text', centre),
        cell((m.alias || []).join(', '), 'ex. sigle, ancien nom', inp => {
          m.alias = inp.value.split(',').map(s => s.trim()).filter(Boolean);
        }, 'text', centre),
        cell(m.email, centre && !m.centreEmail ? 'adresse à renseigner (poste)' : 'adresse à renseigner', inp => {
          m.email = inp.value.trim();
          m.localEmail = centre && !!m.email;
          inp.classList.toggle('invalid', !!m.email && !M.isValidEmailList(m.email));
          tr.className = m.email ? '' : 'no-email';
          renderMutCount();
        }, 'text', centre && (!!m.centreEmail || !managed.allowLocalMutuelles))
      );
      const tdDel = document.createElement('td');
      tdDel.className = 'actions';
      if (managed) {
        const b = document.createElement('span');
        b.className = 'badge ' + (centre ? 'centre' : 'local');
        b.textContent = centre ? (m.localEmail ? 'Centre + adresse poste' : 'Centre') : 'Poste';
        tdDel.append(b, document.createTextNode(' '));
        if (!centre || m.localEmail) {
          const pr = document.createElement('button');
          pr.textContent = 'Proposer'; pr.title = 'Proposer cet ajout au centre (email à l\'administrateur)';
          pr.addEventListener('click', () => proposeMutuelle(m));
          tdDel.append(pr);
        }
      }
      const del = document.createElement('button');
      del.className = 'danger';
      del.textContent = 'Supprimer';
      del.hidden = centre;
      del.addEventListener('click', () => {
        if (!confirm('Supprimer « ' + (m.nom || 'cette mutuelle') + ' » de l\'annuaire ?')) return;
        mutuelles.splice(mutuelles.indexOf(m), 1);
        renderMutuelles(); markDirty();
      });
      tdDel.append(del);
      tr.append(tdDel);
      body.append(tr);
    }
    renderMutCount();
    renderMutTest();
  }

  function renderMutCount() {
    const missing = mutuelles.filter(m => !m.email).length;
    $('mutCount').textContent = mutuelles.length + ' mutuelle(s)' + (missing ? ' — ' + missing + ' sans adresse' : '');
  }

  function renderMutTest() {
    const v = $('mutTest').value;
    const out = $('mutTestResult');
    out.replaceChildren();
    if (!v.trim()) return;
    const r = M.matchMutuelle(v, mutuelles);
    const span = document.createElement('span');
    if (r) {
      span.className = r.mutuelle.email ? 'ok' : 'ko';
      span.textContent = '→ ' + r.mutuelle.nom + (r.mutuelle.email ? ' : ' + r.mutuelle.email : ' (adresse non renseignée)');
    } else {
      span.className = 'ko';
      span.textContent = 'Aucune correspondance : ajoutez ce nom dans « autres noms » de la bonne mutuelle.';
    }
    out.append(span);
  }

  $('mutSearch').addEventListener('input', renderMutuelles);
  $('mutTest').addEventListener('input', renderMutTest);
  /* ---------------- propositions au centre ---------------- */
  function proposeByMail(subject, body) {
    const to = (managed && managed.adminEmail) || '';
    if (!to && !confirm('Aucune adresse administrateur n\'est configurée par le centre. Ouvrir quand même le message (destinataire à saisir) ?')) return;
    const url = M.buildGmailUrl({ to, subject, body, account: settings.gmailAccount });
    window.open(url, '_blank', 'noopener');
  }
  function proposeMutuelle(m) {
    const entry = { id: m.id, nom: m.nom, alias: m.alias || [], email: m.email };
    proposeByMail('Mail Mutuelle — proposition pour l\'annuaire : ' + m.nom,
      'Bonjour,\n\nJe propose ' + (m.origin === 'centre' ? 'd\'ajouter l\'adresse de cette mutuelle' : 'd\'ajouter cette mutuelle') + ' à l\'annuaire du centre :\n\n' +
      '- Nom : ' + m.nom + '\n- Autres noms : ' + ((m.alias || []).join(', ') || '—') + '\n- Email : ' + (m.email || '—') + '\n\n' +
      'Si c\'est validé, pensez à la mettre à jour dans la configuration du centre (console Google).\n\n' +
      'Pour l\'administrateur (format de la configuration) :\n' + JSON.stringify(entry));
  }
  function proposeTemplate(t) {
    const entry = { id: t.id, dest: t.dest || 'mutuelle', nom: t.nom, objet: t.objet, cc: t.cc || '', corps: t.corps };
    proposeByMail('Mail Mutuelle — proposition de modèle : ' + t.nom,
      'Bonjour,\n\nJe propose d\'ajouter ce modèle aux modèles du centre :\n\n' +
      'Nom : ' + t.nom + '\nDestinataire : ' + (t.dest === 'patient' ? 'patient' : 'mutuelle') + '\nObjet : ' + t.objet + '\n\n' + t.corps + '\n\n' +
      '—\nPour l\'administrateur (format de la configuration) :\n' + JSON.stringify(entry));
  }
  $('tplPropose').addEventListener('click', () => { if (currentTpl) proposeTemplate(currentTpl); });

  $('mutAdd').addEventListener('click', () => {
    mutuelles.unshift({ id: M.uid('mut'), nom: '', alias: [], email: '', origin: 'local' });
    $('mutSearch').value = '';
    renderMutuelles(); markDirty();
    const first = $('mutBody').querySelector('input');
    if (first) first.focus();
  });

  /* ---------------- logiciel ---------------- */

  async function renderSites() {
    const ul = $('siteList');
    ul.replaceChildren();
    if (!settings.siteMatches.length) {
      const li = document.createElement('li');
      li.innerHTML = '<span class="muted">Aucune adresse : la barre n\'apparaîtra que sur la page de démonstration.</span>';
      ul.append(li);
    }
    for (const p of settings.siteMatches) {
      const ok = await chrome.permissions.contains({ origins: [p] }).catch(() => false);
      const li = document.createElement('li');
      const code = document.createElement('code'); code.textContent = p;
      const badge = document.createElement('span');
      badge.className = 'badge ' + (ok ? 'ok' : 'ko');
      badge.textContent = ok ? 'Autorisé' : 'Non autorisé';
      li.append(code, badge);
      if (!ok) {
        const grant = document.createElement('button');
        grant.textContent = 'Autoriser';
        grant.addEventListener('click', async () => {
          await chrome.permissions.request({ origins: [p] }).catch(() => false);
          renderSites();
        });
        li.append(grant);
      }
      const del = document.createElement('button');
      del.className = 'danger';
      del.textContent = 'Retirer';
      del.addEventListener('click', async () => {
        settings.siteMatches = settings.siteMatches.filter(x => x !== p);
        // on garde l'autorisation si un formulaire CRM utilise le même site
        if (!crmPatterns().includes(p)) await chrome.permissions.remove({ origins: [p] }).catch(() => {});
        ignoreChangesUntil = Date.now() + 3000;
        await M.saveSettings(settingsToSave(settings));
        renderSites();
      });
      li.append(del);
      ul.append(li);
    }
    if (managed) applyLocks();
  }

  $('siteAdd').addEventListener('click', async () => {
    const p = M.toMatchPattern($('siteInput').value);
    if (!p) { alert('Adresse non reconnue. Exemple : https://app.monlogiciel.fr'); return; }
    // La demande d'autorisation doit partir directement du clic
    const granted = await chrome.permissions.request({ origins: [p] }).catch(err => { alert(String(err.message || err)); return false; });
    if (!settings.siteMatches.includes(p)) settings.siteMatches.push(p);
    ignoreChangesUntil = Date.now() + 3000;
    await M.saveSettings(settingsToSave(Object.assign(readSettingsFromForm(), { siteMatches: settings.siteMatches })));
    $('siteInput').value = '';
    renderSites();
    setStatus(granted ? 'Site ajouté : rechargez l\'onglet du logiciel.' : 'Site ajouté, mais l\'autorisation a été refusée.', granted ? 'ok' : 'err');
  });

  function renderSelectors() {
    const g = $('selGrid');
    g.replaceChildren();
    for (const [k, label] of Object.entries(SEL_LABELS)) {
      const lab = document.createElement('span'); lab.textContent = label;
      const inp = document.createElement('input');
      inp.type = 'text'; inp.id = 'sel-' + k; inp.placeholder = 'détection automatique';
      inp.value = settings.selectors[k] || '';
      inp.addEventListener('input', () => { inp.classList.toggle('invalid', !validSelector(inp.value)); markDirty(); });
      g.append(lab, inp);
    }
    if (managed) applyLocks();
  }

  function validSelector(s) {
    if (!s.trim()) return true;
    try { document.createDocumentFragment().querySelector(s); return true; } catch (e) { return false; }
  }

  /* ---------------- formulaire réglages ---------------- */

  function fillSettingsForm() {
    $('anchorSelector').value = settings.anchorSelector;
    $('gmailAccount').value = settings.gmailAccount;
    $('centreNom').value = settings.centreNom;
    $('signature').value = settings.signature;
    crmTargets = JSON.parse(JSON.stringify(settings.crmTargets || []));
    features = Object.assign({}, settings.features);
    renderSelectors();
    renderCrm();
    renderFeatures();
  }

  function readSettingsFromForm() {
    const s = Object.assign({}, settings);
    s.anchorSelector = $('anchorSelector').value.trim();
    s.gmailAccount = $('gmailAccount').value.trim();
    s.centreNom = $('centreNom').value.trim();
    s.signature = $('signature').value;
    s.crmTargets = crmTargets.map(t => ({ id: t.id, nom: (t.nom || '').trim() || 'CRM', url: (t.url || '').trim(), bouton: (t.bouton || '').trim() || 'Nouveau devis', actif: t.actif !== false }))
      .filter(t => t.url);
    s.features = Object.assign({}, features);
    s.selectors = {};
    for (const k of Object.keys(SEL_LABELS)) {
      const inp = $('sel-' + k);
      s.selectors[k] = inp ? inp.value.trim() : (settings.selectors[k] || '');
    }
    return s;
  }

  /* ---------------- fonctions activables ---------------- */
  let features = {};
  function renderFeatures() {
    $('featMailMutuelle').checked = features.mailMutuelle !== false;
    $('featMailPatient').checked = features.mailPatient !== false;
    const box = $('featCrm');
    box.replaceChildren();
    if (!crmTargets.length) {
      const p = document.createElement('p');
      p.className = 'muted'; p.textContent = 'Aucun formulaire CRM configuré.';
      box.append(p);
    }
    for (const t of crmTargets) {
      const row = document.createElement('label');
      row.className = 'switch-row';
      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.checked = t.actif !== false;
      cb.addEventListener('change', () => { t.actif = cb.checked; markDirty(); renderCrm(); });
      const sw = document.createElement('span'); sw.className = 'sw';
      const txt = document.createElement('span');
      const b = document.createElement('b'); b.textContent = '＋ ' + (t.nom || '(sans nom)');
      const small = document.createElement('small'); small.textContent = t.url || 'adresse non renseignée';
      txt.append(b, small);
      row.append(cb, sw, txt);
      box.append(row);
    }
    if (managed) applyLocks();
  }
  $('featMailMutuelle').addEventListener('change', e => { features.mailMutuelle = e.target.checked; markDirty(); });
  $('featMailPatient').addEventListener('change', e => { features.mailPatient = e.target.checked; markDirty(); });

  /* ---------------- formulaires CRM ---------------- */
  let crmTargets = [];
  const crmPatterns = () => [...new Set(crmTargets.map(t => /^https:\/\//.test((t.url || '').trim()) ? M.toMatchPattern(t.url) : '').filter(Boolean))];

  function renderCrm() {
    const body = $('crmBody');
    body.replaceChildren();
    for (const t of crmTargets) {
      const tr = document.createElement('tr');
      const cell = (key, ph) => {
        const td = document.createElement('td');
        const inp = document.createElement('input');
        inp.type = 'text'; inp.value = t[key] || ''; inp.placeholder = ph;
        inp.addEventListener('input', () => { t[key] = inp.value; markDirty(); if (key === 'url') renderCrmStatus(); renderFeatures(); });
        td.append(inp);
        return td;
      };
      const td = document.createElement('td');
      const del = document.createElement('button');
      del.className = 'danger'; del.textContent = 'Supprimer';
      del.addEventListener('click', () => { crmTargets.splice(crmTargets.indexOf(t), 1); renderCrm(); renderFeatures(); markDirty(); });
      td.append(del);
      const tdOn = document.createElement('td');
      tdOn.className = 'center';
      const on = document.createElement('input');
      on.type = 'checkbox'; on.checked = t.actif !== false; on.title = 'Afficher ce bouton dans la barre';
      on.addEventListener('change', () => { t.actif = on.checked; markDirty(); renderFeatures(); });
      tdOn.append(on);
      tr.append(tdOn, cell('nom', 'ex. Devis dentaire'), cell('url', 'https://monapp.base44.app/devis/suivi'), cell('bouton', 'Nouveau devis'), td);
      body.append(tr);
    }
    renderCrmStatus();
    if (managed) applyLocks();
  }

  async function renderCrmStatus() {
    const pats = crmPatterns();
    const bad = crmTargets.some(t => (t.url || '').trim() && !/^https:\/\//.test(t.url.trim()));
    let missing = [];
    for (const p of pats) if (!(await chrome.permissions.contains({ origins: [p] }).catch(() => false))) missing.push(p);
    $('crmStatus').textContent = bad ? 'Une adresse ne commence pas par https://' :
      !crmTargets.length ? 'Aucun formulaire : pas de bouton CRM dans la barre.' :
      missing.length ? 'Accès au CRM à autoriser.' : 'CRM autorisé ✓';
    $('crmGrant').hidden = !missing.length;
  }

  $('crmAdd').addEventListener('click', () => {
    crmTargets.push({ id: M.uid('crm'), nom: '', url: '', bouton: 'Nouveau devis', actif: true });
    renderFeatures();
    renderCrm(); markDirty();
    const inputs = $('crmBody').querySelectorAll('tr:last-child input');
    if (inputs[0]) inputs[0].focus();
  });
  $('crmGrant').addEventListener('click', async () => {
    const pats = crmPatterns();
    if (!pats.length) return;
    const granted = await chrome.permissions.request({ origins: pats }).catch(() => false);
    if (granted) await save();
    renderCrmStatus();
  });

  ['anchorSelector', 'gmailAccount', 'centreNom', 'signature'].forEach(id => {
    $(id).addEventListener('input', () => {
      if (id === 'anchorSelector') $(id).classList.toggle('invalid', !validSelector($(id).value));
      markDirty(); renderPreview();
    });
  });

  /* ---------------- enregistrement ---------------- */

  function validate() {
    const errs = [];
    // Seul ce que le poste peut modifier est contrôlé (pas la configuration imposée par le centre)
    const ownTpl = templates.filter(t => t.origin !== 'centre');
    const ownMut = mutuelles.filter(m => m.origin !== 'centre' || m.localEmail);
    ownTpl.forEach(t => { if (!t.nom.trim()) errs.push('Un modèle n\'a pas de nom.'); });
    ownTpl.forEach(t => { if (t.cc && !M.isValidEmailList(t.cc)) errs.push('Copie (Cc) invalide dans « ' + t.nom + ' ».'); });
    ownMut.forEach(m => { if (!m.nom.trim()) errs.push('Une mutuelle de l\'annuaire n\'a pas de nom.'); });
    ownMut.forEach(m => { if (m.email && !M.isValidEmailList(m.email)) errs.push('Adresse invalide pour « ' + m.nom + ' » : ' + m.email); });
    const s = readSettingsFromForm();
    if (!isLocked('crmTargets')) crmTargets.forEach(t => { if ((t.url || '').trim() && !/^https:\/\/[^\s]+$/.test(t.url.trim())) errs.push('L\'adresse du formulaire CRM « ' + (t.nom || '?') + ' » doit commencer par https://'); });
    if (!isLocked('anchorSelector') && !validSelector(s.anchorSelector)) errs.push('Le sélecteur d\'emplacement de la barre est invalide.');
    if (!isLocked('selectors')) Object.entries(s.selectors).forEach(([k, v]) => { if (!validSelector(v)) errs.push('Sélecteur invalide pour « ' + SEL_LABELS[k] + ' ».'); });
    return errs;
  }

  async function save() {
    const errs = validate();
    if (errs.length) { setStatus('Non enregistré', 'err'); alert('Corrigez avant d\'enregistrer :\n\n• ' + errs.join('\n• ')); return; }
    try {
      $('saveBtn').disabled = true;
      setStatus('Enregistrement…');
      templates.forEach(t => { t.nom = t.nom.trim(); t.cc = (t.cc || '').trim(); });
      mutuelles.forEach(m => { m.nom = m.nom.trim(); });
      settings = readSettingsFromForm();
      ignoreChangesUntil = Date.now() + 3000;
      await M.saveCollection('tpl', M.localPart('tpl', templates));
      await M.saveCollection('mut', M.localPart('mut', mutuelles));
      await M.saveSettings(settingsToSave(settings));
      dirty = false;
      setStatus('Enregistré ✓ (les onglets ouverts se mettent à jour)', 'ok');
    } catch (e) {
      $('saveBtn').disabled = false;
      setStatus('Erreur', 'err');
      alert('Enregistrement impossible : ' + (e.message || e));
    }
  }
  $('saveBtn').addEventListener('click', save);

  /** Les réglages imposés par le centre ne sont jamais recopiés sur le poste. */
  function settingsToSave(s) {
    if (!managed) return s;
    const out = Object.assign({}, s);
    for (const k of managed.lockedSettings) {
      if (localRaw[k] !== undefined) out[k] = localRaw[k]; else delete out[k];
    }
    return out;
  }

  /** Grise tout ce qui est imposé par le centre. */
  function applyLocks() {
    $('managedBanner').hidden = !managed;
    if (!managed) return;
    const lock = (ids, key) => ids.forEach(id => { const e = $(id); if (e) { e.disabled = isLocked(key); e.title = isLocked(key) ? 'Imposé par le centre' : ''; } });
    lock(['anchorSelector'], 'anchorSelector');
    lock(['gmailAccount'], 'gmailAccount');
    lock(['centreNom'], 'centreNom');
    lock(['signature'], 'signature');
    lock(['siteInput', 'siteAdd'], 'siteMatches');
    lock(['featMailMutuelle', 'featMailPatient'], 'features');
    lock(['crmAdd', 'crmGrant'], 'crmTargets');
    document.querySelectorAll('#selGrid input').forEach(i => { i.disabled = isLocked('selectors'); });
    document.querySelectorAll('#crmBody input, #crmBody button, #featCrm input').forEach(i => { i.disabled = isLocked('crmTargets'); });
    if (isLocked('siteMatches')) document.querySelectorAll('#siteList button').forEach(b => { b.disabled = true; });
    $('mutAdd').disabled = !canAddMut();
    $('resetTpl').disabled = managed.templatesLocked;
    $('resetMut').disabled = managed.mutuellesLocked;
    const extra = [];
    if (managed.mutuellesLocked) extra.push(managed.allowLocalMutuelles ? 'Vous pouvez ajouter des mutuelles sur ce poste et les proposer au centre.' : 'L\'annuaire ne peut pas être complété sur ce poste.');
    if (managed.templatesLocked && managed.allowLocalTemplates) extra.push('Vous pouvez créer vos propres modèles.');
    $('managedExtra').textContent = extra.join(' ');
  }
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (dirty) save(); }
  });

  /* ---------------- sauvegarde / import ---------------- */

  $('exportBtn').addEventListener('click', () => {
    const data = { app: 'mail-mutuelle', version: 1, exportedAt: new Date().toISOString(), settings: readSettingsFromForm(), templates, mutuelles };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'mail-mutuelle-reglages-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });

  $('importFile').addEventListener('change', async e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (data.app !== 'mail-mutuelle' || !Array.isArray(data.templates) || !Array.isArray(data.mutuelles)) throw new Error('fichier non reconnu');
      if (!confirm('Remplacer les modèles, l\'annuaire et les réglages actuels par ceux du fichier ?\n(' + data.templates.length + ' modèle(s), ' + data.mutuelles.length + ' mutuelle(s))')) return;
      templates = data.templates.map(t => ({ id: t.id || M.uid('tpl'), dest: t.dest === 'patient' ? 'patient' : 'mutuelle', nom: String(t.nom || ''), objet: String(t.objet || ''), cc: String(t.cc || ''), corps: String(t.corps || '') }));
      mutuelles = data.mutuelles.map(m => ({ id: m.id || M.uid('mut'), nom: String(m.nom || ''), alias: Array.isArray(m.alias) ? m.alias.map(String) : [], email: String(m.email || '') }));
      settings = M.mergeSettings(data.settings);
      currentTpl = templates[0] || null;
      renderAll();
      await save();
      if (settings.siteMatches.length) alert('Pensez à vérifier l\'onglet « Logiciel médical » : chaque adresse doit être autorisée sur ce poste.');
    } catch (err) {
      alert('Import impossible : ' + (err.message || err));
    }
  });

  $('resetTpl').addEventListener('click', () => {
    if (!confirm('Remplacer tous les modèles par les modèles d\'origine ?')) return;
    templates = JSON.parse(JSON.stringify(M.DEFAULT_TEMPLATES.concat(M.DEFAULT_PATIENT_TEMPLATES)));
    currentTpl = templates[0];
    renderTplList(); renderTplEditor(); markDirty();
  });
  $('resetMut').addEventListener('click', () => {
    if (!confirm('Remplacer tout l\'annuaire par la liste d\'origine (adresses à renseigner) ?')) return;
    mutuelles = JSON.parse(JSON.stringify(M.DEFAULT_MUTUELLES));
    renderMutuelles(); markDirty();
  });

  async function renderQuota() {
    try {
      const used = await chrome.storage.sync.getBytesInUse(null);
      $('quota').textContent = 'Espace utilisé : ' + (used / 1024).toFixed(1) + ' Ko sur ' + Math.round(chrome.storage.sync.QUOTA_BYTES / 1024) + ' Ko disponibles (limite Chrome).';
    } catch (e) { /* rien */ }
  }

  /* ---------------- démarrage ---------------- */

  function renderAll() {
    fillSettingsForm(); renderTplList(); renderTplEditor(); renderMutuelles();
    if (managed) {
      $('polAdminEmail').value = managed.adminEmail || '';
      $('polAllowMut').checked = managed.allowLocalMutuelles;
      $('polAllowTpl').checked = managed.allowLocalTemplates;
    }
    applyLocks();
  }

  /* ---------------- export pour la console Google ---------------- */
  function policyJson() {
    const pol = M.toAdminConsolePolicy({
      settings: readSettingsFromForm(),
      templates, mutuelles,
      adminEmail: $('polAdminEmail').value.trim(),
      allowLocalMutuelles: $('polAllowMut').checked,
      allowLocalTemplates: $('polAllowTpl').checked
    });
    return JSON.stringify(pol, null, 2);
  }
  $('exportPolicy').addEventListener('click', () => {
    const blob = new Blob([policyJson()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'mail-mutuelle-config-centre-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
  $('copyPolicy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(policyJson()); setStatus('Configuration copiée ✓', 'ok'); }
    catch (e) { alert('Copie impossible : utilisez « Exporter ».'); }
  });

  async function init() {
    const data = await M.ensureDefaults();
    settings = data.settings;
    templates = data.templates;
    mutuelles = data.mutuelles;
    managed = data.managed;
    localRaw = (await M.loadLocal()).rawSettings || {};
    const keepId = currentTpl && currentTpl.id;
    currentTpl = templates.find(t => t.id === keepId) || templates[0] || null;
    renderAll();
    setStatus('Tout est enregistré', '');
  }

  // Si les réglages sont modifiés depuis un autre poste pendant que la page est ouverte
  chrome.storage.onChanged.addListener((changes, area) => {
    if (((area === 'sync' && Date.now() > ignoreChangesUntil) || area === 'managed') && !dirty) init();
  });

  init();
})();
