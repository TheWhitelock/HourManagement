import { useEffect, useMemo, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGear, faPlus, faTrash, faXmark } from '@fortawesome/free-solid-svg-icons';
import './App.css';

const padNumber = (value) => String(value).padStart(2, '0');
const toDateKey = (date) =>
  `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`;

const toLocalDateTimeInputValue = (date) => {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
};

const getWeekRange = (anchor) => {
  const start = new Date(anchor);
  start.setHours(0, 0, 0, 0);
  const day = start.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diff);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

const parseDateValue = (value) =>
  typeof value === 'string' && value.length === 10 ? new Date(`${value}T00:00:00`) : new Date(value);

const formatDateLabel = (value) =>
  parseDateValue(value).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });

const formatTimeLabel = (value) =>
  parseDateValue(value).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit'
  });

const getIsoWeekNumber = (value) => {
  const date = new Date(value);
  const day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - day + 3);
  const firstThursday = new Date(date.getFullYear(), 0, 4);
  const firstDay = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - firstDay + 3);
  const diff = date - firstThursday;
  return 1 + Math.round(diff / (7 * 24 * 60 * 60 * 1000));
};

const inferApiBase = () => {
  const envBase = (import.meta?.env?.VITE_API_BASE || '').replace(/\/$/, '');
  if (envBase) {
    return envBase;
  }
  if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
    return 'http://127.0.0.1:3001';
  }
  return '';
};

const apiBase = inferApiBase();
const apiUrl = (path) => (apiBase ? `${apiBase}${path}` : path);

