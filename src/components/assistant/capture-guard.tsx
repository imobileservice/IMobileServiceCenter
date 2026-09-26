"use client"

import { useEffect, useRef, useState } from "react"
import { useLocation } from "react-router-dom"
import { getApiUrl } from "@/lib/utils/api"
import { toast } from "sonner"

/**
 * Screen-capture and data-sharing guard for the assistant admin screens.
 *
 * Read this before relying on it.
 *
 * A web page cannot make a screenshot impossible. The operating system takes
 * the picture, and a phone pointed at the monitor needs no software at all.
 * What a page CAN do is win the race against most capture tools and make every
 * capture that still gets through traceable to a person. This does both:
 *
 *   1. THE SHIELD. The moment a capture key is pressed - PrintScreen, the
 *      Windows key (Win+Shift+S, Win+PrtScn, Win+G, Win+Alt+R all start with
 *      it) - or the window loses focus, the whole page is hidden behind a
 *      notice. It is a class on <html>, not React state, so it goes up in the
 *      same frame as the key event: the capture tools take longer than that to
 *      start, which is exactly how an earlier version's warning toast ended up
 *      INSIDE a screenshot - there was time to react, and it was not used.
 *   2. THE WATERMARK. The assistant's name, email and the current time tiled
 *      across every screen, above every dialog. Whatever beats the shield - a
 *      phone photo, a capture tool on a timer - identifies who took it.
 *   3. THE LOG. Every attempt is reported to /api/assistant/security-event and
 *      shows in the administrator's Activity tab with the assistant's email,
 *      the page, the time and their IP.
 *   4. The rest: printing shows a notice, copy/cut/drag/right-click are off,
 *      Ctrl+S / Ctrl+U and the developer-tools shortcuts are refused, the
 *      clipboard is emptied after PrintScreen, and screen sharing started from
 *      this page is refused.
 *
 * What still gets through: a phone camera, a capture tool on a delay timer
 * while the person clicks back into the page, and a screen recording that was
 * already running before the page opened. For those, the watermark is the
 * control. Stopping them outright takes a managed device or a native app, not
 * a web page.
 */

const SHIELD_CLASS = "capture-shield"

/** Keys that are a capture on their own. F13 is PrintScreen on some keyboards. */
const CAPTURE_KEYS = new Set(["PrintScreen", "F13"])

/** The Windows / Command key. Every Windows capture shortcut starts with it. */
const OS_KEYS = new Set(["Meta", "OS"])

/**
 * Capture shortcuts that ride on the Windows / Command key, matched by physical
 * key because Shift changes e.key ("3" arrives as "#"). The shield is already
 * up by the time these arrive; this decides only what gets logged.
 *   Win+Shift+S snip · Win+G Game Bar · Win+Alt+R record
 *   Cmd+Shift+3/4/5/6 macOS screenshots
 */
const isOsCaptureShortcut = (e: KeyboardEvent) =>
  e.metaKey &&
  ((e.shiftKey && ["KeyS", "Digit3", "Digit4", "Digit5", "Digit6"].includes(e.code)) ||
    (!e.shiftKey && !e.altKey && e.code === "KeyG") ||
    (e.altKey && e.code === "KeyR"))

/** How long the shield stays up after a capture key, even if focus never leaves. */
const SHIELD_HOLD_MS = 2500

/** Delay before lowering on focus, so a tool that hands focus straight back gets nothing. */
const RESUME_DELAY_MS = 300

