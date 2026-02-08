import { useEffect, useMemo, useState } from 'react';
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

export default function App() {
  const [clockStatus, setClockStatus] = useState({ clockedIn: false, lastEvent: null });
  const [weekSummary, setWeekSummary] = useState([]);
  const [events, setEvents] = useState([]);
  const [weekRange, setWeekRange] = useState(getWeekRange(new Date()));
  const [status, setStatus] = useState('');
  const [manualForm, setManualForm] = useState({
    type: 'IN',
    occurredAt: ''
  });

  const weekRangeLabel = useMemo(() => {
    const startLabel = formatDateLabel(weekRange.start);
    const endLabel = formatDateLabel(weekRange.end);
    return `${startLabel} — ${endLabel}`;
  }, [weekRange]);

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

  useEffect(() => {
    const range = getWeekRange(new Date());
    setWeekRange(range);
    loadWeek(range);
  }, []);

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
              ? `Last event: ${clockStatus.lastEvent.type === 'IN' ? 'Clock in' : 'Clock out'} · ${formatDateLabel(
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
              className="ghost"
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

      <section className="card week-card">
        <div className="card-header">
          <div>
            <h2>This week</h2>
            <p className="card-subtitle">{weekRangeLabel}</p>
          </div>
          <span className="count">{weekSummary.length} days</span>
        </div>
        <div className="week-grid">
          {weekSummary.map((day) => (
            <article key={day.date} className="day-tile">
              <p className="day-name">{formatDateLabel(day.date)}</p>
              <p className="day-hours">{day.totalHours.toFixed(2)}h</p>
              <p className="day-minutes">{day.totalMinutes} minutes</p>
            </article>
          ))}
        </div>
      </section>

      <section className="card manual-card">
        <div className="card-header">
          <div>
            <h2>Add manual event</h2>
            <p className="card-subtitle">Manual events can only be in the past.</p>
          </div>
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
          <button type="submit">Add event</button>
        </form>
      </section>

      <section className="card">
        <div className="card-header">
          <div>
            <h2>Events</h2>
            <p className="card-subtitle">Review and remove clock history for the week.</p>
          </div>
          <span className="count">{events.length} total</span>
        </div>
        {groupedEvents.length === 0 ? (
          <p className="empty-state">No events logged yet.</p>
        ) : (
          <div className="events-grid">
            {groupedEvents.map((group) => (
              <div key={group.date} className="events-day">
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
                        className="ghost"
                        type="button"
                        onClick={() => handleDeleteEvent(event.id)}
                      >
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
    </div>
  );
}
