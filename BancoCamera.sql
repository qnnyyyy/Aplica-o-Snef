-- =========================================================
-- BANCO DE DADOS
-- Sistema de Contagem de Pessoas - Vivotek
-- Empresa: SNEF
-- =========================================================

CREATE DATABASE IF NOT EXISTS snef_people_count
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE snef_people_count;

-- =========================================================
-- TABELA: tenants
-- Clientes/empresas do sistema (multi-tenant)
-- =========================================================
CREATE TABLE tenants (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    -- Cada tenant JÁ é uma estação/localidade (ex: "Linha 11 Prata") — não existe
    -- uma tabela separada de "estações" dentro do tenant, seria redundante.
    location VARCHAR(255) NULL,
    -- Admin principal/dono da localidade. Ninguém consegue alterar a
    -- permissão desse usuário pela aplicação — só mexendo direto no banco.
    owner_user_id BIGINT NULL,
    -- Chave usada pelas câmeras para autenticar o push de eventos deste tenant
    api_key VARCHAR(64) NULL UNIQUE,

    -- Alerta de superlotação: dispara quando "pessoas no local agora" passa desse valor
    capacity_alert_threshold INT NULL,
    capacity_alert_sent_at DATETIME NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO tenants (id, name, api_key) VALUES (1, 'SNEF', SUBSTRING(SHA2(CONCAT(RAND(), NOW()), 256), 1, 40));

-- =========================================================
-- TABELA: zones
-- Zonas físicas monitoradas dentro da localidade (tenant)
-- =========================================================
CREATE TABLE zones (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT NOT NULL DEFAULT 1,
    name VARCHAR(100) NOT NULL,
    description VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_zones_tenant
        FOREIGN KEY (tenant_id)
        REFERENCES tenants(id)
);

CREATE INDEX idx_zones_tenant ON zones(tenant_id);

-- =========================================================
-- TABELA: cameras
-- Cadastro das câmeras Vivotek
-- =========================================================
CREATE TABLE cameras (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT NOT NULL DEFAULT 1,

    camera_id VARCHAR(100) NOT NULL UNIQUE,   -- Serial / Device_ID
    name VARCHAR(255),
    osd_text VARCHAR(100),                    -- Nome exibido na própria imagem (OSD)
    model VARCHAR(100),
    camera_user VARCHAR(100),                 -- Usuário de acesso à API da câmera
    camera_password_enc VARCHAR(500),         -- Senha criptografada (AES-256-GCM)
    location VARCHAR(255) UNIQUE,             -- IP ou local físico
    enabled BOOLEAN DEFAULT TRUE,

    zone_id BIGINT NULL,
    last_seen TIMESTAMP NULL,
    last_alert_sent_at DATETIME NULL,          -- evita reenviar alerta de câmera offline repetidamente
    whatsapp_alert_stage INT NOT NULL DEFAULT 0,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_camera_zone
        FOREIGN KEY (zone_id)
        REFERENCES zones(id)
        ON DELETE SET NULL,

    CONSTRAINT fk_cameras_tenant
        FOREIGN KEY (tenant_id)
        REFERENCES tenants(id)
);

CREATE INDEX idx_cameras_tenant ON cameras(tenant_id);

-- =========================================================
-- TABELA: rules
-- Regras analíticas (VCA)
-- =========================================================
CREATE TABLE rules (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description VARCHAR(255),
    type ENUM(
        'FlowPath',
        'LineCrossing',
        'AreaEnter',
        'AreaExit',
        'PeopleCounting',
        'Other'
    ) DEFAULT 'PeopleCounting',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =========================================================
-- TABELA: raw_payloads
-- Guarda o JSON bruto enviado pela câmera
-- =========================================================
CREATE TABLE raw_payloads (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,

    camera_id BIGINT NOT NULL,
    tenant_id BIGINT NOT NULL DEFAULT 1,
    raw_json JSON NOT NULL,
    received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Campos derivados do JSON (para performance)
    direction VARCHAR(5)
        GENERATED ALWAYS AS (
            JSON_UNQUOTE(JSON_EXTRACT(raw_json,'$.direction'))
        ) STORED,

    count_val INT
        GENERATED ALWAYS AS (
            JSON_EXTRACT(raw_json,'$.count')
        ) STORED,

    CONSTRAINT fk_raw_camera
        FOREIGN KEY (camera_id)
        REFERENCES cameras(id),

    CONSTRAINT fk_raw_payloads_tenant
        FOREIGN KEY (tenant_id)
        REFERENCES tenants(id)
);

CREATE INDEX idx_raw_time ON raw_payloads (received_at);
CREATE INDEX idx_raw_camera ON raw_payloads (camera_id);
CREATE INDEX idx_raw_payloads_tenant ON raw_payloads (tenant_id);

-- =========================================================
-- TABELA: people_count_events
-- Eventos normalizados (opcional, futuro)
-- =========================================================
CREATE TABLE people_count_events (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,

    camera_id BIGINT NOT NULL,
    tenant_id BIGINT NOT NULL DEFAULT 1,
    rule_id BIGINT NULL,
    zone_id BIGINT NULL,

    direction ENUM('IN','OUT','UNKNOWN'),
    count INT NOT NULL DEFAULT 1,

    object_type VARCHAR(50),
    object_attributes JSON,

    event_time DATETIME NOT NULL,
    received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_event_time (event_time),

    CONSTRAINT fk_event_camera
        FOREIGN KEY (camera_id)
        REFERENCES cameras(id),

    CONSTRAINT fk_event_rule
        FOREIGN KEY (rule_id)
        REFERENCES rules(id),

    CONSTRAINT fk_event_zone
        FOREIGN KEY (zone_id)
        REFERENCES zones(id),

    CONSTRAINT fk_pce_tenant
        FOREIGN KEY (tenant_id)
        REFERENCES tenants(id)
);

CREATE INDEX idx_pce_tenant ON people_count_events(tenant_id);

-- =========================================================
-- TABELA: daily_counts
-- Agregação diária
-- =========================================================
CREATE TABLE daily_counts (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,

    camera_id BIGINT NOT NULL,
    rule_id BIGINT NULL,
    date DATE NOT NULL,

    total_in BIGINT DEFAULT 0,
    total_out BIGINT DEFAULT 0,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE KEY uq_daily (camera_id, rule_id, date),

    CONSTRAINT fk_daily_camera
        FOREIGN KEY (camera_id)
        REFERENCES cameras(id),

    CONSTRAINT fk_daily_rule
        FOREIGN KEY (rule_id)
        REFERENCES rules(id)
);

-- =========================================================
-- TABELA: hourly_counts
-- Agregação horária
-- =========================================================
CREATE TABLE hourly_counts (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,

    camera_id BIGINT NOT NULL,
    rule_id BIGINT NULL,
    date DATE NOT NULL,
    hour TINYINT NOT NULL, -- 0 a 23

    total_in BIGINT DEFAULT 0,
    total_out BIGINT DEFAULT 0,
    
    

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE KEY uq_hourly (camera_id, rule_id, date, hour),

    CONSTRAINT fk_hourly_camera
        FOREIGN KEY (camera_id)
        REFERENCES cameras(id),

    CONSTRAINT fk_hourly_rule
        FOREIGN KEY (rule_id)
        REFERENCES rules(id)
);

-- =========================================================
-- TABELA: users
-- Usuários do sistema
-- =========================================================
CREATE TABLE users (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT NOT NULL DEFAULT 1,

    name VARCHAR(150) NOT NULL,
    email VARCHAR(150) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,

    -- DONO só é atribuído pela aplicação (cadastro com a chave de dono ou criação
    -- de nova localização por quem já é dono) — nunca pela tela de Permissões.
    role ENUM('ADMIN','MANAGER','OPERATOR','VIEWER','DONO') DEFAULT 'VIEWER',
    active BOOLEAN DEFAULT TRUE,

    -- "Manutenção" é só uma etiqueta visual/contato, não uma permissão — não afeta acesso.
    -- Quem tem a tag recebe os alertas de câmera offline também por WhatsApp.
    is_maintenance BOOLEAN DEFAULT FALSE,
    phone_number VARCHAR(30) NULL,

    last_login DATETIME NULL,

    reset_token VARCHAR(255) NULL,
    reset_token_expires DATETIME NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    -- Mesmo e-mail pode ter uma conta admin em um tenant e viewer em outro;
    -- só não pode repetir dentro do mesmo tenant.
    UNIQUE KEY uq_users_email_tenant (email, tenant_id),

    CONSTRAINT fk_users_tenant
        FOREIGN KEY (tenant_id)
        REFERENCES tenants(id)
);

CREATE INDEX idx_users_tenant ON users(tenant_id);

-- =========================================================
-- TABELA: pending_registrations
-- Pedidos de cadastro (Admin/Operador) aguardando aprovação de
-- um admin ou dono da localidade escolhida. Dono não passa por aqui,
-- pois ele cria a própria localidade na hora.
-- =========================================================
CREATE TABLE pending_registrations (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT NOT NULL,

    name VARCHAR(150) NOT NULL,
    email VARCHAR(150) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    requested_role ENUM('ADMIN','VIEWER') NOT NULL,
    status ENUM('PENDING','APPROVED','REJECTED') DEFAULT 'PENDING',
    phone_number VARCHAR(30) NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    decided_at DATETIME NULL,
    decided_by VARCHAR(150) NULL,

    -- token usado nos links de Aprovar/Rejeitar do e-mail de notificação;
    -- some (status muda pra PENDING só uma vez) assim que alguém decide
    decision_token VARCHAR(64) NULL,
    decision_token_expires DATETIME NULL,

    CONSTRAINT fk_pending_tenant
        FOREIGN KEY (tenant_id)
        REFERENCES tenants(id)
);

CREATE INDEX idx_pending_tenant ON pending_registrations(tenant_id);
CREATE INDEX idx_pending_email ON pending_registrations(email);
CREATE INDEX idx_pending_token ON pending_registrations(decision_token);

-- =========================================================
-- TABELA: login_attempts
-- Histórico de tentativas de login, usado pra bloquear força bruta
-- =========================================================
CREATE TABLE login_attempts (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(150) NOT NULL,
    success BOOLEAN NOT NULL,
    ip VARCHAR(64) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_login_attempts_email ON login_attempts(email, created_at);

-- =========================================================
-- TABELA: camera_alerts
-- Histórico de câmeras que caíram/voltaram — alimenta o sininho de
-- notificação e o relatório semanal de atividade das câmeras
-- =========================================================
CREATE TABLE camera_alerts (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    camera_id BIGINT NULL,
    camera_name VARCHAR(255) NULL,
    type ENUM('OFFLINE','ONLINE') NOT NULL,
    read_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_camera_alerts_tenant
        FOREIGN KEY (tenant_id)
        REFERENCES tenants(id)
);

CREATE INDEX idx_camera_alerts_tenant ON camera_alerts(tenant_id, created_at);

-- =========================================================
-- TABELA: audit_log
-- Registro de ações administrativas (convites, mudança de permissão, remoção)
-- =========================================================
CREATE TABLE audit_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    actor_name VARCHAR(150) NULL,
    actor_email VARCHAR(150) NULL,
    action VARCHAR(64) NOT NULL,
    target_email VARCHAR(150) NULL,
    details VARCHAR(500) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_audit_tenant
        FOREIGN KEY (tenant_id)
        REFERENCES tenants(id)
);

CREATE INDEX idx_audit_tenant ON audit_log(tenant_id);

-- =========================================================
-- TRIGGER: Agregação automática ao inserir payload
-- =========================================================
DELIMITER //

CREATE TRIGGER after_raw_payload_insert
AFTER INSERT ON raw_payloads
FOR EACH ROW
BEGIN
    DECLARE v_in INT DEFAULT 0;
    DECLARE v_out INT DEFAULT 0;
    DECLARE v_date DATE;
    DECLARE v_hour TINYINT;

    SET v_in = IFNULL(
        JSON_EXTRACT(NEW.raw_json,'$.Data[0].CountingInfo[0].In'), 0
    );
    SET v_out = IFNULL(
        JSON_EXTRACT(NEW.raw_json,'$.Data[0].CountingInfo[0].Out'), 0
    );

    SET v_date = DATE(NEW.received_at);
    SET v_hour = HOUR(NEW.received_at);

    INSERT INTO daily_counts (camera_id, date, total_in, total_out)
    VALUES (NEW.camera_id, v_date, v_in, v_out)
    ON DUPLICATE KEY UPDATE
        total_in = total_in + v_in,
        total_out = total_out + v_out;

    INSERT INTO hourly_counts (camera_id, date, hour, total_in, total_out)
    VALUES (NEW.camera_id, v_date, v_hour, v_in, v_out)
    ON DUPLICATE KEY UPDATE
        total_in = total_in + v_in,
        total_out = total_out + v_out;
END//

DELIMITER ;


SELECT
    c.name AS camera,
    z.name AS zona
FROM cameras c
INNER JOIN zones z ON c.zone_id = z.id;


INSERT INTO raw_payloads (camera_id, received_at, raw_json)
VALUES (
    1, 
    NOW(), 
    '{"Data": [{"CountingInfo": [{"In": 10, "Out": 5}]}]}'
);

