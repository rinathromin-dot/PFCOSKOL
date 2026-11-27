(() => {
  const xmlHeader = '<?xml version="1.0" encoding="UTF-8"?>';
  const spreadsheet = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const relationships = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const packageRelationships = 'http://schemas.openxmlformats.org/package/2006/relationships';
  const mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml';

  function escapeXml(value) {
    return Array.from(String(value ?? '')).filter(char =>
      !/^[\u0000-\u0008\u000B\u000C\u000E-\u001F\uD800-\uDFFF\uFFFE\uFFFF]$/.test(char)
    ).join('').replace(/[&<>\r]/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '\r': '&#13;'}[char]));
  }

  function crc32(bytes) {
    let crc = -1;
    for (const byte of bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (-(crc & 1) & 0xedb88320);
    }
    return (crc ^ -1) >>> 0;
  }

  // XLSX is a ZIP archive. Store its small set of XML parts without compression.
  function zip(parts) {
    const encoder = new TextEncoder();
    const files = [];
    const directory = [];
    let offset = 0;
    let directorySize = 0;

    for (const [path, xml] of Object.entries(parts)) {
      const name = encoder.encode(path);
      const bytes = encoder.encode(xmlHeader + xml);
      const crc = crc32(bytes);

      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);
      local.setUint16(12, 33, true);
      local.setUint32(14, crc, true);
      local.setUint32(18, bytes.length, true);
      local.setUint32(22, bytes.length, true);
      local.setUint16(26, name.length, true);

      const central = new DataView(new ArrayBuffer(46));
      central.setUint32(0, 0x02014b50, true);
      central.setUint16(4, 20, true);
      central.setUint16(6, 20, true);
      central.setUint16(14, 33, true);
      central.setUint32(16, crc, true);
      central.setUint32(20, bytes.length, true);
      central.setUint32(24, bytes.length, true);
      central.setUint16(28, name.length, true);
      central.setUint32(42, offset, true);

      files.push(local, name, bytes);
      directory.push(central, name);
      offset += local.byteLength + name.length + bytes.length;
      directorySize += central.byteLength + name.length;
    }

    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, directory.length / 2, true);
    end.setUint16(10, directory.length / 2, true);
    end.setUint32(12, directorySize, true);
    end.setUint32(16, offset, true);
    return new Blob([...files, ...directory, end], {type: mime + '.sheet'});
  }

  function workbook(rows) {
    const values = [
      ['Магазин WB', 'МХ', 'Баркод (БК)', 'Артикул WB (НМ)', 'Название товара', 'Количество'],
      ...rows.map(([mx, , barcode, name, quantity, article, store]) => [
        String(store).trim(), String(mx), String(barcode), String(article), String(name),
        String(quantity).trim() && Number.isFinite(Number(quantity)) ? Number(quantity) : String(quantity)
      ])
    ];
    const sheetRows = values.map((row, index) => {
      const number = index + 1;
      const cells = row.map((value, column) => {
        const ref = 'ABCDEF'[column] + number;
        return typeof value === 'number'
          ? `<c r="${ref}"><v>${value}</v></c>`
          : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
      }).join('');
      return `<row r="${number}">${cells}</row>`;
    }).join('');

    return zip({
      '[Content_Types].xml': `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
        <Override PartName="/xl/workbook.xml" ContentType="${mime}.sheet.main+xml"/>
        <Override PartName="/xl/worksheets/sheet1.xml" ContentType="${mime}.worksheet+xml"/>
      </Types>`,
      '_rels/.rels': `<Relationships xmlns="${packageRelationships}">
        <Relationship Id="rId1" Type="${relationships}/officeDocument" Target="xl/workbook.xml"/>
      </Relationships>`,
      'xl/workbook.xml': `<workbook xmlns="${spreadsheet}" xmlns:r="${relationships}">
        <bookViews><workbookView/></bookViews>
        <sheets><sheet name="Остатки" sheetId="1" r:id="rId1"/></sheets>
      </workbook>`,
      'xl/_rels/workbook.xml.rels': `<Relationships xmlns="${packageRelationships}">
        <Relationship Id="rId1" Type="${relationships}/worksheet" Target="worksheets/sheet1.xml"/>
      </Relationships>`,
      'xl/worksheets/sheet1.xml': `<worksheet xmlns="${spreadsheet}">
        <sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
        <cols><col min="1" max="1" width="34" customWidth="1"/><col min="2" max="2" width="14" customWidth="1"/>
        <col min="3" max="4" width="22" customWidth="1"/><col min="5" max="5" width="54" customWidth="1"/>
        <col min="6" max="6" width="16" customWidth="1"/></cols>
        <sheetData>${sheetRows}</sheetData><autoFilter ref="A1:F${values.length}"/>
      </worksheet>`
    });
  }

  window.downloadStockXlsx = (rows, store) => {
    const date = new Intl.DateTimeFormat('sv-SE', {timeZone: 'Europe/Moscow'}).format(new Date());
    const filename = Array.from(store.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')).slice(0, 90).join('');
    const url = URL.createObjectURL(workbook(rows));
    const link = document.createElement('a');
    link.href = url;
    link.download = `Остатки — ${filename} — ${date}.xlsx`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };
})();
