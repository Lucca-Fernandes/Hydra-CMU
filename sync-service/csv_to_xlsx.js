const fs = require('fs');
const ExcelJS = require('exceljs');

const CSV = process.argv[2];
if (!CSV) { console.error('uso: node csv_to_xlsx.js <arquivo.csv>'); process.exit(1); }
const OUT = CSV.replace(/\.csv$/, '.xlsx');
const ROWS_PER_SHEET = 1_000_000;

(async () => {
  console.log(`[in]  ${CSV}`);
  console.log(`[out] ${OUT}`);

  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ filename: OUT, useStyles: false, useSharedStrings: false });

  let headers = null;
  let sheet = null;
  let sheetIdx = 0;
  let rowInSheet = 0;
  let totalRows = 0;

  function newSheet() {
    sheetIdx++;
    rowInSheet = 0;
    sheet = workbook.addWorksheet(`Desembolso_${sheetIdx}`);
    sheet.addRow(headers).commit();
  }

  function emitRow(fields) {
    if (headers === null) {
      headers = fields;
      newSheet();
      return;
    }
    sheet.addRow(fields).commit();
    rowInSheet++;
    totalRows++;
    if (rowInSheet >= ROWS_PER_SHEET) {
      sheet.commit();
      console.log(`[sheet ${sheetIdx}] ${rowInSheet} linhas | total ${totalRows}`);
      newSheet();
    }
    if (totalRows % 100_000 === 0) {
      console.log(`[progress] ${totalRows} linhas (aba ${sheetIdx}, ${rowInSheet} na aba)`);
    }
  }

  // Stateful CSV parser (RFC 4180-ish): handles quoted fields, escaped quotes, newlines inside quotes.
  let cur = '';
  let fields = [];
  let inQ = false;
  let prevWasQuoteInQ = false;

  const stream = fs.createReadStream(CSV, { encoding: 'utf8', highWaterMark: 1 << 20 });

  for await (const chunk of stream) {
    for (let i = 0; i < chunk.length; i++) {
      const c = chunk[i];
      if (inQ) {
        if (prevWasQuoteInQ) {
          prevWasQuoteInQ = false;
          if (c === '"') { cur += '"'; continue; }
          // the previous " closed the quote
          inQ = false;
          // fallthrough to unquoted handling of c
        } else if (c === '"') {
          prevWasQuoteInQ = true;
          continue;
        } else {
          cur += c;
          continue;
        }
      }
      // unquoted
      if (c === '"') { inQ = true; continue; }
      if (c === ',') { fields.push(cur); cur = ''; continue; }
      if (c === '\n') {
        fields.push(cur); cur = '';
        emitRow(fields);
        fields = [];
        continue;
      }
      if (c === '\r') continue;
      cur += c;
    }
  }
  // flush last record if file doesn't end with newline
  if (prevWasQuoteInQ) { inQ = false; prevWasQuoteInQ = false; }
  if (cur.length > 0 || fields.length > 0) {
    fields.push(cur);
    emitRow(fields);
  }

  if (sheet) sheet.commit();
  await workbook.commit();
  console.log(`[done] ${totalRows} linhas em ${sheetIdx} abas -> ${OUT}`);
})();
