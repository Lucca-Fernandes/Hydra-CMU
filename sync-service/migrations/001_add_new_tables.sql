-- Migration 001: Novas tabelas para endpoints adicionais + suporte incremental
-- Executar manualmente no Neon Postgres antes do primeiro uso do sync_v2.js

-- Contatos (Responsáveis Legais, Financeiros, Titulares)
CREATE TABLE IF NOT EXISTS cmu_contacts (
    id          INT PRIMARY KEY,
    data        JSONB NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Customers (Perfis de Acesso / Grupos)
CREATE TABLE IF NOT EXISTS cmu_customers (
    id          INT PRIMARY KEY,
    data        JSONB NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Prospectors (Parceiros Comerciais)
CREATE TABLE IF NOT EXISTS cmu_prospectors (
    id          INT PRIMARY KEY,
    data        JSONB NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Vouchers (Cupons / Contratos)
CREATE TABLE IF NOT EXISTS cmu_vouchers (
    id          INT PRIMARY KEY,
    data        JSONB NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Extensão do sync_control para modo incremental
ALTER TABLE sync_control
    ADD COLUMN IF NOT EXISTS last_sync_completed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS sync_mode TEXT DEFAULT 'full';