export default function CaptureGuard({ email, name }: { email: string; name?: string | null }) {
  const location = useLocation()
  const pathRef = useRef(location.pathname)
  pathRef.current = location.pathname

  useEffect(() => {
    const root = document.documentElement
    const lastReport: Record<string, number> = {}
    let holdUntil = 0
    let osKeyDown = false
    let lowerTimer: number | undefined

    /* --- the shield ------------------------------------------------ */

    const raise = (holdMs = 0) => {
      root.classList.add(SHIELD_CLASS)
      holdUntil = Math.max(holdUntil, Date.now() + holdMs)
      scheduleLower(holdMs || RESUME_DELAY_MS)
    }

    const scheduleLower = (delayMs: number) => {
      window.clearTimeout(lowerTimer)
      lowerTimer = window.setTimeout(lowerIfSafe, delayMs)
    }

    // Only when this window has focus again, is visible, the Windows key is
    // up, and any capture-key hold has run out. Otherwise it stays hidden and
    // the next focus/keyup tries again.
    const lowerIfSafe = () => {
      if (!document.hasFocus() || document.visibilityState !== "visible" || osKeyDown) return
      const wait = holdUntil - Date.now()
      if (wait > 0) return scheduleLower(wait)
      root.classList.remove(SHIELD_CLASS)
    }

    /* --- reporting ------------------------------------------------- */

    /** One report per event type per 10s, so a held-down key is not a flood. */
    const report = (event: string) => {
      const now = Date.now()
      if (now - (lastReport[event] || 0) < 10_000) return
      lastReport[event] = now

      void fetch(getApiUrl("/api/assistant/security-event"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event, path: pathRef.current }),
      }).catch(() => {
        /* the log is best-effort; never interrupt the person's work */
      })
    }

    const warn = (message: string) => toast.warning(message, { id: "capture-guard", duration: 4000 })

    /**
     * Overwrite whatever PrintScreen just put on the clipboard. Only works while
     * the document has focus and the browser allows it - the PrtScn-then-paste
     * case, and nothing else.
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

    const captureAttempt = () => {
      raise(SHIELD_HOLD_MS)
      clearClipboard()
      report("screenshot.keypress")
      warn("Screenshots are not permitted here. This attempt has been logged.")
    }

    /* --- keyboard -------------------------------------------------- */

    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase()

      if (OS_KEYS.has(e.key)) {
        // Up before the rest of the shortcut arrives. Pressing the Windows key
        // for anything else costs a blink, which is the price of this working.
        osKeyDown = true
        raise()
        return
      }

      if (CAPTURE_KEYS.has(e.key) || isOsCaptureShortcut(e)) {
        captureAttempt()
        return
      }

      if ((e.ctrlKey || e.metaKey) && key === "p") {
        e.preventDefault()
        report("screenshot.print")
        warn("Printing is disabled on this screen. This attempt has been logged.")
        return
      }

      if ((e.ctrlKey || e.metaKey) && (key === "s" || key === "u")) {
        e.preventDefault()
        report("save.blocked")
        warn("Saving this page is disabled. This attempt has been logged.")
        return
      }

      const devtools =
        e.key === "F12" ||
        (e.ctrlKey && e.shiftKey && ["i", "j", "c"].includes(key)) ||
        (e.metaKey && e.altKey && ["i", "j", "c"].includes(key))
      if (devtools) {
        e.preventDefault()
        report("devtools.suspected")
        warn("Developer tools are disabled on this screen. This attempt has been logged.")
      }
    }

    const onKeyUp = (e: KeyboardEvent) => {
      if (OS_KEYS.has(e.key)) {
        osKeyDown = false
        scheduleLower(RESUME_DELAY_MS)
        return
      }
      // Windows delivers PrintScreen as keyup only in most browsers.
      if (CAPTURE_KEYS.has(e.key)) captureAttempt()
    }

    /* --- focus and visibility ------------------------------------- */

    const onBlur = () => raise()
    const onFocus = () => {
      // A Windows-key release can happen while another window has focus, so
      // the flag is reset here rather than trusted.
      osKeyDown = false
      scheduleLower(RESUME_DELAY_MS)
    }
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        raise()
        report("screen.hidden")
      } else {
        scheduleLower(RESUME_DELAY_MS)
      }
    }

    /* --- copying, dragging, printing, sharing ---------------------- */

    const onCopy = (e: ClipboardEvent) => {
      e.preventDefault()
      report("copy.blocked")
    }
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault()
      report("contextmenu.blocked")
    }
    const onDragStart = (e: DragEvent) => e.preventDefault()
    const onBeforePrint = () => report("screenshot.print")

    // Up from the first frame if the page opened without focus.
    if (!document.hasFocus()) raise()

    window.addEventListener("keydown", onKeyDown, true)
    window.addEventListener("keyup", onKeyUp, true)
    window.addEventListener("blur", onBlur)
    window.addEventListener("focus", onFocus)
    document.addEventListener("visibilitychange", onVisibility)
    document.addEventListener("copy", onCopy)
    document.addEventListener("cut", onCopy)
    document.addEventListener("contextmenu", onContextMenu)
    document.addEventListener("dragstart", onDragStart)
    window.addEventListener("beforeprint", onBeforePrint)

    /**
     * Screen-share and tab-capture started from this page. A capture started
     * from the OS or another tab never reaches this - the shield and the
     * watermark are what cover those.
     */
    const media = navigator.mediaDevices as any
    const originalGetDisplayMedia = media?.getDisplayMedia?.bind(media)
    if (originalGetDisplayMedia) {
      media.getDisplayMedia = async () => {
        report("screenshot.capture_api")
        warn("Screen sharing is not permitted here. This attempt has been logged.")
        throw new DOMException("Screen capture is disabled on this page", "NotAllowedError")
      }
    }

    return () => {
      window.clearTimeout(lowerTimer)
      root.classList.remove(SHIELD_CLASS)
      window.removeEventListener("keydown", onKeyDown, true)
      window.removeEventListener("keyup", onKeyUp, true)
      window.removeEventListener("blur", onBlur)
      window.removeEventListener("focus", onFocus)
      document.removeEventListener("visibilitychange", onVisibility)
      document.removeEventListener("copy", onCopy)
      document.removeEventListener("cut", onCopy)
      document.removeEventListener("contextmenu", onContextMenu)
      document.removeEventListener("dragstart", onDragStart)
      window.removeEventListener("beforeprint", onBeforePrint)
      if (originalGetDisplayMedia) media.getDisplayMedia = originalGetDisplayMedia
    }
  }, [])

  return (
    <>
      {/*
        Pure CSS, so nothing waits on React: the shield hides every element on
        the page - dialogs and portals included - and shows only the cover.
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
        html.${SHIELD_CLASS} body * { visibility: hidden !important; }
        html.${SHIELD_CLASS} .capture-cover,
        html.${SHIELD_CLASS} .capture-cover * { visibility: visible !important; }
        .capture-cover { display: none; }
        html.${SHIELD_CLASS} .capture-cover { display: flex; }
        .assistant-shell {
          -webkit-user-select: none;
          user-select: none;
          -webkit-touch-callout: none;
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

      <Watermark email={email} name={name} />

      <div className="capture-cover fixed inset-0 z-[100] items-center justify-center bg-background">
        <div className="max-w-sm px-8 text-center">
          <p className="text-sm font-semibold text-foreground">Content hidden</p>
          <p className="mt-2 text-xs text-muted-foreground">
            This page hides itself when it is not in focus or a screen capture starts. Click here to
            continue. Signed in as {email}.
          </p>
        </div>
      </div>
    </>
  )
}

/**
 * The assistant's name, email and the current time, tiled across the screen
 * above every dialog. Anything captured - by any means, including a phone -
 * carries the identity of whoever was signed in when it was taken.
 *
 * The fill is an explicit mid-grey, not currentColor: inside an SVG used as a
 * CSS background, currentColor does not inherit and falls back to black -
 * which, blended onto this dark theme, made the old watermark invisible.
 * Mid-grey at this opacity shows on the dark theme and the light one alike.
 */
function Watermark({ email, name }: { email: string; name?: string | null }) {
  const [now, setNow] = useState(() => new Date())

  // The time on a leaked capture should say when it was taken, not when the
  // page was opened.
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  const when = now.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })

  // One short line each, anchored low in the tile: rotated text climbs as it
  // runs right, and a single long line climbed straight out of the top of the
  // tile and was clipped mid-email.
  const lines = [name && name !== email ? name : null, email, `${when} · IMobile · Confidential`]
    .filter(Boolean)
    .map((line, index) => `<text x="30" y="${200 + index * 20}">${escapeXml(String(line))}</text>`)
    .join("")

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="300">
    <g font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="15" font-weight="600" fill="#8b909a"
       transform="rotate(-22 30 210)">${lines}</g>
  </svg>`

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[90] select-none opacity-[0.22]"
      style={{
        backgroundImage: `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`,
        backgroundRepeat: "repeat",
      }}
    />
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
