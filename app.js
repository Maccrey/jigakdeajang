const STORAGE_KEY='latebook_records_v2', SETTINGS_KEY='latebook_settings_v3', CALENDAR_KEY='latebook_calendar_v1', EMPLOYEE_LOCK_KEY='latebook_employee_lock_v1';
const LEGACY_SETTINGS_KEY='latebook_settings_v2', SHEETS_URL_KEY='latebook_sheets_url_v1';
const COLORS=['#4f7bd9','#ff7b7f','#ffbb61','#65c889','#9b7ae6','#f06ea8','#66b7d6','#f09f53','#7a9be6','#d67676'];
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)], money=n=>Number(n||0).toLocaleString('ko-KR')+'원', pad=n=>String(n).padStart(2,'0');
const defaultSettings={startTime:'09:00',feePerMinute:1000,employees:[]};
let settings=loadSettings();
let records=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');
let calendarEvents=JSON.parse(localStorage.getItem(CALENDAR_KEY)||'[]');
let referenceNow=new Date();

function loadSettings(){
  const current=JSON.parse(localStorage.getItem(SETTINGS_KEY)||'null');
  if(current) return {...defaultSettings,...current,employees:Array.isArray(current.employees)?current.employees:[]};
  const legacy=JSON.parse(localStorage.getItem(LEGACY_SETTINGS_KEY)||'null');
  if(legacy) return {...defaultSettings,...legacy,employees:[]};
  return {...defaultSettings};
}
async function getReferenceTime(){try{if(location.protocol.startsWith('http')){const r=await fetch(location.href,{method:'HEAD',cache:'no-store'});const d=r.headers.get('date');if(d){$('#timeSource')&&($('#timeSource').textContent='서버 시간');return new Date(d)}}}catch(e){}$('#timeSource')&&($('#timeSource').textContent='기기 시간');return new Date()}
function toLocalInputValue(d){const local=new Date(d.getTime()-d.getTimezoneOffset()*60000);return local.toISOString().slice(0,16)}
function calcLate(date,startTimeOverride){const use=startTimeOverride||settings.startTime||'09:00';const[h,m]=use.split(':').map(Number);const start=new Date(date);start.setHours(h,m,0,0);const diff=Math.floor((new Date(date)-start)/60000);const late=Math.max(0,diff);return{late,fee:late*settings.feePerMinute,usedStartTime:use}}
function sameMonth(a,b){return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()}
function monthRecords(){return records.filter(r=>sameMonth(new Date(r.datetime),referenceNow)).sort((a,b)=>new Date(a.datetime)-new Date(b.datetime))}
function fmtDate(d){return `${d.getMonth()+1}/${d.getDate()}`} function fmtFullDate(d){return `${d.getFullYear()}.${pad(d.getMonth()+1)}.${pad(d.getDate())}`} function fmtTime(d){return `${pad(d.getHours())}:${pad(d.getMinutes())}`}
function esc(s){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
async function getClientIp(){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),4000);try{const response=await fetch('https://api.ipify.org?format=json',{cache:'no-store',mode:'cors',signal:controller.signal});if(!response.ok)throw new Error(`HTTP ${response.status}`);const data=await response.json();return /^([0-9]{1,3}\.){3}[0-9]{1,3}$/.test(data.ip||'')||/^[0-9a-f:]+$/i.test(data.ip||'')?data.ip:null}catch(error){return null}finally{clearTimeout(timer)}}
function requestClientIp(){return getClientIp().catch(()=>null)}
function workMinutes(r){if(!r.checkoutDatetime)return 0;const mins=Math.floor((new Date(r.checkoutDatetime)-new Date(r.datetime))/60000);return Number.isFinite(mins)?Math.max(0,mins):0}
function workLabel(mins){const h=Math.floor(mins/60),m=mins%60;return `${h}시간${m?` ${m}분`:''}`}
function calcStreak(m){if(!m.length)return 0;const days=[...new Map(m.map(r=>[new Date(r.datetime).toDateString(),r])).values()];let s=0;for(let i=days.length-1;i>=0;i--){if(days[i].late>0)s++;else break}return s}
function updateClock(){referenceNow=new Date();const clock=$('#liveClock');if(clock)clock.textContent=`${pad(referenceNow.getHours())}:${pad(referenceNow.getMinutes())}:${pad(referenceNow.getSeconds())}`}


