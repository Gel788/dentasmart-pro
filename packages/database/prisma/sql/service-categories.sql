-- Marks price-list sections as categories once, for rows saved before the flag existed:
-- a row that other services sit under, or one with no code, price or duration.
UPDATE services SET "isCategory" = true
WHERE "isCategory" = false
  AND (id IN (SELECT DISTINCT "parentId" FROM services WHERE "parentId" IS NOT NULL)
       OR (code IS NULL AND "basePrice" = 0 AND "durationMin" = 0));
