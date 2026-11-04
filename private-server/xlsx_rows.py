"""Lectura limitada de XLSX sin macros, fórmulas, vínculos ni ejecución de contenido."""
import io, json, sys, zipfile, posixpath
from xml.etree import ElementTree as ET
from datetime import datetime, timedelta

def read(data):
    ns = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        if len(z.infolist()) > 500 or sum(i.file_size for i in z.infolist()) > 20_000_000:
            raise ValueError('Excel demasiado grande al descomprimir')
        if any('vbaProject' in i.filename for i in z.infolist()):
            raise ValueError('No se admiten macros')
        shared = []
        if 'xl/sharedStrings.xml' in z.namelist():
            for si in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('s:si', ns):
                shared.append(''.join(t.text or '' for t in si.findall('.//s:t', ns)))
        wb = ET.fromstring(z.read('xl/workbook.xml'))
        sheets = wb.findall('s:sheets/s:sheet', ns)
        if len(sheets) != 1:
            raise ValueError('Exporta un Excel con una sola pestaña de movimientos o usa CSV')
        rel_id = sheets[0].get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')
        rels = ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
        rel = next(r for r in rels if r.get('Id') == rel_id)
        if rel.get('TargetMode') == 'External': raise ValueError('Vínculo externo no permitido')
        target = rel.get('Target')
        path = target.lstrip('/') if target.startswith('/') else posixpath.normpath('xl/' + target)
        if not path.startswith('xl/worksheets/'): raise ValueError('Pestaña no válida')
        rows = []
        for row in ET.fromstring(z.read(path)).findall('s:sheetData/s:row', ns):
            values = [''] * 30
            for c in row.findall('s:c', ns):
                ref = ''.join(ch for ch in c.get('r', '') if ch.isalpha())
                col = 0
                for ch in ref: col = col * 26 + ord(ch.upper()) - 64
                if not 1 <= col <= 30: raise ValueError('Excel con más de 30 columnas')
                if c.find('s:f', ns) is not None: raise ValueError('Convierte las fórmulas a valores antes de importar')
                value = c.findtext('s:v', '', ns)
                if c.get('t') == 's': value = shared[int(value)]
                elif c.get('t') == 'inlineStr': value = ''.join(t.text or '' for t in c.findall('.//s:t', ns))
                values[col-1] = value
            while values and values[-1] == '': values.pop()
            if values: rows.append(values)
            if len(rows) > 1001: raise ValueError('Máximo 1000 movimientos')
        if rows:
            date_cols = [i for i, h in enumerate(rows[0]) if h.lower().replace(' ', '') in ('fecha', 'date', 'fechaoperacion')]
            epoch = datetime(1904, 1, 1) if wb.find('s:workbookPr', ns) is not None and wb.find('s:workbookPr', ns).get('date1904') in ('1', 'true') else datetime(1899, 12, 30)
            for row in rows[1:]:
                for i in date_cols:
                    if i < len(row) and row[i].replace('.', '', 1).isdigit() and 1 <= float(row[i]) <= 100000:
                        row[i] = (epoch + timedelta(days=float(row[i]))).strftime('%Y-%m-%d')
        return rows

try:
    print(json.dumps(read(sys.stdin.buffer.read(6_000_001)), ensure_ascii=False))
except Exception as e:
    print(str(e), file=sys.stderr)
    sys.exit(1)
