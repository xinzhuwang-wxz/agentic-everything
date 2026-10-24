export * from './agents-model.js';
export * from './file-model.js';
/** This is an explicit unavailable deployment gate, not a replacement durable engine. */
export const durabilityQualification = Object.freeze({ owner: 'DBOS OSS', status: 'pending-postgresql-qualification', productionReady: false, fixturePersistence: 'in-memory only', required: ['PostgreSQL configured by operator', 'DBOS model-step replay test', 'approval atomic-consume transaction', 'crash-after-write receipt reconciliation', 'cross-process resume and version pinning'] });
