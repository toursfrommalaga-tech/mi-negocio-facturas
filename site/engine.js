/* Motor compartido por Apps Script y el servidor local. Importes internos: céntimos EUR. */
var Engine = (function () {
  'use strict';
  const copy = x => JSON.parse(JSON.stringify(x));
  const fail = m => { throw Error(m); };
  const text = (v, max = 800) => { const s = String(v == null ? '' : v).trim(); if (s.length > max) fail('Texto demasiado largo'); return s; };
  const required = v => text(v) || fail('Falta un campo obligatorio');
  const norm = v => text(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  function decimal(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? v : fail('Número no válido');
    let s = text(v).replace(/[ €\u00a0]/g, '');
    if (!s) fail('Falta un importe');
    if (s.includes(',')) { if (!/^-?(?:\d{1,3}(?:\.\d{3})+|\d+),\d{1,4}$/.test(s)) fail('Importe no válido'); s = s.replace(/\./g, '').replace(',', '.'); }
    if (!/^-?\d+(?:\.\d{1,4})?$/.test(s)) fail('Número no válido');
    return Number(s);
  }
  function money(v, positive = false) { const n = Math.round((decimal(v) + Number.EPSILON) * 100); if (!Number.isSafeInteger(n) || Math.abs(n) > 1000000000 || (positive && n <= 0)) fail('Importe fuera de rango'); return n; }
  function date(v) {
    const s = text(v), m = s.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
    const iso = m ? m[3] + '-' + m[2] + '-' + m[1] : s;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) fail('Fecha no válida: usa día/mes/año');
    const d = new Date(iso + 'T12:00:00Z'); if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== iso) fail('Fecha imposible'); return iso;
  }
  function initial(email, company = 'Mi negocio · pruebas') {
    return { version: '0.2.0', tenant: 'negocio-1', company, revision: 0, counters: {}, clients: [], drafts: [], invoices: [], bank: [], payments: [], proposals: [], documents: [], issues: [], audit: [], requests: [], users: [{ email: email.toLowerCase(), role: 'admin', active: true }], integrations: { fiscal: 'BLOQUEADA', ai: 'SIN_PROVEEDOR', banking: 'SOLO_IMPORTACION' } };
  }
  function auth(s, email) { if (!email) fail('Acceso denegado: no se ha podido identificar tu cuenta'); const u = s.users.find(u => u.email === email.toLowerCase() && u.active); if (!u) fail('Acceso denegado'); return u; }
  function permission(u, action) {
    const employee = ['view', 'addClient', 'createDraft', 'addDocument', 'addIssue', 'ask', 'draftPDF'];
    const adviser = ['view', 'ask', 'draftPDF'];
    if (u.role === 'admin') return;
    if (!(u.role === 'employee' ? employee : adviser).includes(action)) fail('Tu perfil no permite esta operación');
  }
  function due(s, invoice) { return Math.max(0, invoice.total - s.payments.filter(p => !p.voided && p.invoiceId === invoice.id).reduce((a, p) => a + p.amount, 0)); }
  function remaining(s, bank) { return Math.max(0, Math.abs(bank.amount) - s.payments.filter(p => !p.voided && p.bankId === bank.id).reduce((a, p) => a + p.amount, 0)); }
  function visible(s, u) {
    const own = a => u.role === 'employee' ? a.filter(x => x.createdBy === u.email) : a;
    const finance = u.role !== 'employee';
    const invoices = finance ? s.invoices.map(i => Object.assign({}, i, { due: due(s, i) })) : [];
    const bank = finance ? s.bank.map(b => Object.assign({}, b, { remaining: remaining(s, b) })) : [];
    const confirmed = invoices.filter(i => i.status === 'confirmed');
    const review = invoices.filter(i => i.status !== 'confirmed');
    const total = (type, field) => confirmed.filter(i => i.type === type).reduce((a, i) => a + i[field], 0);
    return { version: s.version, company: s.company, revision: s.revision, user: u, integrations: s.integrations,
      clients: own(s.clients), drafts: own(s.drafts), invoices, bank, documents: own(s.documents), issues: own(s.issues),
      payments: finance ? s.payments : [], proposals: finance ? s.proposals.filter(p => p.status === 'pending') : [],
      users: u.role === 'admin' ? s.users : [], audit: u.role === 'admin' ? s.audit.slice(-200) : [],
      summary: finance ? { sales: total('sales', 'total'), expenses: total('received', 'total'), dueSales: total('sales', 'due'), dueExpenses: total('received', 'due'), salesCount: confirmed.filter(i => i.type === 'sales').length, receivedCount: confirmed.filter(i => i.type === 'received').length, unmatched: bank.filter(b => b.remaining > 0).length, missingInvoices: bank.filter(b => b.amount < 0 && b.remaining > 0).length, review: review.length + s.documents.filter(d => d.status === 'review').length, issues: s.issues.filter(i => i.status === 'open').length } : null };
  }
  function lineTotals(lines) {
    if (!Array.isArray(lines) || !lines.length || lines.length > 60) fail('Añade entre 1 y 60 conceptos');
    const result = lines.map(l => {
      const quantity = decimal(l.quantity), unit = money(l.price), discount = decimal(l.discount || 0), vat = decimal(l.vat == null ? 21 : l.vat);
      if (quantity <= 0 || quantity > 100000 || unit < 0 || discount < 0 || discount > 100 || ![0, 4, 10, 21].includes(vat)) fail('Revisa cantidad, precio, descuento e IVA');
      const base = Math.round(quantity * unit * (1 - discount / 100)), tax = Math.round(base * vat / 100);
      return { description: required(l.description), quantity, unit, discount, vat, base, tax, total: base + tax };
    });
    const base = result.reduce((a, l) => a + l.base, 0), tax = result.reduce((a, l) => a + l.tax, 0);
    if (base + tax <= 0 || base + tax > 1000000000) fail('Total fuera de rango');
    return { lines: result, base, tax, total: base + tax };
  }
  function csv(raw) {
    raw = String(raw || '').replace(/^\uFEFF/, ''); if (raw.length > 500000) fail('CSV superior a 500 KB');
    const head = raw.split(/\r?\n/)[0], sep = [';', '\t', ','].sort((a, b) => head.split(b).length - head.split(a).length)[0];
    const rows = []; let row = [], cell = '', quoted = false;
    for (let i = 0; i < raw.length; i++) {
      const c = raw[i];
      if (c === '"') { if (quoted && raw[i + 1] === '"') { cell += '"'; i++; } else if (quoted || cell === '') quoted = !quoted; else fail('Comillas CSV no válidas'); }
      else if (c === sep && !quoted) { row.push(cell); cell = ''; }
      else if ((c === '\r' || c === '\n') && !quoted) { if (c === '\r' && raw[i + 1] === '\n') i++; row.push(cell); if (row.some(x => x.trim())) rows.push(row); row = []; cell = ''; }
      else cell += c;
    }
    if (quoted) fail('CSV con comillas sin cerrar'); row.push(cell); if (row.some(x => x.trim())) rows.push(row);
    if (rows.length < 2 || rows.length > 1001) fail('El extracto necesita cabecera y entre 1 y 1000 movimientos'); return rows;
  }
  function bankRows(rows, p, s, ctx, meta) {
    if (!Array.isArray(rows) || rows.length < 2 || rows.length > 1001 || rows.some(r => !Array.isArray(r) || r.length > 30)) fail('Extracto fuera de límites: máximo 1000 filas y 30 columnas');
    const headers = rows[0].map(norm), index = aliases => headers.findIndex(h => aliases.includes(h));
    const dc = index(['fecha', 'date', 'fechaoperacion']), cc = index(['concepto', 'descripcion', 'detalle', 'description']), ac = index(['importe', 'amount']), cr = index(['abono', 'haber', 'credit']), db = index(['cargo', 'debe', 'debit']), rc = index(['referencia', 'ref', 'id', 'identificador']);
    if (dc < 0 || cc < 0 || (ac < 0 && (cr < 0 || db < 0))) fail('Cabeceras necesarias: Fecha;Concepto;Importe;Referencia (opcional)');
    const account = required(p.account), imported = [], review = []; let duplicated = 0;
    rows.slice(1).forEach((r, i) => {
      let day, description, amount;
      try {
        day = date(r[dc]); description = required(r[cc]);
        amount = ac >= 0 ? money(r[ac]) : money(r[cr] || 0) - money(r[db] || 0);
        if (!amount) fail('Importe cero');
      } catch (e) { review.push({ row: i + 2, reason: e.message }); return; }
      const ref = rc >= 0 ? text(r[rc]) : '';
      // Sin referencia solo se marca posible duplicado: pueden existir dos cargos legítimos iguales.
      const signature = ctx.hash([norm(account), day, norm(description), amount].join('|'));
      const refKey = ref ? ctx.hash(norm(account) + '|' + ref) : '';
      const sameRef = refKey && s.bank.find(b => b.refKey === refKey);
      if (sameRef) { if (sameRef.signature === signature) { duplicated++; return; } review.push({ row: i + 2, reason: 'Referencia bancaria repetida con datos distintos' }); return; }
      const possibleDuplicate = !ref && s.bank.some(b => b.signature === signature);
      const b = Object.assign({ id: ctx.id('MOV'), account, date: day, description, amount, reference: ref, signature, refKey, possibleDuplicate, duplicateResolved: false, source: text(p.name || 'Extracto') }, meta);
      s.bank.push(b); imported.push(b.id);
    });
    return { imported: imported.length, duplicated, review, ids: imported, possibleDuplicates: s.bank.filter(b => imported.includes(b.id) && b.possibleDuplicate).length };
  }
  function validateInvoice(p, s, ctx, meta) {
    const type = ['sales', 'received'].includes(p.type) ? p.type : fail('Tipo de factura no válido');
    const docType = ['invoice', 'quote', 'delivery', 'reservation', 'other'].includes(p.docType) ? p.docType : 'invoice';
    const number = text(p.number), name = required(p.name), nif = text(p.nif).toUpperCase();
    const base = money(p.base == null || p.base === '' ? 0 : p.base), tax = money(p.tax == null || p.tax === '' ? 0 : p.tax), total = money(p.total, true);
    if (type === 'sales' && p.externalConfirmed !== true) fail('Solo se registran facturas ya emitidas en otro sistema fiscal');
    const status = p.confirmed === true && docType === 'invoice' && nif && number ? 'confirmed' : 'review';
    if (base < 0 || tax < 0 || (status === 'confirmed' && base + tax !== total)) fail('Base más IVA debe coincidir con el total al céntimo');
    const key = norm(nif || name) + '|' + norm(number || p.sourceId || ctx.id('REV')) + '|' + type;
    if (s.invoices.some(i => i.key === key)) fail('Ya existe una factura de ese emisor y número');
    const sourcePaid = p.sourcePaid === true;
    const sourceUrl = /^https:\/\//.test(p.sourceUrl || '') ? text(p.sourceUrl, 1600) : '';
    const invoice = Object.assign({ id: ctx.id('FAC'), type, docType, status, number, name, nif, date: date(p.date), dateEstimated: p.dateEstimated === true, dueDate: p.dueDate ? date(p.dueDate) : '', description: text(p.description), base, tax, total, key, sourceId: text(p.sourceId), sourceUrl, documentId: text(p.documentId), sourcePaid: sourcePaid && status === 'confirmed', sourceNote: text(p.sourceNote), currency: 'EUR' }, meta);
    s.invoices.push(invoice);
    if (sourcePaid && status === 'confirmed') s.payments.push(Object.assign({ id: ctx.id('PAG'), invoiceId: invoice.id, amount: total, date: invoice.date, bankId: '', method: 'Importado de origen: pagada', sourceId: invoice.sourceId }, meta));
    if (p.documentId) { const doc = s.documents.find(d => d.id === p.documentId); if (!doc) fail('Adjunto no encontrado'); if (doc.status === 'linked') fail('El adjunto ya está asociado a otra factura'); doc.docType = docType; doc.status = 'linked'; doc.invoiceId = invoice.id; }
    return invoice;
  }
  function allocate(s, p, ctx, meta) {
    const b = p.bankId ? s.bank.find(b => b.id === p.bankId) || fail('Movimiento no encontrado') : null;
    if (b && b.possibleDuplicate && !b.duplicateResolved) fail('Revisa primero el posible duplicado bancario');
    const list = p.allocations;
    if (!Array.isArray(list) || !list.length || list.length > 50) fail('Indica facturas e importes');
    const seen = new Set(); let sum = 0;
    const plans = list.map(a => {
      if (seen.has(a.invoiceId)) fail('Factura repetida en el reparto'); seen.add(a.invoiceId);
      const i = s.invoices.find(i => i.id === a.invoiceId) || fail('Factura inexistente');
      if (i.status !== 'confirmed' || i.docType !== 'invoice') fail('El documento debe estar revisado como factura');
      if (b && (b.amount > 0 ? 'sales' : 'received') !== i.type) fail('El signo del movimiento no corresponde a la factura');
      const amount = money(a.amount, true), old = a.paymentId ? s.payments.find(x => x.id === a.paymentId && x.invoiceId === i.id && !x.voided) || fail('Pago previo inexistente') : null;
      if (old && (!b || old.bankId || amount !== old.amount)) fail('El pago manual ya está asociado o tiene otro importe');
      if (!old && amount > due(s, i)) fail('El importe supera el pendiente de ' + i.number);
      sum += amount; return { invoice: i, amount, old };
    });
    if (b && sum > remaining(s, b)) fail('El reparto supera el importe libre del movimiento');
    const paymentDate = date(p.date || (b && b.date) || ctx.today);
    const ids = plans.map(x => {
      if (x.old) { x.old.bankId = b.id; x.old.linkedAt = ctx.now; return x.old.id; }
      const payment = Object.assign({ id: ctx.id('PAG'), invoiceId: x.invoice.id, amount: x.amount, date: paymentDate, bankId: b ? b.id : '', method: b ? 'Banco' : text(p.method || 'Manual'), note: text(p.note) }, meta); s.payments.push(payment); return payment.id;
    });
    return { payments: ids, allocated: sum, remaining: b ? remaining(s, b) : null };
  }
  function proposals(s, ctx, meta) {
    let created = 0;
    for (const b of s.bank) {
      const left = remaining(s, b); if (!left || (b.possibleDuplicate && !b.duplicateResolved)) continue;
      const kind = b.amount > 0 ? 'sales' : 'received';
      const docs = s.invoices.filter(i => i.type === kind && i.status === 'confirmed' && i.docType === 'invoice' && due(s, i) > 0);
      const desc = norm(b.description + b.reference);
      const candidates = docs.map(i => { const ref = norm(i.number), name = norm(i.name); const evidence = ref.length >= 4 && desc.includes(ref) ? 'Referencia' : name.length >= 4 && desc.includes(name) ? 'Nombre' : ''; return { i, evidence, score: (evidence === 'Referencia' ? 8 : evidence ? 4 : 0) + (due(s, i) === left ? 2 : 0) }; }).filter(c => due(s, c.i) === left || c.evidence).sort((a, b) => b.score - a.score).slice(0, 8);
      for (const c of candidates) {
        const amount = Math.min(left, due(s, c.i));
        const key = [b.id, c.i.id, amount].join('|');
        if (s.proposals.some(p => p.key === key)) continue;
        s.proposals.push(Object.assign({ id: ctx.id('PROP'), key, bankId: b.id, allocations: [{ invoiceId: c.i.id, amount: amount / 100 }], reason: (c.evidence || 'Solo importe') + (amount < due(s, c.i) ? ' · pago parcial propuesto' : '') + ' · revisar', confidence: c.evidence ? 'media' : 'baja', status: 'pending' }, meta)); created++;
      }
      // Agrupación explícita de dos facturas del mismo emisor/receptor; siempre requiere revisión.
      const group = docs.slice(0, 80);
      for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) {
        const a = group[i], c = group[j];
        if (norm(a.nif || a.name) !== norm(c.nif || c.name) || due(s, a) + due(s, c) !== left) continue;
        const key = [b.id, ...[a.id, c.id].sort()].join('|'); if (s.proposals.some(p => p.key === key)) continue;
        s.proposals.push(Object.assign({ id: ctx.id('PROP'), key, bankId: b.id, allocations: [a, c].map(i => ({ invoiceId: i.id, amount: due(s, i) / 100 })), reason: 'Dos facturas de la misma entidad suman el movimiento · revisar', confidence: 'baja', status: 'pending' }, meta)); created++;
      }
    }
    return { created };
  }
  function ask(s, u, question, ctx) {
    const v = visible(s, u); if (!v.summary) return { answer: 'Tu perfil puede consultar sus propios borradores y documentos; las consultas financieras requieren autorización.', certainty: 'confirmed', items: [] };
    const q = norm(question); let items = [], title = '';
    const invoices = v.invoices.filter(i => i.status === 'confirmed');
    if (/cobrad|proveedor.*factura|falt.*factura/.test(q)) { items = v.bank.filter(b => b.amount < 0 && b.remaining > 0).map(b => ({ id: b.id, name: b.description, amount: b.remaining })); title = 'Cargos sin justificar o sin conciliar. Puede faltar la factura; también puede ser un gasto que no la requiere.'; }
    else if (/banco|movimiento/.test(q)) { items = v.bank.filter(b => b.remaining > 0).map(b => ({ id: b.id, name: b.description, amount: b.remaining })); title = 'Movimientos con importe pendiente de conciliar'; }
    else if (/pagar|pendient.*pago/.test(q)) { items = invoices.filter(i => i.type === 'received' && i.due > 0).map(i => ({ id: i.id, name: i.name + ' · ' + i.number, amount: i.due })); title = 'Facturas confirmadas pendientes de pagar'; }
    else if (/deben|debe.*dinero|cobrar/.test(q)) { items = invoices.filter(i => i.type === 'sales' && i.due > 0).map(i => ({ id: i.id, name: i.name + ' · ' + i.number, amount: i.due })); title = 'Facturas confirmadas pendientes de cobrar'; }
    else if (/facturad|venta/.test(q)) { const month = ctx.today.slice(0, 7); items = invoices.filter(i => i.type === 'sales' && i.date.startsWith(month)).map(i => ({ id: i.id, name: i.name + ' · ' + i.number, amount: i.total })); title = 'Ventas registradas de ' + month + ', IVA incluido; excluye borradores'; }
    else if (/revis/.test(q)) { items = [...v.invoices.filter(i => i.status !== 'confirmed').map(i => ({ id: i.id, name: i.name + ' · ' + i.number, amount: i.total })), ...v.documents.filter(d => d.status === 'review').map(d => ({ id: d.id, name: d.name, amount: 0 }))]; title = 'Documentos que requieren revisión; no suman gastos confirmados'; }
    else return { answer: 'Puedo consultar quién te debe dinero, facturas por pagar, movimientos sin conciliar, ventas de este mes y documentos por revisar.', certainty: 'confirmed', items: [], asOf: ctx.now };
    return { answer: title, certainty: /sin justificar/.test(title) ? 'estimate' : 'confirmed', count: items.length, total: items.reduce((a, i) => a + i.amount, 0), items, asOf: ctx.now, source: 'Datos registrados en el piloto; no consulta el banco en directo.', mode: 'Consultas por reglas, sin IA generativa ni envío externo' };
  }
  function run(original, email, action, p, ctx) {
    const s = copy(original), u = auth(s, email); permission(u, action); p = p || {};
    if (action === 'view') return { state: original, result: visible(s, u), changed: false };
    if (action === 'ask') return { state: original, result: ask(s, u, p.question, ctx), changed: false };
    if (action === 'draftPDF') { const d = s.drafts.find(d => d.id === p.id && (u.role !== 'employee' || d.createdBy === u.email)) || fail('Borrador no encontrado'); return { state: original, result: { company: s.company, draft: d }, changed: false }; }
    if (action === 'issueFiscal') fail('Emisión fiscal bloqueada: falta verificar cumplimiento, integración y autorización del titular');
    const key = required(p.requestId); if (key.length > 160) fail('Identificador de operación no válido');
    const fingerprint = ctx.hash(JSON.stringify({ action, payload: p }));
    const prior = s.requests.find(r => r.key === key && r.email === u.email);
    if (prior) { if (prior.fingerprint !== fingerprint) fail('Identificador de operación reutilizado con otros datos'); return { state: original, result: prior.result, changed: false }; }
    const meta = { createdBy: u.email, createdAt: ctx.now, tenant: s.tenant }; let result;
    switch (action) {
      case 'addClient': {
        const nif = text(p.nif).toUpperCase(); if (nif && s.clients.some(c => norm(c.nif) === norm(nif))) fail('NIF de cliente ya registrado');
        result = Object.assign({ id: ctx.id('CLI'), name: required(p.name), nif, email: text(p.email), address: text(p.address), city: text(p.city), postcode: text(p.postcode), phone: text(p.phone) }, meta); s.clients.push(result); break;
      }
      case 'createDraft': {
        const client = s.clients.find(c => c.id === p.clientId && (u.role !== 'employee' || c.createdBy === u.email)) || fail('Selecciona un cliente autorizado');
        const day = date(p.date || ctx.today), series = text(p.series || 'BOR', 16).toUpperCase(); if (!/^[A-Z0-9_-]{1,16}$/.test(series)) fail('Serie no válida');
        if (p.documentId && !s.documents.some(d => d.id === p.documentId && (u.role !== 'employee' || d.createdBy === u.email))) fail('Adjunto no autorizado');
        const countKey = series + '-' + day.slice(0, 4), next = (s.counters[countKey] || 0) + 1;
        result = Object.assign({ id: countKey + '-' + String(next).padStart(5, '0'), date: day, series, client: copy(client), status: 'draft', note: text(p.note), documentId: text(p.documentId) }, lineTotals(p.lines), meta);
        s.counters[countKey] = next; s.drafts.push(result); break;
      }
      case 'registerInvoice': result = validateInvoice(p, s, ctx, meta); break;
      case 'reviewInvoice': {
        const i = s.invoices.find(i => i.id === p.id) || fail('Documento no encontrado');
        if (i.status === 'confirmed') fail('Los registros confirmados no se sobrescriben');
        if (s.payments.some(x => x.invoiceId === i.id && !x.voided)) fail('Documento con pagos: requiere revisión administrativa fuera del piloto');
        const merged = Object.assign({}, i, p, { base: p.base == null ? i.base / 100 : p.base, tax: p.tax == null ? i.tax / 100 : p.tax, total: p.total == null ? i.total / 100 : p.total, confirmed: true, externalConfirmed: i.type === 'sales' });
        const linked = i.documentId && s.documents.find(d => d.id === i.documentId);
        if (linked && linked.invoiceId === i.id) linked.status = 'review';
        s.invoices = s.invoices.filter(x => x.id !== i.id); result = validateInvoice(merged, s, ctx, meta); result.id = i.id; result.reviewedBy = u.email; result.reviewedAt = ctx.now; result.sourcePaid = false; if (linked) linked.invoiceId = i.id; break;
      }
      case 'importBank': result = bankRows(p.rows || csv(p.csv), p, s, ctx, meta); break;
      case 'resolveDuplicate': { const b = s.bank.find(b => b.id === p.id) || fail('Movimiento no encontrado'); if (!b.possibleDuplicate) fail('No está marcado como posible duplicado'); b.duplicateResolved = true; b.duplicateNote = required(p.note); result = { id: b.id }; break; }
      case 'allocate': result = allocate(s, p, ctx, meta); break;
      case 'voidPayment': { const pay = s.payments.find(x => x.id === p.id && !x.voided) || fail('Pago no encontrado'); pay.voided = true; pay.voidReason = required(p.reason); pay.voidedAt = ctx.now; pay.voidedBy = u.email; result = { id: pay.id }; break; }
      case 'propose': result = proposals(s, ctx, meta); break;
      case 'acceptProposal': { const prop = s.proposals.find(x => x.id === p.id && x.status === 'pending') || fail('Propuesta ya procesada'); result = allocate(s, { bankId: prop.bankId, allocations: prop.allocations }, ctx, meta); prop.status = 'accepted'; prop.acceptedBy = u.email; break; }
      case 'rejectProposal': { const prop = s.proposals.find(x => x.id === p.id && x.status === 'pending') || fail('Propuesta ya procesada'); prop.status = 'rejected'; result = { id: prop.id }; break; }
      case 'addDocument': {
        if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(p.mime)) fail('Adjunto no permitido');
        if (!Number.isInteger(p.size) || p.size <= 0 || p.size > 4 * 1024 * 1024) fail('El archivo debe tener entre 1 byte y 4 MB');
        if (!/^[a-f0-9]{64}$/.test(p.hash || '')) fail('Huella de archivo no válida');
        if (s.documents.some(d => d.hash === p.hash)) fail('Este archivo ya se ha recibido');
        result = Object.assign({ id: ctx.id('DOC'), name: required(p.name), mime: p.mime, size: p.size, hash: p.hash, storageId: required(p.storageId), status: 'review', docType: 'other', channel: text(p.channel || 'Subida manual') }, meta); s.documents.push(result); break;
      }
      case 'classifyDocument': { const d = s.documents.find(d => d.id === p.id) || fail('Documento no encontrado'); if (!['invoice', 'quote', 'delivery', 'reservation', 'other'].includes(p.docType)) fail('Tipo documental no válido'); d.docType = p.docType; d.status = p.docType === 'invoice' ? 'review' : 'classified'; d.note = text(p.note); result = { id: d.id }; break; }
      case 'addIssue': result = Object.assign({ id: ctx.id('INC'), description: required(p.description), status: 'open' }, meta); s.issues.push(result); break;
      case 'setUser': {
        const email2 = required(p.email).toLowerCase(); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email2) || !['admin', 'employee', 'adviser'].includes(p.role)) fail('Cuenta o perfil no válido');
        if (email2 === u.email && (p.role !== 'admin' || p.active === false)) fail('No puedes quitar tu propio acceso de administrador');
        const user = s.users.find(x => x.email === email2); const fields = { email: email2, role: p.role, active: p.active !== false }; if (user) Object.assign(user, fields); else s.users.push(fields); result = fields; break;
      }
      case 'configure': s.company = required(p.company); result = { company: s.company }; break;
      case 'syncReceived': {
        if (!Array.isArray(p.records) || p.records.length > 1500) fail('Fuente demasiado grande: requiere importación por lotes'); let imported = 0; const review = [];
        for (const r of p.records) {
          if (!r.sourceId || s.invoices.some(i => i.sourceId === r.sourceId)) continue;
          try {
            validateInvoice(Object.assign({}, r, { type: 'received' }), s, ctx, meta); imported++;
            const previousIssue = s.issues.find(i => i.sourceId === r.sourceId && i.kind === 'sourceImport' && i.status === 'open');
            if (previousIssue) { previousIssue.status = 'resolved'; previousIssue.resolvedAt = ctx.now; }
          } catch (e) {
            review.push({ sourceId: r.sourceId, reason: e.message });
            if (!s.issues.some(i => i.sourceId === r.sourceId && i.kind === 'sourceImport' && i.status === 'open')) s.issues.push(Object.assign({ id: ctx.id('INC'), kind: 'sourceImport', sourceId: r.sourceId, sourceUrl: /^https:\/\//.test(r.sourceUrl || '') ? text(r.sourceUrl,1600) : '', description: 'Revisar importación: ' + text(r.name) + ' · ' + text(r.number) + ' · ' + e.message + ' · ' + text(r.sourceNote), status: 'open' }, meta));
          }
        }
        result = { imported, review, sourceMode: 'Solo lectura; instantánea sin sobrescribir históricos' }; break;
      }
      default: fail('Operación desconocida');
    }
    s.revision++;
    const prev = s.audit.length ? s.audit[s.audit.length - 1].hash : '';
    const event = { id: ctx.id('AUD'), at: ctx.now, actor: u.email, action, requestId: key, revision: s.revision, previous: prev, payloadHash: fingerprint };
    event.hash = ctx.hash(JSON.stringify(event)); s.audit.push(event);
    s.requests.push({ key, email: u.email, fingerprint, result: { id: result.id, imported: result.imported, created: result.created, payments: result.payments, replayed: true } });
    // Se conserva la idempotencia durante toda la vida de este piloto, sin recortar silenciosamente.
    return { state: s, result, changed: true };
  }
  return { initial, run, visible, auth, due, remaining, money, date, csv, norm, lineTotals };
})();
if (typeof module !== 'undefined') module.exports = Engine;
