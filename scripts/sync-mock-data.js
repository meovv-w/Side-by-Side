const fs = require('fs');
const path = require('path');

const store = require('../miniprogram/utils/mockStore');
const output = path.join(__dirname, 'mock-data.json');

fs.writeFileSync(output, `${JSON.stringify({
  collections: store.getSeed(),
  mode: 'local-product-mode',
  source: 'miniprogram/utils/mockStore.js',
  generatedAt: new Date().toISOString()
}, null, 2)}\n`);

console.log(`mock data synced: ${output}`);
