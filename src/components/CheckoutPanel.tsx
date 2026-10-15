import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { ReservationStatus, Reservation } from '@/types/database';
import EditReservationModal from '@/components/EditReservationModal';
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
  Pencil,
  Trash2,
  MapPin,
} from 'lucide-react';

interface CheckoutCalendarProps {
  refreshKey?: number;
}

interface CalendarReservation {
  id: string;
  user_id: string;
  reserved_for_name: string | null;
  title: string;
  purpose: string;
  start_time: string;
  end_time: string;
  status: ReservationStatus;
  created_at: string;
  pickup_location: string | null;
  profile: { id: string; full_name: string; role: string } | null;
  items: { id: string; equipment_id: string; equipment: { id: string; name: string; category: string; type: string; status: string } }[];
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
  equipment: { id: string; name: string; category: string; type: string; status: string };
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

type ActionType = 'checkout' | 'checkin' | 'both' | 'completed' | 'none';

function getEventAction(r: CalendarReservation, dayDate: Date): ActionType {
  const start = new Date(r.start_time);
  const end = new Date(r.end_time);
  const startsToday = sameDay(start, dayDate);
  const endsToday = sameDay(end, dayDate);

  const hasItemsToCheckout = r.items.some(
    (item) => !r.checkouts?.some((c) => c.equipment_id === item.equipment_id)
  );

  const hasItemsNotReturned = r.items.some((item) => {
    const checkout = r.checkouts?.find((c) => c.equipment_id === item.equipment_id);
    return !checkout?.checked_in_at;
  });

  const dayIsFriday = dayDate.getDay() === 5;
  const endOnWeekend = end.getDay() === 6 || end.getDay() === 0;
  const endBeforeOrOnDay = end <= new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate(), 23, 59, 59);
  const endsTodayOrWeekendRollback = endsToday || (dayIsFriday && endOnWeekend && endBeforeOrOnDay);

  if (r.status === 'checked_in' && endsTodayOrWeekendRollback) return 'completed';
  if (startsToday && hasItemsToCheckout && endsTodayOrWeekendRollback && hasItemsNotReturned) return 'both';
  if (startsToday && hasItemsToCheckout) return 'checkout';
  if (endsTodayOrWeekendRollback && hasItemsNotReturned) {
    return hasItemsToCheckout ? 'both' : 'checkin';
  }
  return 'none';
}

