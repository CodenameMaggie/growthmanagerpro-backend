# Supabase Tables Required for Growth Manager Pro

## 📊 Complete Table List (27 Tables)

### 🔐 AUTHENTICATION & USERS (Critical for Login/Signup)

#### 1. **users** (CRITICAL)
Multi-role user table for admin, advisor, consultant, saas users

**Columns:**
- `id` (uuid, primary key)
- `email` (text, unique, required)
- `password_hash` (text, required) - bcrypt hashed
- `full_name` (text, required)
- `name` (text)
- `role` (text, required) - 'admin', 'advisor', 'consultant', 'saas', 'client'
- `status` (text) - 'active', 'pending', 'inactive'
- `company` (text)
- `phone` (text)
- `specialization` (text) - for advisors
- `tenant_id` (uuid, foreign key → tenants.id)
- `stripe_customer_id` (text) - for SaaS users
- `stripe_subscription_id` (text)
- `tier` (text) - 'starter', 'professional', 'enterprise'
- `trial_ends_at` (timestamptz)
- `permissions` (jsonb)
- `terms_accepted_at` (timestamptz)
- `privacy_accepted_at` (timestamptz)
- `created_at` (timestamptz, default now())
- `updated_at` (timestamptz)

**Used by:** login.js, signup-advisor.js, signup-consultant.js, signup-saas.js, signup-invited.js

---

#### 2. **contacts** (CRITICAL)
Client contacts - separate from users table, used for client login

**Columns:**
- `id` (uuid, primary key)
- `tenant_id` (uuid, foreign key → tenants.id, required)
- `email` (text, required)
- `password_hash` (text) - for client portal login
- `name` (text, required)
- `full_name` (text)
- `company` (text)
- `phone` (text)
- `role` (text) - defaults to 'client'
- `status` (text) - 'active', 'inactive'
- `last_contact_date` (timestamptz)
- `created_at` (timestamptz, default now())
- `updated_at` (timestamptz)

**Used by:** login.js, contacts.js, prospects.js, deals.js

---

#### 3. **tenants** (CRITICAL)
Multi-tenant isolation - each business has a tenant record

**Columns:**
- `id` (uuid, primary key)
- `business_name` (text, required)
- `subdomain` (text, unique, required) - for SaaS tenants
- `owner_name` (text)
- `owner_email` (text)
- `stripe_customer_id` (text)
- `stripe_subscription_id` (text)
- `subscription_status` (text) - 'active', 'trialing', 'canceled'
- `tier` (text) - 'starter', 'professional', 'enterprise'
- `trial_ends_at` (timestamptz)
- `max_users` (integer)
- `max_clients` (integer)
- `max_storage_gb` (integer)
- `created_at` (timestamptz, default now())
- `updated_at` (timestamptz)

**Used by:** signup-saas.js, check-subdomain.js, all API endpoints (for tenant_id filtering)

---

#### 4. **invitations**
User invitations for team members

**Columns:**
- `id` (uuid, primary key)
- `tenant_id` (uuid, foreign key → tenants.id)
- `email` (text, required)
- `role` (text, required) - 'advisor', 'consultant', 'client'
- `token` (text, unique, required)
- `status` (text) - 'pending', 'accepted', 'expired'
- `invited_by` (uuid, foreign key → users.id)
- `expires_at` (timestamptz)
- `created_at` (timestamptz, default now())

**Used by:** invitations.js, signup-invited.js, verify-invitation.js

---

### 🤝 RELATIONSHIPS & CONNECTIONS

#### 5. **advisor_client_relationships**
Links advisors to their clients

**Columns:**
- `id` (uuid, primary key)
- `tenant_id` (uuid, foreign key → tenants.id)
- `advisor_id` (uuid, foreign key → users.id)
- `client_id` (uuid, foreign key → users.id or contacts.id)
- `relationship_type` (text) - 'primary', 'secondary'
- `permission_level` (text) - 'view', 'edit', 'admin'
- `status` (text) - 'active', 'inactive', 'pending'
- `created_at` (timestamptz, default now())

**Used by:** advisor/advisor-clients.js

---

#### 6. **connection_invitations**
Pending connection requests between users

**Columns:**
- `id` (uuid, primary key)
- `tenant_id` (uuid, foreign key → tenants.id)
- `inviter_email` (text)
- `inviter_type` (text) - 'advisor', 'consultant', 'client'
- `invitee_email` (text)
- `invitee_type` (text)
- `status` (text) - 'pending', 'accepted', 'declined'
- `created_at` (timestamptz, default now())

**Used by:** connection-request.js

---

