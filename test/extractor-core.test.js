const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const { defaultSeasonForMonth, extractExportTimestamp, extractFallLotteryTicketRows, lotteryTicketHeaders, splitRowsByCYSAGroup, transformRows, formatUSPhone, outputHeadersForSeason, seasonStatus } = require('../extractor-core.js');

test('extracts the GotSport export timestamp from a CSV filename', () => {
  assert.deepEqual(extractExportTimestamp('program-registrations-20260309T163022.csv'), {
    stamp: '20260309T163022', display: '2026-03-09 16:30:22',
  });
  assert.equal(extractExportTimestamp('registrations.csv'), null);
});

test('Fall lottery export includes opted-in players regardless of jersey need', () => {
  const rows = extractFallLotteryTicketRows([{ ...base, 'Payment Plan': 'Fall Rec', 'Select "1" if you have a Jersey Quantity': '1', 'Fall Fundraiser Opt-in Quantity': '1' }]);
  assert.deepEqual(lotteryTicketHeaders, ['Last Name', 'First Name', 'Birth Year', 'Contact Email', 'Phone', 'Age Group', 'CYSA Group', 'Needs Lottery Ticket']);
  assert.deepEqual(rows, [{
    'Last Name': 'Smith', 'First Name': 'Sam', 'Birth Year': '2015', 'Contact Email': 'sam@example.com',
    Phone: '(484) 555-1234', 'Age Group': 'U11', 'CYSA Group': 'Rec', 'Needs Lottery Ticket': 'Yes',
  }]);
});

test('handoff page contains dedicated U6 and Rec result tables', () => {
  const page = fs.readFileSync(require.resolve('../CYSA-GotSport-Extractor.html'), 'utf8');
  assert.match(page, /id="u6-table"/);
  assert.match(page, /id="rec-table"/);
});

test('handoff page includes instructions for downloading the GotSport CSV', () => {
  const page = fs.readFileSync(require.resolve('../CYSA-GotSport-Extractor.html'), 'utf8');
  assert.match(page, /How to get the GotSport CSV:/);
  assert.match(page, /Programs &gt; Program Registrations/);
  assert.match(page, /Completed and Submitted/);
  assert.match(page, /Download as CSV/);
});

test('instructions are open initially and close after reports render', () => {
  const page = fs.readFileSync(require.resolve('../CYSA-GotSport-Extractor.html'), 'utf8');
  assert.match(page, /<details id="instructions" class="instructions" open>/);
  assert.match(page, /How to get the GotSport CSV:/);
  assert.match(page, /\$\('instructions'\)\.open = false/);
});

test('splits processed rows into separate U6 and Rec exports', () => {
  const groups = splitRowsByCYSAGroup([
    { CYSAGroup: 'Rec', 'Last Name': 'Rec Player' },
    { CYSAGroup: 'U6', 'Last Name': 'U6 Player' },
  ]);
  assert.deepEqual(groups.U6.map((row) => row['Last Name']), ['U6 Player']);
  assert.deepEqual(groups.Rec.map((row) => row['Last Name']), ['Rec Player']);
});

test('defaults January through May to Spring and June through December to Fall', () => {
  assert.equal(defaultSeasonForMonth(0), 'Spring');
  assert.equal(defaultSeasonForMonth(4), 'Spring');
  assert.equal(defaultSeasonForMonth(5), 'Fall');
  assert.equal(defaultSeasonForMonth(11), 'Fall');
});

test('allows Spring and Fall processing', () => {
  assert.deepEqual(seasonStatus('Spring'), { ready: true });
  assert.deepEqual(seasonStatus('Fall'), { ready: true });
});

const base = {
  'Last Name': 'Smith',
  'First Name': 'Sam',
  'Birth Year': '2015',
  'Contact Email': 'sam@example.com',
  Phone: '+14845551234',
  'Age Group': 'U11',
  'Payment Plan': 'Standard Rec',
  'New Jersey Quantity': '0',
  'New Shorts Quantity': '0',
  'Select "1" if you have a Jersey Quantity': '1',
  'Select "1" if you have a pair of Shorts Quantity': '1',
  'Jersey Size - Please select a size regardless of if you need a new jersey.': 'Youth Medium',
  'Jersey Number - If you have an existing Jersey number please enter it here. If not please leave it blank. We cannot guarantee Jersey numbers but we do our best.': '27',
  'Short Size - Please select a size regardless of if you need new shorts.': 'Youth Large',
};

