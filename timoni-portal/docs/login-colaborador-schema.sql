-- RASCUNHO PARA REVISÃO. Não executado. Não há inicialização automática na aplicação.
-- Nome, unidade e contato continuam no cadastro oficial. A política individual é vinculada pelo mesmo id.
BEGIN;
CREATE TABLE portal_collaborator_credentials (
  collaborator_id TEXT PRIMARY KEY CHECK (length(collaborator_id) BETWEEN 1 AND 128),
  username TEXT NOT NULL UNIQUE CHECK (username ~ '^[a-z0-9][a-z0-9._-]{2,63}$'),
  password_hash TEXT NOT NULL,
  credential_version INTEGER NOT NULL DEFAULT 1 CHECK (credential_version > 0),
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE portal_collaborator_access_policy (
  collaborator_id TEXT PRIMARY KEY REFERENCES portal_collaborator_credentials(collaborator_id) ON DELETE RESTRICT,
  profile TEXT NOT NULL CHECK (profile IN ('administracao-cica', 'administracao-marcelo',
    'gestao-rio-claro', 'vendedores-rio-claro', 'estoque-rio-claro',
    'gestao-araras', 'vendedores-araras', 'estoque-araras', 'motorista-leitura', 'legado')),
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(permissions) = 'object'),
  mobile_modules JSONB CHECK (mobile_modules IS NULL OR jsonb_typeof(mobile_modules) = 'array'),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE portal_collaborator_login_limits (
  bucket TEXT PRIMARY KEY CHECK (bucket ~ '^[0-9a-f]{64}$'),
  window_started_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL CHECK (attempts > 0)
);
COMMIT;
