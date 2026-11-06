import type { Course, Session, WeekRange } from '../../data/types';
import { courseWeeks, normalizeWeeks } from '../../data/schedule';

export type ScheduleResult = {
  term: string;
  courses: Course[];
  source: 'html' | 'api';
};

const plain = (s: string) => s.replace(/<[^>]*>/g, '').replace(/&nbsp;|&#160;/g, ' ')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/\s+/g, ' ').trim();
const cleanName = (s: string) => plain(s).replace(/【[^】]*】|\[[^\]]*\]|[★▲●◆■]/g, '').trim();
const attr = (tag: string, name: string) => new RegExp(`(?:^|\\s)${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i').exec(tag)?.[2] ?? '';
const value = (row: Record<string, unknown>, key: string) => typeof row[key] === 'string' || typeof row[key] === 'number' ? String(row[key]).trim() : '';

export function weeksToText(weeks: WeekRange[]) {
  return normalizeWeeks(weeks).map((w) => `${w.from === w.to ? w.from : `${w.from}-${w.to}`}${w.rule === 'odd' ? '单' : w.rule === 'even' ? '双' : ''}`).join('、');
}

export function parseWeeks(input: string): WeekRange[] {
  // 只移除节次括号，不能把 (单)/(双) 一起删掉。
  const text = input.replace(/[（(][^()（）]*节[^()（）]*[）)]/g, '').replace(/第\s*\d{1,2}\s*节/g, '').replace(/第|周|\s|[()（）]/g, '')
    .replace(/[～~—–]/g, '-');
  if (!text) throw new Error('课程缺少周次，请在教务页面显示“节/周”后重试');
  const result: WeekRange[] = [];
  for (const segment of text.split(/[,，、;；]/)) {
    const m = /^(\d{1,2})(?:-(\d{1,2}))?([单双])?$/.exec(segment);
    if (!m) throw new Error(`无法识别周次“${input}”，请检查课表`);
    const from = Number(m[1]);
    const to = Number(m[2] || m[1]);
    if (from < 1 || to < from || to > 60) throw new Error(`周次超出范围：${input}`);
    result.push({ from, to, rule: m[3] === '单' ? 'odd' : m[3] === '双' ? 'even' : 'all' });
  }
  return normalizeWeeks(result);
}

function periods(input: string, fallback?: { from: number; to: number }) {
  const m = /(\d{1,2})\s*[-—–~～]\s*(\d{1,2})\s*节/.exec(input) || /^\s*(\d{1,2})\s*[-—–~～]\s*(\d{1,2})\s*$/.exec(input);
  const one = /(?:第\s*)?(\d{1,2})\s*节/.exec(input) || /^\s*(\d{1,2})\s*$/.exec(input);
  const from = m ? Number(m[1]) : one ? Number(one[1]) : fallback?.from;
  const to = m ? Number(m[2]) : one ? Number(one[1]) : fallback?.to;
  if (!from || !to || from < 1 || to < from || to > 30) throw new Error('无法识别课程节次');
  return { from, to };
}

function locationOf(input: string) {
  return plain(input).replace(/(楼)([A-Za-z]?\d[\w-]*)$/, '$1 $2');
}

type Row = {
  name: string;
  classId?: string;
  className?: string;
  courseCode?: string;
  teacher: string;
  weekday: number;
  from: number;
  to: number;
  location: string;
  weeks: WeekRange[];
  credit?: string;
  note?: string;
};

function hash(input: string) {
  let a = 2166136261;
  let b = 5381;
  for (let i = 0; i < input.length; i++) {
    a = Math.imul(a ^ input.charCodeAt(i), 16777619);
    b = Math.imul(b, 33) ^ input.charCodeAt(i);
  }
  return `${(a >>> 0).toString(36)}-${(b >>> 0).toString(36)}`;
}

function toCourses(rows: Row[], term: string, source: ScheduleResult['source']): ScheduleResult {
  if (!/^\d{4}-\d{4}学年第[123]学期$/.test(term)) throw new Error('未识别到学期，请重新查询课表');
  if (!rows.length) throw new Error('没找到课程，请选择学期并查询“个人课表”');
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    if (!r.name || !Number.isInteger(r.weekday) || r.weekday < 1 || r.weekday > 7) throw new Error('课表字段不完整，请重新查询');
    // DOM 缺少编号时仅在这份个人课表内按课名和教师分组，不宣称已匹配教学班。
    const key = r.classId ? `class:${r.classId}` : JSON.stringify([r.name, r.teacher, r.courseCode]);
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const courses = [...groups.values()].map((items, index): Course => {
    const first = items[0];
    if (items.some((r) => r.name !== first.name)) throw new Error('同一教学班出现不同课程名称，请检查导入数据');
    const sessions: Session[] = [];
    for (const r of items) {
      const existing = sessions.find((s) => s.weekday === r.weekday && s.from === r.from && s.to === r.to &&
        s.location === r.location && s.teacher === r.teacher);
      if (existing) existing.weeks = normalizeWeeks([...(existing.weeks ?? []), ...r.weeks]);
      else sessions.push({ weekday: r.weekday as Session['weekday'], from: r.from, to: r.to,
        location: r.location, teacher: r.teacher, weeks: r.weeks });
    }
    sessions.sort((a, b) => a.weekday - b.weekday || a.from - b.from || a.location.localeCompare(b.location) || (a.teacher ?? '').localeCompare(b.teacher ?? ''));
    const identity = first.classId ? `class:${first.classId}` : `local:${hash(JSON.stringify([first.name, first.teacher, sessions]))}`;
    return {
      id: `swufe-${hash(term)}-${hash(identity)}`,
      name: first.name,
      teacher: [...new Set(items.map((r) => r.teacher))].join('、'),
      sessions, weeks: courseWeeks(sessions), hue: index % 5, members: 0,
      source: { school: 'swufe', term, classId: first.classId, className: first.className, courseCode: first.courseCode },
      credit: first.credit, note: first.note,
    };
  });
  return { term, courses, source };
}

export function coursesFromHtml(html: string): ScheduleResult {
  const start = /\bid\s*=\s*["']table1["']/i.exec(html);
  if (!start) throw new Error('请打开“个人课表查询”并查询，等待课表显示后再读取');
  const end = html.toLowerCase().indexOf('</table>', start.index);
  if (end < 0) throw new Error('课表尚未加载完整，请稍后重试');
  // 页面还有一份 table2 列表，必须限定范围，避免导入两遍。
  const grid = html.slice(start.index, end + 8);
  const term = /(\d{4}-\d{4})学年第\s*([123])\s*学期/.exec(grid);
  const rows: Row[] = [];
  for (const cell of grid.matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/gi)) {
    const id = /^(\d+)-(\d+)$/.exec(attr(cell[1], 'id'));
    if (!id) continue;
    const blocks = cell[2].split(/(?=<div\b[^>]*class=["'][^"']*\btimetable_con\b)/i);
    for (const block of blocks) {
      if (!/\btimetable_con\b/.test(block)) continue;
      const title = /<(u|span)\b([^>]*class=["'][^"']*\btitle\b[^"']*["'][^>]*)>([\s\S]*?)<\/\1>/i.exec(block);
      if (!title) throw new Error('课程标题格式发生变化，请重新查询课表');
      const fields: Record<string, string> = {};
      for (const p of block.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
        const key = /\btitle\s*=\s*(["'])(.*?)\1/.exec(p[1]);
        if (key) fields[plain(key[2])] = plain(p[1].replace(/<span\b[^>]*\btitle=["'][^"']*["'][^>]*>[\s\S]*?<\/span>/gi, ''));
      }
      const time = fields['节/周'] || fields['节次'] || '';
      const row = Number(id[2]);
      const span = Number(attr(cell[1], 'rowspan') || 1);
      rows.push({ name: cleanName(title[3]), classId: attr(title[2], 'data-jxb_id') || undefined,
        teacher: fields['教师'] || '未填写', weekday: Number(id[1]),
        ...periods(time, { from: row, to: row + span - 1 }), location: locationOf(fields['上课地点'] || ''),
        weeks: parseWeeks(time), credit: fields['学分'], note: [fields['课程性质'], fields['重修标记']].filter(Boolean).join(' / ') });
    }
  }
  return toCourses(rows, term ? `${term[1]}学年第${term[2]}学期` : '', 'html');
}

export function coursesFromApi(data: unknown, term: string): ScheduleResult {
  if (!data || typeof data !== 'object' || !Array.isArray((data as { kbList?: unknown }).kbList)) throw new Error('未获取到教务课表数据');
  const list = (data as { kbList: unknown[] }).kbList;
  const rows = list.map((entry): Row => {
    if (!entry || typeof entry !== 'object') throw new Error('课表数据格式异常');
    const r = entry as Record<string, unknown>;
    const name = cleanName(value(r, 'kcmc'));
    const year = value(r, 'xnm');
    const quarter = value(r, 'xqm');
    const semester = ({ '3': '1', '12': '2', '16': '3' } as Record<string, string>)[quarter];
    if ((year && !term.startsWith(`${year}-`)) || (quarter && (!semester || !term.endsWith(`第${semester}学期`)))) {
      throw new Error('课表数据与所选学期不一致，请重新查询后读取');
    }
    return { name, classId: value(r, 'jxb_id') || undefined, className: value(r, 'jxbmc') || undefined,
      courseCode: value(r, 'kch') || undefined, teacher: value(r, 'xm') || '未填写',
      weekday: Number(value(r, 'xqj')), ...periods(value(r, 'jcs') || value(r, 'jc')),
      location: locationOf(value(r, 'cdmc')), weeks: parseWeeks(value(r, 'zcd')),
      credit: value(r, 'xf') || undefined, note: value(r, 'kcxzmc') || undefined };
  });
  return toCourses(rows, term, 'api');
}
