-- Order brokers to match the team page on ecrtx.com, so the portal's Brokers
-- tab and the broker pickers on the client/property forms read in the same
-- sequence people already know from the website.
--
-- Matched on name rather than id: the portal holds a subset of the website
-- roster, and this way it applies cleanly whoever happens to be in the table.
-- Anyone not on the list keeps a high display_order and sorts to the end
-- rather than being silently reshuffled.

WITH website_order(full_name, ord) AS (
  VALUES
    ('Matt Levin', 1),
    ('Jason Steinberg', 2),
    ('Patrick Ley', 3),
    ('Haley Smith', 4),
    ('Ryan Wilson', 5),
    ('Matt Fain', 6),
    ('David Dawkins', 7),
    ('Stephen Pannes', 8),
    ('Sean Couey', 9),
    ('Isaac Gutierrez', 10),
    ('Nick Owens', 11),
    ('Hannah Huskey', 12),
    ('Ross Chumley', 13),
    ('Cory Camp', 14),
    ('Charles Herst', 15),
    ('Stephen McMillen', 16),
    ('Brian Velazquez', 17),
    ('Sean Bednarz', 18),
    ('Martin Villarreal', 19),
    ('Emily Staples', 20)
)
UPDATE brokers b
SET display_order = w.ord
FROM website_order w
WHERE lower(btrim(b.name)) = lower(w.full_name);

-- Push anyone the list didn't cover to the end, preserving their relative order.
UPDATE brokers
SET display_order = 900 + display_order
WHERE display_order < 900
  AND lower(btrim(name)) NOT IN (
    'matt levin','jason steinberg','patrick ley','haley smith','ryan wilson',
    'matt fain','david dawkins','stephen pannes','sean couey','isaac gutierrez',
    'nick owens','hannah huskey','ross chumley','cory camp','charles herst',
    'stephen mcmillen','brian velazquez','sean bednarz','martin villarreal',
    'emily staples'
  );
