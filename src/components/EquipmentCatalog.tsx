import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { Equipment, EquipmentStatus, ReservationStatus } from '@/types/database';
import { EquipmentStatusBadge, ReservationStatusBadge, formatTime } from '@/components/Badges';
import {
  Search,
  Package,
  Loader2,
  AlertTriangle,
  Mic,
  MicVocal,
  Presentation,
  Volume2,
  Cable,
  Monitor,
  Sliders,
  Headphones,
  Plus,
  Pencil,
  Trash2,
  MapPin,
  X,
  CalendarSearch,
  User,
  Clock,
} from 'lucide-react';

interface EquipmentCatalogProps {
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  reservationDate?: { start: string; end: string };
}

interface EquipmentGroup {
  key: string;
  category: string;
  type: string;
  items: Equipment[];
}

const categoryIcons: Record<string, React.ReactNode> = {
  projector: <Presentation className="w-5 h-5" />,
  microphone: <Mic className="w-5 h-5" />,
  speaker:   <Volume2 className="w-5 h-5" />,
  cable:     <Cable className="w-5 h-5" />,
  screen:    <Monitor className="w-5 h-5" />,
  mixer:     <Sliders className="w-5 h-5" />,
};

function getIcon(category: string, type: string): React.ReactNode {
  if (type.includes('headset') || type.includes('lapel')) return <Headphones className="w-5 h-5" />;
  if (type.includes('wireless')) return <MicVocal className="w-5 h-5" />;
  return categoryIcons[category] || <Package className="w-5 h-5" />;
}

interface DayReservation {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  status: ReservationStatus;
  profile: { full_name: string } | null;
  items: { equipment_id: string }[];
}

