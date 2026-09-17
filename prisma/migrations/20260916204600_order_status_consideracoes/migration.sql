-- Remap OrderStatus to created/paid/shipped/delivered/canceled.
-- Covers DBs still on pending/approved and DBs already on created/paid without canceled.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'OrderStatus'
      AND e.enumlabel IN ('pending', 'approved')
  ) OR (
    EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'OrderStatus'
        AND e.enumlabel = 'created'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'OrderStatus'
        AND e.enumlabel = 'canceled'
    )
  ) THEN
    CREATE TYPE "OrderStatus_new" AS ENUM ('created', 'paid', 'shipped', 'delivered', 'canceled');

    ALTER TABLE "pedido"
      ALTER COLUMN "status" TYPE "OrderStatus_new"
      USING (
        CASE "status"::text
          WHEN 'pending' THEN 'created'
          WHEN 'approved' THEN 'paid'
          WHEN 'created' THEN 'created'
          WHEN 'paid' THEN 'paid'
          WHEN 'shipped' THEN 'shipped'
          WHEN 'delivered' THEN 'delivered'
          WHEN 'canceled' THEN 'canceled'
        END::"OrderStatus_new"
      );

    DROP TYPE "OrderStatus";
    ALTER TYPE "OrderStatus_new" RENAME TO "OrderStatus";
  END IF;
END $$;
