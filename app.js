// 课迹课程表应用逻辑
const STORAGE_KEY = 'keji-state-v1';
const DAY_NAMES = ['一', '二', '三', '四', '五', '六', '日'];
const PERIOD_TIMES = ['08:00-08:50', '09:00-09:50', '10:10-11:00', '11:10-12:00', '14:30-15:20', '15:30-16:20', '16:40-17:30', '17:40-18:30', '19:30-20:20', '20:30-21:20', '21:30-22:20'];
const COLOR_NAMES = ['violet', 'mint', 'orange', 'blue', 'pink'];

const sampleCourses = [
  { id: 'sample-1', name: '高等数学', teacher: '李老师', room: 'A-203', day: 1, start: 1, end: 2, color: 'violet', note: '' },
  { id: 'sample-2', name: '大学英语', teacher: '王老师', room: 'B-108', day: 1, start: 5, end: 6, color: 'mint', note: '' },
  { id: 'sample-3', name: '线性代数', teacher: '陈老师', room: 'A-305', day: 2, start: 3, end: 4, color: 'orange', note: '' },
  { id: 'sample-4', name: '程序设计基础', teacher: '周老师', room: '实验楼 204', day: 3, start: 1, end: 3, color: 'blue', note: '' },
  { id: 'sample-5', name: '体育', teacher: '赵老师', room: '田径场', day: 4, start: 7, end: 8, color: 'pink', note: '' },
  { id: 'sample-6', name: '近现代史纲要', teacher: '刘老师', room: 'C-101', day: 5, start: 5, end: 6, color: 'violet', note: '' }
];
const defaultState = {
  schemaVersion: 3,
  activeSemesterId: 'semester-2026-fall',
  semesters: [{ id: 'semester-2026-fall', name: '2026 秋季学期', startDate: '2026-09-01', selectedWeek: null, periodCount: 11, courses: sampleCourses }],
  memos: []
};

let state = loadState();
let selectedColor = 'violet';
let currentFile = null;
let currentFileKind = '';
let importedCourses = [];
let pendingMemoImage = '';
let selectedMemoTag = '学习';
let activeMemoFilter = '全部';
let deferredInstallPrompt = null;
let toastTimer;

const $ = selector => document.querySelector(selector);
const $$ = selector => Array.from(document.querySelectorAll(selector));

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved) return attachStateAliases(structuredClone(defaultState));
    if (Array.isArray(saved.semesters) && saved.semesters.length > 0) {
      const nextState = { schemaVersion: 3, activeSemesterId: saved.activeSemesterId || saved.semesters[0].id, semesters: saved.semesters.map((semester, index) => normalizeSemester(semester, index)), memos: Array.isArray(saved.memos) ? saved.memos : [] };
      return attachStateAliases(nextState);
    }
    const migratedSemester = { id: 'semester-imported', name: '我的课程表', startDate: saved.semesterStart || '2026-09-01', selectedWeek: saved.selectedWeek || null, periodCount: 11, courses: Array.isArray(saved.courses) ? saved.courses : structuredClone(sampleCourses) };
    return attachStateAliases({ schemaVersion: 3, activeSemesterId: migratedSemester.id, semesters: [migratedSemester], memos: Array.isArray(saved.memos) ? saved.memos : [] });
  } catch (error) { return attachStateAliases(structuredClone(defaultState)); }
}

function normalizeSemester(semester, index = 0) {
  return { id: semester.id || `semester-${Date.now()}-${index}`, name: semester.name || `第 ${index + 1} 个学期`, startDate: semester.startDate || semester.semesterStart || '2026-09-01', selectedWeek: Number(semester.selectedWeek) || null, periodCount: Number(semester.periodCount) || 11, courses: Array.isArray(semester.courses) ? semester.courses : [] };
}

function attachStateAliases(target) {
  Object.defineProperties(target, {
    activeSemester: { enumerable: false, configurable: true, get: () => activeSemester() },
    courses: { enumerable: false, configurable: true, get: () => activeSemester().courses, set: value => { activeSemester().courses = value; } },
    semesterStart: { enumerable: false, configurable: true, get: () => activeSemester().startDate, set: value => { activeSemester().startDate = value; } },
    selectedWeek: { enumerable: false, configurable: true, get: () => activeSemester().selectedWeek, set: value => { activeSemester().selectedWeek = value; } },
    periodCount: { enumerable: false, configurable: true, get: () => activeSemester().periodCount, set: value => { activeSemester().periodCount = value; } }
  });
  return target;
}

function activeSemester() {
  const semesters = Array.isArray(state?.semesters) ? state.semesters : [];
  if (semesters.length === 0) {
    const fallback = normalizeSemester({ id: 'semester-fallback', name: '我的课程表' });
    state.semesters = [fallback];
    state.activeSemesterId = fallback.id;
    return fallback;
  }
  return semesters.find(semester => semester.id === state.activeSemesterId) || semesters[0];
}