function applyEmployeeLock(){
  const select=$('#nameInput'), lock=$('#employeeLockInput');
  if(!select||!lock)return;
  let saved=null;
  try{saved=JSON.parse(localStorage.getItem(EMPLOYEE_LOCK_KEY)||'null')}catch(e){}
  if(saved?.locked && saved?.name){
    const employeeExists=(settings.employees||[]).includes(saved.name);
    if(!employeeExists){
      localStorage.removeItem(EMPLOYEE_LOCK_KEY);
      lock.checked=false;
      select.disabled=!(settings.employees||[]).length;
      return;
    }
    let option=[...select.options].find(o=>o.value===saved.name);
    if(!option){
      option=document.createElement('option');
      option.value=saved.name;
      option.textContent=saved.name;
      select.appendChild(option);
    }
    select.value=saved.name;
    lock.checked=true;
    select.disabled=true;
    $('#employeeHelp')&&($('#employeeHelp').textContent=`${saved.name} 직원으로 고정되어 있습니다. 변경하려면 체크를 해제하세요.`);
  }else{
    lock.checked=false;
    select.disabled=!(settings.employees||[]).length;
  }
}
function bindEmployeeLock(){
  const select=$('#nameInput'), lock=$('#employeeLockInput');
  if(!select||!lock||lock.dataset.bound==='1')return;
  lock.dataset.bound='1';
  lock.addEventListener('change',()=>{
    if(lock.checked){
      if(!select.value){
        alert('먼저 직원을 선택한 뒤 직원 고정을 체크해 주세요.');
        lock.checked=false;
        return;
      }
      const payload={locked:true,name:select.value};
      localStorage.setItem(EMPLOYEE_LOCK_KEY,JSON.stringify(payload));
      select.disabled=true;
      $('#employeeHelp')&&($('#employeeHelp').textContent=`${select.value} 직원으로 고정되어 있습니다. 변경하려면 체크를 해제하세요.`);
    }else{
      localStorage.removeItem(EMPLOYEE_LOCK_KEY);
      select.disabled=!(settings.employees||[]).length;
      $('#employeeHelp')&&($('#employeeHelp').textContent='체크하면 선택한 직원을 이 브라우저에서 고정합니다.');
    }
  });
}

