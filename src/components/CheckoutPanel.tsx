import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { ReservationStatus } from '@/types/database';
import {
  ReservationStatusBadge,
  formatTime,
  formatDate,
} from '@/components/Badges';
import {
  Loader2,
  Package,
  User,
  ArrowUpFromLine,
  ArrowDownToLine,
  Check,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  X,
  AlertTriangle,
} from 'lucide-react';

interface CheckoutCalendarProps {
  refreshKey?: number;
}

interface CalendarReservation {
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
  checkouts: CheckoutItem[];
}

interface CheckoutItem {
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
  equipment: { id: string; name: string; category: string; type: string };
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const DAY_OFFSETS: Record<string, number> = {
  Monday: 0, Tuesday: 1, Wednesday: 2, Thursday: 3, Friday: 4,
};

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

type ActionType = 'checkout' | 'checkin' | 'both' | 'none';

function getEventAction(r: CalendarReservation, dayDate: Date): ActionType {
  const start = new Date(r.start_time);
  const end = new Date(r.end_time);
  const startsToday = sameDay(start, dayDate);
  const endsToday = sameDay(end, dayDate);
  const hasItemsToCheckout = r.items.some(
    (item) => !r.checkouts?.some((c) => c.equipment_id === item.equipment_id)
  );
  const hasItemsToCheckin = r.checkouts?.some((c) => !c.checked_in_at) ?? false;

  if (startsToday && hasItemsToCheckout && endsToday && hasItemsToCheckin) return 'both';
  if (startsToday && hasItemsToCheckout) return 'checkout';
  if (endsToday && hasItemsToCheckin) return 'checkin';
  return 'none';
}

export default function CheckoutCalendar({ refreshKey }: CheckoutCalendarProps) {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [reservations, setReservations] = useState<CalendarReservation[]>([]);
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [selectedReservation, setSelectedReservation] = useState<CalendarReservation | null>(null);
  const [processing, setProcessing] = useState(false);
  const [condition, setCondition] = useState('good');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<{
    type: 'checkout' | 'checkin';
    itemName: string;
    itemId: string;
    checkoutId?: string;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const weekStartIso = weekStart.toISOString();
    const weekEndIso = addDays(weekStart, 7).toISOString();

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
           id, reservation_id, equipment_id,
           checked_out_by, checked_out_at,
           checked_in_by, checked_in_at,
           condition_out, condition_in, notes,
           equipment:equipment ( id, name, category, type )
         )`
      )
      .in('status', ['approved', 'checked_out'])
      .lt('start_time', weekEndIso)
      .gt('end_time', weekStartIso)
      .order('start_time', { ascending: true });

    if (error) {
      console.error('Error loading calendar:', error);
    } else if (data) {
      setReservations(data as CalendarReservation[]);
    }
    setLoading(false);
  }, [weekStart]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  async function reloadReservation(id: string): Promise<CalendarReservation | null> {
    const { data } = await supabase
      .from('reservations')
      .select(
        `*,
         profile:profiles!user_id ( id, full_name, role ),
         items:reservation_items (
           id, equipment_id,
           equipment:equipment ( id, name, category, type )
         ),
         checkouts:checkouts (
           id, reservation_id, equipment_id,
           checked_out_by, checked_out_at,
           checked_in_by, checked_in_at,
           condition_out, condition_in, notes,
           equipment:equipment ( id, name, category, type )
         )`
      )
      .eq('id', id)
      .maybeSingle();
    return data as CalendarReservation | null;
  }

  async function checkAndUpdateReservationStatus(reservationId: string) {
    const { data } = await supabase
      .from('reservations')
      .select(
        `*,
         items:reservation_items ( id ),
         checkouts:checkouts ( id, checked_in_at )`
      )
      .eq('id', reservationId)
      .maybeSingle();

    if (!data) return;

    const totalItems = data.items?.length || 0;
    const totalCheckouts = data.checkouts?.length || 0;
    const totalCheckedIn = data.checkouts?.filter((c: any) => c.checked_in_at).length || 0;

    let newStatus: ReservationStatus = data.status;
    if (totalCheckouts === totalItems && totalCheckedIn === 0) {
      newStatus = 'checked_out';
    } else if (totalCheckedIn === totalItems) {
      newStatus = 'checked_in';
    } else if (totalCheckouts > 0 && totalCheckouts < totalItems) {
      newStatus = 'checked_out';
    }

    if (newStatus !== data.status) {
      await supabase
        .from('reservations')
        .update({ status: newStatus })
        .eq('id', reservationId);
    }
  }

  function requestCheckout(item: CalendarReservation['items'][0]) {
    setPendingAction({
      type: 'checkout',
      itemName: item.equipment.name,
      itemId: item.equipment_id,
    });
  }

  function requestCheckin(checkout: CheckoutItem) {
    setPendingAction({
      type: 'checkin',
      itemName: checkout.equipment.name,
      itemId: checkout.equipment_id,
      checkoutId: checkout.id,
    });
  }

  async function confirmAction() {
    if (!pendingAction || !user || !profile || !selectedReservation) return;

    setProcessing(true);

    if (pendingAction.type === 'checkout') {
      const { error } = await supabase.from('checkouts').insert({
        reservation_id: selectedReservation.id,
        equipment_id: pendingAction.itemId,
        checked_out_by: user.id,
        condition_out: condition,
        notes: '',
      });

      if (error) {
        console.error('Checkout error:', error);
        alert('Failed to check out item: ' + error.message);
      } else {
        await supabase
          .from('equipment')
          .update({ status: 'in_use' })
          .eq('id', pendingAction.itemId);
        await checkAndUpdateReservationStatus(selectedReservation.id);
        await load();
        const refreshed = await reloadReservation(selectedReservation.id);
        if (refreshed) setSelectedReservation(refreshed);
        setSuccessMessage(`${pendingAction.itemName} checked out successfully`);
        setTimeout(() => setSuccessMessage(null), 2500);
      }
    } else if (pendingAction.type === 'checkin' && pendingAction.checkoutId) {
      const { error } = await supabase
        .from('checkouts')
        .update({
          checked_in_by: user.id,
          checked_in_at: new Date().toISOString(),
          condition_in: condition,
        })
        .eq('id', pendingAction.checkoutId);

      if (error) {
        console.error('Checkin error:', error);
        alert('Failed to check in item: ' + error.message);
      } else {
        await supabase
          .from('equipment')
          .update({ status: 'available' })
          .eq('id', pendingAction.itemId);
        await checkAndUpdateReservationStatus(selectedReservation.id);
        await load();
        const refreshed = await reloadReservation(selectedReservation.id);
        if (refreshed) setSelectedReservation(refreshed);
        setSuccessMessage(`${pendingAction.itemName} returned successfully`);
        setTimeout(() => setSuccessMessage(null), 2500);
      }
    }

    setPendingAction(null);
    setProcessing(false);
  }

  function cancelAction() {
    setPendingAction(null);
  }

  const weekDays = useMemo(() => {
    return DAYS.map((dayName) => {
      const date = addDays(weekStart, DAY_OFFSETS[dayName]);
      const dayReservations = reservations.filter((r) => {
        const action = getEventAction(r, date);
        return action !== 'none';
      });
      return { dayName, date, reservations: dayReservations };
    });
  }, [weekStart, reservations]);

  const today = new Date();
  const isThisWeek = sameDay(weekStart, getWeekStart(today));

  function getEventTiming(r: CalendarReservation, dayDate: Date) {
    const start = new Date(r.start_time);
    const end = new Date(r.end_time);
    const startsToday = sameDay(start, dayDate);
    const endsToday = sameDay(end, dayDate);

    if (startsToday && endsToday) {
      return `${formatTime(r.start_time)} – ${formatTime(r.end_time)}`;
    } else if (startsToday) {
      return `from ${formatTime(r.start_time)}`;
    } else if (endsToday) {
      return `until ${formatTime(r.end_time)}`;
    }
    return 'all day';
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div>
      {/* Week navigation */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setWeekStart(addDays(weekStart, -7))}
            className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-slate-600" />
          </button>
          <div className="text-center min-w-[180px]">
            <p className="font-semibold text-slate-900">
              {weekStart.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
              {' – '}
              {addDays(weekStart, 4).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
            </p>
            <p className="text-xs text-slate-500">
              {weekStart.toLocaleDateString('en-US', { year: 'numeric' })}
            </p>
          </div>
          <button
            onClick={() => setWeekStart(addDays(weekStart, 7))}
            className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
          >
            <ChevronRight className="w-5 h-5 text-slate-600" />
          </button>
        </div>
        {!isThisWeek && (
          <button
            onClick={() => setWeekStart(getWeekStart(new Date()))}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <CalendarDays className="w-4 h-4" /> This Week
          </button>
        )}
      </div>

      {successMessage && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm flex items-center gap-2">
          <Check className="w-4 h-4" /> {successMessage}
        </div>
      )}

      {/* Calendar grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {weekDays.map(({ dayName, date, reservations: dayReservations }) => {
          const isToday = sameDay(date, today);
          return (
            <div
              key={dayName}
              className={`rounded-2xl border ${isToday ? 'border-blue-300 bg-blue-50/30' : 'border-slate-200 bg-white'} flex flex-col min-h-[300px]`}
            >
              {/* Day header */}
              <div className={`px-4 py-3 border-b ${isToday ? 'border-blue-200 bg-blue-50' : 'border-slate-100 bg-slate-50'} rounded-t-2xl`}>
                <p className={`text-xs font-semibold uppercase tracking-wide ${isToday ? 'text-blue-600' : 'text-slate-400'}`}>
                  {dayName}
                </p>
                <p className={`text-lg font-bold ${isToday ? 'text-blue-700' : 'text-slate-900'}`}>
                  {date.getDate()}
                </p>
              </div>

              {/* Events */}
              <div className="flex-1 p-2 space-y-2 overflow-y-auto">
                {dayReservations.length === 0 ? (
                  <div className="flex items-center justify-center h-full min-h-[80px]">
                    <p className="text-xs text-slate-300">No events</p>
                  </div>
                ) : (
                  dayReservations.map((r) => {
                    const action = getEventAction(r, date);
                    const timing = getEventTiming(r, date);
                    const itemsToCheckout = r.items.filter(
                      (item) => !r.checkouts?.some((c) => c.equipment_id === item.equipment_id)
                    ).length;
                    const itemsToCheckin = r.checkouts?.filter((c) => !c.checked_in_at).length || 0;

                    return (
                      <button
                        key={r.id}
                        onClick={() => setSelectedReservation(r)}
                        className={`w-full text-left p-3 rounded-xl border transition-all hover:shadow-sm ${
                          action === 'checkout'
                            ? 'border-sky-300 bg-sky-50 hover:bg-sky-100'
                            : action === 'checkin'
                            ? 'border-orange-300 bg-orange-50 hover:bg-orange-100'
                            : action === 'both'
                            ? 'border-teal-300 bg-teal-50 hover:bg-teal-100'
                            : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 mb-1">
                          {action === 'checkout' && <ArrowUpFromLine className="w-3.5 h-3.5 text-sky-600 shrink-0" />}
                          {action === 'checkin' && <ArrowDownToLine className="w-3.5 h-3.5 text-orange-600 shrink-0" />}
                          {action === 'both' && (
                            <>
                              <ArrowUpFromLine className="w-3 h-3 text-sky-600" />
                              <ArrowDownToLine className="w-3 h-3 text-orange-600" />
                            </>
                          )}
                          {action === 'none' && <Package className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                          <p className="text-xs font-semibold text-slate-700 truncate">
                            {timing}
                          </p>
                        </div>
                        <p className="text-sm font-medium text-slate-900 truncate mb-0.5">
                          {r.title}
                        </p>
                        {r.profile && (
                          <p className="text-xs text-slate-500 truncate flex items-center gap-1">
                            <User className="w-3 h-3" /> {r.profile.full_name}
                          </p>
                        )}
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <ReservationStatusBadge status={r.status} />
                          {action === 'checkout' && itemsToCheckout > 0 && (
                            <span className="text-xs font-medium text-sky-600">
                              {itemsToCheckout} to hand out
                            </span>
                          )}
                          {action === 'checkin' && itemsToCheckin > 0 && (
                            <span className="text-xs font-medium text-orange-600">
                              {itemsToCheckin} to return
                            </span>
                          )}
                          {action === 'both' && (
                            <span className="text-xs font-medium text-teal-600">
                              {itemsToCheckout + itemsToCheckin} actions
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-sky-100 border border-sky-300" /> Check Out
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-orange-100 border border-orange-300" /> Check In
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-teal-100 border border-teal-300" /> Both
        </span>
      </div>

      {/* Detail Modal */}
      {selectedReservation && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm"
          onClick={() => { setSelectedReservation(null); setPendingAction(null); }}
        >
          <div
            className="bg-white w-full max-w-lg h-full overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              {/* Header */}
              <div className="flex items-start justify-between mb-6">
                <div className="min-w-0">
                  <h2 className="text-xl font-bold text-slate-900 mb-1">{selectedReservation.title}</h2>
                  <ReservationStatusBadge status={selectedReservation.status} />
                </div>
                <button
                  onClick={() => { setSelectedReservation(null); setPendingAction(null); }}
                  className="p-2 rounded-lg hover:bg-slate-100 transition-colors shrink-0"
                >
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </div>

              {/* Reserved by */}
              {selectedReservation.profile && (
                <div className="flex items-center gap-3 mb-5 p-3 rounded-xl bg-slate-50">
                  <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center">
                    <User className="w-4 h-4 text-slate-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">{selectedReservation.profile.full_name}</p>
                    <p className="text-xs text-slate-500 capitalize">{selectedReservation.profile.role}</p>
                  </div>
                </div>
              )}

              {/* Time */}
              <div className="grid grid-cols-2 gap-3 mb-5">
                <div className="p-3 rounded-xl border border-sky-200 bg-sky-50">
                  <p className="text-xs text-sky-500 mb-1">Pick up</p>
                  <p className="text-sm font-medium text-slate-900">
                    {formatDate(selectedReservation.start_time)}, {formatTime(selectedReservation.start_time)}
                  </p>
                </div>
                <div className="p-3 rounded-xl border border-orange-200 bg-orange-50">
                  <p className="text-xs text-orange-500 mb-1">Return by</p>
                  <p className="text-sm font-medium text-slate-900">
                    {formatDate(selectedReservation.end_time)}, {formatTime(selectedReservation.end_time)}
                  </p>
                </div>
              </div>

              {/* Purpose */}
              {selectedReservation.purpose && (
                <div className="mb-5">
                  <p className="text-xs text-slate-400 mb-1">Purpose</p>
                  <p className="text-sm text-slate-700">{selectedReservation.purpose}</p>
                </div>
              )}

              {/* Condition selector */}
              <div className="mb-4">
                <label className="block text-xs font-medium text-slate-500 mb-1.5">
                  Equipment Condition
                </label>
                <div className="flex gap-2">
                  {['good', 'fair', 'needs_repair'].map((c) => (
                    <button
                      key={c}
                      onClick={() => setCondition(c)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${
                        condition === c
                          ? c === 'good'
                            ? 'bg-emerald-100 text-emerald-700 border border-emerald-300'
                            : c === 'fair'
                            ? 'bg-amber-100 text-amber-700 border border-amber-300'
                            : 'bg-red-100 text-red-700 border border-red-300'
                          : 'bg-slate-50 text-slate-500 border border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      {c.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>

              {/* Equipment items */}
              <div className="mb-5">
                <h3 className="text-sm font-semibold text-slate-700 mb-3">
                  Equipment ({selectedReservation.items?.length || 0})
                </h3>
                <div className="space-y-2">
                  {selectedReservation.items?.map((item) => {
                    const checkout = selectedReservation.checkouts?.find(
                      (c) => c.equipment_id === item.equipment_id
                    );
                    const isCheckedOut = !!checkout;
                    const isCheckedIn = !!checkout?.checked_in_at;

                    return (
                      <div
                        key={item.id}
                        className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                          isCheckedIn
                            ? 'bg-emerald-50 border-emerald-100'
                            : isCheckedOut
                            ? 'bg-orange-50 border-orange-200'
                            : 'bg-sky-50 border-sky-200'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                            isCheckedIn ? 'bg-emerald-100' : isCheckedOut ? 'bg-orange-100' : 'bg-sky-100'
                          }`}>
                            <Package className={`w-4 h-4 ${
                              isCheckedIn ? 'text-emerald-600' : isCheckedOut ? 'text-orange-600' : 'text-sky-600'
                            }`} />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-slate-900">{item.equipment.name}</p>
                            <p className="text-xs text-slate-400">{item.equipment.type}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {!isCheckedOut && (
                            <button
                              onClick={() => requestCheckout(item)}
                              disabled={processing}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-medium transition-colors disabled:opacity-60"
                            >
                              <ArrowUpFromLine className="w-3.5 h-3.5" /> Hand out
                            </button>
                          )}
                          {isCheckedOut && !isCheckedIn && (
                            <button
                              onClick={() => requestCheckin(checkout!)}
                              disabled={processing}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-xs font-medium transition-colors disabled:opacity-60"
                            >
                              <ArrowDownToLine className="w-3.5 h-3.5" /> Return
                            </button>
                          )}
                          {isCheckedIn && (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                              <Check className="w-3.5 h-3.5" /> Returned
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {pendingAction && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={cancelAction}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-sm w-full mx-4 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                pendingAction.type === 'checkout' ? 'bg-sky-100' : 'bg-orange-100'
              }`}>
                {pendingAction.type === 'checkout' ? (
                  <ArrowUpFromLine className="w-6 h-6 text-sky-600" />
                ) : (
                  <ArrowDownToLine className="w-6 h-6 text-orange-600" />
                )}
              </div>
              <div>
                <h3 className="font-bold text-slate-900">
                  {pendingAction.type === 'checkout' ? 'Confirm Check Out' : 'Confirm Check In'}
                </h3>
                <p className="text-sm text-slate-500">{pendingAction.itemName}</p>
              </div>
            </div>

            <div className="mb-5 p-3 rounded-xl bg-slate-50 text-sm">
              <div className="flex items-center justify-between mb-1">
                <span className="text-slate-500">Condition</span>
                <span className="font-medium text-slate-900 capitalize">{condition.replace('_', ' ')}</span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {pendingAction.type === 'checkout'
                  ? 'This item will be marked as handed out to the teacher.'
                  : 'This item will be marked as returned and available again.'}
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={cancelAction}
                disabled={processing}
                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium text-sm transition-colors disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={confirmAction}
                disabled={processing}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-white font-medium text-sm transition-colors disabled:opacity-60 ${
                  pendingAction.type === 'checkout'
                    ? 'bg-sky-600 hover:bg-sky-700'
                    : 'bg-orange-600 hover:bg-orange-700'
                }`}
              >
                {processing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                {pendingAction.type === 'checkout' ? 'Confirm Hand Out' : 'Confirm Return'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
