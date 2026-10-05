import type { ReservationStatus, EquipmentStatus } from '@/types/database';

const reservationStatusConfig: Record<ReservationStatus, { label: string; color: string }> = {
  pending:      { label: 'Pending',      color: 'bg-amber-100 text-amber-700 border-amber-200' },
  approved:     { label: 'Approved',     color: 'bg-blue-100 text-blue-700 border-blue-200' },
  checked_out:  { label: 'Checked Out',  color: 'bg-violet-100 text-violet-700 border-violet-200' },
  checked_in:   { label: 'Returned',     color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  cancelled:    { label: 'Cancelled',    color: 'bg-slate-100 text-slate-500 border-slate-200' },
};

export function ReservationStatusBadge({ status }: { status: ReservationStatus }) {
  const config = reservationStatusConfig[status];
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${config.color}`}>
      {config.label}
    </span>
  );
}

const equipmentStatusConfig: Record<EquipmentStatus, { label: string; color: string; dot: string }> = {
  available:   { label: 'Available',   color: 'bg-emerald-100 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  in_use:      { label: 'In Use',      color: 'bg-violet-100 text-violet-700 border-violet-200', dot: 'bg-violet-500' },
  maintenance: { label: 'Maintenance', color: 'bg-red-100 text-red-700 border-red-200', dot: 'bg-red-500' },
};

export function EquipmentStatusBadge({ status }: { status: EquipmentStatus }) {
  const config = equipmentStatusConfig[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${config.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatDateTime(dateStr: string): string {
  return `${formatDate(dateStr)}, ${formatTime(dateStr)}`;
}

export function formatRelative(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  const diffDays = diffHours / 24;

  if (Math.abs(diffHours) < 1) return 'just now';
  if (Math.abs(diffHours) < 24) {
    const h = Math.round(Math.abs(diffHours));
    return diffHours > 0 ? `in ${h}h` : `${h}h ago`;
  }
  if (Math.abs(diffDays) < 7) {
    const dd = Math.round(Math.abs(diffDays));
    return diffDays > 0 ? `in ${dd}d` : `${dd}d ago`;
  }
  return formatDate(dateStr);
}
