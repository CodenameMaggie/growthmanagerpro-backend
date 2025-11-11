#!/usr/bin/env node
/**
 * Password Migration Script
 *
 * This script hashes all existing plaintext passwords in the database.
 *
 * Tables to migrate:
 * - users (password field → password_hash field)
 * - contacts (password field → password_hash field)
 *
 * Usage:
 *   node scripts/migrate-passwords.js
 *
 * Options:
 *   --dry-run    Show what would be updated without making changes
 *   --table=X    Migrate only specific table (users or contacts)
 */

const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials!');
  console.error('Please set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Parse command line arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const tableArg = args.find(arg => arg.startsWith('--table='));
const specificTable = tableArg ? tableArg.split('=')[1] : null;

const SALT_ROUNDS = 10;

/**
 * Check if a password is already hashed (bcrypt hashes start with $2)
 */
function isAlreadyHashed(password) {
  return password && password.startsWith('$2');
}

/**
 * Migrate passwords in the users table
 */
async function migrateUsersTable() {
  console.log('\n📋 Migrating users table...');

  // Fetch all users with plaintext passwords
  const { data: users, error: fetchError } = await supabase
    .from('users')
    .select('id, email, password, password_hash')
    .or('password.not.is.null,password_hash.not.is.null');

  if (fetchError) {
    console.error('❌ Error fetching users:', fetchError);
    return { migrated: 0, skipped: 0, errors: 0 };
  }

  console.log(`Found ${users.length} users`);

  let migrated = 0;
  let skipped = 0;
  let errors = 0;

  for (const user of users) {
    const password = user.password_hash || user.password;

    if (!password) {
      console.log(`⚠️  User ${user.email}: No password found, skipping`);
      skipped++;
      continue;
    }

    if (isAlreadyHashed(password)) {
      console.log(`✅ User ${user.email}: Already hashed, skipping`);
      skipped++;
      continue;
    }

    if (dryRun) {
      console.log(`🔍 [DRY RUN] Would hash password for: ${user.email}`);
      migrated++;
      continue;
    }

    try {
      // Hash the password
      const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

      // Update the user record
      const { error: updateError } = await supabase
        .from('users')
        .update({
          password_hash: hashedPassword,
          password: null,  // Clear old plaintext field
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);

      if (updateError) {
        console.error(`❌ User ${user.email}: Update failed -`, updateError.message);
        errors++;
      } else {
        console.log(`✅ User ${user.email}: Password hashed successfully`);
        migrated++;
      }
    } catch (error) {
      console.error(`❌ User ${user.email}: Hash failed -`, error.message);
      errors++;
    }
  }

  return { migrated, skipped, errors };
}

/**
 * Migrate passwords in the contacts table (clients)
 */
async function migrateContactsTable() {
  console.log('\n📋 Migrating contacts table...');

  // Fetch all contacts with plaintext passwords
  const { data: contacts, error: fetchError } = await supabase
    .from('contacts')
    .select('id, email, name, password, password_hash')
    .or('password.not.is.null,password_hash.not.is.null');

  if (fetchError) {
    console.error('❌ Error fetching contacts:', fetchError);
    return { migrated: 0, skipped: 0, errors: 0 };
  }

  console.log(`Found ${contacts.length} contacts`);

  let migrated = 0;
  let skipped = 0;
  let errors = 0;

  for (const contact of contacts) {
    const password = contact.password_hash || contact.password;
    const displayName = contact.email || contact.name || contact.id;

    if (!password) {
      console.log(`⚠️  Contact ${displayName}: No password found, skipping`);
      skipped++;
      continue;
    }

    if (isAlreadyHashed(password)) {
      console.log(`✅ Contact ${displayName}: Already hashed, skipping`);
      skipped++;
      continue;
    }

    if (dryRun) {
      console.log(`🔍 [DRY RUN] Would hash password for: ${displayName}`);
      migrated++;
      continue;
    }

    try {
      // Hash the password
      const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

      // Update the contact record
      const { error: updateError } = await supabase
        .from('contacts')
        .update({
          password_hash: hashedPassword,
          password: null,  // Clear old plaintext field
          updated_at: new Date().toISOString()
        })
        .eq('id', contact.id);

      if (updateError) {
        console.error(`❌ Contact ${displayName}: Update failed -`, updateError.message);
        errors++;
      } else {
        console.log(`✅ Contact ${displayName}: Password hashed successfully`);
        migrated++;
      }
    } catch (error) {
      console.error(`❌ Contact ${displayName}: Hash failed -`, error.message);
      errors++;
    }
  }

  return { migrated, skipped, errors };
}

/**
 * Main migration function
 */
async function main() {
  console.log('🔒 Password Migration Script');
  console.log('============================');

  if (dryRun) {
    console.log('🔍 Running in DRY RUN mode - no changes will be made');
  }

  if (specificTable) {
    console.log(`📌 Migrating only: ${specificTable} table`);
  }

  console.log('');

  const results = {
    users: { migrated: 0, skipped: 0, errors: 0 },
    contacts: { migrated: 0, skipped: 0, errors: 0 }
  };

  // Migrate users table
  if (!specificTable || specificTable === 'users') {
    results.users = await migrateUsersTable();
  }

  // Migrate contacts table
  if (!specificTable || specificTable === 'contacts') {
    results.contacts = await migrateContactsTable();
  }

  // Print summary
  console.log('\n📊 Migration Summary');
  console.log('====================');

  if (!specificTable || specificTable === 'users') {
    console.log('\nUsers table:');
    console.log(`  ✅ Migrated: ${results.users.migrated}`);
    console.log(`  ⏭️  Skipped: ${results.users.skipped}`);
    console.log(`  ❌ Errors: ${results.users.errors}`);
  }

  if (!specificTable || specificTable === 'contacts') {
    console.log('\nContacts table:');
    console.log(`  ✅ Migrated: ${results.contacts.migrated}`);
    console.log(`  ⏭️  Skipped: ${results.contacts.skipped}`);
    console.log(`  ❌ Errors: ${results.contacts.errors}`);
  }

  const totalMigrated = results.users.migrated + results.contacts.migrated;
  const totalErrors = results.users.errors + results.contacts.errors;

  console.log('\nTotal:');
  console.log(`  ✅ Migrated: ${totalMigrated}`);
  console.log(`  ❌ Errors: ${totalErrors}`);

  if (dryRun) {
    console.log('\n🔍 This was a DRY RUN - no changes were made');
    console.log('Run without --dry-run to perform actual migration');
  } else if (totalErrors > 0) {
    console.log('\n⚠️  Migration completed with errors - please review above');
    process.exit(1);
  } else {
    console.log('\n✅ Migration completed successfully!');
  }
}

// Run the migration
main().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
