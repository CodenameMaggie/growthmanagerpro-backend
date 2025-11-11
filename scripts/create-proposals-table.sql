-- =====================================================
-- PROPOSALS TABLE SCHEMA
-- =====================================================
-- This table stores proposal/quote information for potential clients
-- Sits between Strategy Calls and Active Deals in the pipeline

CREATE TABLE proposals (
    -- Primary Key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant Isolation (CRITICAL for multi-tenancy)
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Client/Prospect Information
    prospect_name VARCHAR(255) NOT NULL,
    contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
    email VARCHAR(255),
    company VARCHAR(255),
    phone VARCHAR(50),

    -- Related Records
    strategy_call_id UUID REFERENCES strategy_calls(id) ON DELETE SET NULL,
    deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,

    -- Proposal Details
    proposal_title VARCHAR(500) NOT NULL DEFAULT 'Growth Management Proposal',
    proposal_number VARCHAR(100) UNIQUE,  -- e.g., PROP-2024-001

    -- Scope & Deliverables
    scope_of_work TEXT,  -- Main description of services
    deliverables TEXT[],  -- Array of deliverable items
    success_metrics TEXT[],  -- Array of success metrics/KPIs
    timeline VARCHAR(255),  -- e.g., "6 months", "Q1 2024"

    -- Pricing Information
    pricing_model VARCHAR(50) DEFAULT 'monthly_retainer',
    -- Options: monthly_retainer, project_based, performance_based, hybrid

    total_contract_value DECIMAL(12, 2),  -- Total contract value
    monthly_fee DECIMAL(10, 2),  -- Monthly recurring fee
    setup_fee DECIMAL(10, 2) DEFAULT 0,  -- One-time setup/onboarding fee
    payment_terms VARCHAR(255) DEFAULT 'Net 30',  -- Payment terms

    -- Recommended Tier/Package
    recommended_tier VARCHAR(50),  -- foundations, growth, scale, enterprise, custom
    recommended_systems TEXT[],  -- Array of recommended systems

    -- Proposal Status
    status VARCHAR(50) DEFAULT 'draft' NOT NULL,
    -- Options: draft, ready, sent, viewed, accepted, rejected, expired, negotiating

    -- Valid Through
    valid_until DATE,  -- Proposal expiration date

    -- Client Interaction Tracking
    sent_at TIMESTAMP,
    sent_by UUID REFERENCES users(id) ON DELETE SET NULL,
    viewed_at TIMESTAMP,  -- First time viewed
    view_count INTEGER DEFAULT 0,
    last_viewed_at TIMESTAMP,  -- Most recent view

    -- Decision Tracking
    accepted_at TIMESTAMP,
    rejected_at TIMESTAMP,
    rejection_reason TEXT,

    -- Follow-up
    follow_up_date DATE,
    next_action VARCHAR(255),

    -- Documents & Links
    proposal_url VARCHAR(500),  -- Link to PDF or external proposal doc
    presentation_url VARCHAR(500),  -- Link to presentation/deck

    -- Internal Notes
    notes TEXT,
    internal_notes TEXT,  -- Not visible to client

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW() NOT NULL,

    -- Indexes for Performance
    CONSTRAINT proposals_tenant_id_idx CHECK (tenant_id IS NOT NULL)
);

-- =====================================================
-- INDEXES
-- =====================================================

-- Tenant isolation (most important for queries)
CREATE INDEX idx_proposals_tenant_id ON proposals(tenant_id);

-- Status filtering
CREATE INDEX idx_proposals_status ON proposals(status);

-- Date filtering
CREATE INDEX idx_proposals_created_at ON proposals(created_at DESC);
CREATE INDEX idx_proposals_sent_at ON proposals(sent_at DESC);

-- Relationships
CREATE INDEX idx_proposals_contact_id ON proposals(contact_id);
CREATE INDEX idx_proposals_strategy_call_id ON proposals(strategy_call_id);
CREATE INDEX idx_proposals_deal_id ON proposals(deal_id);

-- Compound index for tenant + status (common query pattern)
CREATE INDEX idx_proposals_tenant_status ON proposals(tenant_id, status);

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================

-- Enable RLS on proposals table
ALTER TABLE proposals ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their tenant's proposals
CREATE POLICY "Users can only see their tenant's proposals"
ON proposals FOR SELECT
USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Policy: Users can only insert into their tenant
CREATE POLICY "Users can only insert into their tenant's proposals"
ON proposals FOR INSERT
WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Policy: Users can only update their tenant's proposals
CREATE POLICY "Users can only update their tenant's proposals"
ON proposals FOR UPDATE
USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Policy: Users can only delete their tenant's proposals
CREATE POLICY "Users can only delete their tenant's proposals"
ON proposals FOR DELETE
USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_proposals_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER proposals_updated_at_trigger
    BEFORE UPDATE ON proposals
    FOR EACH ROW
    EXECUTE FUNCTION update_proposals_updated_at();

