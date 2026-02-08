import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from '../App.jsx';

const makeResponse = (data, ok = true) =>
  Promise.resolve({
    ok,
    json: () => Promise.resolve(data)
  });

const makeWeekSummary = (startDate) => {
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    const date = day.toISOString().slice(0, 10);
    return {
      date,
      totalHours: 0,
      totalMinutes: 0
    };
  });
};

const toLocalDateTimeInputValue = (date) => {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
};

beforeEach(() => {
  global.fetch = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('App', () => {
  it('disables clock in when already clocked in', async () => {
    const weekSummary = makeWeekSummary(new Date());
    global.fetch
      .mockImplementationOnce(() => makeResponse([]))
      .mockImplementationOnce(() => makeResponse({ days: weekSummary }))
      .mockImplementationOnce(() =>
        makeResponse({
          clockedIn: true,
          lastEvent: { type: 'IN', occurredAt: new Date().toISOString() }
        })
      );

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/clocked in/i)).toBeInTheDocument();
    });

    const clockInButton = screen.getByRole('button', { name: /clock in/i });
    const clockOutButton = screen.getByRole('button', { name: /clock out/i });

    expect(clockInButton).toBeDisabled();
    expect(clockOutButton).not.toBeDisabled();
  });

  it('rejects manual events in the future', async () => {
    const weekSummary = makeWeekSummary(new Date());
    global.fetch
      .mockImplementationOnce(() => makeResponse([]))
      .mockImplementationOnce(() => makeResponse({ days: weekSummary }))
      .mockImplementationOnce(() =>
        makeResponse({
          clockedIn: false,
          lastEvent: null
        })
      );

    render(<App />);

    const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const input = await screen.findByLabelText(/when/i);
    const futureValue = toLocalDateTimeInputValue(futureDate);
    fireEvent.change(input, { target: { value: futureValue } });

    await waitFor(() => {
      expect(input.value).toBe(futureValue);
    });

    const submit = screen.getByRole('button', { name: /add event/i });
    fireEvent.submit(submit.closest('form'));

    expect(await screen.findByText(/manual events must be in the past/i)).toBeInTheDocument();
  });

  it('renders seven day tiles for the week summary', async () => {
    const weekSummary = makeWeekSummary(new Date());
    global.fetch
      .mockImplementationOnce(() => makeResponse([]))
      .mockImplementationOnce(() => makeResponse({ days: weekSummary }))
      .mockImplementationOnce(() =>
        makeResponse({
          clockedIn: false,
          lastEvent: null
        })
      );

    const { container } = render(<App />);

    await waitFor(() => {
      expect(container.querySelectorAll('.day-tile').length).toBe(7);
    });
  });

  it('calls the delete endpoint for events', async () => {
    const weekSummary = makeWeekSummary(new Date());
    const event = {
      id: 1,
      type: 'IN',
      occurredAt: new Date().toISOString()
    };

    global.fetch
      .mockImplementationOnce(() => makeResponse([event]))
      .mockImplementationOnce(() => makeResponse({ days: weekSummary }))
      .mockImplementationOnce(() =>
        makeResponse({
          clockedIn: true,
          lastEvent: event
        })
      )
      .mockImplementationOnce(() =>
        makeResponse({
          willChangeStatus: false,
          currentStatus: 'IN',
          nextStatus: 'IN'
        })
      )
      .mockImplementationOnce(() => makeResponse({}))
      .mockImplementationOnce(() => makeResponse([]))
      .mockImplementationOnce(() => makeResponse({ days: weekSummary }))
      .mockImplementationOnce(() =>
        makeResponse({
          clockedIn: true,
          lastEvent: event
        })
      );

    render(<App />);

    const deleteButton = await screen.findByRole('button', { name: /delete/i });
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/clock-events/1/impact'
      );
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/clock-events/1',
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });
});
