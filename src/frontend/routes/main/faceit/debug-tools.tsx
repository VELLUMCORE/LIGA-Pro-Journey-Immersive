import React from 'react';
import { AppStateContext } from '@liga/frontend/redux';

type FaceitDebugToolsProps = {
  onResolved?: () => Promise<void> | void;
};

type MenuState =
  | { type: 'W'; x: number; y: number }
  | { type: 'L'; x: number; y: number }
  | null;

export default function FaceitDebugTools({ onResolved }: FaceitDebugToolsProps) {
  const { state } = React.useContext(AppStateContext);
  const [appInfo, setAppInfo] = React.useState<{ isDev?: boolean } | null>(null);
  const [working, setWorking] = React.useState(false);
  const [menu, setMenu] = React.useState<MenuState>(null);

  const settings = React.useMemo(() => {
    if (!state.profile?.settings) return null;
    return JSON.parse(state.profile.settings);
  }, [state.profile?.settings]);

  const debugEnabled = Boolean(appInfo?.isDev && settings?.general?.debug);

  React.useEffect(() => {
    api.app.info().then((info: any) => setAppInfo(info)).catch(() => setAppInfo(null));
  }, []);

  React.useEffect(() => {
    if (!menu) return;
    const onClose = () => setMenu(null);
    window.addEventListener('click', onClose);
    return () => window.removeEventListener('click', onClose);
  }, [menu]);

  const run = async (outcome: 'W' | 'D' | 'L', style: 'DEFAULT' | 'MVP' | 'BOTTOM' = 'DEFAULT') => {
    setMenu(null);
    setWorking(true);
    try {
      await api.debug.faceitResult({ outcome, style });
      await onResolved?.();
    } finally {
      setWorking(false);
    }
  };

  if (!debugEnabled) {
    return null;
  }

  return (
    <div className="mt-4 flex flex-col items-center gap-2">
      <div className="text-[11px] uppercase tracking-[0.25em] text-neutral-500">Developer Debug</div>
      <div className="join">
        <button
          type="button"
          className="btn btn-sm join-item"
          disabled={working}
          onClick={() => void run('W')}
          onContextMenu={(event) => {
            event.preventDefault();
            setMenu({ type: 'W', x: event.clientX, y: event.clientY });
          }}
        >
          W
        </button>
        <button
          type="button"
          className="btn btn-sm join-item"
          disabled={working}
          onClick={() => void run('D')}
        >
          D
        </button>
        <button
          type="button"
          className="btn btn-sm join-item"
          disabled={working}
          onClick={() => void run('L')}
          onContextMenu={(event) => {
            event.preventDefault();
            setMenu({ type: 'L', x: event.clientX, y: event.clientY });
          }}
        >
          L
        </button>
      </div>
      {menu && (
        <div
          className="fixed z-[9999] rounded border border-[#ffffff25] bg-[#101010] p-1 shadow-2xl"
          style={{ left: menu.x, top: menu.y }}
        >
          {menu.type === 'W' && (
            <button
              type="button"
              className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-white/10"
              onClick={() => void run('W', 'MVP')}
            >
              Win as MVP
            </button>
          )}
          {menu.type === 'L' && (
            <button
              type="button"
              className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-white/10"
              onClick={() => void run('L', 'BOTTOM')}
            >
              Lose as Bottom Fragger
            </button>
          )}
        </div>
      )}
    </div>
  );
}
