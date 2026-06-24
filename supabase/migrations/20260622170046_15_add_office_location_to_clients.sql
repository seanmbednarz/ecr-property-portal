ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS office_address text,
  ADD COLUMN IF NOT EXISTS office_lat double precision,
  ADD COLUMN IF NOT EXISTS office_lng double precision;

UPDATE clients SET
  office_address = '3305 Steck Ave, Austin, TX 78757',
  office_lat     = 30.366114,
  office_lng     = -97.739604
WHERE company ILIKE '%Austin Capital Bank%';

UPDATE clients SET
  office_address = '2408 Manor Rd, Austin, TX 78722',
  office_lat     = 30.285509,
  office_lng     = -97.716680
WHERE company ILIKE '%SMB Design%';
