# Database Migration Guide - 3 Role Implementation

## Current Issue
The system needs to migrate from separate `Jukir` model to using `User` table with role-based Jurik accounts. However, existing database has:
- 4 rows in `jukir` table
- Foreign key constraints in `transaction` table referencing `jukir.id`

## Migration Strategy

### Option 1: Fresh Start (Recommended for Development)
Since this is a development environment with seedable data:

1. **Backup current data (optional)**
   ```bash
   # Export existing data if needed
   pg_dump -h localhost -p 5434 -U postgres sess > backup_before_3role.sql
   ```

2. **Reset database**
   ```bash
   cd C:\Smart-EvaluationSensing-Statistical-System\backend
   
   # Drop all tables
   psql -h localhost -p 5434 -U postgres -d sess -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
   
   # Recreate schema
   npx prisma db push --accept-data-loss
   ```

3. **Re-seed with new data structure**
   ```bash
   npm run db:seed
   ```

### Option 2: Data Migration Script (For Production)

Create a Node.js script to migrate Jukir data to User table:

```javascript
// scripts/migrate-jukir-to-user.js
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('tempPassword123', 10);
  
  // Get all existing Jurik data
  const jukirs = await prisma.jukir.findMany({
    include: { transactions: true }
  });
  
  console.log(`Migrating ${jukirs.length} Jurik accounts...`);
  
  // Create User accounts for each Jurik
  const migratedJukirs = [];
  for (const jukir of jukirs) {
    const email = `jukir.${jukir.name.toLowerCase().replace(/\s/g, '.')}@local`;
    
    const user = await prisma.user.create({
      data: {
        name: jukir.name,
        email: email,
        passwordHash: passwordHash,
        role: 'JUKIR',
        areaId: jukir.areaId,
        status: 'ACTIVE'
      }
    });
    
    migratedJukirs.push({
      jukirId: jukir.id,
      userId: user.id,
      email: email
    });
    
    // Update transactions to reference new user
    await prisma.transaction.updateMany({
      where: { jukirId: jukir.id },
      data: { jukirId: user.id }
    });
  }
  
  console.log('Migration completed!');
  console.table(migratedJukirs);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

Run migration:
```bash
node scripts/migrate-jukir-to-user.js
```

Then drop old Jukir table:
```bash
npx prisma db push
```

### Option 3: Manual SQL Migration

Execute SQL directly:

```sql
-- Step 1: Create users from existing jurik
INSERT INTO "user" (id, name, email, passwordhash, role, status, "areaId", "createdAt", "updatedAt")
SELECT 
    gen_random_uuid() as id,
    name,
    'jukir_' || lower(regexp_replace(name, '[^a-zA-Z0-9]', '.', 'g')) || '@local' as email,
    '$2b$10$randomhash...' as passwordhash, -- hashed password
    'JUKIR' as role,
    'ACTIVE' as status,
    "areaId",
    now() as "createdAt",
    now() as "updatedAt"
FROM jukir;

-- Step 2: Update transaction table to reference new user IDs
UPDATE transaction t
SET "jukirId" = u.id
FROM "user" u
WHERE t."jukirId"::text LIKE 'jukir_%' 
  AND u."areaId" = t."areaId";

-- Step 3: Drop old jukir table
DROP TABLE jukir;

-- Step 4: Drop foreign key constraint on transaction if still exists
ALTER TABLE transaction 
DROP CONSTRAINT IF EXISTS transaction_jukirid_fkey;

ALTER TABLE transaction 
ADD CONSTRAINT transaction_jukirid_fkey 
FOREIGN KEY ("jukirId") REFERENCES "user"(id) ON DELETE SET NULL;
```

## Recommended Approach

For development/testing: **Option 1** (Fresh start)
- Quick and clean
- No data loss concerns
- Easy to repeat

For production: **Option 2** (Script) or **Option 3** (Manual SQL)
- Preserves existing data
- Proper audit trail
- Can be tested separately

## Post-Migration Verification

After migration completes:

1. **Check User records**
```bash
npm run db:seed
# Verify output shows created users
```

2. **Verify relationships**
```javascript
// In TypeScript/Node
const juriks = await prisma.user.findMany({
  where: { role: 'JUKIR' },
  include: { area: true }
});
console.log('Jurik count:', juriks.length);
```

3. **Test API endpoints**
```bash
# Test authentication
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@sess.local","password":"password123"}'
```

## Troubleshooting

### Error: Foreign key constraint violation
**Cause:** Transaction table has `jukirId` referencing dropped `jukir` table

**Solution:** Update foreign key before dropping table
```sql
ALTER TABLE transaction 
DROP CONSTRAINT transaction_jukirid_fkey;

-- After creating users, add back
ALTER TABLE transaction 
ADD CONSTRAINT transaction_jukirid_fkey 
FOREIGN KEY ("jukirId") REFERENCES "user"(id) ON DELETE SET NULL;
```

### Error: Duplicate email
**Cause:** Email already exists when creating Jurik users

**Solution:** Use unique email pattern
```typescript
const email = `jurik_${Date.now()}_${uuid}@local`;
```

### Error: Cannot find type 'Jukir'
**Cause:** Schema still references old Jukir model

**Solution:** Ensure schema.prisma doesn't have model Jukir anymore and all relations updated

## Success Criteria

✅ No more `model Jukir` in schema  
✅ User table has records with `role = 'JUKIR'`  
✅ Transaction.jukirId references User.id  
✅ Area assignment works via User.areaId  
✅ Seed data creates Jurik accounts correctly  
✅ All API endpoints work with new role system  

---

## Quick Command Reference

### For Development Environment
```bash
cd backend
npx prisma db push --accept-data-loss
npm run db:seed
```

### For Testing Migration
```bash
npm run db:migration:check  # Custom script to verify data
```

### Rollback (if needed)
```bash
# Restore from backup
pg_restore -h localhost -p 5434 -U postgres backup_before_3role.sql
```
