// 文章元信息面板：slug、标题、描述、封面、日期、分类、标签。
// 全部受控，状态仍由 Editor 页面持有；封面上传在组件内完成。
import { useRef, useState, type DragEvent } from 'react';
import { Image as ImageIcon, Upload, X, Tag, Calendar } from 'lucide-react';
import { uploadImage } from '../../lib/api';

type FrontmatterPanelProps = {
  isNew: boolean;
  newSlug: string;
  onNewSlugChange: (v: string) => void;
  title: string;
  onTitleChange: (v: string) => void;
  description: string;
  onDescriptionChange: (v: string) => void;
  cover: string;
  onCoverChange: (v: string) => void;
  /** 封面上传结果之类的提示信息回传给页面顶栏 */
  onNotify: (msg: string) => void;
  pubDate: string;
  onPubDateChange: (v: string) => void;
  category: string;
  onCategoryChange: (v: string) => void;
  tags: string[];
  tagInput: string;
  onTagInputChange: (v: string) => void;
  onAddTag: () => void;
  onRemoveTag: (tag: string) => void;
};

export function FrontmatterPanel({
  isNew, newSlug, onNewSlugChange,
  title, onTitleChange,
  description, onDescriptionChange,
  cover, onCoverChange, onNotify,
  pubDate, onPubDateChange,
  category, onCategoryChange,
  tags, tagInput, onTagInputChange, onAddTag, onRemoveTag,
}: FrontmatterPanelProps) {
  const [isDraggingCover, setIsDraggingCover] = useState(false);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const coverDragDepth = useRef(0);

  const handleCoverUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      onNotify('请拖入图片文件');
      return;
    }

    setIsUploadingCover(true);
    try {
      const { url } = await uploadImage(file);
      onCoverChange(url);
      onNotify('封面已上传，保存文章后生效');
    } catch (err: any) {
      onNotify('封面上传失败: ' + (err.message || String(err)));
    } finally {
      setIsUploadingCover(false);
    }
  };

  const handleCoverDragEnter = (event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    event.stopPropagation();
    coverDragDepth.current += 1;
    setIsDraggingCover(true);
  };

  const handleCoverDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
  };

  const handleCoverDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    event.stopPropagation();
    coverDragDepth.current = Math.max(0, coverDragDepth.current - 1);
    if (coverDragDepth.current === 0) setIsDraggingCover(false);
  };

  const handleCoverDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    coverDragDepth.current = 0;
    setIsDraggingCover(false);

    const file = Array.from(event.dataTransfer.files).find((item) => item.type.startsWith('image/'));
    if (file) {
      void handleCoverUpload(file);
    } else if (event.dataTransfer.files.length > 0) {
      onNotify('请拖入图片文件');
    }
  };

  const openCoverPicker = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e: any) => {
      const file = e.target.files?.[0];
      if (file) handleCoverUpload(file);
    };
    input.click();
  };

  return (
    <>
      {/* Frontmatter: Slug (new only) */}
      {isNew && (
        <div className="mb-6">
          <label className="block text-xs text-notion-text-secondary mb-1 font-medium">
            文件名 (slug)
          </label>
          <input
            type="text"
            value={newSlug}
            onChange={(e) => onNewSlugChange(e.target.value)}
            spellCheck={false}
            placeholder="my-article-slug（留空则根据标题生成）"
            className="w-full px-3 py-2 text-sm border border-notion-border rounded-md focus:outline-none focus:border-notion-accent transition-colors"
          />
        </div>
      )}

      {/* Title */}
      <input
        type="text"
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        spellCheck={false}
        placeholder="无标题"
        className="w-full text-[34px] font-extrabold tracking-tight text-notion-text placeholder:text-notion-text-placeholder focus:outline-none leading-tight mb-2 bg-transparent"
      />

      {/* Description */}
      <input
        type="text"
        value={description}
        onChange={(e) => onDescriptionChange(e.target.value)}
        spellCheck={false}
        placeholder="添加描述..."
        className="w-full text-[15px] text-notion-text-secondary placeholder:text-notion-text-placeholder focus:outline-none mb-4 bg-transparent"
      />

      {/* Cover */}
      <div
        className={`mb-6 rounded-xl border p-3 transition-colors ${
          isDraggingCover
            ? 'border-sky-400 bg-sky-50/80 ring-2 ring-sky-200'
            : 'border-notion-border bg-notion-bg-sidebar/70'
        }`}
        onDragEnter={handleCoverDragEnter}
        onDragOver={handleCoverDragOver}
        onDragLeave={handleCoverDragLeave}
        onDrop={handleCoverDrop}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
              <ImageIcon className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-medium text-notion-text">文章封面</div>
              <div className="truncate text-xs text-notion-text-secondary">
                {isUploadingCover
                  ? '正在上传封面...'
                  : isDraggingCover
                    ? '松开鼠标即可上传图片'
                    : cover || '拖拽图片到此处，或点击上传；未设置时使用默认封面图'}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={openCoverPicker}
              disabled={isUploadingCover}
              className="inline-flex items-center gap-1.5 rounded-md border border-notion-border bg-white px-3 py-1.5 text-sm text-notion-text transition-colors hover:bg-notion-bg-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Upload className="w-3.5 h-3.5" />
              {isUploadingCover ? '上传中...' : '上传封面'}
            </button>
            {cover && (
              <button
                type="button"
                onClick={() => onCoverChange('')}
                className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-notion-text-secondary transition-colors hover:bg-white hover:text-red-500"
              >
                <X className="w-3.5 h-3.5" />
                清空
              </button>
            )}
          </div>
        </div>

        {cover && (
          <div className="mt-3 overflow-hidden rounded-lg border border-notion-border bg-white">
            <img src={cover} alt="文章封面预览" className="h-40 w-full object-cover" />
          </div>
        )}
      </div>

      {/* Meta: date, category & tags — D 彩谱：彩色分类 chips */}
      <div className="flex flex-wrap items-center gap-4 mb-8 pb-6 border-b border-notion-border text-sm">
        <div className="flex items-center gap-1.5 text-notion-text-secondary">
          <Calendar className="w-3.5 h-3.5" />
          <input
            type="date"
            value={pubDate}
            onChange={(e) => onPubDateChange(e.target.value)}
            className="bg-transparent focus:outline-none text-notion-text"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center rounded-full bg-pink-100 px-1 py-0.5">
            <input
              type="text"
              value={category}
              onChange={(e) => onCategoryChange(e.target.value)}
              placeholder="分类"
              className="min-w-[64px] w-24 bg-transparent focus:outline-none text-xs font-medium text-pink-600 text-center placeholder:text-pink-300"
            />
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Tag className="w-3.5 h-3.5 text-notion-text-secondary" />
          {tags.map((tag, i) => (
            <span
              key={tag}
              className={`inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-medium rounded-full ${
                i % 3 === 0
                  ? 'bg-purple-100 text-purple-600'
                  : i % 3 === 1
                    ? 'bg-green-100 text-green-600'
                    : 'bg-sky-100 text-sky-600'
              }`}
            >
              {tag}
              <button onClick={() => onRemoveTag(tag)} className="hover:text-red-500">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          <input
            type="text"
            value={tagInput}
            onChange={(e) => onTagInputChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onAddTag(); } }}
            onBlur={onAddTag}
            placeholder="添加标签..."
            className="bg-transparent focus:outline-none text-xs text-notion-text-secondary w-24"
          />
        </div>
      </div>
    </>
  );
}