function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch (error) { showToast('设备存储空间不足，图片备忘可能无法保存'); }
}

function todayDate() { const date = new Date(); return new Date(date.getFullYear(), date.getMonth(), date.getDate()); }
function semesterWeek(date = todayDate()) { const start = new Date(`${state.semesterStart}T00:00:00`); if (Number.isNaN(start.getTime())) return 1; return Math.max(1, Math.floor(Math.floor((date - start) / 86400000) / 7) + 1); }
function currentDisplayedWeek() { return Number(state.selectedWeek) || semesterWeek(); }
function currentDay() { const day = todayDate().getDay(); return day === 0 ? 7 : day; }
function formatToday() { const date = todayDate(); return `${date.getMonth() + 1}月${date.getDate()}日 · 星期${DAY_NAMES[currentDay() - 1]}`; }
function periodLabel(index) { return `第 ${index} 节`; }
function periodTime(index) { return PERIOD_TIMES[index - 1] || ''; }
function courseVisible(course, week = currentDisplayedWeek()) {
  if (Array.isArray(course.weekRules) && course.weekRules.length > 0) return course.weekRules.some(rule => week >= rule.start && week <= rule.end && (!rule.parity || (rule.parity === 'odd' ? week % 2 === 1 : week % 2 === 0)));
  if (Array.isArray(course.weekRanges) && course.weekRanges.length > 0) return course.weekRanges.some(range => week >= range[0] && week <= range[1]);
  return !Array.isArray(course.weeks) || course.weeks.length === 0 || course.weeks.includes(week);
}
function getVisibleCourses() { return state.courses.filter(course => courseVisible(course)); }

function renderAll() {
  $('#todayDate').textContent = formatToday();
  $('#weekLabel').textContent = `第 ${currentDisplayedWeek()} 周`;
  $('#termLabel').textContent = activeSemester().name;
  $('#semesterStartInput').value = state.semesterStart;
  $('#currentWeekInput').value = currentDisplayedWeek();
  $('#periodCountInput').value = String(state.periodCount);
  renderSemesterControls();
  renderQuickStats(); renderNextUp(); renderTable(); renderMemos(); fillPeriodSelects();
}

function renderSemesterControls() {
  $('#semesterSelect').innerHTML = state.semesters.map(semester => `<option value="${escapeAttribute(semester.id)}">${escapeHtml(semester.name)}</option>`).join('');
  $('#semesterSelect').value = state.activeSemesterId;
  $('#deleteSemesterButton').disabled = state.semesters.length <= 1;
}

function renderQuickStats() {
  const visible = getVisibleCourses();
  const todayCourses = visible.filter(course => course.day === currentDay());
  $('#quickStats').innerHTML = `<div class="stat-card"><span class="stat-label">本周课程</span><strong class="stat-value">${visible.length}<small> 门</small></strong></div><div class="stat-card"><span class="stat-label">今天安排</span><strong class="stat-value stat-accent">${todayCourses.length}<small> 门</small></strong></div><div class="stat-card"><span class="stat-label">图片备忘</span><strong class="stat-value">${state.memos.length}<small> 张</small></strong></div>`;
}

function renderNextUp() {
  const todayCourses = getVisibleCourses().filter(course => course.day === currentDay()).sort((a, b) => a.start - b.start);
  const card = $('#nextUpCard');
  if (todayCourses.length === 0) { card.className = 'next-up card empty'; card.innerHTML = '<span>今天没有课程，留一点时间给自己。</span>'; return; }
  const course = todayCourses[0];
  card.className = 'next-up card';
  card.innerHTML = `<div class="next-up-main"><i class="next-up-dot" style="background:${colorValue(course.color)}"></i><div><p class="eyebrow">今天的第一节课</p><h3>${escapeHtml(course.name)}</h3><p>${courseRoomTeacher(course)}</p></div></div><div class="next-up-time"><strong>${periodTime(course.start)}</strong><span>第 ${course.start}-${course.end} 节</span></div>`;
}

