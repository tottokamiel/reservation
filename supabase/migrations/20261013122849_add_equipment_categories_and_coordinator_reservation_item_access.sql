/*
# Add managed equipment categories and coordinator item editing access

1. New Table
- `equipment_categories`
- `id` (uuid, primary key)
- `name` (text, unique category name)
- `created_at` (timestamptz)

2. Security
- Row-level security is enabled on `equipment_categories`.
- All signed-in users can read category names.
- Coordinators can add, rename, and delete categories.
- Coordinators can add and remove items from any reservation through `reservation_items`.

3. Existing Data
- Existing equipment category text values are not changed or deleted.
- Existing reservation and equipment records remain intact.

4. Important Notes
- Equipment continues to store its category as text so existing items remain compatible.
- A category can only be deleted when no equipment item currently uses that exact name.
*/

CREATE TABLE IF NOT EXISTS equipment_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE equipment_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "equipment_categories_select_authenticated" ON equipment_categories;
CREATE POLICY "equipment_categories_select_authenticated"
ON equipment_categories FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "equipment_categories_insert_coordinator" ON equipment_categories;
CREATE POLICY "equipment_categories_insert_coordinator"
ON equipment_categories FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'coordinator')
);

DROP POLICY IF EXISTS "equipment_categories_update_coordinator" ON equipment_categories;
CREATE POLICY "equipment_categories_update_coordinator"
ON equipment_categories FOR UPDATE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'coordinator')
)
WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'coordinator')
);

DROP POLICY IF EXISTS "equipment_categories_delete_coordinator" ON equipment_categories;
CREATE POLICY "equipment_categories_delete_coordinator"
ON equipment_categories FOR DELETE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'coordinator')
);

DROP POLICY IF EXISTS "reservation_items_insert_own" ON reservation_items;
CREATE POLICY "reservation_items_insert"
ON reservation_items FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM reservations
    WHERE reservations.id = reservation_items.reservation_id
    AND (
      reservations.user_id = auth.uid()
      OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'coordinator')
    )
  )
);

DROP POLICY IF EXISTS "reservation_items_delete_own" ON reservation_items;
CREATE POLICY "reservation_items_delete"
ON reservation_items FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM reservations
    WHERE reservations.id = reservation_items.reservation_id
    AND (
      reservations.user_id = auth.uid()
      OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'coordinator')
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_equipment_categories_name ON equipment_categories(name);
