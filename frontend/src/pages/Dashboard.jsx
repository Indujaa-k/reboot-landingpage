import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { downloadFile } from "../api/axios";
import logo from "../assets/logo-4.png";
import "./Dashboard.css";

const STATUS_OPTIONS = ["paid", "failed", "refunded"];
const GENDER_OPTIONS = ["male", "female", "other", "not_specified"];

const GENDER_LABELS = {
  male: "Male",
  female: "Female",
  other: "Other",
  not_specified: "Not specified",
};

const formatINR = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value || 0);

const formatShortDate = (isoDate) =>
  new Date(isoDate).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
  });

// Registration timestamp (date + time it was created), used in the table
// and modal now that payment status/method are no longer shown.
const formatRegisteredAt = (isoDate) =>
  new Date(isoDate).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

// Returns the fill-band class for a slot's progress bar, so the bar shifts
// from green -> amber -> orange -> red as the slot approaches capacity.
const slotFillClass = (fillPercent) => {
  if (fillPercent >= 100) return "dash-slot-fill-full";
  if (fillPercent >= 85) return "dash-slot-fill-high";
  if (fillPercent >= 60) return "dash-slot-fill-medium";
  return "";
};

// Generic "bar row" used by every breakdown panel (source / gender / age / date)
// so they all share the same visual language.
const BarRow = ({
  label,
  value,
  count,
  maxValue,
  valueFormatter = (v) => v,
}) => (
  <div className="dash-bar-row">
    <span className="dash-bar-label">{label}</span>
    <div className="dash-bar-track">
      <div
        className="dash-bar-fill"
        style={{ width: `${Math.max(4, (value / (maxValue || 1)) * 100)}%` }}
      />
    </div>
    <span className="dash-bar-value">{valueFormatter(value)}</span>
    {count !== undefined && <span className="dash-bar-count">{count} tx</span>}
  </div>
);

