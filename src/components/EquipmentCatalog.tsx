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
  History,
  Check,
  Info,
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
  reserved_for_name: string | null;
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
  const [infoEquipment, setInfoEquipment] = useState<Equipment | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [categoryNames, setCategoryNames] = useState<string[]>([]);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');

  const isCoordinator = profile?.role === 'coordinator';

  const [daySearchDate, setDaySearchDate] = useState<string>('');
  const [dayReservations, setDayReservations] = useState<DayReservation[]>([]);
  const [daySearchLoading, setDaySearchLoading] = useState(false);
  const [historyEquipment, setHistoryEquipment] = useState<Equipment | null>(null);
  const [historyReservations, setHistoryReservations] = useState<DayReservation[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

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

  const loadCategories = useCallback(async () => {
    const { data, error } = await supabase
      .from('equipment_categories')
      .select('name')
      .order('name');

    if (error) {
      console.error('Error loading categories:', error);
    } else if (data) {
      setCategoryNames(data.map((category) => category.name));
    }
  }, []);

  useEffect(() => {
    if (isCoordinator) loadCategories();
  }, [isCoordinator, loadCategories]);

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

  async function openEquipmentHistory(item: Equipment) {
    setHistoryEquipment(item);
    setHistoryReservations([]);
    setHistoryLoading(true);

    const { data, error } = await supabase
      .from('reservations')
      .select(
        `id, reserved_for_name, title, start_time, end_time, status,
         profile:profiles!user_id ( full_name ),
         items:reservation_items!inner ( equipment_id )`
      )
      .eq('reservation_items.equipment_id', item.id)
      .order('start_time', { ascending: false });

    if (error) {
      console.error('Error loading equipment history:', error);
    } else if (data) {
      setHistoryReservations(data as unknown as DayReservation[]);
    }
    setHistoryLoading(false);
  }

  const categoryOptions = useMemo((): string[] => {
    const set = new Set([...categoryNames, ...equipment.map((item) => item.category)]);
    return Array.from(set).filter(Boolean).sort();
  }, [categoryNames, equipment]);

  const categories = useMemo((): string[] => ['all', ...categoryOptions], [categoryOptions]);

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

  async function addCategory() {
    const name = newCategory.trim().toLowerCase();
    if (!name) return;
    const { error } = await supabase.from('equipment_categories').insert({ name });
    if (error) {
      console.error('Error adding category:', error);
      alert('This category could not be added. It may already exist.');
      return;
    }
    setNewCategory('');
    await loadCategories();
  }

  async function renameCategory(oldName: string) {
    const name = editingCategoryName.trim().toLowerCase();
    if (!name || name === oldName) {
      setEditingCategory(null);
      return;
    }
    if (categoryOptions.some((category) => category.toLowerCase() === name.toLowerCase() && category !== oldName)) {
      alert('A category with that name already exists.');
      return;
    }

    const { error: categoryError } = await supabase
      .from('equipment_categories')
      .update({ name })
      .eq('name', oldName);
    if (categoryError) {
      console.error('Error renaming category:', categoryError);
      alert('This category could not be renamed. Please try again.');
      return;
    }

    const { error: equipmentError } = await supabase
      .from('equipment')
      .update({ category: name })
      .eq('category', oldName);
    if (equipmentError) {
      console.error('Error updating equipment category:', equipmentError);
      alert('The category was renamed, but the equipment in it could not be updated. Please refresh and try again.');
    }
    setEditingCategory(null);
    await Promise.all([loadCategories(), loadEquipment()]);
  }

  async function deleteCategory(name: string) {
    if (equipment.some((item) => item.category === name)) {
      alert('This category cannot be deleted while equipment is using it. Rename it or move those items first.');
      return;
    }
    if (!confirm(`Delete the ${name} category?`)) return;
    const { error } = await supabase.from('equipment_categories').delete().eq('name', name);
    if (error) {
      console.error('Error deleting category:', error);
      alert('This category could not be deleted. Please try again.');
      return;
    }
    await loadCategories();
  }

  async function handleDeleteItem(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    const { error } = await supabase.from('equipment').delete().eq('id', id);
    if (error) {
      console.error('Error deleting equipment:', error);
      alert('This item could not be deleted. Please try again.');
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
            onClick={() => setShowCategoryManager(!showCategoryManager)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              showCategoryManager
                ? 'bg-blue-100 text-blue-700 border border-blue-300'
                : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'
            }`}
          >
            <Package className="w-4 h-4" /> Manage Categories
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
                          {(r.reserved_for_name || r.profile) && (
                            <span className="flex items-center gap-1">
                              <User className="w-3 h-3" /> {r.reserved_for_name || r.profile?.full_name}
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

      {isCoordinator && showCategoryManager && (
        <div className="mb-4 bg-white rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Equipment Categories</h3>
              <p className="text-xs text-slate-400 mt-0.5">Add, rename, or remove categories used by your equipment.</p>
            </div>
            <button type="button" onClick={() => setShowCategoryManager(false)} className="p-1.5 rounded-lg hover:bg-slate-100">
              <X className="w-4 h-4 text-slate-500" />
            </button>
          </div>
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={newCategory}
              onChange={(event) => setNewCategory(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addCategory(); } }}
              placeholder="New category name"
              className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
            <button type="button" onClick={addCategory} className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium">
              Add
            </button>
          </div>
          <div className="space-y-2">
            {categoryNames.map((category) => (
              <div key={category} className="flex items-center gap-2 p-2 rounded-lg bg-slate-50">
                {editingCategory === category ? (
                  <>
                    <input
                      autoFocus
                      value={editingCategoryName}
                      onChange={(event) => setEditingCategoryName(event.target.value)}
                      onKeyDown={(event) => { if (event.key === 'Enter') renameCategory(category); }}
                      className="flex-1 px-2 py-1 rounded border border-blue-300 text-sm text-slate-900 outline-none"
                    />
                    <button type="button" onClick={() => renameCategory(category)} className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"><Check className="w-4 h-4" /></button>
                    <button type="button" onClick={() => setEditingCategory(null)} className="p-1 text-slate-400 hover:bg-slate-200 rounded"><X className="w-4 h-4" /></button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm text-slate-700">{category}</span>
                    <button type="button" onClick={() => { setEditingCategory(category); setEditingCategoryName(category); }} className="p-1 text-slate-500 hover:bg-slate-200 rounded"><Pencil className="w-4 h-4" /></button>
                    <button type="button" onClick={() => deleteCategory(category)} className="p-1 text-red-500 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4" /></button>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add form (not editing existing item) */}
      {showAddForm && !editingItem && isCoordinator && (
        <EquipmentForm
          key="new"
          equipment={null}
          categories={categoryOptions}
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
                      <div key={item.id} className="relative w-full">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => setInfoEquipment(item)}
                            className={`flex items-center gap-2 px-3 py-2 rounded-xl border-2 text-sm transition-all cursor-pointer ${
                              isSelected
                                ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                                : isUnavailable && !isCoordinator
                                ? 'border-slate-200 bg-slate-50 text-slate-400'
                                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
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

                          {isCoordinator && (
                            <button
                              type="button"
                              onClick={() => openEquipmentHistory(item)}
                              className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl border border-slate-200 bg-white text-slate-500 hover:border-blue-300 hover:text-blue-600 transition-colors text-xs"
                              title={`View reservation history for ${item.name}`}
                            >
                              <History className="w-3.5 h-3.5" /> History
                            </button>
                          )}

                          {/* Coordinator edit controls */}
                          {isCoordinator && editMode && (
                            <div className="flex gap-1">
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

                        {/* Inline edit form under the item */}
                        {isCoordinator && editingItem?.id === item.id && (
                          <div className="w-full mt-2 mb-2">
                            <EquipmentForm
                              key={item.id}
                              equipment={editingItem}
                              categories={categoryOptions}
                              onClose={() => setEditingItem(null)}
                              onSaved={() => { setEditingItem(null); loadEquipment(); }}
                            />
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

      {infoEquipment && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => setInfoEquipment(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-slate-200">
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  {getIcon(infoEquipment.category, infoEquipment.type)}
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 mb-1">Equipment details</p>
                  <h2 className="text-xl font-bold text-slate-900">{infoEquipment.name}</h2>
                  <p className="text-sm text-slate-500 mt-1">{infoEquipment.type}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInfoEquipment(null)}
                className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
                aria-label="Close equipment details"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                  <p className="text-xs text-slate-400 mb-1">Category</p>
                  <p className="text-sm font-medium text-slate-800 capitalize">{infoEquipment.category}</p>
                </div>
                <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                  <p className="text-xs text-slate-400 mb-1">Status</p>
                  <p className={`text-sm font-medium ${
                    infoEquipment.status === 'available'
                      ? 'text-emerald-600'
                      : infoEquipment.status === 'maintenance'
                      ? 'text-red-600'
                      : 'text-violet-600'
                  }`}>
                    {infoEquipment.status === 'in_use' ? 'In Use' : infoEquipment.status.charAt(0).toUpperCase() + infoEquipment.status.slice(1)}
                  </p>
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <MapPin className="w-4 h-4 text-slate-400 mt-0.5" />
                  <div>
                    <p className="text-xs text-slate-400">Storage location</p>
                    <p className="text-sm text-slate-700">{infoEquipment.location || 'No location recorded'}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Info className="w-4 h-4 text-slate-400 mt-0.5" />
                  <div>
                    <p className="text-xs text-slate-400">Notes</p>
                    <p className="text-sm text-slate-700">{infoEquipment.notes || 'No notes recorded'}</p>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    if (!(conflictMap[infoEquipment.id] || infoEquipment.status === 'maintenance') || isCoordinator) onToggleSelect(infoEquipment.id);
                    setInfoEquipment(null);
                  }}
                  disabled={(conflictMap[infoEquipment.id] || infoEquipment.status === 'maintenance') && !isCoordinator}
                  className="flex-1 min-w-[160px] px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {selectedIds.has(infoEquipment.id) ? 'Remove from reservation' : 'Select for reservation'}
                </button>
                {isCoordinator && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingItem(infoEquipment);
                      setInfoEquipment(null);
                    }}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm font-medium transition-colors"
                  >
                    <Pencil className="w-4 h-4" /> Edit item
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {historyEquipment && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => setHistoryEquipment(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] overflow-hidden"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-slate-200">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 mb-1">Reservation History</p>
                <h2 className="text-xl font-bold text-slate-900">{historyEquipment.name}</h2>
                <p className="text-sm text-slate-500 mt-1">Every reservation recorded for this equipment item</p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryEquipment(null)}
                className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(85vh-132px)]">
              {historyLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
                </div>
              ) : historyReservations.length === 0 ? (
                <div className="text-center py-12">
                  <History className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                  <p className="text-sm font-medium text-slate-600">No reservations yet</p>
                  <p className="text-xs text-slate-400 mt-1">This item has not been reserved before.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {historyReservations.map((reservation) => (
                    <div key={reservation.id} className="rounded-xl border border-slate-200 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold text-slate-900 truncate">{reservation.title}</h3>
                          <p className="text-sm text-slate-600 mt-1 flex items-center gap-1.5">
                            <User className="w-3.5 h-3.5 text-slate-400" />
                            {reservation.reserved_for_name || reservation.profile?.full_name || 'Unknown teacher'}
                          </p>
                        </div>
                        <ReservationStatusBadge status={reservation.status} />
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-3">
                        <Clock className="w-3.5 h-3.5" />
                        {new Date(reservation.start_time).toLocaleDateString()} · {formatTime(reservation.start_time)}
                        <span className="text-slate-300">to</span>
                        {new Date(reservation.end_time).toLocaleDateString()} · {formatTime(reservation.end_time)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Equipment Add/Edit Form
// ============================================================
function EquipmentForm({
  equipment,
  categories,
  onClose,
  onSaved,
}: {
  equipment: Equipment | null;
  categories: string[];
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
      console.error('Error saving equipment:', result.error);
      setError('This item could not be saved. Please check the details and try again.');
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
            {Array.from(new Set([...categories, category])).filter(Boolean).map((categoryOption) => (
              <option key={categoryOption} value={categoryOption}>
                {categoryOption.charAt(0).toUpperCase() + categoryOption.slice(1)}
              </option>
            ))}
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
