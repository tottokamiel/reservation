import { useMemo, useState, FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import type { Reservation } from '@/types/database';
import EquipmentCatalog from '@/components/EquipmentCatalog';
import { Calendar, Check, Clock, Loader2, User, X } from 'lucide-react';

interface EditReservationModalProps {
  reservation: Reservation;
  onClose: () => void;
  onSaved: () => void;
}

const TIME_SLOTS: string[] = (() => {
  const slots: string[] = [];
  for (let hour = 8; hour <= 16; hour += 1) {
    const maxMinute = hour === 16 ? 30 : 45;
    for (let minute = 0; minute <= maxMinute; minute += 15) {
      slots.push(`${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`);
    }
  }
  return slots;
})();

function toDateInput(value: string): string {
  const date = new Date(value);
  return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
}

function toTimeInput(value: string): string {
  const date = new Date(value);
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

function buildISOString(dateValue: string, timeValue: string): string {
  const [year, month, day] = dateValue.split('-').map(Number);
  const [hour, minute] = timeValue.split(':').map(Number);
  return new Date(year, month - 1, day, hour, minute).toISOString();
}

function isWeekend(value: string): boolean {
  const day = new Date(`${value}T00:00:00`).getDay();
  return day === 0 || day === 6;
}

export default function EditReservationModal({ reservation, onClose, onSaved }: EditReservationModalProps) {
  const [title, setTitle] = useState(reservation.title);
  const [purpose, setPurpose] = useState(reservation.purpose);
  const [reservedForName, setReservedForName] = useState(reservation.reserved_for_name || '');
  const [dateStr, setDateStr] = useState(toDateInput(reservation.start_time));
  const [endDateStr, setEndDateStr] = useState(toDateInput(reservation.end_time));
  const [startTime, setStartTime] = useState(toTimeInput(reservation.start_time));
  const [endTime, setEndTime] = useState(toTimeInput(reservation.end_time));
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set((reservation.items || []).map((item) => item.equipment_id))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const endTimeOptions = useMemo(() => (
    endDateStr === dateStr
      ? TIME_SLOTS.filter((time) => TIME_SLOTS.indexOf(time) > TIME_SLOTS.indexOf(startTime))
      : TIME_SLOTS
  ), [dateStr, endDateStr, startTime]);

  function toggleSelect(id: string) {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError('Please give your reservation a title.');
      return;
    }
    if (selectedIds.size === 0) {
      setError('Please keep at least one piece of equipment.');
      return;
    }
    if (isWeekend(dateStr) || isWeekend(endDateStr)) {
      setError('Reservations cannot be made on weekends.');
      return;
    }

    const startIso = buildISOString(dateStr, startTime);
    const endIso = buildISOString(endDateStr, endTime);
    if (new Date(endIso) <= new Date(startIso)) {
      setError('Return time must be after pickup time.');
      return;
    }

    const checkedOutIds = new Set(
      (reservation.checkouts || []).filter((checkout) => !checkout.checked_in_at).map((checkout) => checkout.equipment_id)
    );
    const removedCheckedOutItem = Array.from(checkedOutIds).some((id) => !selectedIds.has(id));
    if (removedCheckedOutItem) {
      setError('Items that are currently checked out must be returned before they can be removed.');
      return;
    }

    setSaving(true);
    const { error: reservationError } = await supabase
      .from('reservations')
      .update({
        title: title.trim(),
        purpose: purpose.trim(),
        reserved_for_name: reservedForName.trim() || null,
        start_time: startIso,
        end_time: endIso,
      })
      .eq('id', reservation.id);

    if (reservationError) {
      setError(reservationError.message);
      setSaving(false);
      return;
    }

    const existingIds = new Set((reservation.items || []).map((item) => item.equipment_id));
    const removedIds = Array.from(existingIds).filter((id) => !selectedIds.has(id));
    const addedIds = Array.from(selectedIds).filter((id) => !existingIds.has(id));

    if (removedIds.length > 0) {
      const { error: removeError } = await supabase
        .from('reservation_items')
        .delete()
        .eq('reservation_id', reservation.id)
        .in('equipment_id', removedIds);
      if (removeError) {
        setError('Reservation details saved, but equipment could not be removed: ' + removeError.message);
        setSaving(false);
        return;
      }
    }

    if (addedIds.length > 0) {
      const { error: addError } = await supabase
        .from('reservation_items')
        .insert(addedIds.map((equipmentId) => ({ reservation_id: reservation.id, equipment_id: equipmentId })));
      if (addError) {
        setError('Reservation details saved, but equipment could not be added: ' + addError.message);
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-stretch sm:items-center justify-center bg-black/50 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white w-full sm:max-w-3xl sm:rounded-2xl shadow-2xl flex flex-col max-h-screen sm:max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Edit Reservation</h2>
            <p className="text-sm text-slate-500">Change the booking details or equipment items.</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <form id="edit-reservation-form" onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Event / Lesson Title</label>
                <input value={title} onChange={(event) => setTitle(event.target.value)} required className="w-full px-4 py-2.5 rounded-xl border border-slate-200 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 text-slate-900" />
              </div>
              <div className="sm:col-span-2">
                <label className="flex items-center gap-1.5 text-sm font-medium text-slate-700 mb-1.5"><User className="w-4 h-4" /> Teacher</label>
                <input value={reservedForName} onChange={(event) => setReservedForName(event.target.value)} placeholder="Teacher name" className="w-full px-4 py-2.5 rounded-xl border border-slate-200 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 text-slate-900" />
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-sm font-medium text-slate-700 mb-1.5"><Calendar className="w-4 h-4" /> Pickup Date</label>
                <input type="date" value={dateStr} onChange={(event) => setDateStr(event.target.value)} required className="w-full px-4 py-2.5 rounded-xl border border-slate-200 outline-none focus:border-blue-500 text-slate-900" />
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-sm font-medium text-slate-700 mb-1.5"><Clock className="w-4 h-4" /> Pickup Time</label>
                <select value={startTime} onChange={(event) => setStartTime(event.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 outline-none focus:border-blue-500 text-slate-900 bg-white">
                  {TIME_SLOTS.map((time) => <option key={time} value={time}>{time}</option>)}
                </select>
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-sm font-medium text-slate-700 mb-1.5"><Calendar className="w-4 h-4" /> Return Date</label>
                <input type="date" value={endDateStr} min={dateStr} onChange={(event) => setEndDateStr(event.target.value)} required className="w-full px-4 py-2.5 rounded-xl border border-slate-200 outline-none focus:border-blue-500 text-slate-900" />
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-sm font-medium text-slate-700 mb-1.5"><Clock className="w-4 h-4" /> Return Time</label>
                <select value={endTime} onChange={(event) => setEndTime(event.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 outline-none focus:border-blue-500 text-slate-900 bg-white">
                  {endTimeOptions.map((time) => <option key={time} value={time}>{time}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Purpose</label>
                <textarea value={purpose} onChange={(event) => setPurpose(event.target.value)} rows={2} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 outline-none focus:border-blue-500 text-slate-900 resize-none" />
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Equipment</h3>
              <EquipmentCatalog selectedIds={selectedIds} onToggleSelect={toggleSelect} />
            </div>
            {error && <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
          </form>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-200 shrink-0">
          <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-xl text-slate-600 hover:bg-slate-100 font-medium">Cancel</button>
          <button type="submit" form="edit-reservation-form" disabled={saving} className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium disabled:opacity-60">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
