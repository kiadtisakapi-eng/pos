// Older unit suites use tiny bill-only Sheets. Add real persistent ledger sheets and SHA-256,
// while preserving their existing bill grids and injected PropertiesService failures.
const { createGasEnv } = require('./gas_env');
const crypto = require('crypto');
const ledgers = new WeakMap();
const spreadsheetLedgers = new WeakMap();
module.exports = function upgradeGasHarness(ctx, store) {
  let ledger = ledgers.get(store);
  if (!ledger) { ledger = createGasEnv().ss; ledgers.set(store, ledger); }
  let active = ledger;
  ctx.Utilities = Object.assign({}, ctx.Utilities, {
    getUuid: () => crypto.randomUUID(),
    DigestAlgorithm: { SHA_256: 'SHA_256' }, Charset: { UTF_8: 'UTF_8' },
    computeDigest: (algorithm, text) => [...crypto.createHash('sha256').update(String(text)).digest()]
  });
  ctx.SpreadsheetApp = Object.assign({ flush() {} }, ctx.SpreadsheetApp,
    { getActiveSpreadsheet: () => active });
  function adopt(ss, data) {
    if (ss._ledgerAdapter) { active = ss; return; }
    if (ss._ledgerKey) {
      if (!spreadsheetLedgers.has(ss._ledgerKey)) spreadsheetLedgers.set(ss._ledgerKey, createGasEnv().ss);
      ledger = spreadsheetLedgers.get(ss._ledgerKey);
    }
    const get = ss.getSheetByName.bind(ss), insert = ss.insertSheet && ss.insertSheet.bind(ss);
    const all = ss.getSheets && ss.getSheets.bind(ss);
    const known = new Map();
    ss.getSheetByName = name => {
      if (name.startsWith('_POS_')) return ledger.getSheetByName(name);
      const sh = get(name);
      if (sh) { known.set(name, sh); if (!sh.getName) sh.getName = () => name; }
      return sh;
    };
    ss.insertSheet = (name, pos) => {
      if (name.startsWith('_POS_')) return ledger.insertSheet(name, pos);
      const sh = insert(name, pos); known.set(name, sh); if (!sh.getName) sh.getName = () => name;
      return sh;
    };
    if (data && data.monthKey) ss.getSheetByName(data.monthKey);
    ss.getSheets = () => [...new Set([...(all ? all() : known.values()), ...ledger.getSheets()])]
      .filter(sh => typeof sh.getName === 'function');
    ss._ledgerAdapter = true; active = ss;
  }
  for (const name of ['handleTransaction', 'handleVoidTransaction']) {
    const original = ctx[name];
    ctx[name] = (data, ss) => { adopt(ss, data); return original(data, ss); };
  }
};
