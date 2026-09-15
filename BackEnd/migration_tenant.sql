-- =========================================================
-- MIGRAÇÃO: adicionar suporte multi-tenant
-- O código do backend (apiRouter, cameraRouter, zonaRouter,
-- stationRouter, authRouter, tenantMiddleware) já assume
-- tenant_id em todas as tabelas e uma tabela `tenants`,
-- mas o schema original nunca foi atualizado para isso.
-- =========================================================

CREATE TABLE IF NOT EXISTS tenants (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO tenants (id, name)
SELECT 1, 'SNEF'
WHERE NOT EXISTS (SELECT 1 FROM tenants WHERE id = 1);

ALTER TABLE users ADD COLUMN tenant_id BIGINT NOT NULL DEFAULT 1 AFTER id;
ALTER TABLE cameras ADD COLUMN tenant_id BIGINT NOT NULL DEFAULT 1 AFTER id;
ALTER TABLE zones ADD COLUMN tenant_id BIGINT NOT NULL DEFAULT 1 AFTER id;
ALTER TABLE stations ADD COLUMN tenant_id BIGINT NOT NULL DEFAULT 1 AFTER id;
ALTER TABLE raw_payloads ADD COLUMN tenant_id BIGINT NOT NULL DEFAULT 1 AFTER camera_id;
ALTER TABLE people_count_events ADD COLUMN tenant_id BIGINT NOT NULL DEFAULT 1 AFTER camera_id;

ALTER TABLE users ADD CONSTRAINT fk_users_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE cameras ADD CONSTRAINT fk_cameras_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE zones ADD CONSTRAINT fk_zones_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE stations ADD CONSTRAINT fk_stations_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE raw_payloads ADD CONSTRAINT fk_raw_payloads_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE people_count_events ADD CONSTRAINT fk_pce_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_cameras_tenant ON cameras(tenant_id);
CREATE INDEX idx_zones_tenant ON zones(tenant_id);
CREATE INDEX idx_stations_tenant ON stations(tenant_id);
CREATE INDEX idx_raw_payloads_tenant ON raw_payloads(tenant_id);
CREATE INDEX idx_pce_tenant ON people_count_events(tenant_id);
