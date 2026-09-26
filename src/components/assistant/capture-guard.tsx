"use client"

import { useEffect, useRef, useState } from "react"
import { useLocation } from "react-router-dom"
import { getApiUrl } from "@/lib/utils/api"
import { toast } from "sonner"

/**
 * Screen-capture deterrent for the assistant admin screens.
 *
 * Read this before relying on it.
 *
 * A web page cannot prevent a screenshot. The operating system takes the
 * picture; the browser is never asked, and on Windows, macOS, Android and iOS
 * alike a phone pointed at the monitor works regardless. Any claim to the
 * contrary is false, and building on that claim is worse than building on
 * nothing, because it stops people from applying the controls that do work.
 *
 * What this component actually does, in descending order of usefulness:
 *
 *   1. Attributes and logs the attempt. PrintScreen, the clipboard, Ctrl+P and
 *      getDisplayMedia() all report to /api/assistant/security-event, which
 *      writes to the assistant's activity log with their email, the page, the
 *      time and their IP. The administrator sees it. This is the part that
 *      changes behaviour, and it is the reason the rest is here at all.
 *   2. Watermarks the screen with the assistant's email and the current time,
 *      so a photograph of the monitor identifies who was sitting at it.
 *   3. Blanks the content when the tab loses focus, so a capture tool started
 *      from another window finds nothing on screen.
 *   4. Empties the clipboard after PrintScreen, which defeats the plain
 *      "PrtScn then paste into Paint" route on Windows - but only while the
 *      page has focus and only when the browser grants clipboard access.
 *   5. Makes the page print as a notice rather than as data, and blocks copy,
 *      cut and the context menu.
 *
 * None of 3-5 stops a determined person. All of 1-2 make it traceable, which
 * is the control that actually holds. If the data genuinely must not leave the
 * building, that is an endpoint-management problem, not a CSS one.
 */

const CAPTURE_KEYS = new Set(["PrintScreen", "F13"])

