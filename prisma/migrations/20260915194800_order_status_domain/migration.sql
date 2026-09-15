-- Remaps legacy enum values if this database was created with created/paid/canceled.
-- No-op when OrderStatus already uses pending/approved/shipped/delivered.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'OrderStatus'
      AND e.enumlabel = 'created'
  ) THEN
    DELETE FROM "pedido" WHERE "status"::text IN ('canceled', 'cancelled');

    CREATE TYPE "OrderStatus_new" AS ENUM ('pending', 'approved', 'shipped', 'delivered');

    ALTER TABLE "pedido"
      ALTER COLUMN "status" TYPE "OrderStatus_new"
      USING (
        CASE "status"::text
          WHEN 'created' THEN 'pending'
          WHEN 'paid' THEN 'approved'
          WHEN 'pending' THEN 'pending'
          WHEN 'approved' THEN 'approved'
          WHEN 'shipped' THEN 'shipped'
          WHEN 'delivered' THEN 'delivered'
        END::"OrderStatus_new"
      );

    DROP TYPE "OrderStatus";
    ALTER TYPE "OrderStatus_new" RENAME TO "OrderStatus";
  END IF;
END $$;
