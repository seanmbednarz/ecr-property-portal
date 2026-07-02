-- Lead broker per client: the lead displays first wherever a client's
-- brokers are listed (dashboard footer, detail page, clients table).
ALTER TABLE client_brokers ADD COLUMN IF NOT EXISTS is_lead boolean NOT NULL DEFAULT false;