function renderTable() {
  $('#tableHead').innerHTML = `<div class="period-head">节次</div>${DAY_NAMES.map((day, index) => `<div class="day-head ${index + 1 === currentDay() && currentDisplayedWeek() === semesterWeek() ? 'today' : ''}"><span>周${day}</span><strong>${index + 1}</strong></div>`).join('')}`;
  $('#periodColumn').innerHTML = Array.from({ length: state.periodCount }, (_, index) => `<div class="period-label"><strong>${periodLabel(index + 1)}</strong><span>${periodTime(index + 1)}</span></div>`).join('');
  const courses = getVisibleCourses();
  $('#weekGrid').innerHTML = DAY_NAMES.map((_, dayIndex) => {
    const day = dayIndex + 1;
    const blocks = courses.filter(course => course.day === day).map(course => {
      const start = Math.max(1, Math.min(state.periodCount, Number(course.start) || 1));
      const end = Math.max(start, Math.min(state.periodCount, Number(course.end) || start));
      const room = course.room || '未填写';
      const teacher = course.teacher || '未填写';
      return `<button class="course-block ${COLOR_NAMES.includes(course.color) ? course.color : 'violet'}" style="grid-row:${start} / span ${end - start + 1}" data-course-id="${escapeAttribute(course.id)}" title="点击编辑 ${escapeAttribute(course.name)}｜地点：${escapeAttribute(room)}｜老师：${escapeAttribute(teacher)}"><strong>${escapeHtml(course.name)}</strong><span>地点：${escapeHtml(room)}</span><span>老师：${escapeHtml(teacher)}</span></button>`;
    }).join('');
    return `<div class="day-column ${day === currentDay() && currentDisplayedWeek() === semesterWeek() ? 'today' : ''}" style="grid-template-rows:repeat(${state.periodCount},65px)">${blocks}</div>`;
  }).join('');
  $$('.course-block').forEach(button => button.addEventListener('click', () => openCourseDialog(button.dataset.courseId)));
}

function renderMemos() {
  const filters = ['全部', '学习', '作业', '考试', '其他'];
  $('#memoFilters').innerHTML = filters.map(filter => `<button class="filter-chip ${activeMemoFilter === filter ? 'active' : ''}" data-filter="${filter}">${filter}${filter === '全部' ? '' : ` · ${state.memos.filter(memo => memo.tag === filter).length}`}</button>`).join('');
  $$('.filter-chip').forEach(button => button.addEventListener('click', () => { activeMemoFilter = button.dataset.filter; renderMemos(); }));
  const memos = activeMemoFilter === '全部' ? state.memos : state.memos.filter(memo => memo.tag === activeMemoFilter);
  if (memos.length === 0) {
    $('#memoGrid').innerHTML = `<div class="empty-state"><div><strong>${activeMemoFilter === '全部' ? '还没有图片备忘' : `还没有${activeMemoFilter}记录`}</strong><span>上传一张图片，把重要内容留在手边。</span><br><button class="secondary-button" id="emptyMemoButton">上传第一张图片</button></div></div>`;
    $('#emptyMemoButton')?.addEventListener('click', () => $('#memoFileInput').click());
    return;
  }
  $('#memoGrid').innerHTML = memos.map(memo => `<article class="memo-card memo-open" data-open-memo="${escapeAttribute(memo.id)}" tabindex="0" role="button"><div class="memo-card-top"><span class="memo-mark">▤</span><span class="memo-tag-label">${escapeHtml(memo.tag)}</span><span class="memo-card-hint">点击查看图片</span></div><div class="memo-content"><h3>${escapeHtml(memo.title)}</h3><p>${escapeHtml(memo.note || '没有补充说明')}</p><div class="memo-meta"><span>${escapeHtml(memo.createdAt)}</span><button data-delete-memo="${escapeAttribute(memo.id)}">删除</button></div></div></article>`).join('');
  $$('[data-open-memo]').forEach(card => {
    card.addEventListener('click', () => openMemoViewer(card.dataset.openMemo));
    card.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openMemoViewer(card.dataset.openMemo); } });
  });
  $$('[data-delete-memo]').forEach(button => button.addEventListener('click', event => { event.stopPropagation(); deleteMemo(button.dataset.deleteMemo); }));
}

function courseRoomTeacher(course) { return `地点：${course.room || '未填写'} · 老师：${course.teacher || '未填写'}`; }
function colorValue(color) { return { violet: '#7a6be8', mint: '#4db895', orange: '#ee9b3f', blue: '#5795db', pink: '#da6b9d' }[color] || '#7a6be8'; }
function fillPeriodSelects() { const options = Array.from({ length: state.periodCount }, (_, index) => `<option value="${index + 1}">${index + 1} · ${periodTime(index + 1)}</option>`).join(''); $('#courseStartInput').innerHTML = options; $('#courseEndInput').innerHTML = options; }

function openCourseDialog(courseId = '') {
  fillPeriodSelects();
  const course = state.courses.find(item => item.id === courseId);
  $('#courseDialogTitle').textContent = course ? '编辑这门课程' : '添加一门课程';
  $('#courseIdInput').value = course?.id || '';
  $('#courseNameInput').value = course?.name || '';
  $('#courseDayInput').value = String(course?.day || currentDay());
  $('#courseStartInput').value = String(course?.start || 1);
  $('#courseEndInput').value = String(course?.end || Math.min(2, state.periodCount));
  $('#courseRoomInput').value = course?.room || '';
  $('#courseTeacherInput').value = course?.teacher || '';
  $('#courseWeeksInput').value = course?.weekText || '';
  $('#courseNoteInput').value = course?.note || '';
  selectedColor = COLOR_NAMES.includes(course?.color) ? course.color : 'violet';
  updateColorSelection();
  $('#deleteCourseButton').hidden = !course;
  $('#courseDialog').showModal();
}

