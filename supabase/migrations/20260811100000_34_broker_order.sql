-- Broker display order, as specified by ECR marketing (2026-08-11).
--
-- This is the brokerage roster only — not the full team page on ecrtx.com,
-- which also lists property management, construction, accounting, marketing
-- and engineering staff. Matt Levin (Founder/CEO) is deliberately not in the
-- broker ordering either.
--
-- Matched on name rather than id so it applies cleanly to whichever brokers
-- the table actually holds. Anyone not on the list is pushed past 900 and
-- sorts to the end rather than being silently interleaved.

WITH broker_order(full_name, ord) AS (
  VALUES
    ('Jason Steinberg', 1),
    ('Patrick Ley', 2),
    ('Haley Smith', 3),
    ('Ryan Wilson', 4),
    ('Matt Fain', 5),
    ('David Dawkins', 6),
    ('Stephen Pannes', 7),
    ('Sean Couey', 8),
    ('Isaac Gutierrez', 9),
    ('Nick Owens', 10),
    ('Hannah Huskey', 11),
    ('Ross Chumley', 12),
    ('Cory Camp', 13),
    ('Charles Herst', 14),
    ('Stephen McMillen', 15)
)
UPDATE brokers b
SET display_order = o.ord
FROM broker_order o
WHERE lower(btrim(b.name)) = lower(o.full_name);

UPDATE brokers
SET display_order = 900 + display_order
WHERE display_order < 900
  AND lower(btrim(name)) NOT IN (
    'jason steinberg','patrick ley','haley smith','ryan wilson','matt fain',
    'david dawkins','stephen pannes','sean couey','isaac gutierrez','nick owens',
    'hannah huskey','ross chumley','cory camp','charles herst','stephen mcmillen'
  );
