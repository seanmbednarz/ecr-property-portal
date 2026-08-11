-- Broker display order, as specified by ECR marketing (2026-08-11).
--
-- Brokerage roster only — not the full ecrtx.com team page, which also lists
-- property management, construction, accounting, marketing and engineering
-- staff. Matt Levin (Founder/CEO) is deliberately not in the broker ordering.
--
-- Matching note: several brokers carry their designations in the name column
-- ("Jason Steinberg, SIOR", "Patrick Ley, SIOR CCIM"), so comparison is on the
-- part before the first comma. An exact-name match silently skipped those
-- three and left gaps at the top of the order.
--
-- Written as a single assignment so it's idempotent: every broker either gets
-- their rank or 900, no matter how many times it runs.

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
SET display_order = COALESCE(
  (
    SELECT o.ord FROM broker_order o
    WHERE lower(btrim(split_part(b.name, ',', 1))) = lower(o.full_name)
  ),
  900   -- not on the brokerage list; sorts to the end
);