function updateColorSelection() { $$('.color-dot').forEach(dot => dot.classList.toggle('selected', dot.dataset.color === selectedColor)); }

function saveCourse() {
  const name = $('#courseNameInput').value.trim();
  if (!name) return showToast('请先填写课程名称');
  const id = $('#courseIdInput').value || `course-${Date.now()}`;
  const weekInfo = parseWeekInfo($('#courseWeeksInput').value.trim());
  const course = { id, name, day: Number($('#courseDayInput').value), start: Number($('#courseStartInput').value), end: Number($('#courseEndInput').value), room: $('#courseRoomInput').value.trim(), teacher: $('#courseTeacherInput').value.trim(), note: $('#courseNoteInput').value.trim(), color: selectedColor, weekText: weekInfo.text, weeks: weekInfo.weeks, weekRanges: weekInfo.weekRanges, weekRules: weekInfo.weekRules };
  if (course.end < course.start) [course.start, course.end] = [course.end, course.start];
  const index = state.courses.findIndex(item => item.id === id);
  if (index === -1) state.courses.push(course); else state.courses[index] = course;
  persist(); renderAll(); $('#courseDialog').close(); showToast(index === -1 ? '课程已添加' : '课程已更新');
}

function deleteCourse() {
  const id = $('#courseIdInput').value;
  if (!id || !window.confirm('确定删除这门课程吗？')) return;
  state.courses = state.courses.filter(course => course.id !== id);
  persist(); renderAll(); $('#courseDialog').close(); showToast('课程已删除');
}

function openImportDialog() { resetImportDialog(); $('#importDialog').showModal(); }

function resetImportDialog() {
  currentFile = null; currentFileKind = ''; importedCourses = [];
  $('#scheduleFileInput').value = ''; $('#filePreview').hidden = true; $('#dropZone').hidden = false;
  $('#rawTextSection').hidden = true; $('#ocrProgress').hidden = true; $('#recognizeButton').disabled = true; $('#importCoursesButton').disabled = true;
  $('#importTip').textContent = '先选择一个文件'; $('#rawScheduleText').value = ''; $('#parsedCount').textContent = '';
  $('#ocrProgressBar').style.width = '0%'; $('#ocrPercent').textContent = '0%';
}

function handleScheduleFile(file) {
  if (!file) return;
  currentFile = file; currentFileKind = file.type.startsWith('image/') ? 'image' : 'table';
  $('#dropZone').hidden = true; $('#filePreview').hidden = false; $('#fileName').textContent = file.name;
  $('#fileMeta').textContent = `${formatBytes(file.size)} · ${currentFileKind === 'image' ? '图片识别' : '表格导入'}`;
  const thumb = $('#previewThumb'); thumb.innerHTML = currentFileKind === 'image' ? '' : '表格';
  if (currentFileKind === 'image') {
    const imageUrl = URL.createObjectURL(file); const image = document.createElement('img'); image.src = imageUrl; image.onload = () => URL.revokeObjectURL(imageUrl); thumb.appendChild(image);
    $('#recognizeButton').disabled = false; $('#recognizeButton').textContent = '开始识别'; $('#importTip').textContent = '识别后可编辑文本';
  } else {
    $('#recognizeButton').disabled = false; $('#recognizeButton').textContent = '重新解析'; $('#importTip').textContent = '正在读取表格'; readTableFile(file);
  }
}

async function loadProjectSchedule() {
  try {
    const response = await fetch(encodeURI('./课表.xlsx'), { cache: 'no-store' });
    if (!response.ok) throw new Error('没有找到课表.xlsx，请改用「浏览文件」选择本地文件');
    const blob = await response.blob();
    handleScheduleFile(new File([blob], '课表.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  } catch (error) {
    showToast(error.message || '读取项目课表失败');
  }
}

async function projectScheduleAvailable() {
  try {
    const response = await fetch(encodeURI('./课表.xlsx'), { method: 'HEAD', cache: 'no-store' });
    return response.ok;
  } catch (error) { return false; }
}

// 在线部署（GitHub Pages 等）不会带上个人课表文件，按钮只在文件确实存在时出现。
async function probeProjectSchedule() {
  const button = $('#loadProjectScheduleButton');
  if (!button) return;
  const available = await projectScheduleAvailable();
  button.hidden = !available;
}

async function readTableFile(file) {
  try {
    let rows;
    if (/\.xlsx?$/i.test(file.name)) {
      if (!window.XLSX) throw new Error('表格解析引擎尚未加载');
      const data = await file.arrayBuffer(); const workbook = XLSX.read(data, { type: 'array' });
      rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: '' });
    } else rows = (await file.text()).split(/\r?\n/).filter(line => line.trim()).map(line => line.split(/[,\t，]/));
    $('#rawScheduleText').value = rows.map(row => row.join('\t')).join('\n'); $('#rawTextSection').hidden = false;
    importedCourses = parseRows(rows); updateParsedCount(false);
  } catch (error) { $('#importTip').textContent = '表格读取失败，请改用 CSV 或手动粘贴'; showToast(error.message || '表格读取失败'); }
}

