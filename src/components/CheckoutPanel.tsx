import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { Reservation, ReservationStatus } from '@/types/database';
import {
  ReservationStatusBadge,
  formatDateTime,
} from '@/components/Badges';
import {
  Loader2,
  Package,
  User,
  ArrowUpFromLine,
  ArrowDownToLine,
  ClipboardCheck,
  Inbox,
  Check,
} from 'lucide-react';

interface CheckoutPanelProps {
  refreshKey?: number;
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
  checked_out_by_profile: { id: string; full_name: string } | null;
  checked_in_by_profile: { id: string; full_name: string } | null;
}

interface EnrichedReservation {
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

type CheckoutMode = 'checkout' | 'checkin';

export default function CheckoutPanel({ refreshKey }: CheckoutPanelProps) {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [reservations, setReservations] = useState<EnrichedReservation[]>([]);
  const [actionMode, setActionMode] = useState<CheckoutMode>('checkout');
  const [selectedReservation, setSelectedReservation] = useState<EnrichedReservation | null>(null);
  const [processing, setProcessing] = useState(false);
  const [condition, setCondition] = useState('good');

  const [successMessage, setSuccessMessage] = useState<string | null>(null);

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
           id, reservation_id, equipment_id,
           checked_out_by, checked_out_at,
           checked_in_by, checked_in_at,
           condition_out, condition_in, notes,
           equipment:equipment ( id, name, category, type ),
           checked_out_by_profile:profiles!checked_out_by ( id, full_name ),
           checked_in_by_profile:profiles!checked_in_by ( id, full_name )
         )`
      )
      .in('status', ['approved', 'checked_out'])
      .order('start_time', { ascending: true });

    if (error) {
      console.error('Error loading checkout panel:', error);
    } else if (data) {
      setReservations(data as EnrichedReservation[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  async function handleCheckoutItem(item: EnrichedReservation['items'][0]) {
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
      // Update equipment status to in_use
      await supabase
        .from('equipment')
        .update({ status: 'in_use' })
        .eq('id', item.equipment_id);

      // Check if all items are checked out → update reservation status
      await checkAndUpdateReservationStatus(selectedReservation.id);
      await load();
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
      // Return equipment to available
      await supabase
        .from('equipment')
        .update({ status: 'available' })
        .eq('id', checkout.equipment_id);

      await checkAndUpdateReservationStatus(selectedReservation.id);
      await load();
      setSuccessMessage(`${checkout.equipment.name} returned successfully`);
      setTimeout(() => setSuccessMessage(null), 2500);
    }
    setProcessing(false);
  }

  async function checkAndUpdateReservationStatus(reservationId: string) {
    // Reload the reservation's checkouts to determine status
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
      newStatus = 'checked_out'; // partially checked out
    }

    if (newStatus !== data.status) {
      await supabase
        .from('reservations')
        .update({ status: newStatus })
        .eq('id', reservationId);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  if (reservations.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-slate-100 mb-4">
          <Inbox className="w-8 h-8 text-slate-400" />
        </div>
        <p className="text-slate-500 font-medium">No equipment to process</p>
        <p className="text-sm text-slate-400 mt-1">
          Approved reservations and active check-outs will appear here.
        </p>
      </div>
    );
  }

  // Filter for the selected mode
  const pendingReservations = reservations.filter((r) => {
    if (actionMode === 'checkout') {
      // Show reservations where there are items not yet checked out
      return r.items.some(
        (item) => !r.checkouts?.some((c) => c.equipment_id === item.equipment_id)
      );
    } else {
      // Show reservations where there are items checked out but not returned
      return r.checkouts?.some((c) => !c.checked_in_at);
    }
  });

  return (
    <div>
      {/* Mode toggle */}
      <div className="flex gap-2 mb-6 p-1 bg-slate-100 rounded-xl w-fit">
        <button
          onClick={() => { setActionMode('checkout'); setSelectedReservation(null); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            actionMode === 'checkout'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <ArrowUpFromLine className="w-4 h-4" /> Check Out
        </button>
        <button
          onClick={() => { setActionMode('checkin'); setSelectedReservation(null); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            actionMode === 'checkin'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <ArrowDownToLine className="w-4 h-4" /> Check In
        </button>
      </div>

      {successMessage && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm flex items-center gap-2">
          <Check className="w-4 h-4" /> {successMessage}
        </div>
      )}

      {pendingReservations.length === 0 ? (
        <div className="text-center py-12">
          <ClipboardCheck className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">
            {actionMode === 'checkout'
              ? 'All approved equipment has been checked out.'
              : 'No equipment is currently checked out.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {pendingReservations.map((r) => {
            const isSelected = selectedReservation?.id === r.id;
            return (
              <div
                key={r.id}
                className={`bg-white rounded-2xl border-2 transition-all ${
                  isSelected ? 'border-blue-500 shadow-md' : 'border-slate-200'
                }`}
              >
                {/* Reservation header */}
                <div
                  className="p-5 cursor-pointer"
                  onClick={() => setSelectedReservation(isSelected ? null : r)}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <h3 className="font-semibold text-slate-900">{r.title}</h3>
                    <ReservationStatusBadge status={r.status} />
                  </div>
                  {r.profile && (
                    <p className="text-sm text-slate-500 flex items-center gap-1.5 mb-2">
                      <User className="w-3.5 h-3.5" /> {r.profile.full_name}
                    </p>
                  )}
                  <p className="text-xs text-slate-400">
                    {formatDateTime(r.start_time)} → {formatDateTime(r.end_time)}
                  </p>
                </div>

                {/* Items list - shown when selected */}
                {isSelected && (
                  <div className="border-t border-slate-100 p-5 space-y-3">
                    {/* Condition selector */}
                    <div className="mb-2">
                      <label className="block text-xs font-medium text-slate-500 mb-1.5">
                        Condition
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

                    {actionMode === 'checkout' ? (
                      <>
                        {r.items
                          .filter(
                            (item) =>
                              !r.checkouts?.some((c) => c.equipment_id === item.equipment_id)
                          )
                          .map((item) => (
                            <div
                              key={item.id}
                              className="flex items-center justify-between p-3 rounded-xl border border-slate-200"
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center">
                                  <Package className="w-4 h-4 text-slate-500" />
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-slate-900">
                                    {item.equipment.name}
                                  </p>
                                  <p className="text-xs text-slate-400">
                                    {item.equipment.type}
                                  </p>
                                </div>
                              </div>
                              <button
                                onClick={() => handleCheckoutItem(item)}
                                disabled={processing}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors disabled:opacity-60"
                              >
                                <ArrowUpFromLine className="w-3.5 h-3.5" />
                                Hand out
                              </button>
                            </div>
                          ))}
                        {/* Already checked out items */}
                        {r.checkouts?.filter((c) => !c.checked_in_at).map((c) => (
                          <div
                            key={c.id}
                            className="flex items-center justify-between p-3 rounded-xl bg-violet-50 border border-violet-100"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-lg bg-violet-100 flex items-center justify-center">
                                <Package className="w-4 h-4 text-violet-600" />
                              </div>
                              <div>
                                <p className="text-sm font-medium text-slate-900">
                                  {c.equipment.name}
                                </p>
                                <p className="text-xs text-violet-600">Already checked out</p>
                              </div>
                            </div>
                            <Check className="w-4 h-4 text-violet-500" />
                          </div>
                        ))}
                      </>
                    ) : (
                      /* Check-in mode */
                      <>
                        {r.checkouts
                          ?.filter((c) => !c.checked_in_at)
                          .map((c) => (
                            <div
                              key={c.id}
                              className="flex items-center justify-between p-3 rounded-xl border border-slate-200"
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center">
                                  <Package className="w-4 h-4 text-slate-500" />
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-slate-900">
                                    {c.equipment.name}
                                  </p>
                                  <p className="text-xs text-slate-400">
                                    Out since {formatDateTime(c.checked_out_at)}
                                  </p>
                                </div>
                              </div>
                              <button
                                onClick={() => handleCheckinItem(c)}
                                disabled={processing}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition-colors disabled:opacity-60"
                              >
                                <ArrowDownToLine className="w-3.5 h-3.5" />
                                Return
                              </button>
                            </div>
                          ))}
                        {r.checkouts?.filter((c) => c.checked_in_at).map((c) => (
                          <div
                            key={c.id}
                            className="flex items-center justify-between p-3 rounded-xl bg-emerald-50 border border-emerald-100"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center">
                                <Package className="w-4 h-4 text-emerald-600" />
                              </div>
                              <div>
                                <p className="text-sm font-medium text-slate-900">
                                  {c.equipment.name}
                                </p>
                                <p className="text-xs text-emerald-600">
                                  Returned {c.checked_in_at ? formatDateTime(c.checked_in_at) : ''}
                                </p>
                              </div>
                            </div>
                            <Check className="w-4 h-4 text-emerald-500" />
                          </div>
                        ))}
                      </>
                    )}

                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
