import { useEffect, useState } from 'react';
import './App.css';

const emptyForm = {
  description: '',
  hours: ''
};

export default function App() {
  const [entries, setEntries] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [status, setStatus] = useState('');

  const loadEntries = async () => {
    const response = await fetch('/api/entries');
    const data = await response.json();
    setEntries(data);
  };

  useEffect(() => {
    loadEntries();
  }, []);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setStatus('Saving...');

    const response = await fetch('/api/entries', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        description: form.description,
        hours: Number(form.hours)
      })
    });

    if (!response.ok) {
      setStatus('Something went wrong.');
      return;
    }

    setStatus('Saved!');
    setForm(emptyForm);
    await loadEntries();
  };

  return (
    <div className="page">
      <header className="hero">
        <p className="eyebrow">Local-first setup</p>
        <h1>Hour Management</h1>
        <p className="subhead">
          Track work entries locally with React + Express + SQLite. Add a new entry
          below to see the REST flow in action.
        </p>
      </header>

      <section className="card">
        <h2>Add entry</h2>
        <form className="entry-form" onSubmit={handleSubmit}>
          <label>
            Description
            <input
              name="description"
              value={form.description}
              onChange={handleChange}
              placeholder="Client work, meeting, research"
              required
            />
          </label>
          <label>
            Hours
            <input
              name="hours"
              type="number"
              step="0.25"
              min="0"
              value={form.hours}
              onChange={handleChange}
              placeholder="2.5"
              required
            />
          </label>
          <button type="submit">Save entry</button>
        </form>
        {status && <p className="status">{status}</p>}
      </section>

      <section className="card">
        <div className="card-header">
          <h2>Recent entries</h2>
          <span className="count">{entries.length} total</span>
        </div>
        <ul className="entries">
          {entries.map((entry) => (
            <li key={entry.id}>
              <div>
                <p className="entry-desc">{entry.description}</p>
                <p className="entry-meta">
                  {new Date(entry.createdAt).toLocaleString()}
                </p>
              </div>
              <span className="entry-hours">{entry.hours}h</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