### 💬 MESSAGING & COMMUNICATION

#### 7. **messages**
Client-advisor messaging

**Columns:**
- `id` (uuid, primary key)
- `tenant_id` (uuid, foreign key → tenants.id)
- `client_id` (uuid, foreign key → contacts.id or users.id)
- `sender_id` (uuid)
- `sender_type` (text) - 'advisor', 'client'
- `author` (text) - display name
- `content` (text, required)
- `message_type` (text) - 'text', 'file', 'system'
- `read` (boolean, default false)
- `read_at` (timestamptz)
- `created_at` (timestamptz, default now())

**Used by:** clients/[id]/messages.js, client-dashboard/messages.js

---

#### 8. **advisor_discussions**
Internal team discussions/notes

**Columns:**
- `id` (uuid, primary key)
- `tenant_id` (uuid, foreign key → tenants.id)
- `client_id` (uuid)
- `advisor_id` (uuid, foreign key → users.id)
- `content` (text)
- `discussion_type` (text) - 'note', 'strategy', 'update'
- `created_at` (timestamptz, default now())

**Used by:** advisor/discussion.js

---

#### 9. **advisor_files**
File storage for advisors

**Columns:**
- `id` (uuid, primary key)
- `tenant_id` (uuid, foreign key → tenants.id)
- `advisor_id` (uuid, foreign key → users.id)
- `client_id` (uuid)
- `file_name` (text)
- `file_url` (text)
- `file_type` (text)
- `file_size` (bigint)
- `created_at` (timestamptz, default now())

**Used by:** advisor/files.js

---

### 📞 CALL TRACKING

#### 10. **pre_qualification_calls**
Pre-qualification call records

**Columns:**
- `id` (uuid, primary key)
- `tenant_id` (uuid, foreign key → tenants.id)
- `contact_id` (uuid, foreign key → contacts.id)
- `call_date` (timestamptz)
- `duration` (integer) - minutes
- `status` (text) - 'scheduled', 'completed', 'no-show'
- `outcome` (text) - 'qualified', 'not-qualified', 'follow-up'
- `notes` (text)
- `recording_url` (text)
- `transcript` (text)
- `created_at` (timestamptz, default now())

**Used by:** pre-qualification-calls.js

---

#### 11. **podcast_interviews**
Podcast interview tracking

**Columns:**
- `id` (uuid, primary key)
- `tenant_id` (uuid, foreign key → tenants.id)
- `contact_id` (uuid, foreign key → contacts.id)
- `interview_date` (timestamptz)
- `duration` (integer)
- `status` (text) - 'scheduled', 'completed', 'cancelled'
- `podcast_name` (text)
- `episode_title` (text)
- `recording_url` (text)
- `transcript` (text)
- `notes` (text)
- `created_at` (timestamptz, default now())

**Used by:** podcast-interviews.js

---

#### 12. **discovery_calls**
Discovery call records

**Columns:**
- `id` (uuid, primary key)
- `tenant_id` (uuid, foreign key → tenants.id)
- `contact_id` (uuid, foreign key → contacts.id)
- `call_date` (timestamptz)
- `duration` (integer)
- `status` (text) - 'scheduled', 'completed', 'no-show'
- `pain_points` (text)
- `goals` (text)
- `budget` (numeric)
- `timeline` (text)
- `decision_maker` (boolean)
- `recording_url` (text)
- `transcript` (text)
- `ai_analysis` (jsonb)
- `created_at` (timestamptz, default now())

**Used by:** discovery-calls.js, ai-analyzer.js

---

#### 13. **strategy_calls**
Strategy session records

**Columns:**
- `id` (uuid, primary key)
- `tenant_id` (uuid, foreign key → tenants.id)
- `contact_id` (uuid, foreign key → contacts.id)
- `call_date` (timestamptz)
- `duration` (integer)
- `status` (text)
- `strategy_focus` (text)
- `action_items` (jsonb)
- `next_steps` (text)
- `recording_url` (text)
- `transcript` (text)
- `created_at` (timestamptz, default now())

**Used by:** strategy-calls.js

---

### 💼 SALES & BUSINESS

#### 14. **prospects**
Prospect/lead tracking

**Columns:**
- `id` (uuid, primary key)
- `tenant_id` (uuid, foreign key → tenants.id)
- `name` (text, required)
- `email` (text)
- `company` (text)
- `phone` (text)
- `source` (text) - 'website', 'referral', 'linkedin', etc.
- `status` (text) - 'new', 'contacted', 'qualified', 'converted'
- `notes` (text)
- `created_at` (timestamptz, default now())

**Used by:** prospects.js

---

