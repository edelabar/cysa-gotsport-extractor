(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.RegistrationExtractor = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const IDENTITY_HEADERS = ['Last Name', 'First Name', 'Birth Year', 'Contact Email', 'Phone', 'Age Group', 'CYSA Group'];
  const BASE_OUTPUT_HEADERS = [...IDENTITY_HEADERS, 'Needs Jersey', 'Jersey Size'];
  const lotteryTicketHeaders = [...IDENTITY_HEADERS, 'Needs Lottery Ticket'];

  const field = {
    jerseySize: 'Jersey Size - Please select a size regardless of if you need a new jersey.',
    jerseyNumber: 'Jersey Number - If you have an existing Jersey number please enter it here. If not please leave it blank. We cannot guarantee Jersey numbers but we do our best.',
    existingJersey: 'Select "1" if you have a Jersey Quantity',
  };

  function text(value) { return value == null ? '' : String(value); }

  function formatUSPhone(value) {
    const original = text(value);
    const digits = original.replace(/\D/g, '');
    const number = digits.length === 11 && digits[0] === '1' ? digits.slice(1) : digits;
    return number.length === 10 ? `(${number.slice(0, 3)}) ${number.slice(3, 6)}-${number.slice(6)}` : original;
  }

  function isMoreThanOne(value) { return Number(text(value).trim()) > 1; }
  function includes(value, word) { return text(value).toLowerCase().includes(word.toLowerCase()); }

  function seasonStatus(season) {
    return season === 'Spring' || season === 'Fall'
      ? { ready: true }
      : { ready: false, message: 'Choose Spring or Fall.' };
  }

  function defaultSeasonForMonth(monthIndex) {
    return monthIndex >= 0 && monthIndex <= 4 ? 'Spring' : 'Fall';
  }

  function extractExportTimestamp(filename) {
    const match = text(filename).match(/(\d{8}T\d{6})(?:\.csv)?$/i);
    if (!match) return null;
    const stamp = match[1];
    return {
      stamp,
      display: `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)} ${stamp.slice(9, 11)}:${stamp.slice(11, 13)}:${stamp.slice(13, 15)}`,
    };
  }

  function outputHeadersForSeason(season) {
    return season === 'Spring'
      ? [...BASE_OUTPUT_HEADERS, 'Requested Number']
      : [...BASE_OUTPUT_HEADERS];
  }

  function splitRowsByCYSAGroup(rows) {
    return {
      U6: rows.filter((row) => row.CYSAGroup === 'U6'),
      Rec: rows.filter((row) => row.CYSAGroup === 'Rec'),
    };
  }

  function extractFallLotteryTicketRows(rows) {
    return rows.filter((source) => text(source['Fall Fundraiser Opt-in Quantity']).trim() === '1').map((source) => {
      const isU6 = includes(source['Payment Plan'], 'U6');
      return {
        'Last Name': text(source['Last Name']),
        'First Name': text(source['First Name']),
        'Birth Year': text(source['Birth Year']),
        'Contact Email': text(source['Contact Email']),
        Phone: formatUSPhone(source.Phone),
        'Age Group': text(source['Age Group']),
        'CYSA Group': isU6 ? 'U6' : 'Rec',
        'Needs Lottery Ticket': 'Yes',
      };
    }).sort((a, b) => {
      const group = (a['CYSA Group'] === 'U6' ? 0 : 1) - (b['CYSA Group'] === 'U6' ? 0 : 1);
      if (group) return group;
      const year = Number(b['Birth Year']) - Number(a['Birth Year']);
      if (year) return year;
      const last = a['Last Name'].localeCompare(b['Last Name'], undefined, { sensitivity: 'base' });
      return last || a['First Name'].localeCompare(b['First Name'], undefined, { sensitivity: 'base' });
    });
  }

  function transformRows(rows, season = 'Spring') {
    return rows.map((source) => {
      const paymentPlan = text(source['Payment Plan']);
      const isFree = includes(paymentPlan, 'Free');
      const isU6 = includes(paymentPlan, 'U6');
      const needsJersey = season === 'Fall'
        ? isU6 || text(source[field.existingJersey]).trim() !== '1'
        : isFree
        ? isU6 || isMoreThanOne(source['New Jersey Quantity'])
        : text(source[field.existingJersey]).trim() !== '1';
      if (!needsJersey) return null;

      const jerseySize = text(source[field.jerseySize]);
      const result = {
        'Last Name': text(source['Last Name']),
        'First Name': text(source['First Name']),
        'Birth Year': text(source['Birth Year']),
        'Contact Email': text(source['Contact Email']),
        Phone: formatUSPhone(source.Phone),
        'Age Group': text(source['Age Group']),
        CYSAGroup: isU6 ? 'U6' : 'Rec',
        NeedsJersey: needsJersey ? 'Yes' : 'No',
        JerseySize: needsJersey ? (jerseySize || 'Not Specified') : '',
      };
      if (season === 'Spring') result.RequestedNumber = text(source[field.jerseyNumber]);
      return result;
    }).filter(Boolean).sort(compareRows);
  }

  function compareRows(a, b) {
    const group = (a.CYSAGroup === 'U6' ? 0 : 1) - (b.CYSAGroup === 'U6' ? 0 : 1);
    if (group) return group;
    const year = Number(b['Birth Year']) - Number(a['Birth Year']);
    if (year) return year;
    const last = a['Last Name'].localeCompare(b['Last Name'], undefined, { sensitivity: 'base' });
    return last || a['First Name'].localeCompare(b['First Name'], undefined, { sensitivity: 'base' });
  }

  function toOutputRow(row, season = 'Spring') {
    const output = {
      'Last Name': row['Last Name'], 'First Name': row['First Name'], 'Birth Year': row['Birth Year'],
      'Contact Email': row['Contact Email'], Phone: row.Phone, 'Age Group': row['Age Group'],
      'CYSA Group': row.CYSAGroup, 'Needs Jersey': row.NeedsJersey, 'Jersey Size': row.JerseySize,
    };
    if (season === 'Spring') output['Requested Number'] = row.RequestedNumber;
    return output;
  }

  return { defaultSeasonForMonth, extractExportTimestamp, extractFallLotteryTicketRows, formatUSPhone, lotteryTicketHeaders, outputHeadersForSeason, seasonStatus, splitRowsByCYSAGroup, transformRows, toOutputRow };
});
