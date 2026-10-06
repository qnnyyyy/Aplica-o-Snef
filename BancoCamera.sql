CREATE DATABASE IF NOT EXISTS snef_people_count
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE snef_people_count;

CREATE TABLE tenants (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    location VARCHAR(255) NULL,
    owner_user_id BIGINT NULL,
    api_key VARCHAR(64) NULL UNIQUE,

    capacity_alert_threshold INT NULL,
    capacity_alert_sent_at DATETIME NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO tenants (id, name, api_key) VALUES (1, 'SNEF', SUBSTRING(SHA2(CONCAT(RAND(), NOW()), 256), 1, 40));

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

CREATE TABLE cameras (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT NOT NULL DEFAULT 1,

    camera_id VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(255),
    osd_text VARCHAR(100),
    model VARCHAR(100),
    camera_user VARCHAR(100),
    camera_password_enc VARCHAR(500),
    location VARCHAR(255) UNIQUE,
    enabled BOOLEAN DEFAULT TRUE,

    zone_id BIGINT NULL,
    last_seen TIMESTAMP NULL,
    last_alert_sent_at DATETIME NULL,
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

CREATE TABLE raw_payloads (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,

    camera_id BIGINT NOT NULL,
    tenant_id BIGINT NOT NULL DEFAULT 1,
    raw_json JSON NOT NULL,
    received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

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

CREATE TABLE hourly_counts (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,

    camera_id BIGINT NOT NULL,
    rule_id BIGINT NULL,
    date DATE NOT NULL,
    hour TINYINT NOT NULL,

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

CREATE TABLE users (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT NOT NULL DEFAULT 1,

    name VARCHAR(150) NOT NULL,
    email VARCHAR(150) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,

    role ENUM('ADMIN','MANAGER','OPERATOR','VIEWER','DONO') DEFAULT 'VIEWER',
    active BOOLEAN DEFAULT TRUE,

    is_maintenance BOOLEAN DEFAULT FALSE,
    phone_number VARCHAR(30) NULL,

    last_login DATETIME NULL,

    reset_token VARCHAR(255) NULL,
    reset_token_expires DATETIME NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE KEY uq_users_email_tenant (email, tenant_id),

    CONSTRAINT fk_users_tenant
        FOREIGN KEY (tenant_id)
        REFERENCES tenants(id)
);

CREATE INDEX idx_users_tenant ON users(tenant_id);

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

    decision_token VARCHAR(64) NULL,
    decision_token_expires DATETIME NULL,

    CONSTRAINT fk_pending_tenant
        FOREIGN KEY (tenant_id)
        REFERENCES tenants(id)
);

CREATE INDEX idx_pending_tenant ON pending_registrations(tenant_id);
CREATE INDEX idx_pending_email ON pending_registrations(email);
CREATE INDEX idx_pending_token ON pending_registrations(decision_token);

CREATE TABLE login_attempts (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(150) NOT NULL,
    success BOOLEAN NOT NULL,
    ip VARCHAR(64) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_login_attempts_email ON login_attempts(email, created_at);

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

