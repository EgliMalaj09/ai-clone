-- Launch credit packs (D3.2) and welcome credits (D3.4).
-- Prices are stored in minor units (x100). EUR uses cents; ALL must be whole lek (x100).
-- Idempotent: ON CONFLICT DO NOTHING creates each row once and never overwrites later admin edits.
-- Re-run safely with `pnpm seed:packs` (local) or `pnpm seed:packs -- --remote` (production).
INSERT INTO credit_packages (id,name,credits,bonus_credits,prices,active,sort_order,created_at,updated_at) VALUES
 ('pack_starter','Starter',100,0,'{"EUR":1499,"ALL":149900}',1,1,CAST(strftime('%s','now') AS INTEGER)*1000,CAST(strftime('%s','now') AS INTEGER)*1000)
 ON CONFLICT(id) DO NOTHING;
INSERT INTO credit_packages (id,name,credits,bonus_credits,prices,active,sort_order,created_at,updated_at) VALUES
 ('pack_creator','Creator',250,0,'{"EUR":2999,"ALL":299900}',1,2,CAST(strftime('%s','now') AS INTEGER)*1000,CAST(strftime('%s','now') AS INTEGER)*1000)
 ON CONFLICT(id) DO NOTHING;
INSERT INTO credit_packages (id,name,credits,bonus_credits,prices,active,sort_order,created_at,updated_at) VALUES
 ('pack_pro','Pro',550,0,'{"EUR":5999,"ALL":599900}',1,3,CAST(strftime('%s','now') AS INTEGER)*1000,CAST(strftime('%s','now') AS INTEGER)*1000)
 ON CONFLICT(id) DO NOTHING;
INSERT INTO credit_packages (id,name,credits,bonus_credits,prices,active,sort_order,created_at,updated_at) VALUES
 ('pack_studio','Studio',1200,0,'{"EUR":11999,"ALL":1199900}',1,4,CAST(strftime('%s','now') AS INTEGER)*1000,CAST(strftime('%s','now') AS INTEGER)*1000)
 ON CONFLICT(id) DO NOTHING;
-- Welcome credits: 10 after a verified sign-up (never expire). Leaves any existing admin value untouched.
INSERT INTO app_settings (key,value) VALUES ('welcome_credits','10') ON CONFLICT(key) DO NOTHING;
