-- =========================================================
-- MIGRAÇÃO: admin principal (dono) imutável por tenant
-- O admin que criou a localidade não pode ter a permissão
-- alterada por nenhum outro admin — só mexendo direto no banco.
-- =========================================================

ALTER TABLE tenants ADD COLUMN owner_user_id BIGINT NULL AFTER name;