function applyRuleText(){
  $('#ruleStart')&&($('#ruleStart').textContent=settings.startTime);
  $('#ruleFee')&&($('#ruleFee').textContent=money(settings.feePerMinute));
  $('#ruleEmployees')&&($('#ruleEmployees').textContent=`직원 ${settings.employees.length}명`);
  if($('#appliedStartTime')) $('#appliedStartTime').value=settings.startTime;
  $('#appliedFee')&&($('#appliedFee').textContent=money(settings.feePerMinute));
  $('#usedStartTime')&&($('#usedStartTime').textContent=settings.startTime);
  $('#settingsPreview')&&($('#settingsPreview').textContent=`${settings.startTime}까지 정상 · 이후 1분당 ${money(settings.feePerMinute)}`);
  $('#employeePreview')&&($('#employeePreview').textContent=`등록 직원 ${settings.employees.length}명`);
}
function populateEmployeeSelect(){
  const select=$('#nameInput'); if(!select)return;
  const previous=select.value;
  select.innerHTML='<option value="">직원을 선택하세요</option>';
  settings.employees.forEach(name=>{const o=document.createElement('option');o.value=name;o.textContent=name;select.appendChild(o)});
  const help=$('#employeeHelp');
  if(help) help.textContent=settings.employees.length?`설정에 등록된 직원 ${settings.employees.length}명 중 선택하세요.`:'설정에서 직원명단을 먼저 등록해 주세요.';
  if(previous && settings.employees.includes(previous)) select.value=previous;
  select.disabled=!settings.employees.length;
  applyEmployeeLock();
}
function renderSummary(){const m=monthRecords(),late=m.filter(r=>r.late>0),total=late.reduce((s,r)=>s+r.fee,0),avg=late.length?Math.round(late.reduce((s,r)=>s+r.late,0)/late.length):0,max=late.reduce((a,r)=>!a||r.late>a.late?r:a,null),streak=calcStreak(m),completed=m.filter(r=>r.checkoutDatetime),minutes=completed.reduce((sum,r)=>sum+workMinutes(r),0),longest=completed.reduce((a,r)=>!a||workMinutes(r)>workMinutes(a)?r:a,null);$('#checkoutCount')&&($('#checkoutCount').textContent=`${completed.length}회`);$('#activeShiftCount')&&($('#activeShiftCount').textContent=`${m.filter(r=>!r.checkoutDatetime).length}명`);$('#monthlyFee')&&($('#monthlyFee').textContent=money(total));$('#monthlyCount')&&($('#monthlyCount').textContent=`${late.length}회`);$('#avgLate')&&($('#avgLate').textContent=`${avg}분`);$('#maxLate')&&($('#maxLate').textContent=`${max?.late||0}분`);$('#maxLateDate')&&($('#maxLateDate').textContent=max?fmtFullDate(new Date(max.datetime)):'기록 없음');$('#streakLate')&&($('#streakLate').textContent=`${streak}일`);$('#donutTotal')&&($('#donutTotal').textContent=money(total));$('#monthlyWorkHours')&&($('#monthlyWorkHours').textContent=workLabel(minutes));$('#avgWorkHours')&&($('#avgWorkHours').textContent=workLabel(completed.length?Math.round(minutes/completed.length):0));$('#maxWorkHours')&&($('#maxWorkHours').textContent=longest?workLabel(workMinutes(longest)):'0시간');$('#maxWorkDate')&&($('#maxWorkDate').textContent=longest?`${longest.name} · ${fmtFullDate(new Date(longest.datetime))}`:'기록 없음');$('#recordSummary')&&($('#recordSummary').textContent=`${m.length}건`);renderBars(m);renderDonut(late,total);renderTable(m)}
function renderBars(m){const el=$('#barChart');if(!el)return;el.innerHTML='';const days=new Date(referenceNow.getFullYear(),referenceNow.getMonth()+1,0).getDate(),per={};m.forEach(r=>{const d=new Date(r.datetime).getDate();per[d]=(per[d]||0)+r.fee});const max=Math.max(...Object.values(per),settings.feePerMinute||1000);for(let d=1;d<=days;d++){const val=per[d]||0,item=document.createElement('div');item.className='bar-item';const h=val?Math.max(6,Math.round(val/max*100)):2;item.innerHTML=`<div class="bar ${d===referenceNow.getDate()?'today':''}" style="height:${h}%"></div><span class="bar-label">${d===1||d%5===0||d===referenceNow.getDate()?`${referenceNow.getMonth()+1}/${d}`:''}</span>`;el.appendChild(item)}}
function renderDonut(items,total){const d=$('#donutChart'),l=$('#donutLegend');if(!d||!l)return;l.innerHTML='';if(!items.length||!total){d.style.background='conic-gradient(#ece9e5 0 100%)';l.innerHTML='<div style="color:#999">아직 기록이 없습니다.</div>';return}let acc=0,parts=[];items.slice(-10).forEach((r,i)=>{const pct=r.fee/total*100;parts.push(`${COLORS[i%COLORS.length]} ${acc}% ${acc+pct}%`);acc+=pct;const row=document.createElement('div');row.className='legend-item';row.innerHTML=`<i class="legend-dot" style="background:${COLORS[i%COLORS.length]}"></i><span>${fmtDate(new Date(r.datetime))} · ${r.late}분</span><b>${money(r.fee)}</b>`;l.appendChild(row)});d.style.background=`conic-gradient(${parts.join(',')})`}
function renderTable(m){const body=$('#recordBody');if(!body)return;body.innerHTML='';const rows=[...m].sort((a,b)=>new Date(b.datetime)-new Date(a.datetime));if(!rows.length){body.innerHTML='<tr class="empty-row"><td colspan="11">이번 달 기록이 없습니다.</td></tr>';return}rows.forEach(r=>{const d=new Date(r.datetime),tr=document.createElement('tr');if(r.late>0)tr.className='late-row';tr.innerHTML=`<td>${fmtDate(d)}</td><td>${esc(r.name)}</td><td>${fmtTime(d)}</td><td>${esc(r.checkinIp||'-')}</td><td>${r.checkoutDatetime?fmtTime(new Date(r.checkoutDatetime)):'근무 중'}</td><td>${r.checkoutDatetime?esc(r.checkoutIp||'-'):'-'}</td><td>${r.checkoutDatetime?workLabel(workMinutes(r)):'-'}</td><td>${r.startTime||settings.startTime}</td><td>${r.late}분</td><td>${money(r.fee)}</td><td><button class="delete-btn" data-id="${r.id}">✕</button></td>`;body.appendChild(tr)});$$('.delete-btn').forEach(b=>b.onclick=()=>{records=records.filter(r=>r.id!==b.dataset.id);localStorage.setItem(STORAGE_KEY,JSON.stringify(records));renderSummary()})}
function buildBackupPayload(){return{app:'지각대장',formatVersion:4,exportedAt:new Date().toISOString(),settings:{...defaultSettings,...settings,employees:[...(settings.employees||[])]},records:[...records],calendarEvents:[...calendarEvents]}}
function validateBackupPayload(data){if(!data||typeof data!=='object')throw new Error('백업 파일 형식이 올바르지 않습니다.');if(!data.settings||typeof data.settings!=='object')throw new Error('설정 데이터가 없습니다.');if(!Array.isArray(data.records))throw new Error('출근기록 데이터가 없습니다.');const rs={...defaultSettings,...data.settings};if(typeof rs.startTime!=='string'||!/^\d{2}:\d{2}$/.test(rs.startTime))throw new Error('출근시간 형식이 올바르지 않습니다.');rs.feePerMinute=Number(rs.feePerMinute);if(!Number.isFinite(rs.feePerMinute)||rs.feePerMinute<0)throw new Error('과금요금이 올바르지 않습니다.');rs.employees=Array.isArray(rs.employees)?[...new Set(rs.employees.map(v=>String(v).trim()).filter(Boolean))]:[];const rr=data.records.map((r,i)=>{if(!r||typeof r!=='object')throw new Error(`출근기록 ${i+1}번째 항목이 올바르지 않습니다.`);const d=new Date(r.datetime);if(Number.isNaN(d.getTime()))throw new Error(`출근기록 ${i+1}번째 날짜가 올바르지 않습니다.`);return{...r,id:r.id||`restore-${Date.now()}-${i}`,name:String(r.name||'').trim(),datetime:d.toISOString(),startTime:r.startTime||rs.startTime,feePerMinute:Number(r.feePerMinute??rs.feePerMinute),late:Math.max(0,Number(r.late)||0),fee:Math.max(0,Number(r.fee)||0),checkoutDatetime:r.checkoutDatetime&& !Number.isNaN(new Date(r.checkoutDatetime).getTime())&&new Date(r.checkoutDatetime)>=d?new Date(r.checkoutDatetime).toISOString():null}});const ce=Array.isArray(data.calendarEvents)?data.calendarEvents.map((e,i)=>({...e,id:e.id||`calendar-restore-${Date.now()}-${i}`})):[];return{settings:rs,records:rr,calendarEvents:ce}}
function refreshBackupUi(){$('#backupCount')&&($('#backupCount').textContent=`출퇴근 ${records.length}건 · 퇴근완료 ${records.filter(r=>r.checkoutDatetime).length}건`)}
function updateResult(r){if(!$('#resultBadge'))return;const late=r?.late||0;$('#usedStartTime')&&($('#usedStartTime').textContent=r?.startTime||settings.startTime);$('#lateMinutes').textContent=`${late}분`;$('#lateFee').textContent=money(r?.fee||0);if(!r){$('#resultBadge').className='danger-pill';$('#resultBadge').textContent='출근 전';$('#resultText').textContent='직원을 선택하고 출근 기록을 입력해 주세요.';$('#resultSubtext').textContent=`설정 기준 ${settings.startTime}, 1분당 ${money(settings.feePerMinute)}을 적용합니다.`;$('#quoteText').textContent='“오늘의 1분이 내일의 커피값을 지킨다.”';return}if(late>0){$('#resultBadge').className='danger-pill late';$('#resultBadge').textContent=late>=20?'대형 지각!':'지각입니다!';$('#resultText').textContent=`${r.name}님, ${late}분 지각입니다.`;$('#resultSubtext').textContent=`기준 ${r.startTime} 대비 ${money(r.fee)} 과금입니다.`;$('#quoteText').textContent=late>=20?'“시간은 금이야… 그래서 오늘도 금을 냈군요!”':'“내일은 1분만 더 빨리!”'}else{$('#resultBadge').className='danger-pill safe';$('#resultBadge').textContent='세이프!';$('#resultText').textContent=`${r.name}님, 정시 출근 성공!`;$('#resultSubtext').textContent=`기준 출근시간 ${r.startTime} 안에 도착했어요.`;$('#quoteText').textContent='“오늘의 승리: 지각비 0원!”'}}
function localDateKey(d){const x=new Date(d);return `${x.getFullYear()}-${pad(x.getMonth()+1)}-${pad(x.getDate())}`}
function bind(){
  const checkoutSelect=$('#checkoutName'),checkoutInput=$('#checkoutDateTime'),checkoutForm=$('#checkoutForm');
  initSheetsSettings();
  if(checkoutSelect){const day=localDateKey(new Date()),allToday=records.filter(r=>localDateKey(new Date(r.datetime))===day).sort((a,b)=>new Date(a.datetime)-new Date(b.datetime)),available=allToday.filter(r=>!r.checkoutDatetime);available.forEach(r=>{const opt=document.createElement('option');opt.value=r.id;opt.textContent=r.name;checkoutSelect.appendChild(opt)});if(available.length===1)checkoutSelect.value=available[0].id;checkoutInput.value=toLocalInputValue(new Date());const done=allToday.filter(r=>r.checkoutDatetime).slice(-1)[0];if(!available.length&&done){$('#checkoutStatus').textContent='퇴근 완료';$('#checkoutResultBadge').textContent='퇴근 완료';$('#checkoutResultText').textContent=`${done.name}님, 오늘도 수고하셨어요!`;$('#checkoutResultSubtext').textContent=`오늘 근무 ${workLabel(workMinutes(done))}을 기록했어요.`;$('#checkoutStartTime').textContent=fmtTime(new Date(done.datetime));$('#checkoutEndTime').textContent=fmtTime(new Date(done.checkoutDatetime));$('#checkoutDuration').textContent=workLabel(workMinutes(done));checkoutForm.querySelector('button').disabled=true;checkoutForm.querySelector('button').textContent='오늘 퇴근 기록 완료 ✓'}const showShift=()=>{const rec=available.find(r=>r.id===checkoutSelect.value),mins=rec?Math.floor((new Date(checkoutInput.value)-new Date(rec.datetime))/60000):0;$('#checkoutShift').textContent=rec?`${rec.name}님 · 출근 ${fmtTime(new Date(rec.datetime))} · 예상 근무 ${workLabel(Math.max(0,mins))}`:'퇴근할 직원을 선택해 주세요.';if(rec){$('#checkoutStartTime').textContent=fmtTime(new Date(rec.datetime));$('#checkoutEndTime').textContent=fmtTime(new Date(checkoutInput.value));$('#checkoutDuration').textContent=workLabel(Math.max(0,mins));$('#checkoutResultBadge').textContent='근무 중';$('#checkoutResultText').textContent=`${rec.name}님, 오늘도 힘차게 하루를 마무리해요.`}};checkoutSelect.addEventListener('change',showShift);checkoutInput.addEventListener('input',showShift);showShift();$('#checkoutStatus').textContent=available.length?'퇴근 대기':done?'퇴근 완료':'출근 기록 없음'}
  if(checkoutForm)checkoutForm.addEventListener('submit',async e=>{e.preventDefault();const submit=checkoutForm.querySelector('[type=submit]'),id=checkoutSelect.value,dt=new Date(checkoutInput.value),today=localDateKey(new Date()),rec=records.find(r=>r.id===id&&localDateKey(new Date(r.datetime))===today&&!r.checkoutDatetime),name=rec?.name;if(!rec){alert('오늘 퇴근 처리할 수 있는 출근 기록이 없습니다.');return}if(Number.isNaN(dt.getTime())||dt<new Date(rec.datetime)){alert('퇴근 시각은 출근 시각 이후로 입력해 주세요.');return}if(submit)submit.disabled=true;rec.checkoutIp=await requestClientIp();rec.checkoutDatetime=dt.toISOString();localStorage.setItem(STORAGE_KEY,JSON.stringify(records));$('#checkoutShift').textContent=`${name}님 · 근무 ${workLabel(workMinutes(rec))} · 퇴근 완료`;$('#checkoutStatus').textContent='퇴근 완료';$('#checkoutResultBadge').textContent='퇴근 완료';$('#checkoutResultText').textContent=`${name}님, 오늘도 수고하셨어요!`;$('#checkoutResultSubtext').textContent=`오늘 근무 ${workLabel(workMinutes(rec))}을 기록했어요.`;$('#checkoutStartTime').textContent=fmtTime(new Date(rec.datetime));$('#checkoutEndTime').textContent=fmtTime(dt);$('#checkoutDuration').textContent=workLabel(workMinutes(rec));checkoutForm.querySelector('button').disabled=true;checkoutForm.querySelector('button').textContent='퇴근 기록 완료 ✓';renderSummary();syncSheets('퇴근 기록 저장')});
  const form=$('#checkinForm');
  if(form)form.addEventListener('submit',async e=>{e.preventDefault();const submit=form.querySelector('[type=submit]'),name=$('#nameInput').value,dt=new Date($('#dateTimeInput').value);if(!name){alert('직원을 선택해 주세요.');return}if(Number.isNaN(dt.getTime()))return;const duplicate=records.some(r=>r.name===name&&localDateKey(new Date(r.datetime))===localDateKey(dt));if(duplicate){alert(`${name}님은 ${localDateKey(dt)}에 이미 출근기록이 있습니다.\n동일한 날짜에는 중복 기록할 수 없습니다.`);return}const overrideStart=($('#appliedStartTime')?.value||settings.startTime||'09:00');const{late,fee,usedStartTime}=calcLate(dt,overrideStart);if(submit)submit.disabled=true;const ip=await requestClientIp(),r={id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),name,datetime:dt.toISOString(),startTime:usedStartTime,feePerMinute:settings.feePerMinute,late,fee,checkinIp:ip};records.push(r);localStorage.setItem(STORAGE_KEY,JSON.stringify(records));updateResult(r);renderSummary();syncSheets('출근 기록 저장');if(submit)submit.disabled=false});
  const appliedStart=$('#appliedStartTime');
  if(appliedStart) appliedStart.addEventListener('change',()=>{$('#usedStartTime')&&($('#usedStartTime').textContent=appliedStart.value||settings.startTime);});
  const save=$('#saveSettings');
  if(save)save.onclick=()=>{const employees=($('#employeeSetting').value||'').split(/\r?\n/).map(v=>v.trim()).filter(Boolean);const unique=[...new Set(employees)];settings={startTime:$('#startTimeSetting').value||'09:00',feePerMinute:Number($('#feeSetting').value)||0,employees:unique};localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings));applyRuleText();save.textContent='저장 완료 ✓';syncSheets('설정 저장');setTimeout(()=>save.textContent='설정 저장',1200)};
  const backupBtn=$('#backupDataBtn');
  if(backupBtn) backupBtn.onclick=()=>{const payload=buildBackupPayload(),stamp=new Date(),filename=`지각대장_백업_${stamp.getFullYear()}${pad(stamp.getMonth()+1)}${pad(stamp.getDate())}_${pad(stamp.getHours())}${pad(stamp.getMinutes())}.json`,blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;a.click();URL.revokeObjectURL(a.href);backupBtn.textContent='백업 완료 ✓';syncSheets('백업 데이터 동기화');setTimeout(()=>backupBtn.textContent='💾 데이터 백업',1200)};
  let pendingRestore=null;const restoreInput=$('#restoreFileInput'),restoreBtn=$('#restoreDataBtn'),restoreInfo=$('#restoreFileInfo');
  if(restoreInput) restoreInput.onchange=async()=>{pendingRestore=null;if(restoreBtn)restoreBtn.disabled=true;const file=restoreInput.files?.[0];if(!file){if(restoreInfo)restoreInfo.textContent='선택된 백업 파일이 없습니다.';return}try{pendingRestore=validateBackupPayload(JSON.parse(await file.text()));if(restoreInfo)restoreInfo.textContent=`${file.name} · 출퇴근 ${pendingRestore.records.length}건 · 퇴근완료 ${pendingRestore.records.filter(r=>r.checkoutDatetime).length}건 · 일정 ${pendingRestore.calendarEvents.length}건 · 직원 ${pendingRestore.settings.employees.length}명`;if(restoreBtn)restoreBtn.disabled=false}catch(err){if(restoreInfo)restoreInfo.textContent=`복원할 수 없는 파일입니다: ${err.message}`}};
  if(restoreBtn) restoreBtn.onclick=()=>{if(!pendingRestore)return;if(!confirm(`백업 데이터를 복원할까요?\n현재 설정과 출퇴근기록이 교체됩니다.\n\n출퇴근 기록: ${pendingRestore.records.length}건 (퇴근 완료 ${pendingRestore.records.filter(r=>r.checkoutDatetime).length}건)\n일정: ${pendingRestore.calendarEvents.length}건\n직원: ${pendingRestore.settings.employees.length}명`))return;settings=pendingRestore.settings;records=pendingRestore.records;calendarEvents=pendingRestore.calendarEvents||[];localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings));localStorage.setItem(STORAGE_KEY,JSON.stringify(records));localStorage.setItem(CALENDAR_KEY,JSON.stringify(calendarEvents));applyRuleText();populateEmployeeSelect();applyEmployeeLock();renderSummary();refreshBackupUi();syncSheets('복원 데이터 동기화');$('#startTimeSetting')&&($('#startTimeSetting').value=settings.startTime);$('#feeSetting')&&($('#feeSetting').value=settings.feePerMinute);$('#employeeSetting')&&($('#employeeSetting').value=settings.employees.join('\n'));if(restoreInfo)restoreInfo.textContent=`복원 완료 · 출퇴근 ${records.length}건 · 퇴근완료 ${records.filter(r=>r.checkoutDatetime).length}건 · 일정 ${calendarEvents.length}건 · 직원 ${settings.employees.length}명`;restoreBtn.disabled=true;restoreInput.value='';pendingRestore=null;restoreBtn.textContent='복원 완료 ✓';setTimeout(()=>restoreBtn.textContent='복원하기',1300)};
  const ex=$('#exportBtn');
  if(ex)ex.onclick=()=>{syncSheets('CSV 저장 전 동기화');const rows=monthRecords(),csv=['날짜,이름,출근시간,출근IP,퇴근시간,퇴근IP,근무시간(분),기준출근시간,분당과금액,지각분,과금액',...rows.map(r=>{const d=new Date(r.datetime);return `${fmtFullDate(d)},"${String(r.name).replaceAll('"','""')}",${fmtTime(d)},${r.checkinIp||''},${r.checkoutDatetime?fmtTime(new Date(r.checkoutDatetime)):''},${r.checkoutIp||''},${workMinutes(r)},${r.startTime||settings.startTime},${r.feePerMinute||settings.feePerMinute},${r.late},${r.fee}`})].join('\n'),blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`지각대장_${referenceNow.getFullYear()}_${pad(referenceNow.getMonth()+1)}.csv`;a.click();URL.revokeObjectURL(a.href)};
}