async function recognizeImage() {
  if (!currentFile) return;
  if (!window.Tesseract) return showToast('OCR 引擎加载失败，请检查网络后重试');
  $('#recognizeButton').disabled = true; $('#ocrProgress').hidden = false; $('#ocrStatus').textContent = '正在准备识别'; $('#rawTextSection').hidden = true;
  try {
    let result;
    try { result = await Tesseract.recognize(currentFile, 'chi_sim+eng', { logger: updateOcrProgress }); }
    catch (firstError) { result = await Tesseract.recognize(currentFile, 'eng', { logger: updateOcrProgress }); }
    $('#rawScheduleText').value = result.data.text.trim(); $('#rawTextSection').hidden = false; importedCourses = parseScheduleText(result.data.text); updateParsedCount();
    $('#ocrStatus').textContent = importedCourses.length ? '识别完成，请核对' : '识别完成，建议手动补充格式';
  } catch (error) {
    $('#ocrStatus').textContent = '识别失败'; $('#importTip').textContent = '可以直接在文本框中粘贴课程'; $('#rawTextSection').hidden = false; showToast('图片识别失败，可以手动输入课程文本');
  } finally { $('#recognizeButton').disabled = false; }
}

function updateOcrProgress(message) {
  const progress = Math.round((message.progress || 0) * 100);
  $('#ocrStatus').textContent = progress < 100 ? (message.status || '正在识别') : '正在整理结果'; $('#ocrPercent').textContent = `${progress}%`; $('#ocrProgressBar').style.width = `${progress}%`;
}

function parseRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const normalized = rows.map(row => row.map(cell => String(cell ?? '').trim()));
  const header = normalized[0].map(normalizeHeader);
  const dayColumn = header.findIndex(value => value === '星期' || value === 'day');
  const periodColumn = header.findIndex(value => value === '节次' || value.includes('节次'));
  const nameColumn = header.findIndex(value => value === '课程名称' || value === '课程' || value.includes('课程名称'));
  const weeksColumn = header.findIndex(value => value === '上课周次' || value.includes('周次') || value === 'weeks');
  const roomColumn = header.findIndex(value => value === '上课地点' || value === '教室' || value.includes('地点') || value === 'room');
  const teacherColumn = header.findIndex(value => value === '任课教师' || value === '教师' || value.includes('教师') || value === 'teacher');
  if (dayColumn !== -1 && periodColumn !== -1 && nameColumn !== -1) {
    return normalized.slice(1).map(row => {
      const day = parseDay(row[dayColumn]);
      const range = parsePeriodRange(row[periodColumn]);
      const name = cleanImportedCourseName(row[nameColumn]);
      if (!name || isTimeOfDay(name) || isScheduleLabel(name) || !day || !range) return null;
      return makeCourse(name, day, range, row[roomColumn] || '', row[teacherColumn] || '', parseWeekInfo(row[weeksColumn] || ''));
    }).filter(Boolean);
  }
  const knownHeaders = header.filter(item => /课程|course|星期|day|开始|start|结束|end|教师|老师|teacher|教室|room/.test(item)).length;
  if (knownHeaders >= 2) {
    return normalized.slice(1).map(row => {
      const get = patterns => { const index = header.findIndex(value => patterns.some(pattern => value.includes(pattern))); return index === -1 ? '' : row[index] || ''; };
      const day = parseDay(get(['星期', '周', 'day']) || row.join(' ')); const range = parsePeriodRange(`${get(['开始', 'start'])}-${get(['结束', 'end'])} ${row.join(' ')}`); const name = get(['课程', 'course', '名称']) || row[0];
      if (!name || !day || !range) return null;
      return makeCourse(name, day, range, get(['教室', 'room', '地点']), get(['教师', '老师', 'teacher']));
    }).filter(Boolean);
  }
  return normalized.map(row => parseCourseLine(row.join('\t'))).filter(Boolean);
}