#### 15. **deals**
Sales pipeline deals

**Columns:**
- `id` (uuid, primary key)
- `tenant_id` (uuid, foreign key → tenants.id)
- `client_name` (text, required)
- `company` (text)
- `contact_id` (uuid, foreign key → contacts.id)
- `contract_value` (numeric)
- `monthly_fee` (numeric)
- `status` (text) - 'active', 'client', 'won', 'lost'
- `stage` (text) - pipeline stage
- `probability` (integer) - 0-100
- `expected_close_date` (date)
- `notes` (text)
- `created_at` (timestamptz, default now())

**Used by:** deals.js, clients/active.js

---

#### 16. **proposals**
Client proposals

**Columns:**
- `id` (uuid, primary key)
- `tenant_id` (uuid, foreign key → tenants.id)
- `prospect_name` (text, required)
- `company` (text)
- `email` (text)
- `phone` (text)
- `scope_of_work` (text)
- `deliverables` (text)
- `timeline` (text)
- `total_contract_value` (numeric)
- `monthly_retainer` (numeric)
- `pricing_model` (text) - 'monthly_retainer', 'fixed_price', 'hourly'
- `status` (text) - 'draft', 'sent', 'accepted', 'declined'
- `sent_date` (date)
- `accepted_date` (date)
- `valid_until` (date)
- `notes` (text)
- `created_at` (timestamptz, default now())

**Used by:** proposals.js

---

#### 17. **pipeline**
Custom pipeline stages

**Columns:**
- `id` (uuid, primary key)
- `tenant_id` (uuid, foreign key → tenants.id)
- `stage_name` (text)
- `stage_order` (integer)
- `color` (text)
- `created_at` (timestamptz, default now())

**Used by:** pipeline.js

---

### 📅 PROJECT MANAGEMENT

#### 18. **sprints**
Project sprint tracking

**Columns:**
- `id` (uuid, primary key)
- `tenant_id` (uuid, foreign key → tenants.id)
- `client_id` (uuid)
- `sprint_name` (text)
- `sprint_number` (integer)
- `start_date` (date)
- `end_date` (date)
- `status` (text) - 'planning', 'active', 'completed'
- `goals` (text)
- `deliverables` (jsonb)
- `created_at` (timestamptz, default now())

**Used by:** sprints.js, sprints/sprints-unified.js

---

#### 19. **tasks**
Sprint tasks

**Columns:**
- `id` (uuid, primary key)
- `tenant_id` (uuid, foreign key → tenants.id)
- `sprint_id` (uuid, foreign key → sprints.id)
- `title` (text, required)
- `description` (text)
- `assigned_to` (uuid)
- `status` (text) - 'todo', 'in-progress', 'done'
- `priority` (text) - 'low', 'medium', 'high'
- `due_date` (date)
- `created_at` (timestamptz, default now())

**Used by:** sprints.js

---

#### 20. **blockers**
Sprint blockers

**Columns:**
- `id` (uuid, primary key)
- `tenant_id` (uuid, foreign key → tenants.id)
- `sprint_id` (uuid, foreign key → sprints.id)
- `task_id` (uuid, foreign key → tasks.id)
- `description` (text, required)
- `severity` (text) - 'low', 'medium', 'high', 'critical'
- `status` (text) - 'open', 'resolved'
- `resolved_at` (timestamptz)
- `created_at` (timestamptz, default now())

**Used by:** sprints.js

---

### 📢 MARKETING

#### 21. **campaigns**
Marketing campaign tracking

**Columns:**
- `id` (uuid, primary key)
- `tenant_id` (uuid, foreign key → tenants.id)
- `campaign_name` (text, required)
- `campaign_type` (text) - 'email', 'linkedin', 'ads'
- `status` (text) - 'draft', 'active', 'paused', 'completed'
- `start_date` (date)
- `end_date` (date)
- `target_audience` (text)
- `budget` (numeric)
- `metrics` (jsonb) - clicks, opens, conversions, etc.
- `created_at` (timestamptz, default now())

**Used by:** campaigns.js

---

### ⚙️ SETTINGS & CONFIGURATION

#### 22. **tenant_settings**
Tenant-specific configurations

**Columns:**
- `id` (uuid, primary key)
- `tenant_id` (uuid, foreign key → tenants.id, unique)
- `settings` (jsonb)
- `branding` (jsonb) - logo, colors, etc.
- `integrations` (jsonb) - API keys, webhooks
- `created_at` (timestamptz, default now())
- `updated_at` (timestamptz)

**Used by:** settings.js

---

#### 23. **availability**
User availability schedules

