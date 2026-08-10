import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, GripHorizontal, Minus } from "lucide-react";
import ChatAiView from "./ChatAiView";

const positionStorageKey = "vault_ai_bubble_position";
const bubbleSize = 44;
const viewportMargin = 24;
const idleCloseDelay = 180000;
const cornerReturnDelay = 20000;

function bottomViewportMargin() {
  return window.innerWidth < 1024 ? 96 : viewportMargin;
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

function defaultPosition() {
  return {
    x: Math.max(viewportMargin, window.innerWidth - bubbleSize - 28),
    y: Math.max(viewportMargin, window.innerHeight - bubbleSize - bottomViewportMargin()),
  };
}

function readPosition() {
  try {
    const saved = JSON.parse(localStorage.getItem(positionStorageKey));
    if (Number.isFinite(saved?.x) && Number.isFinite(saved?.y)) return saved;
  } catch {
    // Fall back to the lower-right corner.
  }
  return defaultPosition();
}

function constrainPosition(position) {
  return {
    x: clamp(position.x, viewportMargin, window.innerWidth - bubbleSize - viewportMargin),
    y: clamp(position.y, viewportMargin, window.innerHeight - bubbleSize - bottomViewportMargin()),
  };
}

function snapToCorner(position) {
  const left = viewportMargin;
  const right = Math.max(left, window.innerWidth - bubbleSize - viewportMargin);
  const top = viewportMargin;
  const bottom = Math.max(top, window.innerHeight - bubbleSize - bottomViewportMargin());
  return {
    x: position.x + bubbleSize / 2 < window.innerWidth / 2 ? left : right,
    y: position.y + bubbleSize / 2 < window.innerHeight / 2 ? top : bottom,
  };
}

function panelPosition(position) {
  const width = Math.min(430, window.innerWidth - 32);
  const height = Math.min(680, window.innerHeight - 32);
  return {
    width,
    height,
    left: clamp(position.x + bubbleSize - width, 16, window.innerWidth - width - 16),
    top: clamp(position.y - height - 12, 16, window.innerHeight - height - 16),
  };
}

export default function FloatingAiChat({ fullPage = false, pageContext }) {
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [initialized, setInitialized] = useState(fullPage);
  const [position, setPosition] = useState(() => constrainPosition(readPosition()));
  const [panel, setPanel] = useState(() => panelPosition(position));
  const widgetRef = useRef(null);
  const dragRef = useRef(null);
  const idleTimerRef = useRef(null);
  const cornerTimerRef = useRef(null);
  const positionRef = useRef(position);

  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  useEffect(() => {
    if (fullPage) setInitialized(true);
  }, [fullPage]);

  useEffect(() => {
    function handleResize() {
      setPosition((current) => {
        const next = constrainPosition(current);
        positionRef.current = next;
        setPanel(panelPosition(next));
        localStorage.setItem(positionStorageKey, JSON.stringify(next));
        return next;
      });
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    window.clearTimeout(cornerTimerRef.current);
    if (open || fullPage || dragging) return undefined;

    cornerTimerRef.current = window.setTimeout(() => {
      setPosition((current) => {
        const next = snapToCorner(current);
        if (next.x === current.x && next.y === current.y) return current;
        positionRef.current = next;
        setPanel(panelPosition(next));
        localStorage.setItem(positionStorageKey, JSON.stringify(next));
        return next;
      });
    }, cornerReturnDelay);
    return () => window.clearTimeout(cornerTimerRef.current);
  }, [dragging, fullPage, open, position.x, position.y]);

  useEffect(() => {
    if (!open || fullPage) return undefined;

    function closeOnOutsideInteraction(event) {
      if (!widgetRef.current?.contains(event.target)) setOpen(false);
    }
    function closeOnEscape(event) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsideInteraction);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideInteraction);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [fullPage, open]);

  const resetIdleTimer = useCallback(() => {
    window.clearTimeout(idleTimerRef.current);
    if (!open || fullPage) return;
    idleTimerRef.current = window.setTimeout(() => setOpen(false), idleCloseDelay);
  }, [fullPage, open]);

  useEffect(() => {
    resetIdleTimer();
    return () => window.clearTimeout(idleTimerRef.current);
  }, [resetIdleTimer]);

  function handlePointerDown(event) {
    if (event.button !== 0) return;
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
      moved: false,
    };
  }

  function handlePointerMove(event) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (Math.hypot(deltaX, deltaY) > 4) drag.moved = true;
    const next = constrainPosition({ x: drag.originX + deltaX, y: drag.originY + deltaY });
    positionRef.current = next;
    setPosition(next);
    setPanel(panelPosition(next));
  }

  function handlePointerUp(event) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    localStorage.setItem(positionStorageKey, JSON.stringify(positionRef.current));
    if (!drag.moved) {
      setInitialized(true);
      setOpen((current) => !current);
    }
  }

  function handlePanelPointerUp(event) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    localStorage.setItem(positionStorageKey, JSON.stringify(positionRef.current));
  }

  return (
    <div ref={widgetRef} onPointerDownCapture={resetIdleTimer} onKeyDownCapture={resetIdleTimer}>
      {initialized && (
        <div
          className={fullPage
            ? ""
            : `${open ? "" : "hidden"} fixed z-50 overflow-hidden rounded-2xl border border-cyan-200/20 bg-[#030b11] shadow-[0_26px_90px_rgba(0,0,0,0.62)]`}
          style={fullPage ? undefined : panel}
          role={fullPage ? undefined : "dialog"}
          aria-label={fullPage ? undefined : "Vault AI assistant"}
          aria-hidden={!fullPage && !open}
        >
          {!fullPage && (
            <div
              key="floating-header"
              className="flex h-12 touch-none cursor-move select-none items-center gap-2 border-b border-cyan-100/10 bg-[#06131b] px-3"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePanelPointerUp}
              onPointerCancel={() => {
                dragRef.current = null;
                setDragging(false);
              }}
              title="Drag to move chat"
            >
              <span className="grid size-7 place-items-center rounded-lg bg-cyan-300/10 text-cyan-300"><Bot className="size-4" /></span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-white">Vault AI</p>
                <p className="truncate text-[10px] text-cyan-300/70">Aware of {pageContext.pageTitle}</p>
              </div>
              <GripHorizontal className="size-4 text-slate-600" aria-hidden="true" />
              <button
                type="button"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => setOpen(false)}
                className="grid size-8 cursor-pointer place-items-center rounded-lg text-slate-400 hover:bg-white/5 hover:text-white"
                aria-label="Minimize AI chat"
              >
                <Minus className="size-4" />
              </button>
            </div>
          )}
          <div key="chat-container" className={fullPage ? "" : "h-[calc(100%-3rem)]"}>
            <ChatAiView compact={!fullPage} pageContext={pageContext} />
          </div>
        </div>
      )}

      {!fullPage && !open && (
        <button
          type="button"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => {
            dragRef.current = null;
            setDragging(false);
          }}
          onClick={(event) => {
            if (event.detail === 0) {
              setInitialized(true);
              setOpen((current) => !current);
            }
          }}
          className="ai-chat-bubble fixed z-[51] grid place-items-center rounded-full border border-cyan-200/35 bg-gradient-to-br from-cyan-300 to-cyan-500 text-[#001316] shadow-[0_8px_24px_rgba(6,182,212,0.3)] outline-none transition-shadow hover:shadow-[0_10px_30px_rgba(6,182,212,0.46)] focus-visible:ring-4 focus-visible:ring-cyan-300/20"
          style={{ left: position.x, top: position.y, width: bubbleSize, height: bubbleSize }}
          aria-label="Open movable AI chat"
          aria-expanded="false"
        >
          <Bot className="size-5" />
          <span className="absolute right-0 top-0 size-2.5 rounded-full border-2 border-[#02090f] bg-emerald-400" />
        </button>
      )}
    </div>
  );
}
