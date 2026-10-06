import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { ReservationStatus } from '@/types/database';
import {
  ReservationStatusBadge,
  formatDateTime,
  formatRelative,
} from '@/components/Badges';
import {
  Calendar,
  Clock,
  Package,
  User,
  ArrowUpFromLine,
  ArrowDownToLine,
  Check,
  X,
  Loader2,
  AlertTriangle,
  TrendingUp,
  ClipboardCheck,
  CalendarDays,
} from 'lucide-react';

interface DashboardReservation {
  id: string;
  user_id: string;
  title: string;
  purpose: string;
  start_time: string;
  end_time: string;
  status: ReservationStatus;
  created_at: string;
  profile: { id: string; full_name: string; role: string } | null;
  items: { id: string; equipment_id: string; equipment: { id: string; name: string; category: string; type: string } }[];
  checkouts: {
    id: string;
    equipment_id: string;
    checked_out_at: string;
    checked_in_at: string | null;
    equipment: { id: string; name: string; category: string; type: string };
  }[];
}

interface CoordinatorDashboardProps {
  refreshKey: number;
  onGoToCheckout: () => void;
  onGoToReservations: () => void;
}

export default function CoordinatorDashboard({ refreshKey, onGoToCheckout, onGoToReservations }: CoordinatorDashboardProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [reservations, setReservations] = useState<DashboardReservation[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('reservations')
      .select(
        `*,
         profile:profiles!user_id ( id, full_name, role ),
         items:reservation_items (
           id, equipment_id,
           equipment:equipment ( id, name, category, type )
         ),
         checkouts:checkouts (
           id, equipment_id,
           checked_out_at, checked_in_at,
           equipment:equipment ( id, name, category, type )
         )`
      )
      .in('status', ['pending', 'approved', 'checked_out'])
      .order('start_time', { ascending: true });

    if (error) {
      console.error('Error loading dashboard:', error);
    } else if (data) {
      setReservations(data as DashboardReservation[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  async function approveReservation(id: string) {
    setActionLoading(id);
    const { error } = await supabase
      .from('reservations')
      .update({ status: 'approved' })
      .eq('id', id);
    if (error) console.error('Approve error:', error);
    await load();
    setActionLoading(null);
  }

  async function rejectReservation(id: string) {
    setActionLoading(id);
    const { error } = await supabase
      .from('reservations')
      .update({ status: 'cancelled' })
      .eq('id', id);
    if (error) console.error('Reject error:', error);
    await load();
    setActionLoading(null);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  const now = new Date();

  // Categorize reservations
  const pendingApproval = reservations.filter((r) => r.status === 'pending');

  const upcomingCheckouts = reservations
    .filter((r) =>
      r.status === 'approved' &&
      r.items.some((item) => !r.checkouts?.some((c) => c.equipment_id === item.equipment_id))
    )
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

  const upcomingCheckins = reservations
    .filter((r) =>
      r.status === 'checked_out' &&
      r.checkouts?.some((c) => !c.checked_in_at)
    )
    .sort((a, b) => new Date(a.end_time).getTime() - new Date(b.end_time).getTime());

  // Overdue check-ins (end time passed but still checked out)
  const overdueCheckins = upcomingCheckins.filter((r) => new Date(r.end_time) < now);
  const onTimeCheckins = upcomingCheckins.filter((r) => new Date(r.end_time) >= now);

  const totalActionable = pendingApproval.length + upcomingCheckouts.length + upcomingCheckins.length;

  return (
    <div className="space-y-8">
      {/* Summary banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-amber-500 text-white">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{pendingApproval.length}</p>
              <p className="text-xs text-slate-500">Pending Approval</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-blue-500 text-white">
              <ArrowUpFromLine className="w-5 h-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{upcomingCheckouts.length}</p>
              <p className="text-xs text-slate-500">Ready to Check Out</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-violet-500 text-white">
              <ArrowDownToLine className="w-5 h-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{upcomingCheckins.length}</p>
              <p className="text-xs text-slate-500">
                {overdueCheckins.length > 0 ? `${overdueCheckins.length} overdue` : 'Awaiting Return'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {totalActionable === 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-50 mb-4">
            <Check className="w-8 h-8 text-emerald-500" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900">All caught up!</h3>
          <p className="text-sm text-slate-500 mt-1">
            No pending approvals, check-outs, or returns to process right now.
          </p>
        </div>
      )}

      {/* Pending Approvals */}
      {pendingApproval.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              Pending Approvals ({pendingApproval.length})
            </h3>
            <button
              onClick={onGoToReservations}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              View all
            </button>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {pendingApproval.map((r) => (
              <PendingApprovalCard
                key={r.id}
                reservation={r}
                onApprove={() => approveReservation(r.id)}
                onReject={() => rejectReservation(r.id)}
                loading={actionLoading === r.id}
              />
            ))}
          </div>
        </div>
      )}

      {/* Upcoming Check-outs */}
      {upcomingCheckouts.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-2">
              <ArrowUpFromLine className="w-4 h-4 text-blue-500" />
              Ready to Check Out ({upcomingCheckouts.length})
            </h3>
            <button
              onClick={onGoToCheckout}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              Go to Check Out
            </button>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {upcomingCheckouts.map((r) => (
              <CheckoutOverviewCard
                key={r.id}
                reservation={r}
                mode="checkout"
                onGoToCheckout={onGoToCheckout}
              />
            ))}
          </div>
        </div>
      )}

      {/* Overdue Check-ins */}
      {overdueCheckins.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-red-400 uppercase tracking-wide flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              Overdue Returns ({overdueCheckins.length})
            </h3>
            <button
              onClick={onGoToCheckout}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              Go to Check In
            </button>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {overdueCheckins.map((r) => (
              <CheckoutOverviewCard
                key={r.id}
                reservation={r}
                mode="checkin"
                overdue
                onGoToCheckout={onGoToCheckout}
              />
            ))}
          </div>
        </div>
      )}

      {/* Upcoming Check-ins (on time) */}
      {onTimeCheckins.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-2">
              <ArrowDownToLine className="w-4 h-4 text-violet-500" />
              Upcoming Returns ({onTimeCheckins.length})
            </h3>
            <button
              onClick={onGoToCheckout}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              Go to Check In
            </button>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {onTimeCheckins.map((r) => (
              <CheckoutOverviewCard
                key={r.id}
                reservation={r}
                mode="checkin"
                onGoToCheckout={onGoToCheckout}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Pending Approval Card
// ============================================================
function PendingApprovalCard({
  reservation,
  onApprove,
  onReject,
  loading,
}: {
  reservation: DashboardReservation;
  onApprove: () => void;
  onReject: () => void;
  loading: boolean;
}) {
  const itemsToHandOut = reservation.items.filter(
    (item) => !reservation.checkouts?.some((c) => c.equipment_id === item.equipment_id)
  );

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-slate-900 truncate">{reservation.title}</h3>
          {reservation.profile && (
            <p className="text-sm text-slate-500 mt-0.5 flex items-center gap-1">
              <User className="w-3.5 h-3.5" /> {reservation.profile.full_name}
            </p>
          )}
        </div>
        <ReservationStatusBadge status={reservation.status} />
      </div>

      <div className="flex items-center gap-4 text-sm text-slate-500 mb-3">
        <span className="flex items-center gap-1.5">
          <Calendar className="w-4 h-4" /> {formatDateTime(reservation.start_time)}
        </span>
      </div>
      <div className="flex items-center gap-4 text-sm text-slate-500 mb-4">
        <span className="flex items-center gap-1.5">
          <Clock className="w-4 h-4" /> Until {formatDateTime(reservation.end_time)}
        </span>
        <span className="flex items-center gap-1.5">
          <Package className="w-4 h-4" /> {itemsToHandOut.length} item{itemsToHandOut.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Item chips */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {itemsToHandOut.slice(0, 4).map((item) => (
          <span
            key={item.id}
            className="inline-flex items-center px-2 py-1 rounded-lg bg-slate-50 text-xs text-slate-600 border border-slate-200"
          >
            {item.equipment.name}
          </span>
        ))}
        {itemsToHandOut.length > 4 && (
          <span className="inline-flex items-center px-2 py-1 text-xs text-slate-400">
            +{itemsToHandOut.length - 4} more
          </span>
        )}
      </div>

      {/* Approve / Reject buttons */}
      <div className="flex gap-2">
        <button
          onClick={onApprove}
          disabled={loading}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition-colors disabled:opacity-60"
        >
          <Check className="w-4 h-4" /> Approve
        </button>
        <button
          onClick={onReject}
          disabled={loading}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-medium transition-colors disabled:opacity-60"
        >
          <X className="w-4 h-4" /> Reject
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Checkout / Check-in Overview Card
// ============================================================
function CheckoutOverviewCard({
  reservation,
  mode,
  overdue,
  onGoToCheckout,
}: {
  reservation: DashboardReservation;
  mode: 'checkout' | 'checkin';
  overdue?: boolean;
  onGoToCheckout: () => void;
}) {
  const relevantTime = mode === 'checkout' ? reservation.start_time : reservation.end_time;
  const timeLabel = mode === 'checkout' ? 'Pick up by' : 'Return by';

  if (mode === 'checkout') {
    const itemsToHandOut = reservation.items.filter(
      (item) => !reservation.checkouts?.some((c) => c.equipment_id === item.equipment_id)
    );
    return (
      <div className={`bg-white rounded-2xl border p-5 ${overdue ? 'border-red-200' : 'border-slate-200'}`}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <h3 className="font-semibold text-slate-900 truncate">{reservation.title}</h3>
            {reservation.profile && (
              <p className="text-sm text-slate-500 mt-0.5 flex items-center gap-1">
                <User className="w-3.5 h-3.5" /> {reservation.profile.full_name}
              </p>
            )}
          </div>
          <ReservationStatusBadge status={reservation.status} />
        </div>

        <div className="flex items-center gap-4 text-sm text-slate-500 mb-2">
          <span className="flex items-center gap-1.5">
            <Calendar className="w-4 h-4" /> {formatDateTime(reservation.start_time)}
          </span>
        </div>
        <div className="flex items-center gap-4 text-sm text-slate-500 mb-3">
          <span className="flex items-center gap-1.5">
            <Clock className="w-4 h-4" /> {timeLabel} {formatDateTime(relevantTime)}
          </span>
          <span className="text-slate-400">({formatRelative(relevantTime)})</span>
        </div>

        <div className="flex flex-wrap gap-1.5 mb-4">
          {itemsToHandOut.slice(0, 4).map((item) => (
            <span
              key={item.id}
              className="inline-flex items-center px-2 py-1 rounded-lg bg-slate-50 text-xs text-slate-600 border border-slate-200"
            >
              {item.equipment.name}
            </span>
          ))}
          {itemsToHandOut.length > 4 && (
            <span className="inline-flex items-center px-2 py-1 text-xs text-slate-400">
              +{itemsToHandOut.length - 4} more
            </span>
          )}
        </div>

        <button
          onClick={onGoToCheckout}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
        >
          <ArrowUpFromLine className="w-4 h-4" /> Hand Out Equipment
        </button>
      </div>
    );
  }

  // Check-in mode
  const checkedOutItems = reservation.checkouts?.filter((c) => !c.checked_in_at) || [];
  return (
    <div className={`bg-white rounded-2xl border p-5 ${overdue ? 'border-red-200' : 'border-slate-200'}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-slate-900 truncate">{reservation.title}</h3>
          {reservation.profile && (
            <p className="text-sm text-slate-500 mt-0.5 flex items-center gap-1">
              <User className="w-3.5 h-3.5" /> {reservation.profile.full_name}
            </p>
          )}
        </div>
        {overdue ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border bg-red-100 text-red-700 border-red-200">
            <AlertTriangle className="w-3 h-3" /> Overdue
          </span>
        ) : (
          <ReservationStatusBadge status={reservation.status} />
        )}
      </div>

      <div className="flex items-center gap-4 text-sm text-slate-500 mb-2">
        <span className="flex items-center gap-1.5">
          <Calendar className="w-4 h-4" /> {formatDateTime(reservation.start_time)}
        </span>
      </div>
      <div className={`flex items-center gap-4 text-sm mb-3 ${overdue ? 'text-red-600' : 'text-slate-500'}`}>
        <span className="flex items-center gap-1.5">
          <Clock className="w-4 h-4" /> {timeLabel} {formatDateTime(relevantTime)}
        </span>
        <span className={overdue ? 'text-red-500 font-medium' : 'text-slate-400'}>
          ({formatRelative(relevantTime)})
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-4">
        {checkedOutItems.slice(0, 4).map((c) => (
          <span
            key={c.id}
            className="inline-flex items-center px-2 py-1 rounded-lg bg-violet-50 text-xs text-violet-700 border border-violet-100"
          >
            {c.equipment.name}
          </span>
        ))}
        {checkedOutItems.length > 4 && (
          <span className="inline-flex items-center px-2 py-1 text-xs text-slate-400">
            +{checkedOutItems.length - 4} more
          </span>
        )}
      </div>

      <button
        onClick={onGoToCheckout}
        className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-medium transition-colors ${
          overdue
            ? 'bg-red-500 hover:bg-red-600'
            : 'bg-violet-600 hover:bg-violet-700'
        }`}
      >
        <ArrowDownToLine className="w-4 h-4" /> Process Return
      </button>
    </div>
  );
}
