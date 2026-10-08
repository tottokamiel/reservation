import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { Reservation } from '@/types/database';
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
  Loader2,
  Inbox,
  X,
  Trash2,
  ArrowRight,
} from 'lucide-react';

interface ReservationsListProps {
  filter: 'mine' | 'all';
  onEdit?: () => void;
  refreshKey?: number;
}

export default function ReservationsList({ filter, refreshKey }: ReservationsListProps) {
  const { user, profile } = useAuth();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailReservation, setDetailReservation] = useState<Reservation | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [canceling, setCanceling] = useState(false);

  const loadReservations = useCallback(async () => {
    setLoading(true);

    let query = supabase
      .from('reservations')
      .select(
        `*,
         profile:profiles!user_id (id, full_name, role)`
      )
      .order('start_time', { ascending: true });

    if (filter === 'mine' && user) {
      query = query.eq('user_id', user.id);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error loading reservations:', error);
    } else if (data) {
      setReservations(data as Reservation[]);
    }
    setLoading(false);
  }, [filter, user]);

  useEffect(() => {
    loadReservations();
  }, [loadReservations, refreshKey]);

  async function loadDetail(id: string) {
    setDetailLoading(true);
    const { data, error } = await supabase
      .from('reservations')
      .select(
        `*,
         profile:profiles!user_id (id, full_name, role),
         items:reservation_items (
           id, reservation_id, equipment_id, created_at,
           equipment:equipment (id, name, category, type, status, notes)
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
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('Error loading detail:', error);
    } else if (data) {
      setDetailReservation(data as Reservation);
    }
    setDetailLoading(false);
  }

  function openDetail(id: string) {
    setExpandedId(id);
    loadDetail(id);
  }

  function closeDetail() {
    setExpandedId(null);
    setDetailReservation(null);
  }

  async function cancelReservation(id: string) {
    setCanceling(true);
    const { error } = await supabase
      .from('reservations')
      .update({ status: 'cancelled' })
      .eq('id', id);

    if (error) {
      console.error('Error cancelling reservation:', error);
    } else {
      await loadReservations();
      closeDetail();
    }
    setCanceling(false);
  }

  async function deleteReservation(id: string) {
    setCanceling(true);
    const { error } = await supabase
      .from('reservations')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting reservation:', error);
    } else {
      await loadReservations();
      closeDetail();
    }
    setCanceling(false);
  }

  const isCoordinator = profile?.role === 'coordinator';

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
        <p className="text-slate-500 font-medium">No reservations yet</p>
        <p className="text-sm text-slate-400 mt-1">
          {filter === 'mine'
            ? 'Create a reservation to get started.'
            : 'Reservations from teachers will appear here.'}
        </p>
      </div>
    );
  }

  const now = new Date();
  const upcoming = reservations.filter((r) => new Date(r.end_time) >= now && r.status !== 'cancelled' && r.status !== 'checked_in');
  const past = reservations.filter((r) => new Date(r.end_time) < now || r.status === 'cancelled' || r.status === 'checked_in');

  function renderReservationCard(r: Reservation) {
    const itemCount = detailReservation?.id === r.id ? detailReservation.items?.length : null;
    return (
      <button
        key={r.id}
        onClick={() => openDetail(r.id)}
        className="w-full text-left bg-white rounded-2xl border border-slate-200 p-5 hover:border-slate-300 hover:shadow-md transition-all"
      >
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="min-w-0">
            <h3 className="font-semibold text-slate-900 truncate">{r.title}</h3>
            {filter === 'all' && r.profile && (
              <p className="text-sm text-slate-500 mt-0.5 flex items-center gap-1">
                <User className="w-3.5 h-3.5" /> {r.profile.full_name}
              </p>
            )}
          </div>
          <ReservationStatusBadge status={r.status} />
        </div>

        <div className="flex items-center gap-4 text-sm text-slate-500">
          <span className="flex items-center gap-1.5">
            <Calendar className="w-4 h-4" /> {formatDateTime(r.start_time)}
          </span>
        </div>
        <div className="flex items-center gap-4 text-sm text-slate-500 mt-1.5">
          <span className="flex items-center gap-1.5">
            <Clock className="w-4 h-4" /> Until {formatDateTime(r.end_time)}
          </span>
          {itemCount !== null && (
            <span className="flex items-center gap-1.5">
              <Package className="w-4 h-4" /> {itemCount} item{itemCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </button>
    );
  }

  return (
    <div className="space-y-6">
      {upcoming.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3">
            Upcoming
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {upcoming.map(renderReservationCard)}
          </div>
        </div>
      )}

      {past.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3">
            Past
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {past.map(renderReservationCard)}
          </div>
        </div>
      )}

      {/* Detail Drawer */}
      {expandedId && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm" onClick={closeDetail}>
          <div
            className="bg-white w-full max-w-lg h-full overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {detailLoading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
              </div>
            ) : detailReservation ? (
              <div className="p-6">
                <div className="flex items-start justify-between mb-6">
                  <div className="min-w-0">
                    <h2 className="text-xl font-bold text-slate-900 mb-1">{detailReservation.title}</h2>
                    <ReservationStatusBadge status={detailReservation.status} />
                  </div>
                  <button
                    onClick={closeDetail}
                    className="p-2 rounded-lg hover:bg-slate-100 transition-colors shrink-0"
                  >
                    <X className="w-5 h-5 text-slate-500" />
                  </button>
                </div>

                {/* Reserved by */}
                {detailReservation.profile && (
                  <div className="flex items-center gap-3 mb-5 p-3 rounded-xl bg-slate-50">
                    <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center">
                      <User className="w-4 h-4 text-slate-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-900">{detailReservation.profile.full_name}</p>
                      <p className="text-xs text-slate-500 capitalize">{detailReservation.profile.role}</p>
                    </div>
                  </div>
                )}

                {/* Time */}
                <div className="grid grid-cols-2 gap-3 mb-5">
                  <div className="p-3 rounded-xl border border-slate-200">
                    <p className="text-xs text-slate-400 mb-1">Pick up</p>
                    <p className="text-sm font-medium text-slate-900">{formatDateTime(detailReservation.start_time)}</p>
                  </div>
                  <div className="p-3 rounded-xl border border-slate-200">
                    <p className="text-xs text-slate-400 mb-1">Return by</p>
                    <p className="text-sm font-medium text-slate-900">{formatDateTime(detailReservation.end_time)}</p>
                  </div>
                </div>

                {/* Purpose */}
                {detailReservation.purpose && (
                  <div className="mb-5">
                    <p className="text-xs text-slate-400 mb-1">Purpose</p>
                    <p className="text-sm text-slate-700">{detailReservation.purpose}</p>
                  </div>
                )}

                {/* Equipment items */}
                <div className="mb-5">
                  <h3 className="text-sm font-semibold text-slate-700 mb-3">
                    Equipment ({detailReservation.items?.length || 0})
                  </h3>
                  <div className="space-y-2">
                    {detailReservation.items?.map((item) => {
                      const checkout = detailReservation.checkouts?.find(
                        (c) => c.equipment_id === item.equipment_id
                      );
                      return (
                        <div
                          key={item.id}
                          className="flex items-center justify-between p-3 rounded-xl border border-slate-200"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center">
                              <Package className="w-4 h-4 text-slate-500" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-slate-900">{item.equipment.name}</p>
                              <p className="text-xs text-slate-400">{item.equipment.type}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            {checkout ? (
                              checkout.checked_in_at ? (
                                <div>
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                                    Returned
                                  </span>
                                  <p className="text-xs text-slate-400 mt-0.5">
                                    {formatRelative(checkout.checked_in_at)}
                                  </p>
                                </div>
                              ) : (
                                <div>
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-violet-100 text-violet-700">
                                    Checked Out
                                  </span>
                                  <p className="text-xs text-slate-400 mt-0.5">
                                    {formatRelative(checkout.checked_out_at)}
                                  </p>
                                </div>
                              )
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500">
                                Not checked out
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Checkout details */}
                {detailReservation.checkouts && detailReservation.checkouts.length > 0 && (
                  <div className="mb-5">
                    <h3 className="text-sm font-semibold text-slate-700 mb-3">Handoff Log</h3>
                    <div className="space-y-2">
                      {detailReservation.checkouts.map((c) => (
                        <div key={c.id} className="p-3 rounded-xl bg-slate-50 text-sm">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium text-slate-700">{c.equipment?.name}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                            <span>Out: {formatDateTime(c.checked_out_at)}</span>
                            <ArrowRight className="w-3 h-3" />
                            <span>
                              {c.checked_in_by_profile?.full_name ? 'Returned' : 'Pending return'}
                            </span>
                          </div>
                          {c.checked_out_by_profile && (
                            <p className="text-xs text-slate-400">
                              Handed out by {c.checked_out_by_profile.full_name}
                            </p>
                          )}
                          {c.checked_in_by_profile && (
                            <p className="text-xs text-slate-400">
                              Returned to {c.checked_in_by_profile.full_name}
                            </p>
                          )}
                          {c.condition_in && (
                            <p className="text-xs text-slate-400 mt-1">
                              Condition on return: {c.condition_in}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex flex-wrap gap-3 pt-2 border-t border-slate-100">
                  {/* Teacher: Cancel own active reservation */}
                  {!isCoordinator && (detailReservation.status === 'approved' || detailReservation.status === 'checked_out') && (
                    <button
                      onClick={() => cancelReservation(detailReservation.id)}
                      disabled={canceling}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium text-sm transition-colors disabled:opacity-60"
                    >
                      <X className="w-4 h-4" /> Cancel Reservation
                    </button>
                  )}
                  {/* Coordinator: Cancel any active reservation */}
                  {isCoordinator && (detailReservation.status === 'approved' || detailReservation.status === 'checked_out') && (
                    <button
                      onClick={() => cancelReservation(detailReservation.id)}
                      disabled={canceling}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white font-medium text-sm transition-colors disabled:opacity-60"
                    >
                      <X className="w-4 h-4" /> Cancel Reservation
                    </button>
                  )}
                  {isCoordinator && (detailReservation.status === 'cancelled' || detailReservation.status === 'checked_in') && (
                    <button
                      onClick={() => deleteReservation(detailReservation.id)}
                      disabled={canceling}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 font-medium text-sm transition-colors disabled:opacity-60"
                    >
                      <Trash2 className="w-4 h-4" /> Delete
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-6 text-center text-slate-500">
                <p>Could not load reservation details.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
