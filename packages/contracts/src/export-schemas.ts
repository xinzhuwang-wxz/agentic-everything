import { mkdir, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import * as contracts from './index.js';
await mkdir('dist/schemas', { recursive: true });
let count = 0;
for (const [name, schema] of Object.entries(contracts)) {
  if (name.endsWith('Schema') && schema instanceof z.ZodType) {
    await writeFile(`dist/schemas/${name}.json`, `${JSON.stringify(z.toJSONSchema(schema), null, 2)}\n`);
    count++;
  }
}
console.log(`Exported ${count} JSON Schema contracts to dist/schemas`);
