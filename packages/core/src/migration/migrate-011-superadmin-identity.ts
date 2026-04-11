import mongoose from 'mongoose';
import { generateSuperadminToken, generateIdentityToken, maskToken } from '../common/token-utils';

interface MigrationResult {
  identitiesCreated: number;
  superadminUniqueId: string | null;
  collectionsStripped: string[];
  collectionsRenamed: string[];
  collectionsDropped: string[];
  skipped: string[];
}

async function collectionExists(db: mongoose.mongo.Db, name: string): Promise<boolean> {
  const collections = await db.listCollections({ name }).toArray();
  return collections.length > 0;
}

export async function migrate(mongoUri: string): Promise<MigrationResult> {
  const conn = await mongoose.createConnection(mongoUri).asPromise();
  const db = conn.db;
  if (!db) throw new Error('Failed to obtain database handle');

  const result: MigrationResult = {
    identitiesCreated: 0,
    superadminUniqueId: null,
    collectionsStripped: [],
    collectionsRenamed: [],
    collectionsDropped: [],
    skipped: [],
  };

  try {
    // ── Step 1: Convert tenants → identities ──────────────────────────
    const hasIdentities = await collectionExists(db, 'identities');
    const hasTenants = await collectionExists(db, 'tenants');

    if (hasTenants) {
      const tenantsCol = db.collection('tenants');
      const tenants = await tenantsCol.find({}).toArray();

      if (!hasIdentities || (await db.collection('identities').countDocuments()) === 0) {
        const identitiesCol = db.collection('identities');

        for (const tenant of tenants) {
          const slug = tenant.slug ?? tenant.name ?? tenant._id.toString();
          const displayName = tenant.name ?? slug;
          const isSuperAdmin = tenant.isSuperAdmin === true;

          const existing = await identitiesCol.findOne({ uniqueId: slug });
          if (existing) {
            result.skipped.push(`identity:${slug} (already exists)`);
            if (isSuperAdmin) result.superadminUniqueId = slug;
            continue;
          }

          const token = isSuperAdmin ? generateSuperadminToken() : generateIdentityToken();
          const now = new Date();

          await identitiesCol.insertOne({
            uniqueId: slug,
            displayName,
            token,
            isSuperAdmin,
            status: 'active',
            createdAt: now,
            updatedAt: now,
          });

          result.identitiesCreated++;
          if (isSuperAdmin) {
            result.superadminUniqueId = slug;
            console.log(`  ✓ Superadmin identity created: ${slug} (token: ${maskToken(token)})`);
          } else {
            console.log(`  ✓ Identity created: ${slug} (token: ${maskToken(token)})`);
          }
        }

        await identitiesCol.createIndex({ uniqueId: 1 }, { unique: true });
        await identitiesCol.createIndex({ token: 1 }, { unique: true });
      } else {
        result.skipped.push('identities collection already populated');
      }
    } else if (!hasIdentities) {
      result.skipped.push('no tenants collection found — nothing to convert');
    } else {
      result.skipped.push('tenants already removed; identities exist');
    }

    // ── Step 2: Strip tenantId from document collections ──────────────
    const collectionsToStrip = [
      'topics',
      'timeline_entries',
      'task_dispatches',
      'qa_exchanges',
    ];

    for (const colName of collectionsToStrip) {
      if (!(await collectionExists(db, colName))) {
        result.skipped.push(`strip:${colName} (collection not found)`);
        continue;
      }

      const col = db.collection(colName);
      const count = await col.countDocuments({ tenantId: { $exists: true } });
      if (count === 0) {
        result.skipped.push(`strip:${colName} (no tenantId fields)`);
        continue;
      }

      await col.updateMany({}, { $unset: { tenantId: '' } });
      result.collectionsStripped.push(`${colName} (${count} docs)`);
      console.log(`  ✓ Stripped tenantId from ${colName} (${count} documents)`);
    }

    // ── Step 3: Rename tenant_skill_configs → skill_configs ───────────
    if (await collectionExists(db, 'tenant_skill_configs')) {
      if (await collectionExists(db, 'skill_configs')) {
        result.skipped.push('rename:tenant_skill_configs (skill_configs already exists)');
      } else {
        await db.renameCollection('tenant_skill_configs', 'skill_configs');
        result.collectionsRenamed.push('tenant_skill_configs → skill_configs');
        console.log('  ✓ Renamed tenant_skill_configs → skill_configs');

        const skillConfigs = db.collection('skill_configs');
        const tenantIdCount = await skillConfigs.countDocuments({ tenantId: { $exists: true } });
        if (tenantIdCount > 0) {
          await skillConfigs.updateMany({}, { $unset: { tenantId: '' } });
          console.log(`  ✓ Stripped tenantId from skill_configs (${tenantIdCount} documents)`);
        }
      }
    } else {
      result.skipped.push('rename:tenant_skill_configs (collection not found)');
    }

    // ── Step 4: Drop obsolete collections ─────────────────────────────
    const collectionsToDrop = [
      'tenants',
      'pairing_codes',
      'user_identity_bindings',
      'executor_heartbeats',
    ];

    for (const colName of collectionsToDrop) {
      if (!(await collectionExists(db, colName))) {
        result.skipped.push(`drop:${colName} (not found)`);
        continue;
      }

      await db.dropCollection(colName);
      result.collectionsDropped.push(colName);
      console.log(`  ✓ Dropped collection: ${colName}`);
    }

    return result;
  } finally {
    await conn.close();
  }
}

if (require.main === module) {
  const uri = process.argv[2] || process.env.MONGODB_URI;
  if (!uri) {
    console.error('Usage: ts-node migrate-011-superadmin-identity.ts <mongodb-uri>');
    console.error('  or set MONGODB_URI environment variable');
    process.exit(1);
  }

  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  Migration 011: Superadmin Identity Model       ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log(`\nConnecting to ${uri}...\n`);

  migrate(uri)
    .then((result) => {
      console.log('\n── Migration Summary ──────────────────────────────');
      console.log(`  Identities created:    ${result.identitiesCreated}`);
      console.log(`  Superadmin:            ${result.superadminUniqueId ?? '(none)'}`);
      console.log(`  Collections stripped:  ${result.collectionsStripped.join(', ') || '(none)'}`);
      console.log(`  Collections renamed:   ${result.collectionsRenamed.join(', ') || '(none)'}`);
      console.log(`  Collections dropped:   ${result.collectionsDropped.join(', ') || '(none)'}`);
      if (result.skipped.length > 0) {
        console.log(`  Skipped:               ${result.skipped.join(', ')}`);
      }
      console.log('\n  ✓ Migration complete.\n');
      process.exit(0);
    })
    .catch((err) => {
      console.error('\n  ✗ Migration failed:', err);
      process.exit(1);
    });
}
