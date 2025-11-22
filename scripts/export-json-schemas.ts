#!/usr/bin/env tsx

import * as fs from 'fs';
import * as path from 'path';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  HandshakeSchema,
  IntentSchema,
  IntentResultSchema,
  EventSchema,
  StateSyncSchema,
  AckSchema,
  ReplayRequestSchema,
  ReplayResponseSchema,
  FSMTransitionSchema,
  ErrorSchema,
} from '../packages/core/src/message-schemas.js';

/**
 * Export all Zod schemas as JSON Schema files.
 * 
 * Usage: tsx scripts/export-json-schemas.ts
 */

const SCHEMAS_DIR = path.join(__dirname, '..', 'schemas');

// Ensure schemas directory exists
if (!fs.existsSync(SCHEMAS_DIR)) {
  fs.mkdirSync(SCHEMAS_DIR, { recursive: true });
}

const schemas = [
  { name: 'handshake', schema: HandshakeSchema },
  { name: 'intent', schema: IntentSchema },
  { name: 'intent-result', schema: IntentResultSchema },
  { name: 'event', schema: EventSchema },
  { name: 'state-sync', schema: StateSyncSchema },
  { name: 'ack', schema: AckSchema },
  { name: 'replay-request', schema: ReplayRequestSchema },
  { name: 'replay-response', schema: ReplayResponseSchema },
  { name: 'fsm-transition', schema: FSMTransitionSchema },
  { name: 'error', schema: ErrorSchema },
];

console.log('Exporting JSON schemas...\n');

for (const { name, schema } of schemas) {
  try {
    const jsonSchema = zodToJsonSchema(schema, {
      name: `${name.charAt(0).toUpperCase() + name.slice(1)}Schema`,
      target: 'openApi3',
    });
    
    const filePath = path.join(SCHEMAS_DIR, `${name}.schema.json`);
    fs.writeFileSync(filePath, JSON.stringify(jsonSchema, null, 2));
    
    console.log(`✅ Exported ${name}.schema.json`);
  } catch (error: any) {
    console.error(`❌ Failed to export ${name}:`, error.message);
  }
}

// Create index file
const indexContent = {
  schemas: schemas.map(s => ({
    name: s.name,
    file: `${s.name}.schema.json`,
  })),
  exportedAt: new Date().toISOString(),
};

fs.writeFileSync(
  path.join(SCHEMAS_DIR, 'index.json'),
  JSON.stringify(indexContent, null, 2)
);

console.log(`\n✅ Exported ${schemas.length} JSON schemas to ${SCHEMAS_DIR}`);
console.log(`✅ Created index.json`);