export default function EquipmentCatalog({
  selectedIds,
  onToggleSelect,
  reservationDate,
}: EquipmentCatalogProps) {
  const { profile } = useAuth();
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [conflictMap, setConflictMap] = useState<Record<string, boolean>>({});
  const [conflictLoading, setConflictLoading] = useState(false);
  const [editingItem, setEditingItem] = useState<Equipment | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editMode, setEditMode] = useState(false);

  const isCoordinator = profile?.role === 'coordinator';

  const [daySearchDate, setDaySearchDate] = useState<string>('');
  const [dayReservations, setDayReservations] = useState<DayReservation[]>([]);
  const [daySearchLoading, setDaySearchLoading] = useState(false);

  const daySearchResults = useMemo(() => {
    if (!daySearchDate) return null;
    const result: Record<string, DayReservation[]> = {};
    for (const r of dayReservations) {
      for (const item of r.items) {
        if (!result[item.equipment_id]) result[item.equipment_id] = [];
        result[item.equipment_id].push(r);
      }
    }
    return result;
  }, [dayReservations, daySearchDate]);

  const loadEquipment = useCallback(async () => {
    const { data, error } = await supabase
      .from('equipment')
      .select('*')
      .order('category')
      .order('name');

    if (error) {
      console.error('Error loading equipment:', error);
    } else if (data) {
      setEquipment(data as Equipment[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadEquipment();
  }, [loadEquipment]);

  useEffect(() => {
    async function checkConflicts() {
      if (!reservationDate?.start || !reservationDate?.end) {
        setConflictMap({});
        return;
      }

      setConflictLoading(true);
      const { data, error } = await supabase
        .from('reservation_items')
        .select(
          `equipment_id,
           reservations!inner (start_time, end_time, status)`
        )
        .in('reservations.status', ['pending', 'approved', 'checked_out'] as ReservationStatus[])
        .lt('reservations.start_time', reservationDate.end)
        .gt('reservations.end_time', reservationDate.start);

      if (error) {
        console.error('Error checking conflicts:', error);
        setConflictLoading(false);
        return;
      }

      const map: Record<string, boolean> = {};
      if (data) {
        for (const row of data as any[]) {
          map[row.equipment_id] = true;
        }
      }
      setConflictMap(map);
      setConflictLoading(false);
    }
    checkConflicts();
  }, [reservationDate?.start, reservationDate?.end]);

  useEffect(() => {
    async function searchDay() {
      if (!daySearchDate) {
        setDayReservations([]);
        return;
      }
      setDaySearchLoading(true);
      const dayStart = new Date(daySearchDate + 'T00:00:00');
      const dayEnd = new Date(daySearchDate + 'T23:59:59');
      const { data, error } = await supabase
        .from('reservations')
        .select(
          `id, title, start_time, end_time, status,
           profile:profiles!user_id ( full_name ),
           items:reservation_items ( equipment_id )`
        )
        .in('status', ['approved', 'checked_out'] as ReservationStatus[])
        .lte('start_time', dayEnd.toISOString())
        .gte('end_time', dayStart.toISOString())
        .order('start_time', { ascending: true });
      if (error) {
        console.error('Error searching day:', error);
      } else if (data) {
        setDayReservations(data as unknown as DayReservation[]);
      }
      setDaySearchLoading(false);
    }
    searchDay();
  }, [daySearchDate]);

  const categories = useMemo(() => {
    const set = new Set(equipment.map((e) => e.category));
    return ['all', ...Array.from(set).sort()];
  }, [equipment]);

  const groups: EquipmentGroup[] = useMemo(() => {
    const filtered = equipment.filter((item) => {
      const matchesSearch =
        item.name.toLowerCase().includes(search.toLowerCase()) ||
        item.type.toLowerCase().includes(search.toLowerCase()) ||
        item.category.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;
      return matchesSearch && matchesCategory;
    });

    const map: Record<string, EquipmentGroup> = {};
    for (const item of filtered) {
      const key = `${item.category}__${item.type}`;
      if (!map[key]) {
        map[key] = { key, category: item.category, type: item.type, items: [] };
      }
      map[key].items.push(item);
    }
    return Object.values(map);
  }, [equipment, search, categoryFilter]);

  async function handleDeleteItem(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    const { error } = await supabase.from('equipment').delete().eq('id', id);
    if (error) {
      alert('Failed to delete: ' + error.message);
    } else {
      await loadEquipment();
    }
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
      {/* Search and filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search equipment..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all text-slate-900 text-sm"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
                categoryFilter === cat
                  ? 'bg-slate-900 text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'
              }`}
            >
              {cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1) + 's'}
            </button>
          ))}
        </div>
      </div>

      {/* Coordinator toolbar */}
      {isCoordinator && (
        <div className="flex items-center gap-2 mb-4">
          <button
            type="button"
            onClick={() => { setShowAddForm(true); setEditingItem(null); }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" /> Add Equipment
          </button>
          <button
            type="button"
            onClick={() => setEditMode(!editMode)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              editMode
                ? 'bg-amber-100 text-amber-700 border border-amber-300'
                : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'
            }`}
          >
            <Pencil className="w-4 h-4" /> {editMode ? 'Done Editing' : 'Edit Mode'}
          </button>
        </div>
      )}

      {/* Coordinator: Day search */}
      {isCoordinator && (
        <div className="mb-4 bg-white rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center gap-3 mb-3">
            <CalendarSearch className="w-5 h-5 text-slate-500" />
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Search by Day</h3>
              <p className="text-xs text-slate-400">See who reserved what equipment on a specific date</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="date"
              value={daySearchDate}
              onChange={(e) => setDaySearchDate(e.target.value)}
              className="px-4 py-2 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all text-slate-900 text-sm"
            />
            {daySearchDate && (
              <button
                type="button"
                onClick={() => setDaySearchDate('')}
                className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm text-slate-500 hover:bg-slate-50 transition-colors"
              >
                <X className="w-4 h-4" /> Clear
              </button>
            )}
          </div>

          {daySearchLoading && (
            <div className="flex items-center gap-2 mt-3 text-sm text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading reservations...
            </div>
          )}

          {daySearchResults && !daySearchLoading && (
            <div className="mt-3 space-y-2">
              {dayReservations.length === 0 ? (
                <p className="text-sm text-slate-400 py-2">No reservations on this day.</p>
              ) : (
                dayReservations.map((r) => (
                  <div key={r.id} className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                    <div className="flex items-center justify-between mb-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">{r.title}</p>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500">
                          {r.profile && (
                            <span className="flex items-center gap-1">
                              <User className="w-3 h-3" /> {r.profile.full_name}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {formatTime(r.start_time)}–{formatTime(r.end_time)}
                          </span>
                        </div>
                      </div>
                      <ReservationStatusBadge status={r.status} />
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {r.items.map((item, idx) => {
                        const eq = equipment.find((e) => e.id === item.equipment_id);
                        return (
                          <span key={idx} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-slate-200 text-xs text-slate-600">
                            <Package className="w-3 h-3" /> {eq?.name || 'Unknown'}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* Add/Edit form */}
      {(showAddForm || editingItem) && isCoordinator && (
        <EquipmentForm
          key={editingItem?.id || 'new'}
          equipment={editingItem}
          onClose={() => { setShowAddForm(false); setEditingItem(null); }}
          onSaved={() => { setShowAddForm(false); setEditingItem(null); loadEquipment(); }}
        />
      )}

      {/* Equipment groups */}
      {groups.length === 0 ? (
        <div className="text-center py-16">
          <Package className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">No equipment found</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => {
            const available = group.items.filter(
              (i) => !conflictMap[i.id] && i.status !== 'maintenance'
            );
            const selectedInGroup = group.items.filter((i) => selectedIds.has(i.id));
            const availableForSelection = available.length;

            return (
              <div
                key={group.key}
                className="bg-white rounded-2xl border border-slate-200 p-4"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-slate-100 text-slate-600">
                    {getIcon(group.category, group.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-900">{group.type}</h3>
                    <p className="text-xs text-slate-400 capitalize">{group.category}</p>
                  </div>
                  {isCoordinator && group.items.some((i) => i.location) && (
                    <div className="flex items-center gap-1 text-xs text-slate-400">
                      <MapPin className="w-3.5 h-3.5" />
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 text-xs font-medium">
                      {availableForSelection} available
                    </span>
                    {selectedInGroup.length > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 text-xs font-medium">
                        {selectedInGroup.length} selected
                      </span>
                    )}
                  </div>
                </div>

                {/* Quantity selector + individual items */}
                <div className="flex flex-wrap gap-2">
                  {group.items.map((item) => {
                    const isSelected = selectedIds.has(item.id);
                    const hasConflict = conflictMap[item.id];
                    const isMaintenance = item.status === 'maintenance';
                    const isUnavailable = hasConflict || isMaintenance;

                    return (
                      <div key={item.id} className="relative">
                        <button
                          type="button"
                          onClick={() => !isUnavailable && onToggleSelect(item.id)}
                          disabled={isUnavailable && !isCoordinator}
                          className={`flex items-center gap-2 px-3 py-2 rounded-xl border-2 text-sm transition-all ${
                            isSelected
                              ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                              : isUnavailable && !isCoordinator
                              ? 'border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed'
                              : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 cursor-pointer'
                          }`}
                        >
                          {isSelected && (
                            <span className="w-4 h-4 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
                              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            </span>
                          )}
                          <span>{item.name}</span>
                          {isCoordinator && item.location && (
                            <span className="flex items-center gap-0.5 text-xs text-slate-400 ml-1">
                              <MapPin className="w-3 h-3" /> {item.location}
                            </span>
                          )}
                          {isMaintenance && (
                            <span className="text-xs text-red-500">maintenance</span>
                          )}
                          {hasConflict && !isMaintenance && (
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                          )}
                        </button>

                        {/* Coordinator edit controls */}
                        {isCoordinator && editMode && (
                          <div className="absolute -top-2 -right-2 flex gap-1 z-10">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setEditingItem(item); }}
                              className="w-6 h-6 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center hover:bg-slate-50"
                            >
                              <Pencil className="w-3 h-3 text-slate-600" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleDeleteItem(item.id, item.name); }}
                              className="w-6 h-6 rounded-full bg-white border border-red-200 shadow-sm flex items-center justify-center hover:bg-red-50"
                            >
                              <Trash2 className="w-3 h-3 text-red-500" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {conflictLoading && (
        <p className="text-xs text-slate-400 mt-4 text-center">Checking availability for selected dates...</p>
      )}
    </div>
  );
}

// ============================================================
// Equipment Add/Edit Form
// ============================================================
function EquipmentForm({
  equipment,
  onClose,
  onSaved,
}: {
  equipment: Equipment | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(equipment?.name || '');
  const [category, setCategory] = useState(equipment?.category || 'microphone');
  const [type, setType] = useState(equipment?.type || '');
  const [status, setStatus] = useState<EquipmentStatus>(equipment?.status || 'available');
  const [notes, setNotes] = useState(equipment?.notes || '');
  const [location, setLocation] = useState(equipment?.location || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !category.trim() || !type.trim()) {
      setError('Name, category, and type are required.');
      return;
    }

    setSaving(true);
    const payload = {
      name: name.trim(),
      category: category.trim().toLowerCase(),
      type: type.trim(),
      status,
      notes: notes.trim(),
      location: location.trim(),
    };

    let result;
    if (equipment) {
      result = await supabase.from('equipment').update(payload).eq('id', equipment.id);
    } else {
      result = await supabase.from('equipment').insert(payload);
    }

    if (result.error) {
      setError(result.error.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    onSaved();
  }

  return (
    <div className="mb-4 bg-slate-50 rounded-2xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-slate-900">
          {equipment ? 'Edit Equipment' : 'Add New Equipment'}
        </h3>
        <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-200 transition-colors">
          <X className="w-4 h-4 text-slate-500" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-slate-500 mb-1">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="e.g. Wireless Microphone 3"
            className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none text-sm text-slate-900"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none text-sm text-slate-900 bg-white"
          >
            <option value="projector">Projector</option>
            <option value="microphone">Microphone</option>
            <option value="speaker">Speaker</option>
            <option value="cable">Cable</option>
            <option value="screen">Screen</option>
            <option value="mixer">Mixer</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Type / Model</label>
          <input
            type="text"
            value={type}
            onChange={(e) => setType(e.target.value)}
            required
            placeholder="e.g. wireless handheld"
            className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none text-sm text-slate-900"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as EquipmentStatus)}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none text-sm text-slate-900 bg-white"
          >
            <option value="available">Available</option>
            <option value="in_use">In Use</option>
            <option value="maintenance">Maintenance</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Notes</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes"
            className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none text-sm text-slate-900"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Location</label>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Cabinet A, Storage Room 2"
            className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none text-sm text-slate-900"
          />
        </div>

        {error && (
          <div className="sm:col-span-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            {error}
          </div>
        )}

        <div className="sm:col-span-2 flex justify-end gap-2 mt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-200 text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors disabled:opacity-60"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {equipment ? 'Save Changes' : 'Add Equipment'}
          </button>
        </div>
      </form>
    </div>
  );
}
