// Personal-use example. Anyone who can invoke a publicly deployed URL can replace these sheet contents.
// Restrict deployment access and do not share the URL with untrusted people.
const ATTENDANCE_SHEET_NAME = '출퇴근기록';
const CALENDAR_SHEET_NAME = '일정';
const SETTINGS_SHEET_NAME = '설정';

function doGet(e) {
  const action = e && e.parameter && e.parameter.action;
  if (action !== 'ping') return json_({ ok: false, error: '지원하지 않는 요청입니다.' });
  return json_({ ok: true, service: '지각대장 Google Sheets 연동' });
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (body.action !== 'sync' || !body.payload) throw new Error('동기화 요청 형식이 올바르지 않습니다.');
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) throw new Error('이 Apps Script를 스프레드시트에 연결한 뒤 배포하세요.');
    const payload = body.payload;
    writeTable_(ss, ATTENDANCE_SHEET_NAME,
      ['기록 ID', '직원', '출근 시각', '출근 IP', '퇴근 시각', '퇴근 IP', '근무 분', '기준 출근', '지각 분', '과금 금액', '분당 과금'],
      (payload.records || []).map(r => [r.id || '', r.name || '', r.datetime || '', r.checkinIp || '', r.checkoutDatetime || '', r.checkoutIp || '', durationMinutes_(r), r.startTime || '', Number(r.late) || 0, Number(r.fee) || 0, Number(r.feePerMinute) || 0]));
    writeTable_(ss, CALENDAR_SHEET_NAME,
      ['일정 ID', '제목', '날짜', '종일', '시작', '종료', '분류', '반복', '메모'],
      (payload.calendarEvents || []).map(e => [e.id || '', e.title || '', e.date || '', !!e.allDay, e.startTime || '', e.endTime || '', e.category || '', e.repeat || '', e.notes || '']));
    const settings = payload.settings || {};
    writeTable_(ss, SETTINGS_SHEET_NAME, ['항목', '값'], [
      ['기본 출근시간', settings.startTime || ''],
      ['분당 과금액', Number(settings.feePerMinute) || 0],
      ['직원 명단', (settings.employees || []).join(', ')],
      ['동기화 시각', new Date().toISOString()]
    ]);
    return json_({ ok: true, syncedAt: new Date().toISOString(), recordCount: (payload.records || []).length });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function writeTable_(ss, name, headers, rows) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  sheet.clearContents();
  const values = [headers].concat(rows);
  sheet.getRange(1, 1, values.length, headers.length).setValues(values);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  sheet.autoResizeColumns(1, headers.length);
}

function durationMinutes_(record) {
  if (!record.checkoutDatetime || !record.datetime) return '';
  const start = new Date(record.datetime).getTime();
  const end = new Date(record.checkoutDatetime).getTime();
  return Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, Math.floor((end - start) / 60000)) : '';
}

function json_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