function parseScheduleText(text) { return String(text || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(parseCourseLine).filter(Boolean); }

function parseCourseLine(line) {
  const cells = line.split(/[\t,，|;；]+/).map(value => value.trim()).filter(Boolean); const fullLine = cells.join(' '); const day = parseDay(fullLine); const range = parsePeriodRange(fullLine);
  if (!day || !range) return null;
  const room = cells.find(cell => /(?:教室|室|楼|区|场|馆|栋)/.test(cell)) || ''; const teacher = cells.find(cell => /(?:老师|教师|教授|讲师)/.test(cell)) || '';
  let name = cells.find(cell => cell !== room && cell !== teacher && !parseDay(cell) && !parsePeriodRange(cell) && !isTimeOfDay(cell) && !isScheduleLabel(cell) && !/^\d+$/.test(cell));
  if (!name) return null;
  name = cleanImportedCourseName(name).replace(/(?:星期|周)[一二三四五六日天1-7]/g, '').replace(/第?\d{1,2}\s*[-~—至到]\s*\d{1,2}\s*节?/g, '').trim();
  if (!name || isTimeOfDay(name) || isScheduleLabel(name)) return null;
  return makeCourse(name, day, range, room, teacher);
}

function normalizeHeader(header) { return String(header).toLowerCase().replace(/[\s_()（）]/g, ''); }
function cleanImportedCourseName(value) { return String(value || '').replace(/[☆★☆■◆◇]+/g, '').replace(/\s+/g, ' ').trim(); }
function isTimeOfDay(value) { return /^(上午|下午|早上|中午|晚上|夜间|上午课|下午课)$/.test(String(value || '').replace(/\s+/g, '')); }
function isScheduleLabel(value) { return /^(第几节|上课时间|节次|时段|星期|课程名称|课程|地点|教室|老师|教师)$/.test(String(value || '').replace(/\s+/g, '')); }
function parseWeekInfo(value) {
  const text = String(value || '');
  const parity = /双/.test(text) ? 'even' : /单/.test(text) ? 'odd' : '';
  const weekRules = [];
  const ranges = [];
  for (const match of text.matchAll(/(\d{1,2})\s*[-~—至到]\s*(\d{1,2})\s*周/g)) {
    const start = Number(match[1]);
    const end = Number(match[2]);
    ranges.push([start, end]);
    weekRules.push({ start, end, parity });
  }
  const covered = new Set();
  ranges.forEach(([start, end]) => { for (let week = start; week <= end; week += 1) covered.add(week); });
  const listMatches = text.matchAll(/((?:\d{1,2}\s*[,，、]\s*)+\d{1,2})\s*周/g);
  for (const match of listMatches) {
    match[1].split(/[,，、]/).map(Number).filter(number => number > 0 && number < 100).forEach(week => { if (!covered.has(week)) weekRules.push({ start: week, end: week, parity }); });
  }
  const singles = text.matchAll(/(?<![-\d])(\d{1,2})\s*周/g);
  for (const match of singles) {
    const week = Number(match[1]);
    if (week > 0 && week < 100 && !covered.has(week)) weekRules.push({ start: week, end: week, parity });
  }
  const weeks = weekRules.filter(rule => rule.start === rule.end && !rule.parity).map(rule => rule.start);
  return { text, weeks: [...new Set(weeks)], weekRanges: ranges, weekRules };
}
function parseDay(value) { const match = String(value || '').match(/(?:星期|周|礼拜)\s*([一二三四五六日天1-7])/); if (!match) return 0; const token = match[1]; return /\d/.test(token) ? Number(token) : ({ 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 }[token] || 0); }
function parsePeriodRange(value) { const match = String(value || '').match(/(?:第\s*)?(\d{1,2})\s*(?:[-~—至到]|至)\s*(\d{1,2})\s*(?:节|课)?/); if (match) return { start: Number(match[1]), end: Number(match[2]) }; const single = String(value || '').match(/(?:第\s*)?(\d{1,2})\s*(?:节|课)/); return single ? { start: Number(single[1]), end: Number(single[1]) } : null; }
function makeCourse(name, day, range, room = '', teacher = '', weekInfo = {}) { return { id: `import-${Date.now()}-${Math.random().toString(16).slice(2)}`, name: cleanImportedCourseName(name), day, start: range.start, end: range.end, room: room.trim(), teacher: teacher.trim(), color: COLOR_NAMES[(day - 1) % COLOR_NAMES.length], note: '', weekText: weekInfo.text || '', weeks: weekInfo.weeks || [], weekRanges: weekInfo.weekRanges || [], weekRules: weekInfo.weekRules || [] }; }

function parseImportText(text) {
  const lines = String(text || '').split(/\r?\n/).filter(line => line.trim());
  const rows = lines.map(line => line.split('\t'));
  const header = rows[0]?.map(normalizeHeader) || [];
  if (header.includes('课程名称') && header.includes('任课教师')) return parseRows(rows);
  return lines.map(parseCourseLine).filter(Boolean);
}

function updateParsedCount(reparse = true) { if (reparse) importedCourses = parseImportText($('#rawScheduleText').value); $('#parsedCount').textContent = `${importedCourses.length} 门课程`; $('#importCoursesButton').disabled = importedCourses.length === 0; $('#importTip').textContent = importedCourses.length ? '确认后写入课程表' : '暂未识别到完整课程'; }
function importCourses() { updateParsedCount(); if (importedCourses.length === 0) return showToast('请先补充课程名称、星期和节次'); state.courses.push(...importedCourses); persist(); renderAll(); $('#importDialog').close(); showToast(`已导入 ${importedCourses.length} 门课程`); }

function prepareMemoFile(file) {
  if (!file || !file.type.startsWith('image/')) return showToast('请选择图片文件');
  const reader = new FileReader();
  reader.onload = () => resizeImage(reader.result).then(dataUrl => {
    pendingMemoImage = dataUrl; $('#memoPreview').innerHTML = `<img src="${dataUrl}" alt="待保存的图片">`; $('#memoTitleInput').value = file.name.replace(/\.[^.]+$/, ''); $('#memoNoteInput').value = ''; selectedMemoTag = '学习'; updateMemoTagSelection(); $('#memoDialog').showModal();
  });
  reader.readAsDataURL(file);
}

function resizeImage(dataUrl) {
  return new Promise(resolve => {
    const image = new Image();
    image.onload = () => { const maxWidth = 1280; const ratio = Math.min(1, maxWidth / image.width); const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.width * ratio)); canvas.height = Math.max(1, Math.round(image.height * ratio)); canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height); resolve(canvas.toDataURL('image/jpeg', .82)); };
    image.src = dataUrl;
  });
}

