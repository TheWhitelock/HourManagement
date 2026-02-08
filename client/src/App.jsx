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
  const [manualForm, setManualForm] = useState({
    type: 'IN',
    occurredAt: ''
  });

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
  }, [weekSummary]);

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

    const [eventsResponse, summaryResponse, statusResponse] = await Promise.all([
      fetch(`/api/clock-events?from=${from}&to=${to}`),
      fetch(`/api/clock-summary?from=${from}&to=${to}`),
      fetch('/api/clock-status')
    ]);

    const [eventsData, summaryData, statusData] = await Promise.all([
      eventsResponse.json(),
      summaryResponse.json(),
      statusResponse.json()
    ]);

    setEvents(eventsData);
    setWeekSummary(summaryData.days || []);
    setClockStatus(statusData);
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
    const response = await fetch(`/api/clock-${action}`, { method: 'POST' });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setStatus(data.error || 'Something went wrong.');
      return;
    }
    setStatus(action === 'in' ? 'Clocked in.' : 'Clocked out.');
    await loadWeek();
  };

  const handleManualChange = (event) => {
    const { name, value } = event.target;
    setManualForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleManualSubmit = async (event) => {
    event.preventDefault();
    setStatus('Saving manual event...');
    const parsed = new Date(manualForm.occurredAt);
    if (Number.isNaN(parsed.getTime())) {
      setStatus('Please select a valid timestamp.');
      return;
    }
    if (parsed >= new Date()) {
      setStatus('Manual events must be in the past.');
      return;
    }

    const response = await fetch('/api/clock-events', {
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
  };

  const handleDeleteEvent = async (id) => {
    const impactResponse = await fetch(`/api/clock-events/${id}/impact`);
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
    const response = await fetch(`/api/clock-events/${id}`, { method: 'DELETE' });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setStatus(data.error || 'Something went wrong.');
      return;
    }
    setStatus('Event deleted.');
    await loadWeek();
  };

  return (
    <div className="page">
      <header className="hero">
        <div className="hero-text">
          <p className="eyebrow">Weekly timesheet</p>
          <h1>Hour Management</h1>
          <p className="subhead">
            Track every clock-in and clock-out event, add manual history, and see your
            weekly totals at a glance.
          </p>
        </div>
        <div className="status-card">
          <p className="status-label">Current status</p>
          <div className={`status-pill ${clockStatus.clockedIn ? 'in' : 'out'}`}>
            {clockStatus.clockedIn ? 'Clocked in' : 'Clocked out'}
          </div>
          <p className="status-meta">
            {clockStatus.lastEvent
              ? `Last event: ${clockStatus.lastEvent.type === 'IN' ? 'Clock in' : 'Clock out'} - ${formatDateLabel(
                  clockStatus.lastEvent.occurredAt
                )} ${formatTimeLabel(clockStatus.lastEvent.occurredAt)}`
              : 'No events yet'}
          </p>
          <div className="status-actions">
            <button
              className="primary"
              onClick={() => handleClockAction('in')}
              disabled={clockStatus.clockedIn}
              type="button"
            >
              Clock in
            </button>
            <button
              className="danger"
              onClick={() => handleClockAction('out')}
              disabled={!clockStatus.clockedIn}
              type="button"
            >
              Clock out
            </button>
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
                <p className="card-subtitle">{weekRangeLabel}</p>
              </div>
              <button
                type="button"
                className="ghost with-icon"
                onClick={() => setShowSettings(true)}
              >
                <FontAwesomeIcon icon={faGear} className="icon" fixedWidth aria-hidden="true" />
                Settings
              </button>
            </div>
            <div className="week-stats">
              <div className="stat-card">
                <span className="stat-label">Week total</span>
                <span className="stat-value">{weekStats.totalHours.toFixed(2)}h</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Avg/day</span>
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
                ? `Events of ${formatDateLabel(selectedEvents.date)}`
                : 'Events'}
            </h2>
            <p className="card-subtitle">Review and remove clock history for the week.</p>
          </div>
          <div className="events-actions">
            <button
              type="button"
              className="primary with-icon"
              onClick={() => setIsManualOpen(true)}
            >
              <FontAwesomeIcon icon={faPlus} className="icon" aria-hidden="true" />
              Add manual event
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
                        <FontAwesomeIcon icon={faTrash} className="icon" fixedWidth aria-hidden="true" />
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
                <p className="card-subtitle">Update your weekly graph defaults.</p>
              </div>
              <button type="button" className="ghost with-icon" onClick={() => setShowSettings(false)}>
                <FontAwesomeIcon icon={faXmark} className="icon" fixedWidth aria-hidden="true" />
                Close
              </button>
            </div>
            <div className="settings-grid">
              <label>
                Target hours/day
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
                Hours shown
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
          </div>
        </div>
      )}

      {isManualOpen && (
        <div className="modal-backdrop" onClick={() => setIsManualOpen(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>Add manual event</h2>
                <p className="card-subtitle">Manual events can only be in the past.</p>
              </div>
              <button type="button" className="ghost with-icon" onClick={() => setIsManualOpen(false)}>
                <FontAwesomeIcon icon={faXmark} className="icon" aria-hidden="true" />
              </button>
            </div>
            <form className="manual-form" onSubmit={handleManualSubmit}>
              <label>
                Type
                <select name="type" value={manualForm.type} onChange={handleManualChange}>
                  <option value="IN">Clock in</option>
                  <option value="OUT">Clock out</option>
                </select>
              </label>
              <label>
                When
                <input
                  type="datetime-local"
                  name="occurredAt"
                  value={manualForm.occurredAt}
                  onChange={handleManualChange}
                  max={toLocalDateTimeInputValue(new Date())}
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
