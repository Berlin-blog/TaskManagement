import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useSettings, useWeekNames, saveSettings, clearAllData } from '../hooks/useTasks';
import {
  Card, CardTitle, Button, Input, Badge, PageSkeleton, confirmAction, PageHeader, SectionTitle,
} from '../components/ui';
import { Icon } from '../components/icons';
import { DEFAULT_SETTINGS } from '../types';
import type { Priority } from '../types';

export default function Settings() {
  const settings = useSettings();
  const sortedWeeks = useWeekNames();
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [p3, setP3] = useState('');
  const [special, setSpecial] = useState('');
  const [periodic, setPeriodic] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [inited, setInited] = useState(false);
  const [weekOrderDraft, setWeekOrderDraft] = useState<string[] | null>(null);

  useEffect(() => {
    if (settings && !inited) {
      setP1(settings.priorityMap[1]);
      setP2(settings.priorityMap[2]);
      setP3(settings.priorityMap[3]);
      setSpecial(settings.specialTexts.join('、'));
      setPeriodic(settings.periodicKeywords.join('、'));
      setInited(true);
    }
  }, [settings, inited]);

  if (!settings) return <PageSkeleton />;

  const currentOrder = weekOrderDraft ?? settings.weekOrder ?? [];
  const isCustomized = currentOrder.length > 0;
  const displayOrder = weekOrderDraft && weekOrderDraft.length > 0
    ? weekOrderDraft
    : (sortedWeeks ?? []);

  const moveWeek = (idx: number, dir: -1 | 1) => {
    const list = [...displayOrder];
    const target = idx + dir;
    if (target < 0 || target >= list.length) return;
    [list[idx], list[target]] = [list[target], list[idx]];
    setWeekOrderDraft(list);
  };

  const save = async () => {
    const parseList = (s: string) =>
      s.split(/[、,，\n]/).map((x) => x.trim()).filter(Boolean);
    setSaving(true);
    try {
      await saveSettings({
        priorityMap: { 1: p1 || '高', 2: p2 || '中', 3: p3 || '低' } as Record<Priority, string>,
        specialTexts: parseList(special).length ? parseList(special) : DEFAULT_SETTINGS.specialTexts,
        periodicKeywords: parseList(periodic),
        weekOrder: currentOrder,
      });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1800);
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    const ok = await confirmAction({
      title: '清空全部数据',
      message: '确认清空数据库中的全部任务、变更日志、导入历史与附件？\n此操作不可恢复，建议先到「导入导出」导出一份备份。',
      confirmText: '清空全部数据',
      danger: true,
    });
    if (!ok) return;
    try {
      await clearAllData();
    } catch { /* 写操作层已提示 */ }
  };

  return (
    <div className="page-stack">
      <PageHeader
        title="设置"
        subtitle="任务选项、周顺序与数据管理；设置保存在本地数据库，不会随浏览器清缓存丢失。"
        scope={
          <>
            <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-200">本地 MySQL</Badge>
            <span className="num text-xs text-slate-500">{(sortedWeeks ?? []).length} 个周</span>
          </>
        }
        actions={
          <>
            {saved && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700" role="status">
                <Icon name="check" className="h-3.5 w-3.5" />
                已保存
              </span>
            )}
            <Button variant="primary" className="min-h-9" onClick={save} disabled={saving}>
              {saving ? '保存中…' : '保存设置'}
            </Button>
          </>
        }
      />

      <section className="space-y-3">
        <SectionTitle title="任务选项" subtitle="影响任务导入、展示和优先级命名" />
        <Card>
          <CardTitle>P 优先级映射</CardTitle>
          <p className="mb-3 text-xs leading-relaxed text-slate-500">显示在任务列表、看板和筛选器中的优先级名称。</p>
          <div className="grid grid-cols-3 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs text-slate-500">P1</span>
              <Input value={p1} onChange={(e) => setP1(e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-slate-500">P2</span>
              <Input value={p2} onChange={(e) => setP2(e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-slate-500">P3</span>
              <Input value={p3} onChange={(e) => setP3(e.target.value)} />
            </label>
          </div>
        </Card>

        <Card>
          <CardTitle>特殊日期文本</CardTitle>
          <p className="mb-2 text-xs text-slate-400">用「、」或逗号分隔。这些文本不会强行转为日期，按原文保留并标记为特殊。</p>
          <Input value={special} onChange={(e) => setSpecial(e.target.value)} placeholder="持续、待定、空" />
        </Card>

        <Card>
          <CardTitle>周期任务关键词</CardTitle>
          <p className="mb-2 text-xs text-slate-400">名称包含这些关键词的任务，导入时自动标记为周期任务，可一键复制到新一周。</p>
          <Input value={periodic} onChange={(e) => setPeriodic(e.target.value)} placeholder="周报、动销金额、周日更新" />
        </Card>
      </section>

      <section className="space-y-3">
        <SectionTitle title="周设置" subtitle="控制周列表的起始与显示顺序" />
        <Card>
          <CardTitle>周起始日</CardTitle>
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Badge className="bg-brand-50 text-brand-700 ring-brand-200">周一</Badge>
            <span className="text-slate-400">（固定为周一，与排期习惯一致）</span>
          </div>
        </Card>

        <Card>
          <CardTitle>周顺序</CardTitle>
          <p className="mb-3 text-xs text-slate-400">
            默认按「X月第Y周」自动识别中文数字排序（9月第二周 &lt; 9月第三周 &lt; 10月第一周）。
            可用 ↑↓ 自定义顺序，保存后所有页面的周列表、翻周箭头、图表都会按此顺序显示。
          </p>
          {isCustomized && (
            <div className="mb-2 flex items-center gap-2">
              <Badge className="bg-amber-50 text-amber-700 ring-amber-200">已自定义</Badge>
              <button
                type="button"
                className="text-xs text-slate-400 underline hover:text-slate-600"
                onClick={() => setWeekOrderDraft([])}
              >
                恢复自动排序
              </button>
            </div>
          )}
          <div className="max-h-[320px] space-y-1 overflow-y-auto">
            {displayOrder.map((w, i) => (
              <div key={w} className="flex items-center gap-2 rounded-lg border border-slate-100 px-3 py-1.5">
                <span className="w-6 text-center text-xs text-slate-300">{i + 1}</span>
                <span className="flex-1 text-sm text-slate-700">{w}</span>
                <button
                  type="button"
                  className="rounded px-1.5 py-0.5 text-xs text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                  disabled={i === 0}
                  onClick={() => moveWeek(i, -1)}
                  title="上移"
                  aria-label="上移"
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="rounded px-1.5 py-0.5 text-xs text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                  disabled={i === displayOrder.length - 1}
                  onClick={() => moveWeek(i, 1)}
                  title="下移"
                  aria-label="下移"
                >
                  ↓
                </button>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-slate-300">调整后点击页面上方“保存设置”生效。</p>
        </Card>
      </section>

      <section className="space-y-3">
        <SectionTitle title="存储与数据" subtitle="数据保存在本地，建议定期导出备份" />
        <Card>
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <Icon name="import" className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-700">任务与日志保存在本地 MySQL</p>
              <p className="mt-0.5 text-xs text-slate-400">附件目录需要与数据库分开备份；可在导入导出页完成 xlsx 离线备份。</p>
            </div>
            <Link to="/import-export">
              <Button variant="outline" className="min-h-9">
                去导入导出
                <Icon name="arrow-right" className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </Card>

        <Card className="border-rose-200 bg-rose-50/30">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="mb-1 text-rose-800">危险操作</CardTitle>
              <p className="text-xs leading-relaxed text-rose-600">
                清空数据库中的全部任务、变更日志、导入历史与附件文件；设置会保留。此操作不可恢复。
              </p>
            </div>
            <Button variant="danger" className="min-h-9 shrink-0 border border-rose-200 bg-white" onClick={reset}>
              <Icon name="trash" className="h-4 w-4" />
              清空全部数据
            </Button>
          </div>
        </Card>
      </section>
    </div>
  );
}
