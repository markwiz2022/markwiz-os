import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyClockIn, DEFAULT_OFFICE, distanceMetres, splitWorkDays, validPosition } from '../lib/geo';
import { leaveBalance } from '../lib/leave';

const O = DEFAULT_OFFICE;

test('office: inside Novel Office is OFFICE, a few km away is WFH, no location is WFH', () => {
  assert.equal(classifyClockIn({ lat: O.lat + 0.0005, lng: O.lng, accuracy: 20 }, O).mode, 'OFFICE', '~55 m away');
  const home = classifyClockIn({ lat: 12.9716, lng: 77.6412, accuracy: 15 }, O); // Indiranagar
  assert.equal(home.mode, 'WFH');
  assert.ok(home.distanceM! > 5000 && home.reason.includes('km'));
  assert.equal(classifyClockIn(null, O).mode, 'WFH');
  assert.equal(classifyClockIn(null, O).reason, 'Location not shared');
});

test('office: location accuracy helps a little, but not more than 200 m', () => {
  const p = { lat: O.lat + 0.0025, lng: O.lng }; // ~278 m north
  assert.equal(classifyClockIn({ ...p, accuracy: 10 }, O).mode, 'WFH');
  assert.equal(classifyClockIn({ ...p, accuracy: 150 }, O).mode, 'OFFICE');
  assert.equal(classifyClockIn({ lat: O.lat + 0.0045, lng: O.lng, accuracy: 5000 }, O).mode, 'WFH', '~500 m with very poor accuracy is still WFH');
  assert.ok(Math.abs(distanceMetres(O.lat, O.lng, O.lat + 0.001, O.lng) - 111) < 2);
});

test('office: bad positions are ignored', () => {
  assert.equal(validPosition({ lat: '12', lng: 77 }), null);
  assert.equal(validPosition({ lat: 120, lng: 77 }), null);
  assert.equal(validPosition(null), null);
  assert.deepEqual(validPosition({ lat: 12.9, lng: 77.6, accuracy: -1 }), { lat: 12.9, lng: 77.6, accuracy: null });
});

test('WFH days: a day with any office clock-in is an office day', () => {
  const r = splitWorkDays([
    { dayKey: '2026-11-02', workMode: 'WFH' }, { dayKey: '2026-11-02', workMode: 'OFFICE' },
    { dayKey: '2026-11-03', workMode: 'WFH' }, { dayKey: '2026-11-04', workMode: null },
  ]);
  assert.deepEqual([...r.wfh], ['2026-11-03']);
  assert.equal(r.office.size, 2);
});

test('leave balance: pending days are held so nobody can over-book', () => {
  assert.deepEqual(leaveBalance({ leaveQuota: 12, leavesTaken: 4 }, 3), { total: 12, taken: 4, pending: 3, left: 8, canBook: 5 });
  assert.equal(leaveBalance({ leaveQuota: 2, leavesTaken: 5 }).left, 0, 'never negative');
});
