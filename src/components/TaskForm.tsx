import { useState, useEffect, useCallback } from 'react';
import type { Task, Priority, AppSettings } from '../types';
import { Modal, Input, Select, Button, toast } from './ui';
import { uuid } from '../lib/utils';
import { parseDate, formatDateShort, isSpecialText } from '../lib/date';
import { priorityLabel } from '../lib/status';
import { normalizeWeekName, displayWeekName, parseWeekName, hasExplicitWeekYear } from '../lib/weekSort';

export function TaskForm({
  open,
  onClose,
  onSave,
  initial,
  weekName,
  weekNames,
  settings,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (t: Task) => void | Promise<void>;
  initial?: Task | null;
  weekName: string;
  weekNames: string[];
  settings?: AppSettings;
}) {
  const buildEmpty = useCallback((): Task => ({
    uid: uuid(),
    weekName,
    seq: 0,
    title: '',
    requester: '',
    priority: 3,
    attachmentCount: 0,
    estimatedDate: null,
    estimatedDateText: '',
    revisedDate: null,
    revisedDateText: '',
    isSpecialDate: false,
    isCompleted: false,
    completedAt: null,
    completedAtText: '',
    remark: '',
    status: 'notStarted',
    isPeriodic: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }), [weekName]);

  const [form, setForm] = useState<Task>(() => initial ?? buildEmpty());
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ title?: string; week?: string }>({});

  // 每次打开都重新初始化，避免复用上一条的 uid / 内容（之前会出现 uid 重复、序号全 1）
  useEffect(() => {
    if (!open) return;
    setForm(initial ? { ...initial } : buildEmpty());
    setSaving(false);
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);

  const set = (patch: Partial<Task>) => {
    setForm((f) => ({ ...f, ...patch }));
    if ('title' in patch) setErrors((e) => ({ ...e, title: undefined }));
    if ('weekName' in patch) setErrors((e) => ({ ...e, week: undefined }));
  };

  // 表单打开时那一周所属的年份：只写「1月第一周」时按它补全，避免被推断到别的年份
  const contextYear = parseWeekName(weekName)?.year ?? null;
  const normalizedWeek = (() => {
    const raw = form.weekName.trim();
    if (!raw) return '';
    const withYear = hasExplicitWeekYear(raw) || !contextYear ? raw : `${contextYear}年${raw}`;
    return normalizeWeekName(withYear);
  })();

  const submit = async () => {
    const title = form.title.trim();
    // 周名统一补年份（9月第二周 -> 2026年9月第二周），避免跨年同名周混在一起
    const week = normalizedWeek;
    if (!title || !week) {
      setErrors({
        title: title ? undefined : '请填写任务名称',
        week: week ? undefined : '请选择或输入任务所属周',
      });
      if (!title) toast('请填写任务名称', { type: 'error' });
      else toast('请选择或输入任务所属周', { type: 'error' });
      return;
    }
    const estimatedDateText = form.estimatedDateText.trim();
    const revisedDateText = form.revisedDateText.trim();
    const estimatedDate = parseDate(estimatedDateText);
    const revisedDate = parseDate(revisedDateText);
    const special = isSpecialText(estimatedDateText) || isSpecialText(revisedDateText);
    const payload: Task = {
      ...form,
      title,
      weekName: week,
      seq: initial ? form.seq : 0,
      estimatedDate,
      estimatedDateText,
      revisedDate,
      revisedDateText,
      isSpecialDate: special,
      specialDateText: isSpecialText(estimatedDateText)
        ? estimatedDateText
        : isSpecialText(revisedDateText)
          ? revisedDateText
          : undefined,
      updatedAt: Date.now(),
    };
    setSaving(true);
    try {
      await onSave(payload);
      onClose();
    } catch {
      // 错误提示已在写操作层统一 toast，这里保持弹窗打开便于修改
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => { if (!saving) onClose(); }}
      title={initial ? '编辑任务' : '新增任务'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>取消</Button>
          <Button variant="primary" onClick={submit} disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="所属周（可从已有周选择，或直接输入新周名）">
          <div className="flex gap-2">
            <Select
              value={weekNames.includes(form.weekName) ? form.weekName : '__custom__'}
              onChange={(e) => {
                if (e.target.value === '__custom__') return;
                set({ weekName: e.target.value });
              }}
              className="w-auto min-w-[140px]"
            >
              <option value="">— 选择已有周 —</option>
              {weekNames.map((w) => (
                <option key={w} value={w}>{displayWeekName(w)}</option>
              ))}
              {form.weekName && !weekNames.includes(form.weekName) && (
                <option value={form.weekName}>{displayWeekName(form.weekName)}</option>
              )}
            </Select>
            <Input
              value={form.weekName}
              onChange={(e) => set({ weekName: e.target.value })}
              placeholder="或输入新周名，如 10月第一周"
              className={`flex-1 ${errors.week ? 'border-rose-400 focus:border-rose-400 focus:ring-rose-300/40' : ''}`}
              aria-invalid={!!errors.week}
            />
          </div>
          {errors.week && <p className="mt-1 text-[11px] text-rose-600">{errors.week}</p>}
          {normalizedWeek && normalizedWeek !== form.weekName.trim() && (
            <p className="mt-1 text-[11px] text-brand-500">
              将保存为「{normalizedWeek}」（自动补年份，跨年同名周不会互相覆盖）
            </p>
          )}
        </Field>
        <Field label="任务名称">
          <Input
            value={form.title}
            onChange={(e) => set({ title: e.target.value })}
            placeholder="如：国宝红周报周一更新"
            className={errors.title ? 'border-rose-400 focus:border-rose-400 focus:ring-rose-300/40' : ''}
            aria-invalid={!!errors.title}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          />
          {errors.title && <p className="mt-1 text-[11px] text-rose-600">{errors.title}</p>}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="需求人">
            <Input value={form.requester} onChange={(e) => set({ requester: e.target.value })} />
          </Field>
          <Field label="P 优先级">
            <Select
              value={form.priority}
              onChange={(e) => set({ priority: Number(e.target.value) as Priority })}
            >
              <option value={1}>P1 {priorityLabel(1, settings)}</option>
              <option value={2}>P2 {priorityLabel(2, settings)}</option>
              <option value={3}>P3 {priorityLabel(3, settings)}</option>
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="预估时间（26.9.7 / 持续 / 待定）">
            <Input
              value={form.estimatedDateText}
              onChange={(e) => set({ estimatedDateText: e.target.value })}
              placeholder="26.9.7"
            />
            {form.estimatedDateText && parseDate(form.estimatedDateText) && (
              <p className="mt-1 text-[11px] text-emerald-600">→ {formatDateShort(parseDate(form.estimatedDateText))}</p>
            )}
            {form.estimatedDateText && isSpecialText(form.estimatedDateText) && (
              <p className="mt-1 text-[11px] text-amber-600">特殊日期，按原文保留</p>
            )}
          </Field>
          <Field label="修订时间">
            <Input
              value={form.revisedDateText}
              onChange={(e) => set({ revisedDateText: e.target.value })}
              placeholder="留空"
            />
            {form.revisedDateText && parseDate(form.revisedDateText) && (
              <p className="mt-1 text-[11px] text-amber-600">→ {formatDateShort(parseDate(form.revisedDateText))}</p>
            )}
          </Field>
        </div>
        <Field label="备注">
          <Input value={form.remark} onChange={(e) => set({ remark: e.target.value })} placeholder="可选" />
        </Field>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={form.isPeriodic}
            onChange={(e) => set({ isPeriodic: e.target.checked })}
            className="h-4 w-4 rounded accent-brand-600"
          />
          标记为周期任务（可一键复制到新一周）
        </label>
      </div>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      {children}
    </label>
  );
}
