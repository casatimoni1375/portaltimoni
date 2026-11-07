-- RASCUNHO NÃO EXECUTADO. Aplicação explícita necessária antes da ativação.
-- Não altera, copia, apaga ou atribui mensagens das tabelas portal_chat_* antigas.
BEGIN;
CREATE TABLE portal_person_chat_conversations (
  id BIGSERIAL PRIMARY KEY,
  user_a TEXT NOT NULL REFERENCES portal_collaborator_credentials(collaborator_id) ON DELETE RESTRICT,
  user_b TEXT NOT NULL REFERENCES portal_collaborator_credentials(collaborator_id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (user_a <> user_b), UNIQUE (user_a, user_b)
);
CREATE TABLE portal_person_chat_messages (
  id BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES portal_person_chat_conversations(id) ON DELETE RESTRICT,
  sender_id TEXT NOT NULL REFERENCES portal_collaborator_credentials(collaborator_id) ON DELETE RESTRICT,
  recipient_id TEXT NOT NULL REFERENCES portal_collaborator_credentials(collaborator_id) ON DELETE RESTRICT,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), read_at TIMESTAMPTZ, edited_at TIMESTAMPTZ,
  CHECK (sender_id <> recipient_id)
);
CREATE INDEX portal_person_chat_messages_thread_idx ON portal_person_chat_messages (conversation_id, id DESC);
CREATE INDEX portal_person_chat_unread_idx ON portal_person_chat_messages (recipient_id, conversation_id) WHERE read_at IS NULL;
COMMIT;
