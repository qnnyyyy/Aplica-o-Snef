-- =========================================================
-- MIGRAÇÃO: suporte a Live View / API da câmera
-- Adiciona credenciais (usuário/senha criptografada) e o
-- texto de OSD (nome exibido na própria imagem da câmera).
-- =========================================================

ALTER TABLE cameras ADD COLUMN osd_text VARCHAR(100) NULL AFTER name;
ALTER TABLE cameras ADD COLUMN camera_user VARCHAR(100) NULL AFTER model;
ALTER TABLE cameras ADD COLUMN camera_password_enc VARCHAR(500) NULL AFTER camera_user;
