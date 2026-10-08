import { useState, FormEvent, useMemo, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { Profile } from '@/types/database';
import EquipmentCatalog from '@/components/EquipmentCatalog';
import { X, Calendar, Clock, Loader2, ShoppingBag, Check, User } from 'lucide-react';

interface CreateReservationModalProps {
  onClose: () => void;
  onCreated: () => void;
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

function toDateInput(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function getNextAllowedDate(date: Date): Date {
  const day = date.getDay();
  if (day === 6) return new Date(date.getTime() + 2 * 24 * 60 * 60 * 1000);
  if (day === 0) return new Date(date.getTime() + 1 * 24 * 60 * 60 * 1000);
  return date;
}

const TIME_SLOTS: string[] = (() => {
  const slots: string[] = [];
  for (let h = 8; h <= 16; h++) {
    const maxMin = h === 16 ? 30 : 45;
    for (let m = 0; m <= maxMin; m += 15) {
      slots.push(`${pad(h)}:${pad(m)}`);
    }
  }
  return slots;
})();

function defaultDate(): string {
  const now = new Date();
  return toDateInput(getNextAllowedDate(now));
}

function defaultTimeSlot(after?: string): string {
  if (!after) return '09:00';
  const idx = TIME_SLOTS.indexOf(after);
  if (idx >= 0 && idx < TIME_SLOTS.length - 1) return TIME_SLOTS[idx + 1];
  return after;
}

function buildISOString(dateStr: string, timeStr: string): string {
  const [h, m] = timeStr.split(':').map(Number);
  const [y, mo, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, mo - 1, d, h, m);
  return dt.toISOString();
}

export default function CreateReservationModal({ onClose, onCreated }: CreateReservationModalProps) {
  const { user, profile } = useAuth();
  const isCoordinator = profile?.role === 'coordinator';

  const [title, setTitle] = useState('');
  const [purpose, setPurpose] = useState('');
  const [dateStr, setDateStr] = useState(defaultDate());
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [teachers, setTeachers] = useState<Profile[]>([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>('');

  useEffect(() => {
    if (isCoordinator) {
      supabase
        .from('profiles')
        .select('*')
        .eq('role', 'teacher')
        .order('full_name')
        .then(({ data }) => {
          if (data) setTeachers(data as Profile[]);
        });
    }
  }, [isCoordinator]);

  const reservationDate = useMemo(() => ({
    start: buildISOString(dateStr, startTime),
    end: buildISOString(dateStr, endTime),
  }), [dateStr, startTime, endTime]);

  function handleDateChange(value: string) {
    const date = new Date(value + 'T00:00:00');
    const day = date.getDay();
    if (day === 6 || day === 0) {
      setError('Reservations cannot be made on weekends. Please select a weekday (Monday–Friday).');
      return;
    }
    setError(null);
    setDateStr(value);
  }

  function handleStartTimeChange(value: string) {
    setStartTime(value);
    if (TIME_SLOTS.indexOf(value) >= TIME_SLOTS.indexOf(endTime)) {
      setEndTime(defaultTimeSlot(value));
    }
  }

  function isWeekend(dateStr: string): boolean {
    const date = new Date(dateStr + 'T00:00:00');
    const day = date.getDay();
    return day === 6 || day === 0;
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError('Please give your reservation a title.');
      return;
    }
    if (selectedIds.size === 0) {
      setError('Please select at least one piece of equipment.');
      return;
    }
    if (isWeekend(dateStr)) {
      setError('Reservations cannot be made on weekends.');
      return;
    }

    const startIso = buildISOString(dateStr, startTime);
    const endIso = buildISOString(dateStr, endTime);
    const start = new Date(startIso);
    const end = new Date(endIso);

    if (end <= start) {
      setError('End time must be after start time.');
      return;
    }

    const reservationUserId = isCoordinator && selectedTeacherId
      ? selectedTeacherId
      : user!.id;

    setSubmitting(true);

    const { data: reservation, error: resError } = await supabase
      .from('reservations')
      .insert({
        user_id: reservationUserId,
        title: title.trim(),
        purpose: purpose.trim(),
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        status: 'approved',
      })
      .select()
      .single();

    if (resError || !reservation) {
      setError(resError?.message || 'Failed to create reservation.');
      setSubmitting(false);
      return;
    }

    const items = Array.from(selectedIds).map((equipmentId) => ({
      reservation_id: reservation.id,
      equipment_id: equipmentId,
    }));

    const { error: itemsError } = await supabase
      .from('reservation_items')
      .insert(items);

    if (itemsError) {
      setError('Reservation created but some items could not be added: ' + itemsError.message);
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    onCreated();
  }

  const selectedCount = selectedIds.size;

  return (
    <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center bg-black/50 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white w-full sm:max-w-3xl sm:rounded-2xl shadow-2xl flex flex-col max-h-screen sm:max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-slate-900">New Reservation</h2>
            <p className="text-sm text-slate-500">
              {isCoordinator ? 'Reserve equipment for a teacher' : 'Pick equipment and set the time for your event'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* Coordinator: teacher selector */}
          {isCoordinator && (
            <div className="mb-5">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                <span className="flex items-center gap-1.5">
                  <User className="w-4 h-4" /> Reserve for Teacher
                </span>
              </label>
              <select
                value={selectedTeacherId}
                onChange={(e) => setSelectedTeacherId(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all text-slate-900 bg-white"
              >
                <option value="">Myself (Coordinator)</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.full_name || 'Unnamed teacher'}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-400 mt-1">
                Select which teacher this reservation is for.
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Event details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Event / Lesson Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  placeholder="e.g. School Assembly Presentation"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all text-slate-900"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-4 h-4" /> Date
                  </span>
                </label>
                <input
                  type="date"
                  value={dateStr}
                  onChange={(e) => handleDateChange(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all text-slate-900"
                />
                <p className="text-xs text-slate-400 mt-1">
                  Weekdays only (Monday–Friday)
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-4 h-4" /> Start
                    </span>
                  </label>
                  <select
                    value={startTime}
                    onChange={(e) => handleStartTimeChange(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all text-slate-900 bg-white"
                  >
                    {TIME_SLOTS.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-4 h-4" /> End
                    </span>
                  </label>
                  <select
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all text-slate-900 bg-white"
                  >
                    {TIME_SLOTS.filter((t) => TIME_SLOTS.indexOf(t) > TIME_SLOTS.indexOf(startTime)).map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Purpose <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <textarea
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  rows={2}
                  placeholder="Brief description of what the equipment is for"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all text-slate-900 resize-none"
                />
              </div>
            </div>

            {/* Equipment selection */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-700">
                  Select Equipment
                </h3>
                {selectedCount > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-medium">
                    <ShoppingBag className="w-3.5 h-3.5" />
                    {selectedCount} item{selectedCount !== 1 ? 's' : ''} selected
                  </span>
                )}
              </div>
              <EquipmentCatalog
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
                reservationDate={reservationDate}
              />
            </div>

            {error && (
              <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
                {error}
              </div>
            )}
          </form>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl text-slate-600 hover:bg-slate-100 font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium transition-all shadow-lg shadow-blue-600/20 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            {submitting ? 'Creating...' : 'Create Reservation'}
          </button>
        </div>
      </div>
    </div>
  );
}
