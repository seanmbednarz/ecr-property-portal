
-- Seed brokers
INSERT INTO brokers (id, name, title, phone, email, display_order)
VALUES
  ('a1000000-0000-0000-0000-000000000001', 'Patrick Ley', 'SIOR CCIM', '512.505.0002', 'pley@ecrtx.com', 1),
  ('a1000000-0000-0000-0000-000000000002', 'Ross Chumley', NULL, '512.505.0029', 'rchumley@ecrtx.com', 2)
ON CONFLICT (id) DO NOTHING;
