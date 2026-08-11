-- The tour itinerary needs the day it happens, not just the times: it heads
-- the printed schedule and the cover page of the tour package.
--
-- Nullable — existing tours have no date until someone sets one, and a tour
-- being planned without a firm date yet is a legitimate state.

ALTER TABLE client_tours
  ADD COLUMN IF NOT EXISTS tour_date date;