export default function CaptureGuard({ email }: { email: string }) {
  const location = useLocation()
  const lastReport = useRef<Record<string, number>>({})
  const [obscured, setObscured] = useState(false)

  // Hide the content whenever this window is not the focused one. A capture
  // tool has to be clicked, and clicking it takes focus away from here - so by
  // the time the snip is drawn there is a cover over the data. It is a real
  // obstacle to the Snipping Tool and to nothing else.
  useEffect(() => {
    const hide = () => setObscured(true)
    const show = () => setObscured(false)

    window.addEventListener("blur", hide)
    window.addEventListener("focus", show)
    return () => {
      window.removeEventListener("blur", hide)
      window.removeEventListener("focus", show)
    }
  }, [])

  useEffect(() => {
    /** One report per event type per 10s, so a held-down key is not a flood. */
    const report = (event: string) => {
      const now = Date.now()
      if (now - (lastReport.current[event] || 0) < 10_000) return
      lastReport.current[event] = now

      void fetch(getApiUrl("/api/assistant/security-event"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event, path: location.pathname }),
      }).catch(() => {
        /* the log is best-effort; never interrupt the person's work */
      })
    }

    const warn = (message: string) => toast.warning(message, { duration: 4000 })

    const onKeyDown = (e: KeyboardEvent) => {
      // Windows PrintScreen fires keyup, not keydown, in most browsers - both
      // are handled and the report is de-duplicated above.
      if (CAPTURE_KEYS.has(e.key)) {
        clearClipboard()
        report("screenshot.keypress")
        warn("Screenshots are not permitted here. This attempt has been logged.")
        return
      }

      // Ctrl/Cmd+P, and the Windows snipping shortcut Win+Shift+S (which the
      // browser sees only as Shift+S with the meta key on some layouts).
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") {
        e.preventDefault()
        report("screenshot.print")
        warn("Printing is disabled on this screen. This attempt has been logged.")
        return
      }

      if (e.shiftKey && e.metaKey && e.key.toLowerCase() === "s") {
        report("screenshot.keypress")
        warn("Screen capture is not permitted here. This attempt has been logged.")
      }
    }

    const onKeyUp = (e: KeyboardEvent) => {
      if (CAPTURE_KEYS.has(e.key)) {
        clearClipboard()
        report("screenshot.keypress")
        warn("Screenshots are not permitted here. This attempt has been logged.")
      }
    }

    /**
     * Overwrite whatever PrintScreen just put on the clipboard.
     *
     * Only works while the document has focus and the browser allows it, which
     * is precisely the PrtScn-then-paste case - and nothing else.
     */
    const clearClipboard = () => {
      try {
        if (document.hasFocus() && navigator.clipboard?.writeText) {
          void navigator.clipboard.writeText("").catch(() => {})
        }
      } catch {
        /* clipboard permission denied - nothing to do */
      }
    }

    const onCopy = (e: ClipboardEvent) => {
      e.preventDefault()
      report("copy.blocked")
    }

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault()
      report("contextmenu.blocked")
    }

    const onBeforePrint = () => report("screenshot.print")

    const onVisibility = () => {
      if (document.visibilityState === "hidden") report("screen.hidden")
    }

    document.addEventListener("keydown", onKeyDown, true)
    document.addEventListener("keyup", onKeyUp, true)
    document.addEventListener("copy", onCopy)
    document.addEventListener("cut", onCopy)
    document.addEventListener("contextmenu", onContextMenu)
    document.addEventListener("visibilitychange", onVisibility)
    window.addEventListener("beforeprint", onBeforePrint)

    /**
     * Screen-share and tab-capture started from this page. A capture started
     * from the OS or another tab never reaches this, which is most of them -
     * this catches the browser-initiated case only.
     */
    const media = navigator.mediaDevices as any
    const originalGetDisplayMedia = media?.getDisplayMedia?.bind(media)
    if (originalGetDisplayMedia) {
      media.getDisplayMedia = async (...args: any[]) => {
        report("screenshot.capture_api")
        warn("Screen sharing is not permitted here. This attempt has been logged.")
        throw new DOMException("Screen capture is disabled on this page", "NotAllowedError")
      }
    }

    return () => {
      document.removeEventListener("keydown", onKeyDown, true)
      document.removeEventListener("keyup", onKeyUp, true)
      document.removeEventListener("copy", onCopy)
      document.removeEventListener("cut", onCopy)
      document.removeEventListener("contextmenu", onContextMenu)
      document.removeEventListener("visibilitychange", onVisibility)
      window.removeEventListener("beforeprint", onBeforePrint)
      if (originalGetDisplayMedia) media.getDisplayMedia = originalGetDisplayMedia
    }
  }, [location.pathname])

  return (
    <>
      {/*
        Blank the page while it is not the focused window, and replace the
        printed page with a notice. Both are pure CSS so there is no frame where
        the content is visible before React catches up.
      */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          body::after {
            visibility: visible !important;
            content: "This screen cannot be printed. The attempt has been recorded.";
            position: fixed; inset: 0; display: flex;
            align-items: center; justify-content: center;
            font-size: 18px; font-family: system-ui, sans-serif; text-align: center; padding: 40px;
          }
        }
        .assistant-shell {
          -webkit-user-select: none;
          user-select: none;
        }
        /* Typing must still work, so inputs opt back in. */
        .assistant-shell input,
        .assistant-shell textarea,
        .assistant-shell [contenteditable="true"] {
          -webkit-user-select: text;
          user-select: text;
        }
        .assistant-shell img { -webkit-user-drag: none; user-drag: none; pointer-events: none; }
      `}</style>

      <Watermark email={email} />

      {obscured && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-background/98 backdrop-blur-2xl">
          <div className="max-w-sm px-8 text-center">
            <p className="text-sm font-semibold text-foreground">Hidden while this window is not in focus</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Click anywhere to bring the page back. Signed in as {email}.
            </p>
          </div>
        </div>
      )}
    </>
  )
}

/**
 * A tiled, non-interactive overlay carrying the assistant's email and the
 * current time. Anything captured - by any means, including a phone - carries
 * the identity of whoever was signed in when it was taken.
 */
function Watermark({ email }: { email: string }) {
  const stamp = new Date().toLocaleString()
  const text = `${email} · ${stamp}`

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[60] overflow-hidden select-none"
      style={{ mixBlendMode: "multiply" }}
    >
      <div
        className="absolute inset-0 opacity-[0.055] dark:opacity-[0.09]"
        style={{
          backgroundImage: `url("data:image/svg+xml;utf8,${encodeURIComponent(
            `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="240">
               <text x="0" y="60" transform="rotate(-24 0 60)"
                     font-family="system-ui, sans-serif" font-size="17" fill="currentColor">${escapeXml(text)}</text>
               <text x="120" y="190" transform="rotate(-24 120 190)"
                     font-family="system-ui, sans-serif" font-size="17" fill="currentColor">${escapeXml(text)}</text>
             </svg>`
          )}")`,
          backgroundRepeat: "repeat",
          color: "currentColor",
        }}
      />
    </div>
  )
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}