function sheetsStatus(message,isError=false){const el=$('#sheetsStatus');if(el){el.textContent=message;el.classList.toggle('error',isError)}}
function initSheetsSettings(){const input=$('#sheetsUrlInput');if(!input)return;input.value=localStorage.getItem(SHEETS_URL_KEY)||'';const badge=$('#sheetsConnectionBadge');if(badge)badge.textContent=input.value?'URL 저장됨':'연결 안 됨';$('#sheetsHelpBtn')?.addEventListener('click',()=>$('#sheetsHelpDialog').showModal());$('#sheetsHelpOk')?.addEventListener('click',()=>$('#sheetsHelpDialog').close());$('#sheetsSaveBtn')?.addEventListener('click',()=>{const url=input.value.trim();if(url&&!/^https:\/\/script\.google\.com\/macros\/s\/[^\s]+\/exec(?:\?.*)?$/.test(url)){sheetsStatus('Apps Script 웹 앱 URL 형식을 확인해 주세요. (/exec 주소)',true);return}localStorage.setItem(SHEETS_URL_KEY,url);if(badge)badge.textContent=url?'URL 저장됨':'연결 안 됨';sheetsStatus(url?'웹 앱 URL을 이 브라우저에 저장했습니다.':'저장된 Sheets URL을 삭제했습니다.');});$('#sheetsTestBtn')?.addEventListener('click',()=>testSheets());$('#sheetsSyncBtn')?.addEventListener('click',()=>syncSheets('수동 동기화'));}
async function testSheets(){const url=localStorage.getItem(SHEETS_URL_KEY)||$('#sheetsUrlInput')?.value.trim();if(!url){sheetsStatus('먼저 Apps Script 웹 앱 URL을 저장해 주세요.',true);return}try{sheetsStatus('Google Sheets 연결을 확인하고 있습니다…');const response=await fetch(`${url}?action=ping`,{method:'GET',redirect:'follow',mode:'no-cors'});if(response.type==='opaque'||response.type==='opaqueredirect'){sheetsStatus('요청을 전송했습니다. Google 응답은 브라우저 보안 정책상 읽을 수 없어, 연결 상태는 동기화로 확인해야 합니다.');return}if(!response.ok)throw new Error(`HTTP ${response.status}`);const data=await response.json();if(!data.ok)throw new Error(data.error||'응답 확인에 실패했습니다.');sheetsStatus('연결 성공 · '+(data.service||'Apps Script 웹 앱 응답 확인'));const badge=$('#sheetsConnectionBadge');if(badge)badge.textContent='연결됨'}catch(error){sheetsStatus(`연결을 확인하지 못했습니다: ${error.message}. 웹 앱 배포 권한과 URL을 확인하세요.`,true)}}
async function syncSheets(reason='동기화'){const url=localStorage.getItem(SHEETS_URL_KEY);if(!url){if($('#sheetsStatus'))sheetsStatus('먼저 설정에서 Google Sheets URL을 저장해 주세요.',true);return false}const btn=$('#sheetsSyncBtn');if(btn)btn.disabled=true;try{if($('#sheetsStatus'))sheetsStatus(`${reason} 중…`);const payload={settings,records,calendarEvents},body=JSON.stringify({action:'sync',payload});const response=await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body,mode:'no-cors',redirect:'follow'});if(response.type==='opaque'||response.type==='opaqueredirect'){if($('#sheetsStatus'))sheetsStatus(`${reason} 요청을 Google에 전송했습니다. 브라우저 보안 정책상 저장 성공 여부는 읽을 수 없습니다. 스프레드시트의 출퇴근기록 시트에서 결과를 확인해 주세요.`);return true}if(!response.ok)throw new Error(`HTTP ${response.status}`);const result=await response.json();if(!result.ok)throw new Error(result.error||'동기화 실패');if($('#sheetsStatus'))sheetsStatus(`동기화 완료 · 기록 ${result.recordCount}건 · ${new Date(result.syncedAt||Date.now()).toLocaleString('ko-KR')}`);const badge=$('#sheetsConnectionBadge');if(badge)badge.textContent='연결됨';return true}catch(error){if($('#sheetsStatus'))sheetsStatus(`동기화 실패: ${error.message}. URL, 웹 앱 배포 상태와 Google 접근 권한을 확인하세요.`,true);return false}finally{if(btn)btn.disabled=false}}

