'use strict';
// PDF autónomo sin servicios externos. Fuente estándar WinAnsi, marca de borrador en cada página.
module.exports = function pdf(company, d) {
  const eur = n => (n / 100).toFixed(2) + ' EUR';
  const lines = [company, d.id + ' | ' + d.date, d.client.name, d.client.nif, d.client.address, (d.client.postcode || '') + ' ' + (d.client.city || ''), ''];
  if(d.issuer && Object.values(d.issuer).some(Boolean))lines.splice(1,0,d.issuer.nif||'',d.issuer.address||'',(d.issuer.postcode||'')+' '+(d.issuer.city||''),'');
  for (const l of d.lines) lines.push(l.description, '  ' + l.quantity + ' x ' + eur(l.unit) + ' | Dto. ' + l.discount + '% | IVA ' + l.vat + '% | ' + eur(l.total));
  lines.push('', 'Base: ' + eur(d.base), 'IVA: ' + eur(d.tax), 'TOTAL ORIENTATIVO: ' + eur(d.total), '', d.note || '', 'Documento interno. Sin emision fiscal ni remision a la AEAT.');
  const wrapped = lines.flatMap(l => String(l).split(/\r?\n/).flatMap(x => x.match(/.{1,88}(?:\s|$)|.{1,88}/g) || ['']));
  const chunks = []; for (let i = 0; i < wrapped.length; i += 43) chunks.push(wrapped.slice(i, i + 43));
  const objects = [], put = text => { objects.push(text); return objects.length; };
  put('<< /Type /Catalog /Pages 2 0 R >>'); put(''); put('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const pageIds = [];
  const safe = x => String(x).replace(/[\x00-\x1f]/g, ' ').replace(/[^\x20-\xff]/g, '?').replace(/[\\()]/g, '\\$&');
  chunks.forEach((chunk, idx) => {
    const stream = 'BT /F1 13 Tf 48 794 Td (BORRADOR - NO VALIDO COMO FACTURA FISCAL) Tj /F1 11 Tf 0 -30 Td ' + chunk.map(l => '(' + safe(l) + ') Tj 0 -16 Td').join('\n') + ' ET\nBT /F1 9 Tf 48 30 Td (Pagina ' + (idx + 1) + ' de ' + chunks.length + ' - ' + safe(d.id) + ') Tj ET';
    const content = put('<< /Length ' + Buffer.byteLength(stream, 'latin1') + ' >>\nstream\n' + stream + '\nendstream');
    pageIds.push(put('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ' + content + ' 0 R >>'));
  });
  objects[1] = '<< /Type /Pages /Count ' + pageIds.length + ' /Kids [' + pageIds.map(n => n + ' 0 R').join(' ') + '] >>';
  let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n'; const offsets = [0];
  objects.forEach((o, i) => { offsets.push(Buffer.byteLength(out, 'latin1')); out += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
  const start = Buffer.byteLength(out, 'latin1'); out += 'xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n' + offsets.slice(1).map(n => String(n).padStart(10, '0') + ' 00000 n \n').join('') + 'trailer\n<< /Size ' + (objects.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + start + '\n%%EOF';
  return Buffer.from(out, 'latin1');
};