function saveMemo() {
  if (!pendingMemoImage) return showToast('请先选择一张图片');
  const date = todayDate();
  state.memos.unshift({ id: `memo-${Date.now()}`, image: pendingMemoImage, title: $('#memoTitleInput').value.trim() || '未命名备忘', note: $('#memoNoteInput').value.trim(), tag: selectedMemoTag, createdAt: `${date.getMonth() + 1}月${date.getDate()}日` });
  persist(); renderAll(); $('#memoDialog').close(); $('#memoFileInput').value = ''; pendingMemoImage = ''; showToast('图片备忘已保存');
}

function deleteMemo(id) {
  if (!window.confirm('确定删除这张图片备忘吗？')) return;
  state.memos = state.memos.filter(memo => memo.id !== id); persist(); renderAll(); showToast('图片备忘已删除');
}

function openMemoViewer(id) {
  const memo = state.memos.find(item => item.id === id);
  if (!memo) return;
  $('#memoViewerTitle').textContent = memo.title;
  $('#memoViewerImage').src = memo.image;
  $('#memoViewerNote').textContent = memo.note || '没有补充说明';
  $('#memoViewerMeta').textContent = `${memo.tag} · ${memo.createdAt}`;
  $('#memoViewerDialog').showModal();
}

function updateMemoTagSelection() { $$('.tag').forEach(tag => tag.classList.toggle('selected', tag.dataset.tag === selectedMemoTag)); }
function switchView(viewId) { $$('.view').forEach(view => view.classList.toggle('active', view.id === viewId)); $$('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.view === viewId)); window.scrollTo({ top: 0, behavior: 'smooth' }); }
function showToast(message) { const toast = $('#toast'); toast.textContent = message; toast.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 2600); }
function formatBytes(bytes) { if (bytes < 1024) return `${bytes} B`; if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`; return `${(bytes / 1024 / 1024).toFixed(1)} MB`; }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character])); }
function escapeAttribute(value) { return escapeHtml(value).replace(/`/g, '&#96;'); }

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `课迹备份-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(link.href); showToast('数据备份已下载');
}

function resetData() {
  if (!window.confirm('恢复示例课表会覆盖当前课程和图片备忘，确定继续吗？')) return;
  state = attachStateAliases(structuredClone(defaultState)); state.selectedWeek = semesterWeek(); persist(); renderAll(); showToast('已恢复示例课表');
}

function clearCurrentCourses() {
  if (!window.confirm(`确定清空“${activeSemester().name}”的全部课程吗？`)) return;
  state.courses = [];
  persist(); renderAll(); showToast('当前学期课表已清空');
}

function switchSemester(semesterId) {
  if (!state.semesters.some(semester => semester.id === semesterId)) return;
  state.activeSemesterId = semesterId;
  persist(); renderAll(); showToast(`已切换到${activeSemester().name}`);
}

function addSemester() {
  const name = window.prompt('请输入学期名称', '2027 春季学期');
  if (!name || !name.trim()) return;
  const startDate = window.prompt('请输入学期开始日期（YYYY-MM-DD）', '2027-02-22');
  if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return showToast('日期格式应为 YYYY-MM-DD');
  const semester = { id: `semester-${Date.now()}`, name: name.trim(), startDate, selectedWeek: 1, periodCount: 11, courses: [] };
  state.semesters.push(semester); state.activeSemesterId = semester.id; persist(); renderAll(); showToast('新学期已创建');
}

function deleteCurrentSemester() {
  if (state.semesters.length <= 1) return showToast('至少保留一个学期');
  if (!window.confirm(`确定删除“${activeSemester().name}”及其中的课程吗？`)) return;
  const index = state.semesters.findIndex(semester => semester.id === state.activeSemesterId);
  state.semesters = state.semesters.filter(semester => semester.id !== state.activeSemesterId);
  state.activeSemesterId = state.semesters[Math.max(0, index - 1)].id;
  persist(); renderAll(); showToast('学期已删除');
}

function setManualWeek(value) {
  const week = Math.max(1, Math.min(60, Number(value) || 1));
  state.selectedWeek = week; persist(); renderAll(); showToast(`当前周次已设为第 ${week} 周`);
}

function bindEvents() {
  $$('.modal [value="cancel"]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
  $$('.nav-item').forEach(item => item.addEventListener('click', () => switchView(item.dataset.view)));
  $('#previousWeek').addEventListener('click', () => { state.selectedWeek = Math.max(1, currentDisplayedWeek() - 1); persist(); renderAll(); });
  $('#nextWeek').addEventListener('click', () => { state.selectedWeek = currentDisplayedWeek() + 1; persist(); renderAll(); });
  $('#todayButton').addEventListener('click', () => { state.selectedWeek = semesterWeek(); persist(); renderAll(); });
  $('#currentWeekButton').addEventListener('click', () => { state.selectedWeek = semesterWeek(); persist(); renderAll(); });
  $('#clearCoursesButton').addEventListener('click', clearCurrentCourses);
  $('#quickAddButton').addEventListener('click', () => openCourseDialog()); $('#openImportButton').addEventListener('click', openImportDialog);
  $('#uploadMemoButton').addEventListener('click', () => $('#memoFileInput').click()); $('#memoFileInput').addEventListener('change', event => prepareMemoFile(event.target.files[0]));
  $('#courseForm').addEventListener('submit', event => { event.preventDefault(); saveCourse(); }); $('#deleteCourseButton').addEventListener('click', deleteCourse);
  $('#courseColorPicker').addEventListener('click', event => { if (event.target.matches('.color-dot')) { selectedColor = event.target.dataset.color; updateColorSelection(); } });
  $('#chooseScheduleFile').addEventListener('click', () => $('#scheduleFileInput').click()); $('#loadProjectScheduleButton').addEventListener('click', loadProjectSchedule); $('#scheduleFileInput').addEventListener('change', event => handleScheduleFile(event.target.files[0])); $('#removeFileButton').addEventListener('click', resetImportDialog);
  $('#recognizeButton').addEventListener('click', () => currentFileKind === 'image' ? recognizeImage() : readTableFile(currentFile)); $('#rawScheduleText').addEventListener('input', updateParsedCount); $('#importForm').addEventListener('submit', event => { event.preventDefault(); importCourses(); });
  ['dragenter', 'dragover'].forEach(name => $('#dropZone').addEventListener(name, event => { event.preventDefault(); $('#dropZone').classList.add('dragging'); })); ['dragleave', 'drop'].forEach(name => $('#dropZone').addEventListener(name, event => { event.preventDefault(); $('#dropZone').classList.remove('dragging'); })); $('#dropZone').addEventListener('drop', event => handleScheduleFile(event.dataTransfer.files[0]));
  $('#memoForm').addEventListener('submit', event => { event.preventDefault(); saveMemo(); }); $('#memoTags').addEventListener('click', event => { if (event.target.matches('.tag')) { selectedMemoTag = event.target.dataset.tag; updateMemoTagSelection(); } });
  $('#semesterStartInput').addEventListener('change', event => { state.semesterStart = event.target.value; state.selectedWeek = semesterWeek(); persist(); renderAll(); showToast('学期日期已更新'); });
  $('#currentWeekInput').addEventListener('change', event => setManualWeek(event.target.value));
  $('#periodCountInput').addEventListener('change', event => { state.periodCount = Number(event.target.value); state.courses = state.courses.map(course => ({ ...course, start: Math.min(course.start, state.periodCount), end: Math.min(course.end, state.periodCount) })); persist(); renderAll(); });
  $('#semesterSelect').addEventListener('change', event => switchSemester(event.target.value)); $('#addSemesterButton').addEventListener('click', addSemester); $('#deleteSemesterButton').addEventListener('click', deleteCurrentSemester);
  $('#clearCoursesSettingsButton').addEventListener('click', clearCurrentCourses);
  $('#exportDataButton').addEventListener('click', exportData); $('#resetDataButton').addEventListener('click', resetData);
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); deferredInstallPrompt = event; $('#installButton').hidden = false; });
  $('#installButton').addEventListener('click', async () => { if (!deferredInstallPrompt) return; deferredInstallPrompt.prompt(); await deferredInstallPrompt.userChoice; deferredInstallPrompt = null; $('#installButton').hidden = true; });
}

function init() { if (!state.selectedWeek) { state.selectedWeek = semesterWeek(); persist(); } bindEvents(); renderAll(); probeProjectSchedule(); if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').then(registration => registration.update()).catch(() => {}); }
init();