function mountKakaoVerticalAd(){
  const shell=document.querySelector('.app-shell');
  if(!shell||shell.querySelector('.ad-rail'))return;

  const style=document.createElement('style');
  style.textContent=`
    .ad-rail{display:none}
    @media(min-width:1240px){
      .app-shell{width:min(1400px,calc(100vw - 28px));grid-template-columns:210px minmax(0,1fr) 160px}
      .ad-rail{height:100dvh;min-width:0;display:flex;align-items:center;justify-content:center;overflow:hidden;padding:12px 0}
      .ad-rail .kakao_ad_area{display:block;width:160px;min-height:600px}
    }
    @media(min-width:1240px) and (max-width:1375px){
      .checkin-v13-body{grid-template-columns:minmax(430px,1.1fr) minmax(360px,.9fr)}
    }
  `;
  document.head.appendChild(style);

  const rail=document.createElement('aside');
  rail.className='ad-rail';
  rail.setAttribute('aria-label','광고');
  rail.innerHTML='<ins class="kakao_ad_area" style="display:none;" data-ad-unit="DAN-Ioh9z314VzVOKm6C" data-ad-width="160" data-ad-height="600"></ins>';
  shell.appendChild(rail);

  const loader=document.createElement('script');
  loader.type='text/javascript';
  loader.src='https://t1.kakaocdn.net/kas/static/ba.min.js';
  loader.async=true;
  document.body.appendChild(loader);
}
mountKakaoVerticalAd();

(async()=>{referenceNow=await getReferenceTime();applyRuleText();populateEmployeeSelect();bindEmployeeLock();applyEmployeeLock();refreshBackupUi();$('#dateTimeInput')&&($('#dateTimeInput').value=toLocalInputValue(referenceNow));$('#startTimeSetting')&&($('#startTimeSetting').value=settings.startTime);$('#feeSetting')&&($('#feeSetting').value=settings.feePerMinute);$('#employeeSetting')&&($('#employeeSetting').value=settings.employees.join('\n'));updateClock();setInterval(updateClock,1000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)updateClock()});window.addEventListener('pageshow',updateClock);window.addEventListener('focus',updateClock);bind();const last=monthRecords().slice(-1)[0]||null;updateResult(last);renderSummary()})();