-- Auto-generate proposal number
CREATE OR REPLACE FUNCTION generate_proposal_number()
RETURNS TRIGGER AS $$
DECLARE
    year_prefix VARCHAR(4);
    next_num INTEGER;
    new_number VARCHAR(100);
BEGIN
    IF NEW.proposal_number IS NULL THEN
        year_prefix := TO_CHAR(NOW(), 'YYYY');

        -- Get the next number for this year and tenant
        SELECT COALESCE(MAX(
            CAST(
                SUBSTRING(proposal_number FROM '\d+$') AS INTEGER
            )
        ), 0) + 1
        INTO next_num
        FROM proposals
        WHERE tenant_id = NEW.tenant_id
        AND proposal_number LIKE 'PROP-' || year_prefix || '-%';

        -- Format: PROP-YYYY-NNN (e.g., PROP-2024-001)
        new_number := 'PROP-' || year_prefix || '-' || LPAD(next_num::TEXT, 3, '0');
        NEW.proposal_number := new_number;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER proposals_number_trigger
    BEFORE INSERT ON proposals
    FOR EACH ROW
    EXECUTE FUNCTION generate_proposal_number();

-- =====================================================
-- SAMPLE DATA (OPTIONAL - for testing)
-- =====================================================

-- Uncomment to insert sample data
/*
INSERT INTO proposals (
    tenant_id,
    prospect_name,
    email,
    company,
    proposal_title,
    scope_of_work,
    deliverables,
    pricing_model,
    total_contract_value,
    monthly_fee,
    recommended_tier,
    status,
    valid_until
) VALUES (
    '00000000-0000-0000-0000-000000000000',  -- Replace with actual tenant_id
    'John Smith',
    'john@example.com',
    'Example Corp',
    'Growth Management & Lead Generation Proposal',
    'Comprehensive growth management including lead generation, pipeline management, and client success tracking.',
    ARRAY['Weekly strategy calls', 'Lead generation campaigns', 'Pipeline management', 'Monthly reporting'],
    'monthly_retainer',
    35640.00,  -- $2970/month * 12 months
    2970.00,
    'growth',
    'draft',
    CURRENT_DATE + INTERVAL '30 days'
);
*/

-- =====================================================
-- USEFUL QUERIES
-- =====================================================

-- Get all proposals for a tenant with status counts
/*
SELECT
    status,
    COUNT(*) as count,
    SUM(total_contract_value) as total_value
FROM proposals
WHERE tenant_id = 'YOUR_TENANT_ID'
GROUP BY status
ORDER BY count DESC;
*/

-- Get proposals needing follow-up
/*
SELECT
    id,
    prospect_name,
    company,
    status,
    follow_up_date,
    next_action
FROM proposals
WHERE tenant_id = 'YOUR_TENANT_ID'
  AND status IN ('sent', 'viewed', 'negotiating')
  AND follow_up_date <= CURRENT_DATE
ORDER BY follow_up_date ASC;
*/

-- Get proposal conversion rate
/*
SELECT
    COUNT(CASE WHEN status = 'accepted' THEN 1 END) as accepted_count,
    COUNT(CASE WHEN status IN ('rejected', 'expired') THEN 1 END) as lost_count,
    COUNT(*) as total_count,
    ROUND(
        100.0 * COUNT(CASE WHEN status = 'accepted' THEN 1 END) /
        NULLIF(COUNT(CASE WHEN status IN ('accepted', 'rejected', 'expired') THEN 1 END), 0),
        2
    ) as win_rate
FROM proposals
WHERE tenant_id = 'YOUR_TENANT_ID'
  AND sent_at IS NOT NULL;
*/

-- =====================================================
-- NOTES
-- =====================================================
--
-- Proposal Status Flow:
-- 1. draft → ready → sent → viewed → accepted → (creates deal)
-- 2. Alternative: sent → viewed → negotiating → accepted
-- 3. Alternative: sent → viewed → rejected
-- 4. Alternative: sent → expired (if past valid_until date)
--
-- Integration Points:
-- - Strategy Calls: Can create proposal from strategy call
-- - Deals: Accepted proposal creates a deal
-- - Contacts: Links to contact/prospect
-- - Pipeline: Shows as stage between strategy calls and deals
--
-- Multi-tenant Isolation:
-- - Every query MUST filter by tenant_id
-- - RLS policies enforce this at database level
-- - Indexes optimize tenant-filtered queries
--
