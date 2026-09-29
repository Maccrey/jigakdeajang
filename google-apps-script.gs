// Install this script in your own Google spreadsheet and deploy it as a web app.
// The public client ID is sent by the site and checked against Google's signed token.
const ATTENDANCE_SHEET_NAME = '지각대장_출퇴근기록';
const CALENDAR_SHEET_NAME = '지각대장_일정';
const SETTINGS_SHEET_NAME = '지각대장_설정';
const SPREADSHEET_ID_KEY = 'JIGAK_SPREADSHEET_ID';

function doGet(e) {
  if (!e || !e.parameter || e.parameter.action !== 'ping') {
    return json_({ ok: false, error: '지원하지 않는 요청입니다.' });
  }
  try {
    authorizeOwner_(e.parameter.idToken, e.parameter.clientId);
    return json_({ ok: true, service: '지각대장 개인 Google Sheets 연동' });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function doPost(e) {
  try {
    const formRequest = e && e.parameter && e.parameter.request;
    const rawBody = (e && e.postData && e.postData.contents) || '{}';
    const body = JSON.parse(formRequest || rawBody);
    const claims = authorizeOwner_(body.idToken, body.clientId);
    if (body.action === 'ping') {
      return json_({ ok: true, service: '지각대장 개인 Google Sheets 연동', email: claims.email });
    }
    if (body.action !== 'sync' || !body.payload) throw new Error('동기화 요청 형식이 올바르지 않습니다.');

    const spreadsheetId = PropertiesService.getScriptProperties().getProperty(SPREADSHEET_ID_KEY);
    if (!spreadsheetId) throw new Error('Apps Script 프로젝트 설정의 스크립트 속성에 JIGAK_SPREADSHEET_ID를 입력해 주세요.');
    const ss = SpreadsheetApp.openById(spreadsheetId);
    const payload = body.payload;
    writeTable_(ss, ATTENDANCE_SHEET_NAME,
      ['기록 ID', '직원', '출근 시각', '출근 IP', '퇴근 시각', '퇴근 IP', '근무 분', '기준 출근', '지각 분', '과금 금액', '분당 과금'],
      (payload.records || []).map(r => [r.id || '', r.name || '', r.datetime || '', r.checkinIp || '', r.checkoutDatetime || '', r.checkoutIp || '', durationMinutes_(r), r.startTime || '', Number(r.late) || 0, Number(r.fee) || 0, Number(r.feePerMinute) || 0]));
    writeTable_(ss, CALENDAR_SHEET_NAME,
      ['일정 ID', '제목', '날짜', '종일', '시작', '종료', '분류', '반복', '메모'],
      (payload.calendarEvents || []).map(item => [item.id || '', item.title || '', item.date || '', !!item.allDay, item.startTime || '', item.endTime || '', item.category || '', item.repeat || '', item.notes || '']));
    const settings = payload.settings || {};
    const syncedAt = new Date().toISOString();
    writeTable_(ss, SETTINGS_SHEET_NAME, ['항목', '값'], [
      ['Google 계정', claims.email],
      ['기본 출근시간', settings.startTime || ''],
      ['분당 과금액', Number(settings.feePerMinute) || 0],
      ['직원 명단', (settings.employees || []).join(', ')],
      ['동기화 시각', syncedAt]
    ]);
    return json_({ ok: true, syncedAt, recordCount: (payload.records || []).length });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function authorizeOwner_(idToken, clientId) {
  if (!clientId || !/^[\w.-]+\.apps\.googleusercontent\.com$/.test(clientId)) {
    throw new Error('사이트 OAuth 클라이언트 정보가 없습니다.');
  }
  if (!idToken || typeof idToken !== 'string' || idToken.length > 10000) {
    throw new Error('Google 로그인이 필요합니다.');
  }
  const response = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken), {
    method: 'get', muteHttpExceptions: true
  });
  if (response.getResponseCode() !== 200) throw new Error('Google 로그인 토큰이 유효하지 않습니다. 다시 로그인해 주세요.');
  const claims = JSON.parse(response.getContentText());
  const now = Math.floor(Date.now() / 1000);
  const issuerOk = claims.iss === 'accounts.google.com' || claims.iss === 'https://accounts.google.com';
  const ownerEmail = Session.getEffectiveUser().getEmail().trim().toLowerCase();
  const signedInEmail = String(claims.email || '').trim().toLowerCase();
  if (!issuerOk || claims.aud !== clientId || !claims.sub || Number(claims.exp) <= now ||
      String(claims.email_verified) !== 'true' || !ownerEmail || signedInEmail !== ownerEmail) {
    throw new Error('이 Apps Script와 연결된 시트 소유자의 Google 계정으로 로그인해 주세요.');
  }
  return claims;
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

function setupSpreadsheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('대상 Google 스프레드시트에서 확장 프로그램 → Apps Script로 이 함수를 실행해 주세요.');
  PropertiesService.getScriptProperties().setProperty(SPREADSHEET_ID_KEY, ss.getId());
  // Request the external-request scope during owner setup, before web deployment.
  UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=invalid', { muteHttpExceptions: true });
  Session.getEffectiveUser().getEmail();
  ss.getSheets();
  return ss.getId();
}

function requestOwnerEmailAuthorization_() {
  return Session.getEffectiveUser().getEmail();
}