test('uses a Spring-only Requested Number output column', () => {
  assert.deepEqual(outputHeadersForSeason('Spring'), [
    'Last Name', 'First Name', 'Birth Year', 'Contact Email', 'Phone', 'Age Group',
    'CYSA Group', 'Needs Jersey', 'Jersey Size', 'Requested Number',
  ]);
  assert.deepEqual(outputHeadersForSeason('Fall'), [
    'Last Name', 'First Name', 'Birth Year', 'Contact Email', 'Phone', 'Age Group',
    'CYSA Group', 'Needs Jersey', 'Jersey Size',
  ]);
});

test('includes non-Free registrant needing a jersey and preserves their row data', () => {
  const results = transformRows([{ ...base, 'Select "1" if you have a Jersey Quantity': '0' }]);
  assert.deepEqual(results, [{
    'Last Name': 'Smith', 'First Name': 'Sam', 'Birth Year': '2015', 'Contact Email': 'sam@example.com',
    Phone: '(484) 555-1234', 'Age Group': 'U11', CYSAGroup: 'Rec', NeedsJersey: 'Yes',
    JerseySize: 'Youth Medium', RequestedNumber: '27',
  }]);
});

test('excludes a non-Free registrant who needs no jersey', () => {
  assert.deepEqual(transformRows([base]), []);
});

test('Free plan requires a jersey quantity above one, except U6 always needs a jersey', () => {
  const rows = transformRows([
    { ...base, 'Last Name': 'Free', 'Payment Plan': 'Free Spring Rec', 'New Jersey Quantity': '2', 'New Shorts Quantity': '1' },
    { ...base, 'Last Name': 'U6', 'Payment Plan': 'Free Spring U6', 'New Jersey Quantity': '0', 'New Shorts Quantity': '0', 'Jersey Size - Please select a size regardless of if you need a new jersey.': '' },
  ]);
  assert.equal(rows.length, 2);
  const freeRec = rows.find((row) => row['Last Name'] === 'Free');
  const freeU6 = rows.find((row) => row['Last Name'] === 'U6');
  assert.equal(freeRec.NeedsJersey, 'Yes');
  assert.equal(freeU6.CYSAGroup, 'U6');
  assert.equal(freeU6.NeedsJersey, 'Yes');
  assert.equal(freeU6.JerseySize, 'Not Specified');
});

test('does not include a player who only needs shorts', () => {
  const rows = transformRows([{ ...base, 'Payment Plan': 'Standard Rec', 'Select "1" if you have a Jersey Quantity': '1', 'Select "1" if you have a pair of Shorts Quantity': '0' }]);
  assert.deepEqual(rows, []);
});

test('Fall includes U6 players even when they already have a jersey', () => {
  const rows = transformRows([{ ...base, 'Payment Plan': 'Fall U6', 'Select "1" if you have a Jersey Quantity': '1' }], 'Fall');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].CYSAGroup, 'U6');
  assert.equal(rows[0].NeedsJersey, 'Yes');
  assert.equal(Object.hasOwn(rows[0], 'RequestedNumber'), false);
});

test('Spring does not include a non-Free U6 player who already has a jersey', () => {
  const rows = transformRows([{ ...base, 'Payment Plan': 'Spring U6', 'Select "1" if you have a Jersey Quantity': '1' }], 'Spring');
  assert.deepEqual(rows, []);
});

test('sorts U6 then Rec, newest birth year first, then last and first name', () => {
  const rows = transformRows([
    { ...base, 'Last Name': 'Zed', 'First Name': 'A', 'Birth Year': '2014', 'Payment Plan': 'Standard Rec', 'Select "1" if you have a Jersey Quantity': '0' },
    { ...base, 'Last Name': 'Able', 'First Name': 'Z', 'Birth Year': '2015', 'Payment Plan': 'Standard Rec', 'Select "1" if you have a Jersey Quantity': '0' },
    { ...base, 'Last Name': 'U', 'First Name': 'One', 'Birth Year': '2020', 'Payment Plan': 'Free Spring U6' },
  ]);
  assert.deepEqual(rows.map((row) => row['Last Name']), ['U', 'Able', 'Zed']);
});

test('formats ten-digit US phone values and leaves other source values unchanged', () => {
  assert.equal(formatUSPhone('+16105551234'), '(610) 555-1234');
  assert.equal(formatUSPhone('610.555.1234'), '(610) 555-1234');
  assert.equal(formatUSPhone('abc'), 'abc');
});
