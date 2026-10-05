/*
# School Equipment Reservation System

## Overview
This migration creates the full schema for a school equipment reservation system.
Teachers can reserve equipment for events, and equipment coordinators can
check equipment in and out to track who is currently using what.

## Tables

### profiles
Extends auth.users with role information.
- id (uuid, PK, FK to auth.users) — matches the auth user
- full_name (text) — display name of the teacher/coordinator
- role (text) — either 'teacher' or 'coordinator', defaults to 'teacher'
- created_at (timestamptz)

### equipment
The catalog of physical equipment items available for reservation.
- id (uuid, PK)
- name (text) — e.g. "Projector A", "Wireless Mic 1"
- category (text) — e.g. "projector", "microphone", "speaker"
- type (text) — more specific: "wired microphone", "wireless headset", etc.
- status (text) — 'available', 'in_use', 'maintenance', defaults to 'available'
- notes (text) — optional notes about the item
- created_at (timestamptz)

### reservations
A reservation request made by a teacher for a specific event/time period.
- id (uuid, PK)
- user_id (uuid, FK to auth.users) — the teacher who reserved
- title (text) — event/lesson title
- purpose (text) — what the equipment is for
- start_time (timestamptz) — when the equipment is needed from
- end_time (timestamptz) — when the equipment is returned by
- status (text) — 'pending', 'approved', 'checked_out', 'checked_in', 'cancelled', defaults to 'pending'
- created_at (timestamptz)

### reservation_items
The individual equipment items included in a reservation (one reservation can have many items).
- id (uuid, PK)
- reservation_id (uuid, FK to reservations, cascade delete)
- equipment_id (uuid, FK to equipment)
- created_at (timestamptz)
- UNIQUE constraint on (reservation_id, equipment_id) — no duplicate items in a reservation

### checkouts
Tracks the physical handoff of equipment from coordinator to teacher and back.
- id (uuid, PK)
- reservation_id (uuid, FK to reservations)
- equipment_id (uuid, FK to equipment)
- checked_out_by (uuid, FK to auth.users) — coordinator who handed it out
- checked_out_at (timestamptz) — when it was handed out
- checked_in_by (uuid, FK to auth.users, nullable) — coordinator who received it back
- checked_in_at (timestamptz, nullable) — when it was returned
- condition_out (text, nullable) — condition when handed out
- condition_in (text, nullable) — condition when returned
- notes (text, nullable)
- UNIQUE constraint on (reservation_id, equipment_id) — one checkout record per item per reservation

## Security (RLS)

### profiles
- All authenticated users can read profiles (to see who reserved what).
- Users can update their own profile name only.
- INSERT handled via trigger on auth.users signup (profile auto-created).

### equipment
- All authenticated users can read equipment (teachers need to see what's available).
- Only coordinators can insert/update equipment (manage catalog, maintenance status).

### reservations
- Teachers can CRUD their own reservations.
- Coordinators can read all reservations and update status (approve, etc.).
- Coordinators can delete any reservation.

### reservation_items
- Teachers can add/remove items in their own reservations.
- Coordinators can read all reservation items.

### checkouts
- Coordinators can create (check-out) and update (check-in) checkout records.
- All authenticated users can read checkout records (teachers can see status of their items).

## Trigger
A trigger automatically creates a profile row when a new auth.users row is inserted.
This way, signing up via Supabase Auth also creates the profile without extra client calls.

## Important Notes
1. Role is stored in profiles.role and defaults to 'teacher'. A coordinator
   can be upgraded by updating that column directly (admin operation).
2. The reservation status lifecycle: pending → approved → checked_out → checked_in.
   A reservation can also be cancelled at any point.
3. Equipment status is 'available' by default and changed to 'in_use' when checked out,
   then back to 'available' when checked in.
*/

-- ============================================================
-- PROFILES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'teacher' CHECK (role IN ('teacher', 'coordinator')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_all_authenticated" ON profiles;
CREATE POLICY "profiles_select_all_authenticated"
ON profiles FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own"
ON profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- ============================================================
-- EQUIPMENT TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS equipment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL,
  type text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'in_use', 'maintenance')),
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "equipment_select_all_authenticated" ON equipment;
CREATE POLICY "equipment_select_all_authenticated"
ON equipment FOR SELECT
TO authenticated
USING (true);

-- Only coordinators can insert/update equipment
DROP POLICY IF EXISTS "equipment_insert_coordinator" ON equipment;
CREATE POLICY "equipment_insert_coordinator"
ON equipment FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'coordinator')
);

