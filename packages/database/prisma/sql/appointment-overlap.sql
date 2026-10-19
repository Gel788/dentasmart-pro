-- One chair and one doctor cannot hold two live visits at the same time, whichever code path writes them.
-- Prisma does not model exclusion constraints, so this file is applied after every `prisma db push`.
CREATE EXTENSION IF NOT EXISTS btree_gist;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_cabinet_no_overlap') THEN
    ALTER TABLE appointments ADD CONSTRAINT appointments_cabinet_no_overlap
      EXCLUDE USING gist ("cabinetId" WITH =, tsrange("startsAt", "endsAt") WITH &&)
      WHERE ("cabinetId" IS NOT NULL AND status NOT IN ('CANCELLED', 'NO_SHOW'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_doctor_no_overlap') THEN
    ALTER TABLE appointments ADD CONSTRAINT appointments_doctor_no_overlap
      EXCLUDE USING gist ("doctorId" WITH =, tsrange("startsAt", "endsAt") WITH &&)
      WHERE ("doctorId" IS NOT NULL AND status NOT IN ('CANCELLED', 'NO_SHOW'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_time_order') THEN
    ALTER TABLE appointments ADD CONSTRAINT appointments_time_order CHECK ("endsAt" > "startsAt");
  END IF;
END $$;