**Columns:**
- `id` (uuid, primary key)
- `tenant_id` (uuid, foreign key → tenants.id)
- `user_id` (uuid, foreign key → users.id)
- `day_of_week` (text) - 'monday', 'tuesday', etc.
- `start_time` (time)
- `end_time` (time)
- `timezone` (text)
- `is_available` (boolean)
- `created_at` (timestamptz, default now())

**Used by:** availability.js, availability-sync.js

---

#### 24. **engagement_templates**
Email/message templates

**Columns:**
- `id` (uuid, primary key)
- `tenant_id` (uuid, foreign key → tenants.id)
- `template_name` (text)
- `template_type` (text) - 'email', 'sms', 'message'
- `subject` (text)
- `body` (text)
- `variables` (jsonb)
- `created_at` (timestamptz, default now())

**Used by:** engagement-templates.js

---

### 💰 FINANCIAL

#### 25. **cash_flow**
Financial transactions

**Columns:**
- `id` (uuid, primary key)
- `tenant_id` (uuid, foreign key → tenants.id)
- `transaction_date` (date)
- `description` (text)
- `category` (text) - 'income', 'expense'
- `amount` (numeric)
- `client_id` (uuid)
- `payment_method` (text)
- `status` (text) - 'pending', 'completed', 'cancelled'
- `created_at` (timestamptz, default now())

**Used by:** cash-flow.js

---

#### 26. **subscription_history**
Subscription change history

**Columns:**
- `id` (uuid, primary key)
- `tenant_id` (uuid, foreign key → tenants.id)
- `stripe_subscription_id` (text)
- `action` (text) - 'created', 'upgraded', 'downgraded', 'cancelled'
- `old_tier` (text)
- `new_tier` (text)
- `change_date` (timestamptz)
- `created_at` (timestamptz, default now())

**Used by:** subscription webhooks

---

### 🎥 MEDIA

#### 27. **call-recordings**
Call recording metadata (actual files in storage)

**Columns:**
- `id` (uuid, primary key)
- `tenant_id` (uuid, foreign key → tenants.id)
- `call_id` (uuid) - references to any call table
- `call_type` (text) - 'prequal', 'discovery', 'strategy', 'podcast'
- `recording_url` (text)
- `transcript_url` (text)
- `duration` (integer)
- `file_size` (bigint)
- `created_at` (timestamptz, default now())

**Used by:** various call management APIs

---

## 🔑 CRITICAL INDEXES NEEDED

```sql
-- Authentication lookups
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_contacts_email ON contacts(email);
CREATE INDEX idx_tenants_subdomain ON tenants(subdomain);

-- Tenant filtering (most critical for multi-tenancy)
CREATE INDEX idx_users_tenant_id ON users(tenant_id);
CREATE INDEX idx_contacts_tenant_id ON contacts(tenant_id);
CREATE INDEX idx_deals_tenant_id ON deals(tenant_id);
CREATE INDEX idx_messages_tenant_id ON messages(tenant_id);
CREATE INDEX idx_sprints_tenant_id ON sprints(tenant_id);

-- Relationship lookups
CREATE INDEX idx_advisor_relationships_advisor_id ON advisor_client_relationships(advisor_id);
CREATE INDEX idx_advisor_relationships_client_id ON advisor_client_relationships(client_id);

-- Message queries
CREATE INDEX idx_messages_client_id ON messages(client_id);
CREATE INDEX idx_messages_created_at ON messages(created_at DESC);

-- Invitation lookups
CREATE INDEX idx_invitations_token ON invitations(token);
CREATE INDEX idx_invitations_email ON invitations(email);
```

---

## 🚨 ROW LEVEL SECURITY (RLS) POLICIES NEEDED

All tables MUST have RLS enabled with tenant isolation:

```sql
-- Example for users table
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own tenant data"
ON users FOR SELECT
USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY "Users can insert into own tenant"
ON users FOR INSERT
WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

Apply similar policies to ALL tables with tenant_id.

---

## ✅ VERIFICATION CHECKLIST

- [ ] All 27 tables created in Supabase
- [ ] All columns match API expectations
- [ ] Indexes created for performance
- [ ] RLS policies enabled on all tables
- [ ] Foreign key constraints added
- [ ] Default values set (timestamps, booleans)
- [ ] UUID generation enabled (uuid_generate_v4())
- [ ] Environment variables configured in Vercel:
  - [ ] NEXT_PUBLIC_SUPABASE_URL
  - [ ] SUPABASE_SERVICE_ROLE_KEY
  - [ ] ANTHROPIC_API_KEY
  - [ ] STRIPE_SECRET_KEY
