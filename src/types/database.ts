export type UserRole = 'teacher' | 'coordinator';

export type EquipmentStatus = 'available' | 'in_use' | 'maintenance';

export type ReservationStatus =
  | 'pending'
  | 'approved'
  | 'checked_out'
  | 'checked_in'
  | 'cancelled';

export interface Profile {
  id: string;
  full_name: string;
  role: UserRole;
  created_at: string;
}

export interface Equipment {
  id: string;
  name: string;
  category: string;
  type: string;
  status: EquipmentStatus;
  notes: string;
  location: string;
  created_at: string;
}

export interface Reservation {
  id: string;
  user_id: string;
  title: string;
  purpose: string;
  start_time: string;
  end_time: string;
  status: ReservationStatus;
  created_at: string;
  // joined fields
  profile?: Profile;
  items?: ReservationItemWithEquipment[];
  checkouts?: Checkout[];
}

export interface ReservationItem {
  id: string;
  reservation_id: string;
  equipment_id: string;
  created_at: string;
}

export interface ReservationItemWithEquipment extends ReservationItem {
  equipment: Equipment;
}

export interface Checkout {
  id: string;
  reservation_id: string;
  equipment_id: string;
  checked_out_by: string;
  checked_out_at: string;
  checked_in_by: string | null;
  checked_in_at: string | null;
  condition_out: string;
  condition_in: string | null;
  notes: string;
  // joined fields
  equipment?: Equipment;
  checked_out_by_profile?: Profile;
  checked_in_by_profile?: Profile;
}
