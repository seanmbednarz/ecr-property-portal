ALTER TABLE properties ADD COLUMN IF NOT EXISTS slug text;

UPDATE properties SET slug = '7600-burnet'        WHERE id = '892a44b2-c3c0-4c59-b039-2e54f43ea19c';
UPDATE properties SET slug = 'arboretum-plaza-ii' WHERE id = '5fb7debc-2941-4591-b26e-9c2d1600883c';
UPDATE properties SET slug = 'austin-oaks-bldg-2' WHERE id = 'fc67a182-3ff5-4caa-bbda-5d3c17e5d070';
UPDATE properties SET slug = 'echelon-iv'         WHERE id = '0bf7731e-e8b6-4282-be9a-3238576aacd7';
UPDATE properties SET slug = 'reunion-park-i'     WHERE id = 'de60ab84-414d-437d-bf80-866b394b9bf8';
UPDATE properties SET slug = 'stonebridge-plaza-i' WHERE id = '40e2103e-353d-4191-8728-d753a5f64362';
UPDATE properties SET slug = 'the-park'           WHERE id = '8830b968-6186-449b-b45c-7811ec2bb236';
UPDATE properties SET slug = 'ufcu-plaza'         WHERE id = '3e67e7ab-269f-46c7-9816-fc88d0b88acb';

ALTER TABLE properties ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS properties_slug_key ON properties(slug);
