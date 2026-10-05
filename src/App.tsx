import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import type { Equipment, EquipmentStatus } from '@/types/database';
import Layout from '@/components/Layout';
import AuthPage from '@/pages/AuthPage';
import EquipmentCatalog from '@/components/EquipmentCatalog';
import ReservationsList from '@/components/ReservationsList';
import CreateReservationModal from '@/components/CreateReservationModal';
import CheckoutPanel from '@/components/CheckoutPanel';
import { EquipmentStatusBadge } from '@/components/Badges';
import {
  Package,
  CalendarDays,
  Plus,
  ClipboardCheck,
  Boxes,
  TrendingUp,
  AlertTriangle,
} from 'lucide-react';

type Tab = 'overview' | 'browse' | 'reservations' | 'checkout';

export default function App() {
  const { user, profile, loading } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [stats, setStats] = useState({
    totalEquipment: 0,
    available: 0,
    inUse: 0,
    maintenance: 0,
    myReservations: 0,
    pendingApprovals: 0,
    activeCheckouts: 0,
  });

  const loadStats = useCallback(async () => {
    if (!user) return;
    const isCoordinator = profile?.role === 'coordinator';

    const { data: equipData } = await supabase.from('equipment').select('status');
    const equipment = (equipData || []) as Pick<Equipment, 'status'>[];

    let resQuery = supabase.from('reservations').select('id, status');
    if (!isCoordinator) {
      resQuery = resQuery.eq('user_id', user.id);
    }
    const { data: resData } = await resQuery;
    const reservations = (resData || []) as { id: string; status: string }[];

    const { data: checkoutData } = await supabase
      .from('checkouts')
      .select('id, checked_in_at')
      .is('checked_in_at', null);
    const activeCheckouts = checkoutData?.length || 0;

    setStats({
      totalEquipment: equipment.length,
      available: equipment.filter((e) => e.status === 'available').length,
      inUse: equipment.filter((e) => e.status === 'in_use').length,
      maintenance: equipment.filter((e) => e.status === 'maintenance').length,
      myReservations: reservations.filter((r) => r.status !== 'cancelled' && r.status !== 'checked_in').length,
      pendingApprovals: reservations.filter((r) => r.status === 'pending').length,
      activeCheckouts,
    });
  }, [user, profile]);

  useEffect(() => {
    loadStats();
  }, [loadStats, refreshKey]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user || !profile) {
    return <AuthPage />;
  }

  const isCoordinator = profile.role === 'coordinator';

  const tabs = isCoordinator
    ? [
        { id: 'overview', label: 'Overview', icon: <TrendingUp className="w-4 h-4" /> },
        { id: 'browse', label: 'Equipment', icon: <Boxes className="w-4 h-4" /> },
        { id: 'reservations', label: 'All Reservations', icon: <CalendarDays className="w-4 h-4" /> },
        { id: 'checkout', label: 'Check In/Out', icon: <ClipboardCheck className="w-4 h-4" /> },
      ]
    : [
        { id: 'overview', label: 'Overview', icon: <TrendingUp className="w-4 h-4" /> },
        { id: 'browse', label: 'Equipment', icon: <Boxes className="w-4 h-4" /> },
        { id: 'reservations', label: 'My Reservations', icon: <CalendarDays className="w-4 h-4" /> },
      ];

  function handleReservationCreated() {
    setShowCreateModal(false);
    setRefreshKey((k) => k + 1);
    setActiveTab('reservations');
  }

  const statCards = isCoordinator
    ? [
        { label: 'Total Equipment', value: stats.totalEquipment, icon: <Package className="w-5 h-5" />, color: 'bg-blue-500' },
        { label: 'Available Now', value: stats.available, icon: <Boxes className="w-5 h-5" />, color: 'bg-emerald-500' },
        { label: 'In Use', value: stats.inUse, icon: <Package className="w-5 h-5" />, color: 'bg-violet-500' },
        { label: 'Pending Approvals', value: stats.pendingApprovals, icon: <AlertTriangle className="w-5 h-5" />, color: 'bg-amber-500' },
        { label: 'Active Checkouts', value: stats.activeCheckouts, icon: <ClipboardCheck className="w-5 h-5" />, color: 'bg-slate-700' },
      ]
    : [
        { label: 'Available Equipment', value: stats.available, icon: <Boxes className="w-5 h-5" />, color: 'bg-emerald-500' },
        { label: 'In Use', value: stats.inUse, icon: <Package className="w-5 h-5" />, color: 'bg-violet-500' },
        { label: 'My Active Reservations', value: stats.myReservations, icon: <CalendarDays className="w-5 h-5" />, color: 'bg-blue-500' },
        { label: 'Under Maintenance', value: stats.maintenance, icon: <AlertTriangle className="w-5 h-5" />, color: 'bg-amber-500' },
      ];

  return (
    <Layout activeTab={activeTab} onTabChange={(t) => setActiveTab(t as Tab)} tabs={tabs}>
      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-8">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">
                Welcome, {profile.full_name || 'there'}
              </h2>
              <p className="text-slate-500 mt-1">
                {isCoordinator
                  ? 'Manage equipment handoffs and reservations across the school.'
                  : 'Browse and reserve equipment for your lessons and events.'}
              </p>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="hidden sm:flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium transition-all shadow-lg shadow-blue-600/20"
            >
              <Plus className="w-4 h-4" /> New Reservation
            </button>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {statCards.map((card) => (
              <div
                key={card.label}
                className="bg-white rounded-2xl border border-slate-200 p-5 hover:shadow-md transition-shadow"
              >
                <div className={`inline-flex items-center justify-center w-10 h-10 rounded-xl ${card.color} text-white mb-3`}>
                  {card.icon}
                </div>
                <p className="text-2xl font-bold text-slate-900">{card.value}</p>
                <p className="text-xs text-slate-500 mt-0.5">{card.label}</p>
              </div>
            ))}
          </div>

          {/* Quick actions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {!isCoordinator ? (
              <>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="group flex items-center gap-4 p-6 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 text-white text-left shadow-lg shadow-blue-600/20 hover:shadow-xl hover:shadow-blue-600/30 transition-all"
                >
                  <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-white/20 group-hover:bg-white/30 transition-colors">
                    <Plus className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">Reserve Equipment</h3>
                    <p className="text-sm text-blue-100">Book gear for your next lesson or event</p>
                  </div>
                </button>
                <button
                  onClick={() => setActiveTab('reservations')}
                  className="group flex items-center gap-4 p-6 rounded-2xl bg-white border border-slate-200 text-left hover:border-slate-300 hover:shadow-md transition-all"
                >
                  <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-slate-100 group-hover:bg-slate-200 transition-colors">
                    <CalendarDays className="w-6 h-6 text-slate-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg text-slate-900">My Reservations</h3>
                    <p className="text-sm text-slate-500">Track your current and past bookings</p>
                  </div>
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="group flex items-center gap-4 p-6 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 text-white text-left shadow-lg shadow-blue-600/20 hover:shadow-xl hover:shadow-blue-600/30 transition-all"
                >
                  <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-white/20 group-hover:bg-white/30 transition-colors">
                    <Plus className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">New Reservation</h3>
                    <p className="text-sm text-blue-100">Reserve equipment for a teacher</p>
                  </div>
                </button>
                <button
                  onClick={() => setActiveTab('checkout')}
                  className="group flex items-center gap-4 p-6 rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 text-white text-left shadow-lg hover:shadow-xl transition-all"
                >
                  <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-white/15 group-hover:bg-white/25 transition-colors">
                    <ClipboardCheck className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">Process Check In/Out</h3>
                    <p className="text-sm text-slate-300">Hand equipment to teachers and receive returns</p>
                  </div>
                </button>
                <button
                  onClick={() => setActiveTab('reservations')}
                  className="group flex items-center gap-4 p-6 rounded-2xl bg-white border border-slate-200 text-left hover:border-slate-300 hover:shadow-md transition-all"
                >
                  <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-slate-100 group-hover:bg-slate-200 transition-colors">
                    <CalendarDays className="w-6 h-6 text-slate-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg text-slate-900">All Reservations</h3>
                    <p className="text-sm text-slate-500">
                      {stats.pendingApprovals > 0
                        ? `${stats.pendingApprovals} pending approval${stats.pendingApprovals !== 1 ? 's' : ''}`
                        : 'View all teacher bookings'}
                    </p>
                  </div>
                </button>
              </>
            )}
          </div>

          {/* Equipment status summary */}
          <div>
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3">
              Equipment Status
            </h3>
            <EquipmentStatusSummary refreshKey={refreshKey} />
          </div>
        </div>
      )}

      {/* Browse Equipment Tab */}
      {activeTab === 'browse' && (
        <div>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Equipment Catalog</h2>
              <p className="text-sm text-slate-500 mt-0.5">
                Browse all available equipment. {isCoordinator ? 'You can manage item status.' : 'Select items to include in a reservation.'}
              </p>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-all shadow-lg shadow-blue-600/20"
            >
              <Plus className="w-4 h-4" /> Reserve
            </button>
          </div>
          <EquipmentCatalog
            selectedIds={new Set()}
            onToggleSelect={() => {}}
          />
        </div>
      )}

      {/* Reservations Tab */}
      {activeTab === 'reservations' && (
        <div>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-slate-900">
                {isCoordinator ? 'All Reservations' : 'My Reservations'}
              </h2>
              <p className="text-sm text-slate-500 mt-0.5">
                {isCoordinator
                  ? 'View and manage all equipment reservations.'
                  : 'Track your equipment reservations and their status.'}
              </p>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-all shadow-lg shadow-blue-600/20"
            >
              <Plus className="w-4 h-4" /> New Reservation
            </button>
          </div>
          <ReservationsList
            filter={isCoordinator ? 'all' : 'mine'}
            refreshKey={refreshKey}
          />
        </div>
      )}

      {/* Checkout Tab (coordinators only) */}
      {activeTab === 'checkout' && isCoordinator && (
        <div>
          <div className="mb-6">
            <h2 className="text-xl font-bold text-slate-900">Check In / Check Out</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Hand equipment to teachers and process returns. Record the condition of each item.
            </p>
          </div>
          <CheckoutPanel refreshKey={refreshKey} />
        </div>
      )}

      {/* Create Reservation Modal */}
      {showCreateModal && (
        <CreateReservationModal
          onClose={() => setShowCreateModal(false)}
          onCreated={handleReservationCreated}
        />
      )}
    </Layout>
  );
}

function EquipmentStatusSummary({ refreshKey }: { refreshKey: number }) {
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('equipment')
      .select('*')
      .order('category')
      .order('name')
      .then(({ data }) => {
        if (data) setEquipment(data as Equipment[]);
        setLoading(false);
      });
  }, [refreshKey]);

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <p className="text-slate-400 text-sm text-center">Loading equipment...</p>
      </div>
    );
  }

  // Group by category
  const byCategory: Record<string, Equipment[]> = {};
  for (const item of equipment) {
    if (!byCategory[item.category]) byCategory[item.category] = [];
    byCategory[item.category].push(item);
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6">
      <div className="space-y-5">
        {Object.entries(byCategory).map(([category, items]) => (
          <div key={category}>
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
              {category}
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-slate-50"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{item.name}</p>
                    <p className="text-xs text-slate-400 truncate">{item.type}</p>
                  </div>
                  <EquipmentStatusBadge status={item.status as EquipmentStatus} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