export default function App() {
  const getStoredNumber = (key, fallback) => {
    if (typeof window === 'undefined') {
      return fallback;
    }
    const stored = localStorage.getItem(key);
    if (stored === null) {
      return fallback;
    }
    const parsed = Number(stored);
    return Number.isNaN(parsed) ? fallback : parsed;
  };

  const [clockStatus, setClockStatus] = useState({ clockedIn: false, lastEvent: null });
  const [weekSummary, setWeekSummary] = useState([]);
  const [events, setEvents] = useState([]);
  const [weekRange, setWeekRange] = useState(getWeekRange(new Date()));
  const [status, setStatus] = useState('');
  const [targetHours, setTargetHours] = useState(() =>
    getStoredNumber('hourManagement.targetHours', 8)
  );
  const [hoursShown, setHoursShown] = useState(() =>
    getStoredNumber('hourManagement.hoursShown', 10)
  );
  const [isManualOpen, setIsManualOpen] = useState(false);
  const [selectedDateKey, setSelectedDateKey] = useState(toDateKey(new Date()));
  const [showSettings, setShowSettings] = useState(false);
  const [settingsStatus, setSettingsStatus] = useState('');
  const [serverOk, setServerOk] = useState(true);
  const [manualForm, setManualForm] = useState({
    type: 'IN',
    occurredAt: ''
  });
  const hasDesktopBridge = typeof window !== 'undefined' && window.electronAPI;

  const weekRangeLabel = useMemo(() => {
    const startLabel = formatDateLabel(weekRange.start);
    const endLabel = formatDateLabel(weekRange.end);
    return `${startLabel} - ${endLabel}`;
  }, [weekRange]);

  const weekNumber = useMemo(() => getIsoWeekNumber(weekRange.start), [weekRange]);

  const weekStats = useMemo(() => {
    const totalHours = weekSummary.reduce((sum, day) => sum + day.totalHours, 0);
    const avgHours = weekSummary.length ? totalHours / weekSummary.length : 0;
    const bestDay = weekSummary.reduce(
      (best, day) => (day.totalHours > (best?.totalHours ?? -1) ? day : best),
      null
    );

    return {
      totalHours,
      avgHours,
      bestDay
    };
  }, [weekSummary, selectedDateKey]);

  const chartMax = useMemo(
    () =>
      Math.max(
        hoursShown || 0,
        targetHours || 0,
        ...weekSummary.map((day) => day.totalHours),
        1
      ),
    [hoursShown, targetHours, weekSummary]
  );

  const groupedEvents = useMemo(() => {
    const map = events.reduce((acc, event) => {
      const key = toDateKey(new Date(event.occurredAt));
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(event);
      return acc;
    }, {});

    return Object.keys(map)
      .sort((a, b) => (a > b ? -1 : 1))
      .map((key) => ({
        date: key,
        events: map[key].sort(
          (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
        )
      }));
  }, [events]);

  const selectedEvents = useMemo(() => {
    if (!selectedDateKey) {
      return { date: null, events: [] };
    }
    const match = groupedEvents.find((group) => group.date === selectedDateKey);
    return match || { date: selectedDateKey, events: [] };
  }, [groupedEvents, selectedDateKey]);

  const loadWeek = async (range = weekRange) => {
    const from = toDateKey(range.start);
    const to = toDateKey(range.end);

    try {
      const [eventsResponse, summaryResponse, statusResponse] = await Promise.all([
        fetch(apiUrl(`/api/clock-events?from=${from}&to=${to}`)),
        fetch(apiUrl(`/api/clock-summary?from=${from}&to=${to}`)),
        fetch(apiUrl('/api/clock-status'))
      ]);

      if (!eventsResponse.ok || !summaryResponse.ok || !statusResponse.ok) {
        throw new Error('API request failed.');
      }

      const [eventsData, summaryData, statusData] = await Promise.all([
        eventsResponse.json(),
        summaryResponse.json(),
        statusResponse.json()
      ]);

      setEvents(eventsData);
      setWeekSummary(summaryData.days || []);
      setClockStatus(statusData);
      setStatus('');
      setServerOk(true);
    } catch (error) {
      setStatus(
        'Unable to reach the local server. If this is the desktop app, wait a moment and retry.'
      );
      setServerOk(false);
    }
  };

  const handleWeekShift = (direction) => {
    const anchor = new Date(weekRange.start);
    anchor.setDate(anchor.getDate() + direction * 7);
    const nextRange = getWeekRange(anchor);
    setWeekRange(nextRange);
    loadWeek(nextRange);
  };

  useEffect(() => {
    const range = getWeekRange(new Date());
    setWeekRange(range);
    loadWeek(range);
  }, []);

  useEffect(() => {
    localStorage.setItem('hourManagement.targetHours', String(targetHours));
  }, [targetHours]);

  useEffect(() => {
    localStorage.setItem('hourManagement.hoursShown', String(hoursShown));
  }, [hoursShown]);

  useEffect(() => {
    if (weekSummary.length === 0) {
      return;
    }

    const hasSelected = selectedDateKey
      ? weekSummary.some((day) => toDateKey(new Date(day.date)) === selectedDateKey)
      : false;
    if (hasSelected) {
      return;
    }

    const todayKey = toDateKey(new Date());
    const inRange = weekSummary.some((day) => toDateKey(new Date(day.date)) === todayKey);
    const nextKey = inRange ? todayKey : toDateKey(new Date(weekSummary[0].date));
    setSelectedDateKey(nextKey);
  }, [weekSummary]);

  useEffect(() => {
    if (!isManualOpen) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsManualOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isManualOpen]);

  const handleClockAction = async (action) => {
    setStatus('Updating...');
    try {
      const response = await fetch(apiUrl(`/api/clock-${action}`), { method: 'POST' });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setStatus(data.error || 'Something went wrong.');
        return;
      }
      setStatus(action === 'in' ? 'Clocked in.' : 'Clocked out.');
      await loadWeek();
      setServerOk(true);
    } catch (error) {
      setStatus('Unable to reach the local server.');
      setServerOk(false);
    }
  };

  const handleManualChange = (event) => {
    const { name, value } = event.target;
    setManualForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleManualSubmit = async (event) => {
    event.preventDefault();
    setStatus('Saving manual event...');
    if (!selectedDateKey) {
      setStatus('Please select a day first.');
      return;
    }
    if (!manualForm.occurredAt) {
      setStatus('Please select a time.');
      return;
    }

    const parsed = new Date(`${selectedDateKey}T${manualForm.occurredAt}:00`);
    if (Number.isNaN(parsed.getTime())) {
      setStatus('Please select a valid timestamp.');
      return;
    }
    if (parsed >= new Date()) {
      setStatus('Manual events must be in the past.');
      return;
    }

    try {
      const response = await fetch(apiUrl('/api/clock-events'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: manualForm.type,
          occurredAt: parsed.toISOString()
        })
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setStatus(data.error || 'Something went wrong.');
        return;
      }

      setStatus('Manual event added.');
      setManualForm((prev) => ({ ...prev, occurredAt: '' }));
      setIsManualOpen(false);
      await loadWeek();
      setServerOk(true);
    } catch (error) {
      setStatus('Unable to reach the local server.');
      setServerOk(false);
    }
  };

  const handleDeleteEvent = async (id) => {
    try {
      const impactResponse = await fetch(apiUrl(`/api/clock-events/${id}/impact`));
      if (!impactResponse.ok) {
        const data = await impactResponse.json().catch(() => ({}));
        setStatus(data.error || 'Something went wrong.');
        return;
      }

      const impact = await impactResponse.json();
      if (impact.willChangeStatus) {
        const nextLabel = impact.nextStatus === 'IN' ? 'clocked in' : 'clocked out';
        const ok = window.confirm(
          `Note: deleting this event will set your status to ${nextLabel}. Are you sure?`
        );
        if (!ok) {
          setStatus('Deletion cancelled.');
          return;
        }
      }

      setStatus('Deleting event...');
      const response = await fetch(apiUrl(`/api/clock-events/${id}`), { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setStatus(data.error || 'Something went wrong.');
        return;
      }
      setStatus('Event deleted.');
      await loadWeek();
      setServerOk(true);
    } catch (error) {
      setStatus('Unable to reach the local server.');
      setServerOk(false);
    }
  };

  const handleOpenDataFolder = async () => {
    if (!hasDesktopBridge) {
      setSettingsStatus('Desktop tools are available in the Electron app only.');
      return;
    }

    setSettingsStatus('Opening data folder...');
    const result = await window.electronAPI.openUserData();
    if (!result?.ok) {
      setSettingsStatus(result?.error || 'Unable to open data folder.');
      return;
    }
    setSettingsStatus('Data folder opened.');
  };

  const handleExportBackup = async () => {
    if (!hasDesktopBridge) {
      setSettingsStatus('Desktop tools are available in the Electron app only.');
      return;
    }

    setSettingsStatus('Preparing backup...');
    const result = await window.electronAPI.exportBackup();
    if (!result?.ok) {
      setSettingsStatus(result?.error || 'Backup failed.');
      return;
    }
    setSettingsStatus('Backup exported.');
  };

  return (
    <div className="page">
      <header className="hero">
        <div className="hero-text">
          <p className="eyebrow">Because her time matters.</p>
          <h1>Liliance</h1>
          <p className="subhead">
            Clock in or out and see weekly totals at a glance.
          </p>
        </div>
        <div className="status-card">
          <div className="status-header">
            <p className="status-label">Current status</p>
            <span className={`status-badge ${serverOk ? 'ok' : 'down'}`}>
              {serverOk ? 'Server online' : 'Server offline'}
            </span>
          </div>
          <div className={`status-pill ${clockStatus.clockedIn ? 'in' : 'out'}`}>
            {clockStatus.clockedIn ? 'Clocked in' : 'Clocked out'}
          </div>
          {/* <p className="status-meta">
            {clockStatus.lastEvent
              ? `Last event: ${clockStatus.lastEvent.type === 'IN' ? 'Clock in' : 'Clock out'} - ${formatDateLabel(
                  clockStatus.lastEvent.occurredAt
                )} ${formatTimeLabel(clockStatus.lastEvent.occurredAt)}`
              : 'No events yet'}
          </p> */}
          <div className="status-divider" role="presentation" />
          <p className="status-meta">Use the button below to change your status.</p>
          <div className="status-actions">
            {clockStatus.clockedIn ? (
              <button
                className="danger"
                onClick={() => handleClockAction('out')}
                type="button"
              >
                Clock out
              </button>
            ) : (
              <button
                className="primary"
                onClick={() => handleClockAction('in')}
                type="button"
              >
                Clock in
              </button>
            )}
          </div>
          {status && <p className="status">{status}</p>}
        </div>
      </header>

      <>
        <section className="card week-card">
            <div className="card-header">
              <div>
                <div className="week-title">
                  <button
                    type="button"
                    className="ghost week-nav"
                    onClick={() => handleWeekShift(-1)}
                    aria-label="Previous week"
                  >
                    &lt;
                  </button>
                  <h2>Week {weekNumber}</h2>
                  <button
                    type="button"
                    className="ghost week-nav"
                    onClick={() => handleWeekShift(1)}
                    aria-label="Next week"
                  >
                    &gt;
                  </button>
                </div>
                <p className="card-subtitle">Week range: {weekRangeLabel}</p>
              </div>
              <button
                type="button"
                className="ghost with-icon"
                onClick={() => setShowSettings(true)}
              >
                <FontAwesomeIcon icon={faGear} className="icon" aria-hidden="true" />
                Settings
              </button>
            </div>
            <div className="week-stats">
              <div className="stat-card">
                <span className="stat-label">Week total</span>
                <span className="stat-value">{weekStats.totalHours.toFixed(2)}h</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Average per day</span>
                <span className="stat-value">{weekStats.avgHours.toFixed(2)}h</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Best day</span>
                <span className="stat-value">
                  {weekStats.bestDay
                    ? `${formatDateLabel(weekStats.bestDay.date)} - ${weekStats.bestDay.totalHours.toFixed(2)}h`
                    : '-'}
                </span>
              </div>
            </div>
            {weekSummary.length === 0 ? (
              <p className="empty-state">No hours logged for this week yet.</p>
            ) : (
              <div
                className="week-grid"
                style={{
                  '--target-position': `${Math.min(
                    100,
                    (targetHours / chartMax) * 100
                  )}%`
                }}
              >
                {weekSummary.map((day) => {
                  const barHeight = Math.min(100, (day.totalHours / chartMax) * 100);
                  const isToday = toDateKey(new Date(day.date)) === toDateKey(new Date());
                  const dayKey = toDateKey(new Date(day.date));
                  const isSelected = dayKey === selectedDateKey;

                  return (
                    <article
                      key={day.date}
                      className={`day-column ${isToday ? 'is-today' : ''} ${isSelected ? 'is-selected' : ''}`}
                      data-tooltip={`${formatDateLabel(day.date)} - ${day.totalHours.toFixed(
                        2
                      )}h (${day.totalMinutes} min)`}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedDateKey(dayKey)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setSelectedDateKey(dayKey);
                        }
                      }}
                    >
                      <div className="bar-track">
                        <div className="bar-fill" style={{ height: `${barHeight}%` }} />
                      </div>
                      <p className="day-hours">{day.totalHours.toFixed(2)}h</p>
                      <p className={`day-name ${isToday ? 'is-today' : ''}`}>
                        {formatDateLabel(day.date)}
                        {isToday ? ' (Today)' : ''}
                      </p>
                    </article>
                  );
                })}
              </div>
            )}
        </section>

        <section className="card">
        <div className="card-header">
          <div>
            <h2>
              {selectedEvents.date
                ? `Events for ${formatDateLabel(selectedEvents.date)}`
                : 'Events'}
            </h2>
            <p className="card-subtitle">Review or remove clock history.</p>
          </div>
          <div className="events-actions">
            <button
              type="button"
              className="primary with-icon"
              onClick={() => setIsManualOpen(true)}
            >
              <FontAwesomeIcon icon={faPlus} className="icon" aria-hidden="true" />
              Add past event
            </button>
            <span className="count">{selectedEvents.events.length} total</span>
          </div>
        </div>
        {selectedEvents.events.length === 0 ? (
          <p className="empty-state">No events logged yet.</p>
        ) : (
          <div className="events-grid">
            {[selectedEvents].map((group) => (
              <div key={group.date || 'selected'} className="events-day">
                <div className="events-day-header">
                  <h3>{formatDateLabel(group.date)}</h3>
                  <span>{group.events.length} events</span>
                </div>
                <ul className="events-list">
                  {group.events.map((event) => (
                    <li key={event.id}>
                      <div>
                        <p className="event-title">
                          {event.type === 'IN' ? 'Clock in' : 'Clock out'}
                        </p>
                        <p className="event-meta">{formatTimeLabel(event.occurredAt)}</p>
                      </div>
                      <button
                        className="ghost with-icon"
                        type="button"
                        onClick={() => handleDeleteEvent(event.id)}
                      >
                        <FontAwesomeIcon icon={faTrash} className="icon" aria-hidden="true" />
                        Delete
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
      </>

      {showSettings && (
        <div className="modal-backdrop" onClick={() => setShowSettings(false)}>
          <div className="settings-popover" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>Chart settings</h2>
                <p className="card-subtitle">Update your weekly chart defaults.</p>
              </div>
              <button type="button" className="ghost with-icon" onClick={() => setShowSettings(false)}>
                <FontAwesomeIcon icon={faXmark} className="icon" aria-hidden="true" />
              </button>
            </div>
            <div className="settings-grid">
              <label>
                Target hours per day
                <span className="field-help">Used to draw the target line on the chart.</span>
                <input
                  type="number"
                  min="0"
                  step="0.25"
                  value={targetHours}
                  onChange={(event) =>
                    setTargetHours(
                      Number.isNaN(Number(event.target.value)) ? 0 : Number(event.target.value)
                    )
                  }
                />
              </label>
              <label>
                Max hours shown
                <span className="field-help">Sets the top of the chart scale.</span>
                <input
                  type="number"
                  min="1"
                  step="0.5"
                  value={hoursShown}
                  onChange={(event) =>
                    setHoursShown(
                      Number.isNaN(Number(event.target.value)) ? 0 : Number(event.target.value)
                    )
                  }
                />
              </label>
            </div>
            <div className="settings-tools">
              <div>
                <h3>Desktop tools</h3>
                <p className="card-subtitle">
                  Manage your local data when running the Electron app.
                </p>
              </div>
              <div className="settings-actions">
                <button type="button" className="ghost" onClick={handleOpenDataFolder}>
                  Open data folder
                </button>
                <button type="button" className="primary" onClick={handleExportBackup}>
                  Export backup
                </button>
              </div>
              {settingsStatus && <p className="settings-status">{settingsStatus}</p>}
            </div>
          </div>
        </div>
      )}

      {isManualOpen && (
        <div className="modal-backdrop" onClick={() => setIsManualOpen(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>
                  Add past clock event for{' '}
                  {selectedDateKey ? formatDateLabel(selectedDateKey) : 'the selected day'}
                </h2>
                <p className="card-subtitle">Manually added events must be in the past.</p>
              </div>
              <button type="button" className="ghost with-icon" onClick={() => setIsManualOpen(false)}>
                <FontAwesomeIcon icon={faXmark} className="icon" aria-hidden="true" />
              </button>
            </div>
            <form className="manual-form" onSubmit={handleManualSubmit}>
              <label>
                Event type
                <select name="type" value={manualForm.type} onChange={handleManualChange}>
                  <option value="IN">Clock in</option>
                  <option value="OUT">Clock out</option>
                </select>
              </label>
              <label>
                Time
                <input
                  type="time"
                  name="occurredAt"
                  value={manualForm.occurredAt}
                  onChange={handleManualChange}
                  max={
                    selectedDateKey === toDateKey(new Date())
                      ? toLocalDateTimeInputValue(new Date()).slice(11, 16)
                      : undefined
                  }
                  required
                />
              </label>
              <div className="modal-actions">
                <button type="button" className="ghost" onClick={() => setIsManualOpen(false)}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="primary with-icon"
                >
                  <FontAwesomeIcon icon={faPlus} className="icon" aria-hidden="true" />
                  Add event
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
