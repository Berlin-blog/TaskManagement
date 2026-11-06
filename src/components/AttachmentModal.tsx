import { useState, useEffect, useRef } from 'react';
import { Modal, Button, EmptyState, toast, confirmAction } from './ui';
import { fetchAttachments, uploadAttachments, deleteAttachmentRemote, attachmentDownloadUrl, fetchStorage, type Attachment, type StorageUsage } from '../db/api';
import { cn } from '../lib/utils';

const ACCEPT = '.xlsx,.xls,.csv,.docx,.doc,.pptx,.ppt,.pdf,.png,.jpg,.jpeg,.gif,.webp,.bmp,.txt,.md,.zip,.7z,.rar';
const ACCEPT_HINT = '支持 xlsx/xls/csv、docx/doc、pptx/ppt、pdf、图片、txt/md、zip/7z/rar（不支持 html/svg 等）';

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** 任务留档弹窗：上传/下载/删除附件 */
export function AttachmentModal({
  task,
  onClose,
}: {
  task: { id: number; title: string } | null;
  onClose: () => void;
}) {
  const [list, setList] = useState<Attachment[]>([]);
  const [storage, setStorage] = useState<StorageUsage | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadStorage = () => {
    fetchStorage().then(setStorage).catch(() => { /* 用量只是辅助信息 */ });
  };

  const load = () => {
    if (!task?.id) return;
    setLoading(true);
    loadStorage();
    fetchAttachments(task.id)
      .then(setList)
      .catch((e) => toast(`加载附件失败：${(e as Error).message}`, { type: 'error' }))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id]);

  if (!task) return null;

  const doUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const n = await uploadAttachments(task.id, Array.from(files));
      toast(`已留档 ${n} 个文件`);
      load();
    } catch (e) {
      toast(`上传失败：${(e as Error).message}`, { type: 'error', duration: 4500 });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const doDelete = async (att: Attachment) => {
    const ok = await confirmAction({
      title: '删除留档文件',
      message: `删除「${att.originalName}」？此操作不可恢复。`,
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteAttachmentRemote(att.id);
      toast('已删除留档文件');
      load();
    } catch (e) {
      toast(`删除失败：${(e as Error).message}`, { type: 'error' });
    }
  };

  return (
    <Modal
      open={!!task}
      onClose={onClose}
      title={`任务留档 - ${task.title.slice(0, 16)}${task.title.length > 16 ? '…' : ''}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>关闭</Button>
          <Button variant="primary" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? '上传中…' : '⬆ 上传文件'}
          </Button>
        </>
      }
    >
      <input
        ref={fileRef}
        type="file"
        multiple
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => doUpload(e.target.files)}
      />
      {storage && (
        <p className="mb-1 text-[11px] text-slate-500">
          附件空间已用 {storage.usedMb}MB / {storage.quotaMb}MB（共 {storage.count} 个）
          {storage.used / storage.quota > 0.8 && (
            <span className="ml-1 font-medium text-amber-600">接近上限，建议清理旧文件</span>
          )}
        </p>
      )}
      <p className="mb-2 text-[11px] leading-relaxed text-slate-500">{ACCEPT_HINT}</p>
      {loading ? (
        <p className="py-8 text-center text-sm text-slate-500">加载中…</p>
      ) : list.length === 0 ? (
        <EmptyState title="还没有留档文件" hint={`上传 Excel、PPT、PDF 或图片，下次可直接点击下载。${ACCEPT_HINT}`} />
      ) : (
        <div className="space-y-2 max-h-[360px] overflow-y-auto">
          {list.map((att) => (
            <div key={att.id} className="flex items-center gap-2 rounded-lg border border-slate-100 px-3 py-2 hover:bg-slate-50/60">
              <span className="text-base">{/\.(xlsx|xls|csv)$/i.test(att.originalName) ? '📊' : /\.(pdf)$/i.test(att.originalName) ? '📕' : /\.(docx?|txt|md)$/i.test(att.originalName) ? '📄' : /\.(png|jpe?g|gif|webp)$/i.test(att.originalName) ? '🖼️' : '📎'}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-700" title={att.originalName}>{att.originalName}</p>
                <p className="text-[11px] text-slate-500">
                  {fmtSize(att.size)} · {new Date(att.uploadedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              <a
                href={attachmentDownloadUrl(att.id)}
                className="rounded px-2 py-1 text-xs text-brand-600 hover:bg-brand-50"
              >
                下载
              </a>
              <button
                className={cn('rounded px-2 py-1 text-xs text-rose-500 hover:bg-rose-50')}
                onClick={() => doDelete(att)}
              >
                删
              </button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
