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

function isDateInRange(date: Date, start: string, end: string): boolean {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const s = new Date(start);
  const e = new Date(end);
  return d >= new Date(s.getFullYear(), s.getMonth(), s.getDate()) &&
         d <= new Date(e.getFullYear(), e.getMonth(), e.getDate());
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

  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);

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
      .gte('start_time', weekStartIso)
      .lt('start_time', weekEndIso)
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

  async function handleCheckoutItem(item: CalendarReservation['items'][0]) {
    if (!user || !profile || profile.role !== 'coordinator') return;
    if (!selectedReservation) return;

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
      alert('Failed to check out item: ' + error.message);
    } else {
      await supabase
        .from('equipment')
        .update({ status: 'in_use' })
        .eq('id', item.equipment_id);
      await checkAndUpdateReservationStatus(selectedReservation.id);
      await load();
      const updated = reservations.find(r => r.id === selectedReservation.id);
      if (updated) {
        const refreshed = await reloadReservation(selectedReservation.id);
        setSelectedReservation(refreshed);
      }
      setSuccessMessage(`${item.equipment.name} checked out successfully`);
      setTimeout(() => setSuccessMessage(null), 2500);
    }
    setProcessing(false);
  }

  async function handleCheckinItem(checkout: CheckoutItem) {
    if (!user || !profile || profile.role !== 'coordinator') return;
    if (!selectedReservation) return;

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
      alert('Failed to check in item: ' + error.message);
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

  const weekDays = useMemo(() => {
    return DAYS.map((dayName) => {
      const date = addDays(weekStart, DAY_OFFSETS[dayName]);
      const dayReservations = reservations.filter((r) =>
        isDateInRange(date, r.start_time, r.end_time)
      );
      return { dayName, date, reservations: dayReservations };
    });
  }, [weekStart, reservations]);

  const today = new Date();
  const isThisWeek = sameDay(weekStart, getWeekStart(today));

  function getEventTiming(r: CalendarReservation, dayDate: Date) {
    const start = new Date(r.start_time);
    const end = new Date(r.end_time);
    const dayStart = new Date(dayDate);
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

  function getEventAction(r: CalendarReservation, dayDate: Date): 'checkout' | 'checkin' | 'both' | 'none' {
    const start = new Date(r.start_time);
    const end = new Date(r.end_time);
    const startsToday = sameDay(start, dayDate);
    const endsToday = sameDay(end, dayDate);
    const hasItemsToCheckout = r.items.some(
      (item) => !r.checkouts?.some((c) => c.equipment_id === item.equipment_id)
    );
    const hasItemsToCheckin = r.checkouts?.some((c) => !c.checked_in_at);

    if (startsToday && hasItemsToCheckout && endsToday && hasItemsToCheckin) return 'both';
    if (startsToday && hasItemsToCheckout) return 'checkout';
    if (endsToday && hasItemsToCheckin) return 'checkin';
    return 'none';
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
                            ? 'border-blue-200 bg-blue-50 hover:bg-blue-100'
                            : action === 'checkin'
                            ? 'border-violet-200 bg-violet-50 hover:bg-violet-100'
                            : action === 'both'
                            ? 'border-amber-200 bg-amber-50 hover:bg-amber-100'
                            : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 mb-1">
                          {action === 'checkout' && <ArrowUpFromLine className="w-3.5 h-3.5 text-blue-500 shrink-0" />}
                          {action === 'checkin' && <ArrowDownToLine className="w-3.5 h-3.5 text-violet-500 shrink-0" />}
                          {action === 'both' && (
                            <>
                              <ArrowUpFromLine className="w-3 h-3 text-blue-500" />
                              <ArrowDownToLine className="w-3 h-3 text-violet-500" />
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
                            <span className="text-xs font-medium text-blue-600">
                              {itemsToCheckout} to hand out
                            </span>
                          )}
                          {action === 'checkin' && itemsToCheckin > 0 && (
                            <span className="text-xs font-medium text-violet-600">
                              {itemsToCheckin} to return
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
          <span className="w-3 h-3 rounded bg-blue-100 border border-blue-200" /> Check Out
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-violet-100 border border-violet-200" /> Check In
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-amber-100 border border-amber-200" /> Both
        </span>
      </div>

      {/* Detail Modal */}
      {selectedReservation && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm"
          onClick={() => setSelectedReservation(null)}
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
                  onClick={() => setSelectedReservation(null)}
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
                <div className="p-3 rounded-xl border border-slate-200">
                  <p className="text-xs text-slate-400 mb-1">Pick up</p>
                  <p className="text-sm font-medium text-slate-900">
                    {formatDate(selectedReservation.start_time)}, {formatTime(selectedReservation.start_time)}
                  </p>
                </div>
                <div className="p-3 rounded-xl border border-slate-200">
                  <p className="text-xs text-slate-400 mb-1">Return by</p>
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
                            ? 'bg-violet-50 border-violet-100'
                            : 'border-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                            isCheckedIn ? 'bg-emerald-100' : isCheckedOut ? 'bg-violet-100' : 'bg-slate-100'
                          }`}>
                            <Package className={`w-4 h-4 ${
                              isCheckedIn ? 'text-emerald-600' : isCheckedOut ? 'text-violet-600' : 'text-slate-500'
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
                              onClick={() => handleCheckoutItem(item)}
                              disabled={processing}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors disabled:opacity-60"
                            >
                              <ArrowUpFromLine className="w-3.5 h-3.5" /> Hand out
                            </button>
                          )}
                          {isCheckedOut && !isCheckedIn && (
                            <button
                              onClick={() => handleCheckinItem(checkout!)}
                              disabled={processing}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition-colors disabled:opacity-60"
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
    </div>
  );
}
