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
-- TABELA: stations
-- Estações / locais maiores (ex: Estação 11)
-- =========================================================
CREATE TABLE stations (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    location VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =========================================================
-- TABELA: zones
-- Zonas físicas monitoradas
-- =========================================================
CREATE TABLE zones (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description VARCHAR(255),
    station_id BIGINT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_zone_station
        FOREIGN KEY (station_id)
        REFERENCES stations(id)
        ON DELETE CASCADE
);

-- =========================================================
-- TABELA: cameras
-- Cadastro das câmeras Vivotek
-- =========================================================
CREATE TABLE cameras (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,

    camera_id VARCHAR(100) NOT NULL UNIQUE,   -- Serial / Device_ID
    name VARCHAR(255),
    model VARCHAR(100),
    location VARCHAR(255) UNIQUE,             -- IP ou local físico
    enabled BOOLEAN DEFAULT TRUE,

    zone_id BIGINT NULL,
    last_seen TIMESTAMP NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_camera_zone
        FOREIGN KEY (zone_id)
        REFERENCES zones(id)
        ON DELETE SET NULL
);

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
        REFERENCES cameras(id)
);

CREATE INDEX idx_raw_time ON raw_payloads (received_at);
CREATE INDEX idx_raw_camera ON raw_payloads (camera_id);

-- =========================================================
-- TABELA: people_count_events
-- Eventos normalizados (opcional, futuro)
-- =========================================================
CREATE TABLE people_count_events (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,

    camera_id BIGINT NOT NULL,
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
        REFERENCES zones(id)
);

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

    name VARCHAR(150) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,

    role ENUM('ADMIN','MANAGER','OPERATOR','VIEWER') DEFAULT 'VIEWER',
    active BOOLEAN DEFAULT TRUE,

    last_login DATETIME NULL,

    reset_token VARCHAR(255) NULL,
    reset_token_expires DATETIME NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

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
    z.name AS zona, 
    s.name AS estacao
FROM cameras c
INNER JOIN zones z ON c.zone_id = z.id
INNER JOIN stations s ON z.station_id = s.id;


INSERT INTO raw_payloads (camera_id, received_at, raw_json)
VALUES (
    1, 
    NOW(), 
    '{"Data": [{"CountingInfo": [{"In": 10, "Out": 5}]}]}'
);

