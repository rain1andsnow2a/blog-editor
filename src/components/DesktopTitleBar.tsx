import { useEffect, useState } from 'react';
import { Copy, Maximize2, Minus, X } from 'lucide-react';

const menuLabels = ['File', 'Edit', 'View', 'Window'];

export default function DesktopTitleBar() {
  const desktopApi = typeof window !== 'undefined' ? window.desktopApi : undefined;
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (!desktopApi) return;

    let active = true;
    desktopApi.isMaximized().then((value) => {
      if (active) setIsMaximized(value);
    });
    const unsubscribe = desktopApi.onMaximizedChange(setIsMaximized);

    return () => {
      active = false;
      unsubscribe();
    };
  }, [desktopApi]);

  if (!desktopApi) return null;

  const toggleMaximize = async () => {
    setIsMaximized(await desktopApi.toggleMaximize());
  };

  return (
    <div
      className="desktop-titlebar"
      onDoubleClick={() => { void toggleMaximize(); }}
      aria-label="应用窗口栏"
    >
      <nav className="desktop-titlebar__menus" aria-label="应用菜单">
        {menuLabels.map((label) => (
          <span key={label} className="desktop-titlebar__menu">
            {label}
          </span>
        ))}
      </nav>

      <div className="desktop-titlebar__drag-space" aria-hidden="true" />

      <div className="desktop-titlebar__controls">
        <button
          type="button"
          className="desktop-titlebar__control"
          onClick={() => { void desktopApi.minimize(); }}
          aria-label="最小化"
          title="最小化"
        >
          <Minus />
        </button>
        <button
          type="button"
          className="desktop-titlebar__control"
          onClick={() => { void toggleMaximize(); }}
          aria-label={isMaximized ? '还原窗口' : '最大化'}
          title={isMaximized ? '还原窗口' : '最大化'}
        >
          {isMaximized ? <Copy /> : <Maximize2 />}
        </button>
        <button
          type="button"
          className="desktop-titlebar__control desktop-titlebar__control--close"
          onClick={() => { void desktopApi.close(); }}
          aria-label="关闭"
          title="关闭"
        >
          <X />
        </button>
      </div>
    </div>
  );
}
