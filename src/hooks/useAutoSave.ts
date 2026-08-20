// 自动保存状态机：2 秒防抖、快照对比、状态徽章、离开页面前的兜底。
// 载荷的组装（frontmatter + content）由调用方提供，hook 只管节奏。
import { useState, useRef, useCallback, useEffect } from 'react';
import type { Editor } from '@tiptap/react';

export type AutoSaveStatus = 'idle' | 'editing' | 'saving' | 'saved' | 'error';

export type AutoSavePayload = {
  /** 用于和上次保存对比的快照（JSON 字符串） */
  snapshot: string;
  /** 具体结构由调用方决定，hook 只负责透传给 save */
  frontmatter: any;
  content: string;
};

export function useAutoSave({ enabled, editor, buildPayload, save }: {
  /** 新建文章等场景关闭自动保存 */
  enabled: boolean;
  editor: Editor | null;
  /** 返回 null 表示当前不具备保存条件（如标题为空） */
  buildPayload: () => AutoSavePayload | null;
  save: (payload: AutoSavePayload) => Promise<void>;
}) {
  const [status, setStatus] = useState<AutoSaveStatus>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef('');
  const isDirtyRef = useRef(false);

  // 回调每次渲染都会变，用 ref 保证定时器里拿到的是最新逻辑
  const buildPayloadRef = useRef(buildPayload);
  buildPayloadRef.current = buildPayload;
  const saveRef = useRef(save);
  saveRef.current = save;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const performAutoSave = useCallback(async () => {
    if (!enabledRef.current) return;
    const payload = buildPayloadRef.current();
    if (!payload) return;
    try {
      if (payload.snapshot === lastSavedRef.current) {
        isDirtyRef.current = false;
        setStatus('idle');
        return;
      }

      setStatus('saving');
      await saveRef.current(payload);
      lastSavedRef.current = payload.snapshot;
      isDirtyRef.current = false;
      setStatus('saved');
      if (statusTimer.current) clearTimeout(statusTimer.current);
      statusTimer.current = setTimeout(() => setStatus('idle'), 2000);
    } catch {
      setStatus('error');
      if (statusTimer.current) clearTimeout(statusTimer.current);
      statusTimer.current = setTimeout(() => setStatus('idle'), 3000);
    }
  }, []);

  const schedule = useCallback(() => {
    if (!enabledRef.current) return;
    isDirtyRef.current = true;
    setStatus('editing');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      performAutoSave();
    }, 2000);
  }, [performAutoSave]);

  /** 手动保存成功后同步快照，避免紧接着的自动保存重复提交 */
  const markSaved = useCallback((snapshot: string) => {
    lastSavedRef.current = snapshot;
    isDirtyRef.current = false;
    setStatus('idle');
  }, []);

  /** 手动保存前取消排队中的自动保存 */
  const cancelPending = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  // Watch editor content changes
  useEffect(() => {
    if (!enabled || !editor) return;

    const onUpdate = () => schedule();
    editor.on('update', onUpdate);
    return () => {
      editor.off('update', onUpdate);
    };
  }, [editor, enabled, schedule]);

  // Warn before leaving with unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirtyRef.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => {
      window.removeEventListener('beforeunload', handler);
      if (timer.current) clearTimeout(timer.current);
      if (statusTimer.current) clearTimeout(statusTimer.current);
    };
  }, []);

  // Flush pending auto-save before navigating away (within the app)
  useEffect(() => {
    return () => {
      if (isDirtyRef.current && timer.current) {
        clearTimeout(timer.current);
        // Fire save synchronously on unmount is not reliable,
        // so we do a best-effort immediate call
        performAutoSave();
      }
    };
  }, [performAutoSave]);

  return { status, schedule, markSaved, cancelPending, lastSavedRef, isDirtyRef };
}