const Dashboard = () => {
  const [registrations, setRegistrations] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [filters, setFilters] = useState({
    search: "",
    status: "",
    source: "",
    gender: "",
    from: "",
    to: "",
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [selectedRegistration, setSelectedRegistration] = useState(null);

  // Slot availability (per camp date / time), independent of the table filters.
  const [slotData, setSlotData] = useState([]);

  // Which slot's registrant list is currently open in the modal, plus its
  // fetched contents/loading/error state.
  const [selectedSlot, setSelectedSlot] = useState(null); // { date, time, label }
  const [slotRegistrations, setSlotRegistrations] = useState([]);
  const [slotListLoading, setSlotListLoading] = useState(false);
  const [slotListError, setSlotListError] = useState("");

  // Export preview modal
  const [showExportPreview, setShowExportPreview] = useState(false);
  const [previewRows, setPreviewRows] = useState([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");

  const navigate = useNavigate();
  const adminInfo = JSON.parse(localStorage.getItem("adminInfo"));

  const handleLogout = useCallback(() => {
    localStorage.removeItem("adminInfo");
    navigate("/login");
  }, [navigate]);

  const activeParams = { ...filters, page, limit: 15 };
  Object.keys(activeParams).forEach((k) => {
    if (activeParams[k] === "") delete activeParams[k];
  });

  useEffect(() => {
    let cancelled = false;

    const fetchAll = async () => {
      setLoading(true);
      setError("");
      try {
        const [listRes, analyticsRes] = await Promise.all([
          api.get("/adminregistrations", { params: activeParams }),
          api.get("/adminregistrations/analytics", { params: activeParams }),
        ]);

        if (cancelled) return;
        setRegistrations(listRes.data.items);
        setTotal(listRes.data.total);
        setPages(listRes.data.pages);
        setAnalytics(analyticsRes.data);
      } catch (err) {
        if (cancelled) return;
        if (err.response?.status === 401) {
          handleLogout();
        } else {
          setError(
            err.response?.data?.message || "Failed to load dashboard data.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchAll();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(filters), page]);

  // Slot availability doesn't depend on the table filters, so it's fetched
  // once on mount rather than re-fetched alongside the filtered list.
  useEffect(() => {
    let cancelled = false;

    api
      .get("/adminregistrations/slots")
      .then((res) => {
        if (!cancelled) setSlotData(res.data.slotsByDate || []);
      })
      .catch(() => {
        // Non-critical panel — fail silently rather than blocking the dashboard.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch the registrant list whenever a slot is opened.
  useEffect(() => {
    if (!selectedSlot) return undefined;
    let cancelled = false;

    setSlotListLoading(true);
    setSlotListError("");
    setSlotRegistrations([]);

    api
      .get("/adminregistrations", {
        params: {
          preferredDate: selectedSlot.date,
          preferredTime: selectedSlot.time,
          limit: 200,
        },
      })
      .then((res) => {
        if (!cancelled) setSlotRegistrations(res.data.items || []);
      })
      .catch(() => {
        if (!cancelled) {
          setSlotListError("Could not load the list for this slot.");
        }
      })
      .finally(() => {
        if (!cancelled) setSlotListLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedSlot]);

  // Lock body scroll and support Escape-to-close while any modal is open
  useEffect(() => {
    if (!selectedRegistration && !selectedSlot && !showExportPreview)
      return undefined;
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        setSelectedRegistration(null);
        setSelectedSlot(null);
        setShowExportPreview(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [selectedRegistration, selectedSlot, showExportPreview]);

  const handleFilterChange = (key, value) => {
    setPage(1);
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  // Opens the export preview modal and fetches a small sample of matching
  // rows (using the same filters) so the admin can sanity-check the export
  // before actually downloading the full .xlsx file.
  const openExportPreview = async () => {
    setShowExportPreview(true);
    setPreviewLoading(true);
    setPreviewError("");
    setPreviewRows([]);

    try {
      const exportParams = { ...filters };
      Object.keys(exportParams).forEach((k) => {
        if (exportParams[k] === "") delete exportParams[k];
      });

      const res = await api.get("/adminregistrations", {
        params: { ...exportParams, page: 1, limit: 10 },
      });
      setPreviewRows(res.data.items || []);
    } catch (err) {
      setPreviewError(
        "Couldn't load a preview. You can still export directly.",
      );
    } finally {
      setPreviewLoading(false);
    }
  };

  // Actually triggers the .xlsx download (full filtered set, generated
  // server-side) once the admin confirms from the preview modal.
  const confirmExport = async () => {
    setExporting(true);
    try {
      const exportParams = { ...filters };
      Object.keys(exportParams).forEach((k) => {
        if (exportParams[k] === "") delete exportParams[k];
      });
      await downloadFile(
        "/adminregistrations/export",
        exportParams,
        "transactions.xlsx",
      );
      setShowExportPreview(false);
    } catch (err) {
      setError("Export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  const sources = analytics?.bySource?.map((s) => s._id) || [];

  const maxSourceAmount = analytics?.bySource?.[0]?.amount || 1;
  const maxGenderCount = analytics?.byGender
    ? Math.max(...analytics.byGender.map((g) => g.count), 1)
    : 1;
  const maxAgeCount = analytics?.byAgeGroup
    ? Math.max(...analytics.byAgeGroup.map((a) => a.count), 1)
    : 1;
  const maxEnrollmentCount = analytics?.enrollmentsByDate
    ? Math.max(...analytics.enrollmentsByDate.map((d) => d.count), 1)
    : 1;

  return (
    <div className="dash-screen">
      <header className="dash-header">
        <div className="dash-brand">
          <img src={logo} alt="Clinic logo" className="dash-logo" />
        </div>
        <div className="dash-header-right">
          <span className="dash-admin-name">{adminInfo?.username}</span>
          <button className="dash-logout" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </header>

      <main className="dash-main">
        <div className="dash-title-row">
          <h1>Transactions</h1>
          <span className="dash-count">{total} total</span>
          <button
            className="dash-export"
            onClick={openExportPreview}
            disabled={exporting}
          >
            {exporting ? "Exporting…" : "Export to Excel"}
          </button>
        </div>

        {analytics && (
          <div className="dash-cards">
            <div className="dash-card">
              <span className="dash-card-label">Total revenue</span>
              <span className="dash-card-value">
                {formatINR(analytics.totalRevenue)}
              </span>
              <span className="dash-card-hint">from paid transactions</span>
            </div>
            <div className="dash-card">
              <span className="dash-card-label">Total registrations</span>
              <span className="dash-card-value">
                {analytics.totalRegistrations}
              </span>
              <span className="dash-card-hint">matching current filters</span>
            </div>
            <div className="dash-card">
              <span className="dash-card-label">Average amount</span>
              <span className="dash-card-value">
                {formatINR(analytics.averageAmount)}
              </span>
              <span className="dash-card-hint">per registration</span>
            </div>
          </div>
        )}

        {slotData?.length > 0 && (
          <div className="dash-slot-section">
            <h2>Slot availability</h2>
            <p className="dash-panel-sub">
              Filled vs available seats, per camp date and time. Click a row to
              see who's booked into that slot.
            </p>

            {slotData.map((d) => (
              <div className="dash-slot-date-block" key={d.date}>
                <div className="dash-slot-date-header">
                  <h3>{d.label}</h3>
                  <span className="dash-slot-card-total">
                    {d.totalTaken}/{d.totalCapacity} filled (
                    {d.totalFillPercent}%) · {d.totalAvailable} available
                  </span>
                </div>

                <div className="dash-slot-table-wrap">
                  <table className="dash-slot-table">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Filled</th>
                        <th>Available</th>
                        <th>Capacity</th>
                        <th>Fill %</th>
                        <th>Status</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.slots.map((s) => (
                        <tr key={s.time}>
                          <td>{s.time}</td>
                          <td>{s.taken}</td>
                          <td>{s.available}</td>
                          <td>{s.capacity}</td>
                          <td>
                            <div className="dash-slot-progress">
                              <div
                                className={`dash-bar-track dash-slot-progress-track ${slotFillClass(
                                  s.fillPercent,
                                )}`}
                              >
                                <div
                                  className="dash-bar-fill"
                                  style={{
                                    width: `${Math.max(4, s.fillPercent)}%`,
                                  }}
                                />
                              </div>
                              <span>{s.fillPercent}%</span>
                            </div>
                          </td>
                          <td>
                            <span
                              className={`dash-slot-tag ${
                                s.full ? "dash-slot-full" : ""
                              }`}
                            >
                              {s.full ? "Full" : "Open"}
                            </span>
                          </td>
                          <td>
                            <button
                              className="dash-view-btn"
                              onClick={() =>
                                setSelectedSlot({
                                  date: d.date,
                                  time: s.time,
                                  label: `${d.label}, ${s.time}`,
                                })
                              }
                            >
                              View list
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}

        {analytics && (
          <div className="dash-panel-grid">
            {analytics.enrollmentsByDate?.length > 0 && (
              <div className="dash-panel">
                <h2>Enrollments by date</h2>
                <p className="dash-panel-sub">People registering, per day</p>
                <div className="dash-bar-list dash-bar-list-scroll">
                  {analytics.enrollmentsByDate.map((d) => (
                    <BarRow
                      key={d._id}
                      label={formatShortDate(d._id)}
                      value={d.count}
                      maxValue={maxEnrollmentCount}
                    />
                  ))}
                </div>
              </div>
            )}

            {analytics.byAgeGroup?.length > 0 && (
              <div className="dash-panel">
                <h2>Age breakdown</h2>
                <p className="dash-panel-sub">Registrations by age group</p>
                <div className="dash-bar-list">
                  {analytics.byAgeGroup.map((a) => (
                    <BarRow
                      key={a._id}
                      label={a.label}
                      value={a.count}
                      maxValue={maxAgeCount}
                    />
                  ))}
                </div>
              </div>
            )}

            {analytics.byGender?.length > 0 && (
              <div className="dash-panel">
                <h2>Gender breakdown</h2>
                <p className="dash-panel-sub">Registrations by gender</p>
                <div className="dash-bar-list">
                  {analytics.byGender.map((g) => (
                    <BarRow
                      key={g._id}
                      label={GENDER_LABELS[g._id] || g._id}
                      value={g.count}
                      maxValue={maxGenderCount}
                    />
                  ))}
                </div>
              </div>
            )}

            {analytics.bySource?.length > 0 && (
              <div className="dash-panel">
                <h2>Revenue by source</h2>
                <p className="dash-panel-sub">Where registrations come from</p>
                <div className="dash-bar-list">
                  {analytics.bySource.map((s) => (
                    <BarRow
                      key={s._id}
                      label={s._id}
                      value={s.amount}
                      count={s.count}
                      maxValue={maxSourceAmount}
                      valueFormatter={formatINR}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="dash-filters">
          <input
            className="dash-filter-input"
            placeholder="Search name, phone, reference…"
            value={filters.search}
            onChange={(e) => handleFilterChange("search", e.target.value)}
          />
          <select
            className="dash-filter-select"
            value={filters.status}
            onChange={(e) => handleFilterChange("status", e.target.value)}
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            className="dash-filter-select"
            value={filters.source}
            onChange={(e) => handleFilterChange("source", e.target.value)}
          >
            <option value="">All sources</option>
            {sources.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            className="dash-filter-select"
            value={filters.gender}
            onChange={(e) => handleFilterChange("gender", e.target.value)}
          >
            <option value="">All genders</option>
            {GENDER_OPTIONS.map((g) => (
              <option key={g} value={g}>
                {GENDER_LABELS[g]}
              </option>
            ))}
          </select>
          <input
            className="dash-filter-date"
            type="date"
            value={filters.from}
            onChange={(e) => handleFilterChange("from", e.target.value)}
          />
          <input
            className="dash-filter-date"
            type="date"
            value={filters.to}
            onChange={(e) => handleFilterChange("to", e.target.value)}
          />
        </div>

        {loading && <p className="dash-status">Loading transactions…</p>}
        {error && <p className="dash-status dash-status-error">{error}</p>}

        {!loading &&
          !error &&
          (registrations.length === 0 ? (
            <p className="dash-status">No transactions match these filters.</p>
          ) : (
            <>
              <div className="dash-table-wrap">
                <table className="dash-table">
                  <thead>
                    <tr>
                      <th>Reference</th>
                      <th>Name</th>
                      <th>Phone</th>
                      <th>Age</th>
                      <th>Gender</th>
                      <th>Amount</th>
                      <th>Source</th>
                      <th>Registered</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {registrations.map((r) => (
                      <tr key={r._id}>
                        <td className="dash-mono">{r.referenceNumber}</td>
                        <td>{r.name}</td>
                        <td>{r.phone}</td>
                        <td>{r.age}</td>
                        <td>{GENDER_LABELS[r.gender] || "Not specified"}</td>
                        <td>{formatINR(r.amount)}</td>
                        <td>{r.source}</td>
                        <td>{formatRegisteredAt(r.createdAt)}</td>
                        <td>
                          <button
                            className="dash-view-btn"
                            onClick={() => setSelectedRegistration(r)}
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="dash-pagination">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </button>
                <span>
                  Page {page} of {pages}
                </span>
                <button
                  disabled={page >= pages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            </>
          ))}
      </main>

      {selectedRegistration && (
        <div
          className="dash-modal-backdrop"
          onClick={() => setSelectedRegistration(null)}
        >
          <div className="dash-modal" onClick={(e) => e.stopPropagation()}>
            <div className="dash-modal-header">
              <h2>{selectedRegistration.name}</h2>
              <button
                className="dash-modal-close"
                onClick={() => setSelectedRegistration(null)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="dash-modal-body">
              <div className="dash-modal-row">
                <span>Reference</span>
                <span className="dash-mono">
                  {selectedRegistration.referenceNumber}
                </span>
              </div>
              <div className="dash-modal-row">
                <span>Phone</span>
                <span>{selectedRegistration.phone}</span>
              </div>
              <div className="dash-modal-row">
                <span>Age</span>
                <span>{selectedRegistration.age}</span>
              </div>
              <div className="dash-modal-row">
                <span>Gender</span>
                <span>
                  {GENDER_LABELS[selectedRegistration.gender] ||
                    "Not specified"}
                </span>
              </div>
              <div className="dash-modal-row">
                <span>Preferred date</span>
                <span>{selectedRegistration.preferredDate}</span>
              </div>
              <div className="dash-modal-row">
                <span>Preferred time</span>
                <span>{selectedRegistration.preferredTime}</span>
              </div>
              <div className="dash-modal-row">
                <span>Reason</span>
                <span>{selectedRegistration.reason}</span>
              </div>
              <div className="dash-modal-row">
                <span>Source</span>
                <span>{selectedRegistration.source}</span>
              </div>
              <div className="dash-modal-row">
                <span>Amount</span>
                <span>{formatINR(selectedRegistration.amount)}</span>
              </div>
              <div className="dash-modal-row">
                <span>Registered at</span>
                <span>
                  {formatRegisteredAt(selectedRegistration.createdAt)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedSlot && (
        <div
          className="dash-modal-backdrop"
          onClick={() => setSelectedSlot(null)}
        >
          <div
            className="dash-modal dash-modal-wide"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dash-modal-header">
              <h2>{selectedSlot.label}</h2>
              <button
                className="dash-modal-close"
                onClick={() => setSelectedSlot(null)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="dash-modal-body">
              {slotListLoading && (
                <p className="dash-status">Loading registrants…</p>
              )}
              {slotListError && (
                <p className="dash-status dash-status-error">{slotListError}</p>
              )}
              {!slotListLoading &&
                !slotListError &&
                (slotRegistrations.length === 0 ? (
                  <p className="dash-status">
                    No one is booked into this slot yet.
                  </p>
                ) : (
                  <div className="dash-table-wrap">
                    <table className="dash-table">
                      <thead>
                        <tr>
                          <th>Reference</th>
                          <th>Name</th>
                          <th>Phone</th>
                          <th>Age</th>
                          <th>Gender</th>
                          <th>Amount</th>
                          <th>Registered</th>
                        </tr>
                      </thead>
                      <tbody>
                        {slotRegistrations.map((r) => (
                          <tr key={r._id}>
                            <td className="dash-mono">{r.referenceNumber}</td>
                            <td>{r.name}</td>
                            <td>{r.phone}</td>
                            <td>{r.age}</td>
                            <td>
                              {GENDER_LABELS[r.gender] || "Not specified"}
                            </td>
                            <td>{formatINR(r.amount)}</td>
                            <td>{formatRegisteredAt(r.createdAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {showExportPreview && (
        <div
          className="dash-modal-backdrop"
          onClick={() => !exporting && setShowExportPreview(false)}
        >
          <div
            className="dash-modal dash-modal-wide"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dash-modal-header">
              <h2>Export preview</h2>
              <button
                className="dash-modal-close"
                onClick={() => setShowExportPreview(false)}
                aria-label="Close"
                disabled={exporting}
              >
                ×
              </button>
            </div>

            <div className="dash-modal-body">
              <div className="dash-modal-row">
                <span>Matching your current filters</span>
                <span>
                  {analytics?.totalRegistrations ?? "—"} registrations ·{" "}
                  {formatINR(analytics?.totalRevenue ?? 0)} total
                </span>
              </div>

              {previewLoading && (
                <p className="dash-status">Loading preview…</p>
              )}
              {previewError && (
                <p className="dash-status dash-status-error">{previewError}</p>
              )}

              {!previewLoading && !previewError && (
                <>
                  <p className="dash-panel-sub">
                    First {previewRows.length} row
                    {previewRows.length === 1 ? "" : "s"} shown below. The full
                    export will include every matching registration and a
                    summary sheet.
                  </p>
                  {previewRows.length === 0 ? (
                    <p className="dash-status">No rows match these filters.</p>
                  ) : (
                    <div className="dash-table-wrap">
                      <table className="dash-table">
                        <thead>
                          <tr>
                            <th>Reference</th>
                            <th>Name</th>
                            <th>Phone</th>
                            <th>Age</th>
                            <th>Gender</th>
                            <th>Amount</th>
                            <th>Source</th>
                            <th>Registered</th>
                          </tr>
                        </thead>
                        <tbody>
                          {previewRows.map((r) => (
                            <tr key={r._id}>
                              <td className="dash-mono">{r.referenceNumber}</td>
                              <td>{r.name}</td>
                              <td>{r.phone}</td>
                              <td>{r.age}</td>
                              <td>
                                {GENDER_LABELS[r.gender] || "Not specified"}
                              </td>
                              <td>{formatINR(r.amount)}</td>
                              <td>{r.source}</td>
                              <td>{formatRegisteredAt(r.createdAt)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}

              <div className="dash-modal-actions">
                <button
                  className="dash-view-btn"
                  onClick={() => setShowExportPreview(false)}
                  disabled={exporting}
                >
                  Cancel
                </button>
                <button
                  className="dash-export"
                  onClick={confirmExport}
                  disabled={exporting}
                >
                  {exporting ? "Exporting…" : "Download Excel"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