export default function CheckoutCalendar({ refreshKey }: CheckoutCalendarProps) {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [reservations, setReservations] = useState<CalendarReservation[]>([]);
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [selectedReservation, setSelectedReservation] = useState<CalendarReservation | null>(null);
  const [processing, setProcessing] = useState(false);
  const [condition] = useState('good');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [editingReservation, setEditingReservation] = useState<Reservation | null>(null);
  const [canceling, setCanceling] = useState(false);

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
           equipment:equipment ( id, name, category, type, status )
         )`
      )
      .in('status', ['approved', 'checked_out', 'checked_in'])
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
           equipment:equipment ( id, name, category, type, status )
         )`
      )
      .eq('id', id)
      .maybeSingle();
    return data as CalendarReservation | null;
  }

  async function checkAndUpdateReservationStatus(reservationId: string) {
    const { error } = await supabase.rpc('sync_reservation_status', {
      reservation_id: reservationId,
    });
    if (error) {
      console.error('Error syncing reservation status:', error);
    }
  }

  async function requestCheckout(item: CalendarReservation['items'][0]) {
    if (!user || !profile || !selectedReservation || processing) return;

    if (item.equipment.status === 'maintenance') {
      if (!confirm(`${item.equipment.name} is currently marked as maintenance. Are you sure you want to hand it out?`)) {
        return;
      }
    }

    setProcessing(true);

    const { error } = await supabase.from('checkouts').insert({
      reservation_id: selectedReservation.id,
      equipment_id: item.equipment_id,
      checked_out_by: user.id,
      condition_out: condition,
      notes: '',
    });

    if (error) {
      console.error('Checkout error:', error);
      alert('This item could not be handed out. Please refresh and try again.');
    } else {
      await supabase
        .from('equipment')
        .update({ status: 'in_use' })
        .eq('id', item.equipment_id);
      await checkAndUpdateReservationStatus(selectedReservation.id);
      await load();
      const refreshed = await reloadReservation(selectedReservation.id);
      if (refreshed) setSelectedReservation(refreshed);
      setSuccessMessage(`${item.equipment.name} checked out successfully`);
      setTimeout(() => setSuccessMessage(null), 2500);
    }

    setProcessing(false);
  }

  async function requestCheckin(checkout: CheckoutItem) {
    if (!user || !profile || !selectedReservation || processing) return;

    setProcessing(true);

    const { error } = await supabase
      .from('checkouts')
      .update({
        checked_in_by: user.id,
        checked_in_at: new Date().toISOString(),
        condition_in: condition,
      })
      .eq('id', checkout.id);

    if (error) {
      console.error('Checkin error:', error);
      alert('This item could not be returned. Please refresh and try again.');
    } else {
      await supabase
        .from('equipment')
        .update({ status: 'available' })
        .eq('id', checkout.equipment_id);
      await checkAndUpdateReservationStatus(selectedReservation.id);
      await load();
      const refreshed = await reloadReservation(selectedReservation.id);
      if (refreshed) setSelectedReservation(refreshed);
      setSuccessMessage(`${checkout.equipment.name} returned successfully`);
      setTimeout(() => setSuccessMessage(null), 2500);
    }

    setProcessing(false);
  }

  async function cancelReservation(id: string) {
    if (!confirm('Cancel this reservation?')) return;
    setCanceling(true);
    const { error } = await supabase.rpc('cancel_reservation', {
      reservation_id: id,
    });

    if (error) {
      console.error('Error cancelling reservation:', error);
      alert('This reservation could not be cancelled. Please refresh and try again.');
    } else {
      setSelectedReservation(null);
      await load();
    }
    setCanceling(false);
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
    } else {
      const dayIsFriday = dayDate.getDay() === 5;
      const endOnWeekend = end.getDay() === 6 || end.getDay() === 0;
      if (dayIsFriday && endOnWeekend) {
        return `return by ${formatTime(r.end_time)}`;
      }
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
                    const itemsToCheckin = r.items.filter((item) => {
                      const checkout = r.checkouts?.find((c) => c.equipment_id === item.equipment_id);
                      return !checkout?.checked_in_at;
                    }).length;

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
                            : action === 'completed'
                            ? 'border-slate-200 bg-slate-100 hover:bg-slate-200 opacity-70'
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
                          {action === 'completed' && <Check className="w-3.5 h-3.5 text-slate-500 shrink-0" />}
                          {action === 'none' && <Package className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                          <p className={`text-xs font-semibold truncate ${action === 'completed' ? 'text-slate-500' : 'text-slate-700'}`}>
                            {timing}
                          </p>
                        </div>
                        <p className={`text-sm font-medium truncate mb-0.5 ${action === 'completed' ? 'text-slate-500' : 'text-slate-900'}`}>
                          {r.title}
                        </p>
                        {(r.reserved_for_name || r.profile) && (
                          <p className={`text-xs truncate flex items-center gap-1 ${action === 'completed' ? 'text-slate-400' : 'text-slate-500'}`}>
                            <User className="w-3 h-3" /> {r.reserved_for_name || r.profile?.full_name}
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
                          {action === 'completed' && (
                            <span className="text-xs font-medium text-slate-500">Completed</span>
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
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-slate-100 border border-slate-300" /> Completed
        </span>
      </div>

      {/* Detail Modal */}
      {selectedReservation && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm"
          onClick={() => { setSelectedReservation(null); }}
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
                  onClick={() => { setSelectedReservation(null); }}
                  className="p-2 rounded-lg hover:bg-slate-100 transition-colors shrink-0"
                >
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </div>

              {/* Reserved by */}
              {(selectedReservation.reserved_for_name || selectedReservation.profile) && (
                <div className="flex items-center gap-3 mb-5 p-3 rounded-xl bg-slate-50">
                  <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center">
                    <User className="w-4 h-4 text-slate-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">{selectedReservation.reserved_for_name || selectedReservation.profile?.full_name}</p>
                    <p className="text-xs text-slate-500 capitalize">{selectedReservation.reserved_for_name ? 'Teacher' : selectedReservation.profile?.role}</p>
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

              {/* Pickup/Dropoff Location */}
              {selectedReservation.pickup_location && (
                <div className="mb-5">
                  <p className="text-xs text-slate-400 mb-1">Pickup/Dropoff Location</p>
                  <p className="text-sm text-slate-700 flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-slate-400" /> {selectedReservation.pickup_location}
                  </p>
                </div>
              )}

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
                          {!isCheckedOut && item.equipment.status === 'maintenance' && (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg">
                              <AlertTriangle className="w-3 h-3" /> Maintenance
                            </span>
                          )}
                          {!isCheckedOut && (
                            <button
                              onClick={() => requestCheckout(item)}
                              disabled={processing}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white text-xs font-medium transition-colors disabled:opacity-60 ${
                                item.equipment.status === 'maintenance'
                                  ? 'bg-amber-600 hover:bg-amber-700'
                                  : 'bg-sky-600 hover:bg-sky-700'
                              }`}
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

              {/* Actions */}
              {(selectedReservation.status === 'approved' || selectedReservation.status === 'checked_out') && (
                <div className="flex flex-wrap gap-3 pt-4 border-t border-slate-100">
                  <button
                    onClick={() => setEditingReservation(selectedReservation as unknown as Reservation)}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-blue-200 text-blue-600 hover:bg-blue-50 font-medium text-sm transition-colors"
                  >
                    <Pencil className="w-4 h-4" /> Edit Reservation
                  </button>
                  <button
                    onClick={() => cancelReservation(selectedReservation.id)}
                    disabled={canceling}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white font-medium text-sm transition-colors disabled:opacity-60"
                  >
                    <Trash2 className="w-4 h-4" /> Cancel Reservation
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {editingReservation && (
        <EditReservationModal
          reservation={editingReservation}
          onClose={() => setEditingReservation(null)}
          onSaved={async () => {
            setEditingReservation(null);
            await load();
            const refreshed = await reloadReservation(editingReservation.id);
            if (refreshed) setSelectedReservation(refreshed);
          }}
        />
      )}
    </div>
  );
}
