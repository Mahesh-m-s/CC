import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { fetchAdminVerificationQueue, adminVerifyComplaint } from '../services/complaintService';
import SecureS3Image from '../components/SecureS3Image';
import { getImageUrl, getCategoryFallback } from '../utils/imageUrl';
import { 
  ShieldAlert, 
  CheckCircle2, 
  XCircle, 
  Flame, 
  RefreshCw, 
  AlertTriangle, 
  BarChart3, 
  Users, 
  MapPin, 
  Check, 
  X, 
  Clock, 
  Building,
  Mail,
  Send,
  ShieldCheck
} from 'lucide-react';
import { formatDateTime } from '../utils/exifHelper';

export default function AdminDashboard({ initialTab = 'verification' }) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState(initialTab);
  const [queue, setQueue] = useState([]);
  const [overview, setOverview] = useState(null);
  const [hotspots, setHotspots] = useState([]);
  const [recurring, setRecurring] = useState([]);
  const [wardScores, setWardScores] = useState([]);
  const [overdueList, setOverdueList] = useState([]);
  const [usersList, setUsersList] = useState([]);
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  // Verification modal / action
  const [selectedVerify, setSelectedVerify] = useState(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [bannerMsg, setBannerMsg] = useState(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [qData, ovRes, hRes, rRes, wRes, odRes, uRes] = await Promise.all([
        fetchAdminVerificationQueue().catch(() => []),
        api.get('/admin/analytics/overview').catch(() => ({ data: null })),
        api.get('/admin/analytics/hotspots').catch(() => ({ data: { hotspots: [] } })),
        api.get('/admin/analytics/recurring-issues').catch(() => ({ data: { recurring_issues: [] } })),
        api.get('/admin/analytics/ward-health-scores').catch(() => ({ data: { scores: [] } })),
        api.get('/admin/analytics/sla-overdue').catch(() => ({ data: { overdue_complaints: [] } })),
        api.get('/admin/users').catch(() => ({ data: { users: [] } }))
      ]);
      setQueue(qData || []);
      setOverview(ovRes.data);
      setHotspots(hRes.data?.hotspots || []);
      setRecurring(rRes.data?.recurring_issues || []);
      setWardScores(wRes.data?.scores || []);
      setOverdueList(odRes.data?.overdue_complaints || []);
      setUsersList(uRes.data?.users || []);
    } catch (err) {
      console.error('[AdminDashboard] Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user]);

  const handleVerify = async (decision) => {
    if (!selectedVerify) return;
    setActionLoading(true);
    try {
      await adminVerifyComplaint({
        complaintId: selectedVerify.complaint_id,
        decision,
        notes: adminNotes,
        adminId: user?.id,
        adminName: user?.name
      });
      setBannerMsg({
        type: 'success',
        text: `Resolution successfully ${decision === 'approve' ? 'APPROVED (Status: RESOLVED)' : 'REJECTED (Status: REOPENED)'}.`
      });
      setSelectedVerify(null);
      setAdminNotes('');
      loadData();
    } catch (err) {
      setBannerMsg({ type: 'error', text: err.message || 'Verification action failed' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRecalculateHotspots = async () => {
    try {
      const res = await api.post('/admin/analytics/recalculate-hotspots');
      setBannerMsg({ type: 'success', text: res.data.message });
      loadData();
    } catch (err) {
      setBannerMsg({ type: 'error', text: 'Failed to recalculate hotspots' });
    }
  };

  return (
    <div className="container" style={{ padding: '30px 20px' }}>
      {bannerMsg && (
        <div style={{
          backgroundColor: bannerMsg.type === 'success' ? '#f0fdf4' : '#fef2f2',
          border: `1.5px solid ${bannerMsg.type === 'success' ? '#86efac' : '#fca5a5'}`,
          color: bannerMsg.type === 'success' ? '#166534' : '#b91c1c',
          padding: '12px 16px',
          borderRadius: '8px',
          fontSize: '0.88rem',
          fontWeight: 600,
          marginBottom: '20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span>{bannerMsg.text}</span>
          <button 
            onClick={() => setBannerMsg(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 800, color: 'inherit' }}
          >
            ✕
          </button>
        </div>
      )}
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#4b5e28' }}>
            MCC ADMINISTRATIVE CONTROL
          </span>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#1f241a' }}>
            City Administration & Verification Console
          </h2>
        </div>

        {/* Tab Buttons */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button 
            onClick={() => setActiveTab('verification')}
            className={`btn ${activeTab === 'verification' ? 'btn-primary' : 'btn-outline'}`}
            style={{ padding: '8px 16px', fontSize: '0.85rem' }}
          >
            <CheckCircle2 size={16} /> Verification Queue ({queue.length})
          </button>
          <button 
            onClick={() => setActiveTab('overview')}
            className={`btn ${activeTab === 'overview' ? 'btn-primary' : 'btn-outline'}`}
            style={{ padding: '8px 16px', fontSize: '0.85rem' }}
          >
            <BarChart3 size={16} /> Overview
          </button>
          <button 
            onClick={() => setActiveTab('hotspots')}
            className={`btn ${activeTab === 'hotspots' ? 'btn-primary' : 'btn-outline'}`}
            style={{ padding: '8px 16px', fontSize: '0.85rem' }}
          >
            <Flame size={16} /> Hotspots ({hotspots.length})
          </button>
          <button 
            onClick={() => setActiveTab('recurring')}
            className={`btn ${activeTab === 'recurring' ? 'btn-primary' : 'btn-outline'}`}
            style={{ padding: '8px 16px', fontSize: '0.85rem' }}
          >
            <RefreshCw size={16} /> Recurring ({recurring.length})
          </button>
          <button 
            onClick={() => setActiveTab('overdue')}
            className={`btn ${activeTab === 'overdue' ? 'btn-primary' : 'btn-outline'}`}
            style={{ padding: '8px 16px', fontSize: '0.85rem' }}
          >
            <Clock size={16} /> Overdue ({overdueList.length})
          </button>
          <button 
            onClick={() => setActiveTab('users')}
            className={`btn ${activeTab === 'users' ? 'btn-primary' : 'btn-outline'}`}
            style={{
              padding: '8px 16px',
              fontSize: '0.85rem'
            }}
          >
            <Users size={16} /> User Directory ({usersList.length})
          </button>
        </div>
      </div>

      {/* 1. Verification Queue Tab */}
      {activeTab === 'verification' && (
        <div>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1f241a', marginBottom: '14px' }}>
            Pending Resolution Approvals ({queue.length})
          </h3>
          <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '20px' }}>
            Field Officers must provide geotagged resolution photographs. Compare the initial complaint photo against resolution proof before approving.
          </p>

          {queue.length === 0 ? (
            <div className="card" style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
              No resolutions currently pending verification. All officer reports are reviewed!
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '20px' }}>
              {queue.map((item) => (
                <div key={item.complaint_id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b' }}>{item.complaint_code}</span>
                      <h4 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#1f241a' }}>{item.category_name}</h4>
                      <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                        Ward: <strong>{item.ward_name}</strong>
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '2px' }}>
                        Submitted: <strong>{formatDateTime(item.submitted_at || item.created_at)}</strong>
                      </div>
                    </div>
                    <span className="badge badge-VERIFICATION_PENDING">Pending Verification</span>
                  </div>

                  {/* Side-by-side thumbnails */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                      <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>ORIGINAL ISSUE</div>
                      <div style={{ height: '120px', borderRadius: '6px', overflow: 'hidden', backgroundColor: '#e2e8f0' }}>
                        <img 
                          src={getImageUrl(item.original_photo, item.category_name, false)} 
                          alt="Original" 
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          onError={(e) => { 
                            const fb = getCategoryFallback(item.category_name, false);
                            if (e.target.src !== fb) e.target.src = fb;
                          }}
                        />
                      </div>
                      <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '2px' }}>
                        GPS: {item.original_latitude?.toFixed(4)}, {item.original_longitude?.toFixed(4)}
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#166534', marginBottom: '4px' }}>OFFICER RESOLUTION</div>
                      <div style={{ height: '120px', borderRadius: '6px', overflow: 'hidden', backgroundColor: '#e2e8f0' }}>
                        <img 
                          src={getImageUrl(item.resolution_photo, item.category_name, true)} 
                          alt="Resolution" 
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          onError={(e) => { 
                            const fb = getCategoryFallback(item.category_name, true);
                            if (e.target.src !== fb) e.target.src = fb;
                          }}
                        />
                      </div>
                      <div style={{ fontSize: '0.7rem', color: '#166534', marginTop: '2px' }}>
                        Distance: <strong>{item.distance_from_original_m}m</strong>
                      </div>
                    </div>
                  </div>

                  {item.officer_notes && (
                    <div style={{ fontSize: '0.8rem', backgroundColor: '#f8fafc', padding: '8px', borderRadius: '6px' }}>
                      <strong>Officer Note:</strong> {item.officer_notes}
                    </div>
                  )}

                  <button 
                    onClick={() => setSelectedVerify(item)}
                    className="btn btn-primary"
                    style={{ width: '100%', padding: '8px', fontSize: '0.85rem' }}
                  >
                    Inspect & Decide
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 2. Overview Tab */}
      {activeTab === 'overview' && overview && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
            <div className="card">
              <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Total Complaints</div>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: '#1f241a' }}>{overview.total_complaints}</div>
            </div>
            <div className="card">
              <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Resolved</div>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: '#16a34a' }}>{overview.resolved_count}</div>
              <div style={{ fontSize: '0.75rem', color: '#16a34a', fontWeight: 600 }}>{overview.resolution_rate_pct}% success rate</div>
            </div>
            <div className="card">
              <div style={{ fontSize: '0.8rem', color: '#64748b' }}>In Progress</div>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: '#b45309' }}>{overview.in_progress_count}</div>
            </div>
            <div className="card">
              <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Overdue</div>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: '#dc2626' }}>{overview.overdue_count}</div>
            </div>
          </div>

          {/* Category Breakdown Table */}
          <div className="card">
            <h4 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1f241a', marginBottom: '14px' }}>
              Category Distribution
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
              {overview.category_breakdown?.map((cat, i) => (
                <div key={i} style={{ padding: '12px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>{cat.category}</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#4b5e28', marginTop: '4px' }}>{cat.count}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Department Performance */}
          <div className="card">
            <h4 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1f241a', marginBottom: '14px' }}>
              Department SLA Performance
            </h4>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left', color: '#64748b' }}>
                    <th style={{ padding: '10px' }}>Department</th>
                    <th style={{ padding: '10px' }}>Total</th>
                    <th style={{ padding: '10px' }}>Resolved</th>
                    <th style={{ padding: '10px' }}>Overdue</th>
                    <th style={{ padding: '10px' }}>Resolution Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.department_performance?.map((d) => (
                    <tr key={d.department_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px', fontWeight: 600, color: '#1f241a' }}>{d.department_name}</td>
                      <td style={{ padding: '10px' }}>{d.total}</td>
                      <td style={{ padding: '10px', color: '#16a34a', fontWeight: 600 }}>{d.resolved}</td>
                      <td style={{ padding: '10px', color: d.overdue > 0 ? '#dc2626' : '#64748b', fontWeight: 600 }}>{d.overdue}</td>
                      <td style={{ padding: '10px' }}>
                        <span style={{ fontWeight: 700, color: d.resolution_rate >= 75 ? '#16a34a' : '#b45309' }}>
                          {d.resolution_rate}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 3. Hotspots Tab */}
      {activeTab === 'hotspots' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1f241a' }}>
                Civic Hotspot Clusters (DBSCAN)
              </h3>
              <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                Geospatial clusters of persistent civic complaints detected via density-based spatial clustering.
              </div>
            </div>
            <button 
              onClick={handleRecalculateHotspots}
              className="btn btn-primary"
              style={{ padding: '8px 16px', fontSize: '0.85rem' }}
            >
              <RefreshCw size={15} /> Recalculate Hotspots
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
            {hotspots.map((h) => (
              <div key={h.id} className="card" style={{ borderLeft: '4px solid #dc2626' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#dc2626' }}>🔥 DBSCAN CLUSTER</span>
                  <span className="badge badge-priority-HIGH" style={{ fontSize: '0.65rem' }}>Active</span>
                </div>
                <h4 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#1f241a' }}>{h.category_name}</h4>
                <div style={{ fontSize: '0.85rem', color: '#475569', margin: '4px 0' }}>Ward: <strong>{h.ward_name}</strong></div>
                <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                  Complaints Clustered: <strong>{h.complaint_count}</strong><br />
                  Radius: <strong>{Math.round(h.radius_m)} meters</strong>
                </div>
                <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '8px' }}>
                  Center: {h.center_lat.toFixed(4)}, {h.center_lng.toFixed(4)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. Recurring Issues Tab */}
      {activeTab === 'recurring' && (
        <div>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1f241a', marginBottom: '8px' }}>
            Geographic Recurring Issues
          </h3>
          <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '16px' }}>
            Complaints of the same category reported within 50m of a previously resolved complaint within 90 days.
          </p>

          <div className="card" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left', color: '#64748b' }}>
                  <th style={{ padding: '10px' }}>Category</th>
                  <th style={{ padding: '10px' }}>New Complaint</th>
                  <th style={{ padding: '10px' }}>Previously Resolved</th>
                  <th style={{ padding: '10px' }}>Proximity Distance</th>
                  <th style={{ padding: '10px' }}>Detected Date</th>
                </tr>
              </thead>
              <tbody>
                {recurring.map((r) => (
                  <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px', fontWeight: 600, color: '#b45309' }}>{r.category_name}</td>
                    <td style={{ padding: '10px', fontWeight: 700 }}>{r.new_complaint_code}</td>
                    <td style={{ padding: '10px', color: '#16a34a' }}>{r.previous_complaint_code}</td>
                    <td style={{ padding: '10px' }}>
                      <span className="badge badge-priority-HIGH" style={{ fontSize: '0.7rem' }}>
                        {r.distance_m} meters
                      </span>
                    </td>
                    <td style={{ padding: '10px', color: '#64748b' }}>
                      {formatDateTime(r.detected_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. SLA Overdue Tab */}
      {activeTab === 'overdue' && (
        <div>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#dc2626', marginBottom: '8px' }}>
            SLA Escalated Overdue Complaints ({overdueList.length})
          </h3>
          <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '16px' }}>
            Complaints that exceeded the configured SLA target hours (24h HIGH, 72h MEDIUM, 168h LOW) without resolution.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
            {overdueList.map((c) => (
              <div key={c.id} className="card" style={{ borderLeft: '4px solid #dc2626' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b' }}>{c.complaint_code}</span>
                  <span className="badge badge-OVERDUE">OVERDUE</span>
                </div>
                <h4 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#1f241a', margin: '4px 0' }}>{c.category_name}</h4>
                <div style={{ fontSize: '0.82rem', color: '#475569' }}>
                  Ward: <strong>{c.ward_name}</strong> | Dept: <strong>{c.department_name}</strong>
                </div>
                <div style={{ fontSize: '0.78rem', color: '#dc2626', marginTop: '6px' }}>
                  SLA Target Due: {new Date(c.sla_due_at).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 6. Registered Users & Official Staff Directory Tab */}
      {activeTab === 'users' && (
        <div>
          {/* Header & Filter Controls */}
          <div className="card" style={{
            padding: '20px 24px',
            backgroundColor: '#ffffff',
            borderColor: '#e2d7ba',
            marginBottom: '20px',
            boxShadow: '0 2px 8px rgba(75, 94, 40, 0.05)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1f241a', margin: 0 }}>
                  Municipal Users & Registered Citizens Directory
                </h3>
                <div style={{ fontSize: '0.82rem', color: '#5e6654', marginTop: '2px' }}>
                  Manage registered citizens, designated ward corporators, and department field officers.
                </div>
              </div>

              {/* Search Bar */}
              <div style={{ minWidth: '260px' }}>
                <input
                  type="text"
                  placeholder="Search by name, email, or phone..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="form-input"
                  style={{
                    padding: '8px 12px',
                    fontSize: '0.85rem',
                    borderRadius: '8px',
                    borderColor: '#dcd1b5'
                  }}
                />
              </div>
            </div>

            {/* Role Filter Pills */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {[
                { id: 'all', label: `All Users (${usersList.length})` },
                { id: 'citizen', label: `Citizens (${usersList.filter(u => u.role === 'citizen').length})` },
                { id: 'field_officer', label: `Field Officers (${usersList.filter(u => u.role === 'field_officer').length})` },
                { id: 'corporator', label: `Corporators (${usersList.filter(u => u.role === 'corporator').length})` },
                { id: 'admin', label: `Administrators (${usersList.filter(u => u.role === 'admin').length})` }
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setUserRoleFilter(f.id)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '20px',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    border: userRoleFilter === f.id ? '1.5px solid #4b5e28' : '1px solid #dcd1b5',
                    backgroundColor: userRoleFilter === f.id ? '#4b5e28' : '#ffffff',
                    color: userRoleFilter === f.id ? '#ffffff' : '#4b5e28',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* User Cards Grid */}
          {(() => {
            const filtered = usersList.filter(u => {
              if (userRoleFilter !== 'all' && u.role !== userRoleFilter) return false;
              if (userSearch.trim()) {
                const s = userSearch.toLowerCase();
                const name = (u.name || '').toLowerCase();
                const email = (u.email || '').toLowerCase();
                const phone = (u.phone || '').toLowerCase();
                return name.includes(s) || email.includes(s) || phone.includes(s);
              }
              return true;
            });

            if (filtered.length === 0) {
              return (
                <div className="card" style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                  No users found matching current search and role filters.
                </div>
              );
            }

            return (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: '14px' }}>
                {filtered.map(u => (
                  <div key={u.id || u.email} className="card" style={{
                    padding: '18px 20px',
                    backgroundColor: '#ffffff',
                    borderColor: '#e5dcbe',
                    boxShadow: '0 2px 8px rgba(75, 94, 40, 0.06)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '12px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                      <div style={{
                        width: '42px',
                        height: '42px',
                        borderRadius: '10px',
                        backgroundColor: u.role === 'admin' ? '#d4af37' : (u.role === 'corporator' ? '#b38328' : (u.role === 'field_officer' ? '#4b5e28' : '#6b7280')),
                        color: '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.2rem',
                        flexShrink: 0
                      }}>
                        {u.role === 'admin' ? '🏛️' : (u.role === 'corporator' ? '🏛️' : (u.role === 'field_officer' ? '🛠️' : '👤'))}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          <strong style={{ fontSize: '0.98rem', color: '#1f241a' }}>
                            {u.name}
                          </strong>
                          <span style={{
                            fontSize: '0.66rem',
                            fontWeight: 800,
                            padding: '2px 6px',
                            borderRadius: '4px',
                            backgroundColor: u.role === 'admin' ? '#fef3c7' : (u.role === 'corporator' ? '#fef9c3' : (u.role === 'field_officer' ? '#edf4e4' : '#f3f4f6')),
                            color: u.role === 'admin' ? '#92400e' : (u.role === 'corporator' ? '#854d0e' : (u.role === 'field_officer' ? '#2d3a17' : '#374151')),
                            textTransform: 'uppercase'
                          }}>
                            {u.badge || u.role}
                          </span>
                        </div>

                        <div style={{ fontSize: '0.80rem', color: '#5e6654', marginTop: '4px', wordBreak: 'break-all' }}>
                          {u.email}
                        </div>
                        {u.phone && (
                          <div style={{ fontSize: '0.76rem', color: '#7a8570', marginTop: '2px' }}>
                            📞 {u.phone}
                          </div>
                        )}
                      </div>
                    </div>

                    <div style={{
                      paddingTop: '10px',
                      borderTop: '1px solid #f1ebd9',
                      fontSize: '0.76rem',
                      color: '#6e7762',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <span>
                        {u.department_name ? `Dept: ${u.department_name}` : (u.ward_name ? `Ward: ${u.ward_name}` : 'General Citizen')}
                      </span>
                      <span style={{ color: '#99a38f' }}>
                        ID #{u.id}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}

      {/* Inspection & Decision Modal */}
      {selectedVerify && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.65)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div className="card" style={{ maxWidth: '780px', width: '100%', maxHeight: '92vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#4b5e28' }}>ADMIN RESOLUTION VERIFICATION</span>
                <h3 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#1f241a' }}>
                  {selectedVerify.complaint_code}: {selectedVerify.category_name}
                </h3>
                <div style={{ fontSize: '0.82rem', color: '#64748b' }}>
                  Ward: <strong>{selectedVerify.ward_name}</strong> | Officer: <strong>{selectedVerify.officer_name}</strong>
                </div>
              </div>
              <button 
                onClick={() => setSelectedVerify(null)} 
                style={{ background: 'none', border: 'none', fontSize: '1.4rem', color: '#94a3b8' }}
              >
                &times;
              </button>
            </div>

            {/* Side-by-side Evidence Display */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div style={{ backgroundColor: '#f8fafc', padding: '12px', borderRadius: '8px' }}>
                <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#475569', marginBottom: '6px' }}>
                  ORIGINAL CITIZEN REPORT
                </div>
                <div style={{ height: '220px', borderRadius: '6px', overflow: 'hidden', backgroundColor: '#e2e8f0' }}>
                  <SecureS3Image 
                    complaintId={selectedVerify.complaint_id}
                    objectKey={selectedVerify.original_s3_key}
                    fallbackSrc={getImageUrl(selectedVerify.original_photo, selectedVerify.category_name, false)} 
                    alt="Original Citizen Issue" 
                  />
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '6px' }}>
                  GPS: {selectedVerify.original_latitude?.toFixed(5)}, {selectedVerify.original_longitude?.toFixed(5)}
                </div>
              </div>

              <div style={{ backgroundColor: '#f0fdf4', padding: '12px', borderRadius: '8px' }}>
                <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#166534', marginBottom: '6px' }}>
                  FIELD OFFICER RESOLUTION PROOF
                </div>
                <div style={{ height: '220px', borderRadius: '6px', overflow: 'hidden', backgroundColor: '#e2e8f0' }}>
                  <SecureS3Image 
                    complaintId={selectedVerify.complaint_id}
                    objectKey={selectedVerify.resolution_s3_key}
                    fallbackSrc={getImageUrl(selectedVerify.resolution_photo, selectedVerify.category_name, true)} 
                    alt="Field Officer Resolution" 
                  />
                </div>
                <div style={{ fontSize: '0.75rem', color: '#166534', marginTop: '6px' }}>
                  Resolution GPS: {selectedVerify.resolution_latitude?.toFixed(5)}, {selectedVerify.resolution_longitude?.toFixed(5)}
                </div>
              </div>
            </div>

            {/* Computed Distance Banner */}
            <div style={{
              backgroundColor: selectedVerify.distance_from_original_m <= 50 ? '#dcfce7' : '#fef3c7',
              border: `1px solid ${selectedVerify.distance_from_original_m <= 50 ? '#86efac' : '#fde047'}`,
              padding: '12px 16px',
              borderRadius: '8px',
              marginBottom: '16px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 600 }}>Calculated Geotag Distance:</span>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: selectedVerify.distance_from_original_m <= 50 ? '#166534' : '#b45309' }}>
                  {selectedVerify.distance_from_original_m} meters from original site
                </div>
              </div>
              <span className="badge" style={{ backgroundColor: '#ffffff' }}>
                {selectedVerify.distance_from_original_m <= 50 ? 'Within Geofence (Accurate)' : 'Extended Radius'}
              </span>
            </div>

            {/* Admin Notes */}
            <div className="form-group">
              <label className="form-label">Admin Verification Notes / Instructions</label>
              <textarea 
                className="form-textarea" 
                rows="2" 
                placeholder="Enter notes on verification decision (e.g. Cleared verified against landmarks)..."
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
              />
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button 
                type="button" 
                onClick={() => setSelectedVerify(null)} 
                className="btn btn-outline"
              >
                Cancel
              </button>
              <button 
                type="button" 
                disabled={actionLoading}
                onClick={() => handleVerify('reject')} 
                className="btn btn-danger"
              >
                <X size={16} /> Reject & Reopen
              </button>
              <button 
                type="button" 
                disabled={actionLoading}
                onClick={() => handleVerify('approve')} 
                className="btn btn-success"
              >
                <Check size={16} /> Approve as Resolved
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
