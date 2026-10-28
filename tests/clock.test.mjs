import test from 'node:test';
import assert from 'node:assert/strict';
import { clockContext, clockAnswer } from '../netlify/lib/clock.mjs';

test('Vietnam calendar crosses midnight, weekday and year independently of UTC', () => {
  const clock = clockContext(new Date('2026-12-31T17:00:01Z'));
  assert.equal(clock.time, '00:00:01');
  assert.match(clock.date, /Thứ Sáu, 01\/01\/2027/);
  assert.match(clock.yesterday, /31\/12\/2026/);
  assert.match(clock.tomorrow, /02\/01\/2027/);
});

test('leap day and relative dates come from the calendar', () => {
  const clock = clockContext(new Date('2028-02-28T17:00:00Z'));
  assert.match(clock.date, /29\/02\/2028/);
  assert.match(clock.tomorrow, /01\/03\/2028/);
});

test('common standalone questions receive deterministic time with explicit timezone', () => {
  const clock = clockContext(new Date('2026-10-25T17:45:00Z'));
  for (const question of ['Hôm nay thứ mấy?', 'Hôm nay là ngày bao nhiêu?', 'Bây giờ là mấy giờ?', 'Mấy giờ rồi?', 'Hôm nay ngày mấy tháng mấy năm mấy?', 'Hôm nay là thứ mấy ngày mấy tháng mấy năm bao nhiêu?']) {
    const answer = clockAnswer(question, clock);
    assert.ok(answer, question);
    assert.match(answer, /00:45:00/);
    assert.match(answer, /Thứ Hai, 26\/10\/2026/);
    assert.match(answer, /UTC\+07:00/);
  }
  assert.match(clockAnswer('Ngày mai là thứ mấy?', clock), /27\/10\/2026/);
});

test('mixed tasks, other locations and lunar dates are not intercepted', () => {
  const clock = clockContext();
  for (const question of ['Bây giờ ở Mỹ là mấy giờ?', 'Hôm nay là ngày mấy âm lịch?', 'Hôm nay thứ mấy? Viết bài phân tích Tây Tiến.', 'Dịch câu "Hôm nay thứ mấy?" sang tiếng Anh', 'Ngày 1/1/2000 là thứ mấy?']) {
    assert.equal(clockAnswer(question, clock), null, question);
  }
});
