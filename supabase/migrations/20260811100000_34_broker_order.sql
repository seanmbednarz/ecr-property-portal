-- Order brokers to match the team page on ecrtx.com, so the portal's Brokers
-- tab and the broker pickers on the client/property forms read in the same
-- sequence people already know from the website.
--
-- Brokerage roster only. The website's team page also lists property
-- management, construction, accounting, marketing and engineering staff —
-- those aren't brokers and don't belong in this table's ordering.
--
-- Matched on name rather than id: the portal holds a subset of the roster, so
-- this applies cleanly whoever happens to be in the table. Anyone not on the
-- list is pushed past 900 and sorts to the end rather than being silently
-- interleaved.

WITH website_order(full_name, ord) AS (
  VALUES
    ('Matt Levin', 1),         -- Founder / CEO
    ('Jason Steinberg', 2),    -- Managing Partner / Brokerage
    ('Patrick Ley', 3),        -- Partner
    ('Haley Smith', 4),        -- Brokerage Principal
    ('Ryan Wilson', 5),
    ('Matt Fain', 6),
    ('David Dawkins', 7),      -- Senior Brokerage Advisor
    ('Stephen Pannes', 8),
    ('Sean Couey', 9),
    ('Isaac Gutierrez', 10),
    ('Nick Owens', 11),
    ('Hannah Huskey', 12),     -- Brokerage Advisor
    ('Ross Chumley', 13),
    ('Cory Camp', 14),
    ('Charles Herst', 15),
    ('Stephen McMillen', 16)
)
UPDATE brokers b
SET display_order = w.ord
FROM website_order w
WHERE lower(btrim(b.name)) = lower(w.full_name);

UPDATE brokers
SET display_order = 900 + display_order
WHERE display_order < 900
  AND lower(btrim(name)) NOT IN (
    'matt levin','jason steinberg','patrick ley','haley smith','ryan wilson',
    'matt fain','david dawkins','stephen pannes','sean couey','isaac gutierrez',
    'nick owens','hannah huskey','ross chumley','cory camp','charles herst',
    'stephen mcmillen'
  );