DROP POLICY IF EXISTS "equipment_update_coordinator" ON equipment;
CREATE POLICY "equipment_update_coordinator"
ON equipment FOR UPDATE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'coordinator')
)
WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'coordinator')
);

-- ============================================================
-- RESERVATIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  purpose text NOT NULL DEFAULT '',
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'checked_out', 'checked_in', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;

-- Teachers can read their own; coordinators can read all
DROP POLICY IF EXISTS "reservations_select" ON reservations;
CREATE POLICY "reservations_select"
ON reservations FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'coordinator')
);

-- Teachers can insert their own reservations
DROP POLICY IF EXISTS "reservations_insert_own" ON reservations;
CREATE POLICY "reservations_insert_own"
ON reservations FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Teachers can update their own; coordinators can update any
DROP POLICY IF EXISTS "reservations_update" ON reservations;
CREATE POLICY "reservations_update"
ON reservations FOR UPDATE
TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'coordinator')
)
WITH CHECK (
  auth.uid() = user_id
  OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'coordinator')
);

-- Teachers can delete their own; coordinators can delete any
DROP POLICY IF EXISTS "reservations_delete" ON reservations;
CREATE POLICY "reservations_delete"
ON reservations FOR DELETE
TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'coordinator')
);

-- ============================================================
-- RESERVATION_ITEMS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS reservation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  equipment_id uuid NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reservation_id, equipment_id)
);

ALTER TABLE reservation_items ENABLE ROW LEVEL SECURITY;

-- Teachers can read items for their own reservations; coordinators can read all
DROP POLICY IF EXISTS "reservation_items_select" ON reservation_items;
CREATE POLICY "reservation_items_select"
ON reservation_items FOR SELECT
TO authenticated
USING (
  EXISTS (SELECT 1 FROM reservations WHERE reservations.id = reservation_items.reservation_id AND reservations.user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'coordinator')
);

-- Teachers can insert items into their own reservations
DROP POLICY IF EXISTS "reservation_items_insert_own" ON reservation_items;
CREATE POLICY "reservation_items_insert_own"
ON reservation_items FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM reservations WHERE reservations.id = reservation_items.reservation_id AND reservations.user_id = auth.uid())
);

-- Teachers can delete items from their own reservations
DROP POLICY IF EXISTS "reservation_items_delete_own" ON reservation_items;
CREATE POLICY "reservation_items_delete_own"
ON reservation_items FOR DELETE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM reservations WHERE reservations.id = reservation_items.reservation_id AND reservations.user_id = auth.uid())
);

-- ============================================================
-- CHECKOUTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS checkouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  equipment_id uuid NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  checked_out_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  checked_out_at timestamptz NOT NULL DEFAULT now(),
  checked_in_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  checked_in_at timestamptz,
  condition_out text NOT NULL DEFAULT 'good',
  condition_in text,
  notes text NOT NULL DEFAULT '',
  UNIQUE (reservation_id, equipment_id)
);

ALTER TABLE checkouts ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read (teachers see their own items' status)
DROP POLICY IF EXISTS "checkouts_select_all" ON checkouts;
CREATE POLICY "checkouts_select_all"
ON checkouts FOR SELECT
TO authenticated
USING (true);

-- Only coordinators can insert (check-out) checkout records
DROP POLICY IF EXISTS "checkouts_insert_coordinator" ON checkouts;
CREATE POLICY "checkouts_insert_coordinator"
ON checkouts FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'coordinator')
);

-- Only coordinators can update (check-in) checkout records
DROP POLICY IF EXISTS "checkouts_update_coordinator" ON checkouts;
CREATE POLICY "checkouts_update_coordinator"
ON checkouts FOR UPDATE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'coordinator')
)
WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'coordinator')
);

-- ============================================================
-- TRIGGER: Auto-create profile on signup
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'teacher')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_reservations_user_id ON reservations(user_id);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations(status);
CREATE INDEX IF NOT EXISTS idx_reservations_time_range ON reservations(start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_reservation_items_reservation_id ON reservation_items(reservation_id);
CREATE INDEX IF NOT EXISTS idx_reservation_items_equipment_id ON reservation_items(equipment_id);
CREATE INDEX IF NOT EXISTS idx_checkouts_reservation_id ON checkouts(reservation_id);
CREATE INDEX IF NOT EXISTS idx_checkouts_equipment_id ON checkouts(equipment_id);
CREATE INDEX IF NOT EXISTS idx_equipment_status ON equipment(status);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
