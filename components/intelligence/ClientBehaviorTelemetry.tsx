"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore } from "react";

type ConsentState = "unknown" | "accepted" | "declined";
type TelemetryEnvironment =
  | "production"
  | "preview"
  | "development"
  | "test";

const CONSENT_KEY = "foundation1:product-insights-consent";
const VISITOR_KEY = "foundation1:product-insights-visitor";
const SESSION_KEY = "foundation1:product-insights-session";
const SCHEMA_VERSION = "2026-07-23.1";
const CONSENT_EVENT = "foundation1:product-insights-consent-change";
const CLIENT_PATH_PREFIXES = [
  "/dealroom",
  "/eoi",
  "/estimate",
  "/mandate",
  "/migration",
  "/proposal",
  "/register",
  "/upload",
] as const;
const TOKEN_PARENT_SEGMENTS = new Set([
  "case",
  "dealroom",
  "eoi",
  "mandate",
  "proposal",
  "register",
  "upload",
]);

function isClientPath(pathname: string) {
  return CLIENT_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function consentSnapshot(): ConsentState {
  const navigatorWithPrivacy = navigator as Navigator & {
    globalPrivacyControl?: boolean;
  };
  if (navigatorWithPrivacy.globalPrivacyControl) return "declined";
  const stored = window.localStorage.getItem(CONSENT_KEY);
  return stored === "accepted"
    ? "accepted"
    : stored === "declined"
      ? "declined"
      : "unknown";
}

function subscribeToConsent(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(CONSENT_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(CONSENT_EVENT, callback);
  };
}

function redactPath(value: string) {
  let pathname = value.split("?")[0]?.split("#")[0] ?? "/";
  try {
    pathname = new URL(value, window.location.origin).pathname;
  } catch {
    pathname = "/";
  }
  const segments = pathname
    .split("/")
    .filter(Boolean)
    .map((segment, index, all) => {
      const prior = all[index - 1] ?? "";
      if (all[0] === "estimate" && index > 0) {
        return index === 1 && segment === "a" ? "a" : "[token]";
      }
      if (prior === "case") return "[case]";
      if (TOKEN_PARENT_SEGMENTS.has(prior)) return "[token]";
      if (
        /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment) ||
        /^[A-Za-z0-9_-]{24,}$/.test(segment)
      ) {
        return "[token]";
      }
      return segment.replace(/[^A-Za-z0-9._~-]/g, "").slice(0, 60) || "_";
    });
  return `/${segments.join("/")}`.slice(0, 180) || "/";
}

function identifier(storage: Storage, key: string) {
  try {
    const current = storage.getItem(key);
    if (current) return current;
    const next = crypto.randomUUID();
    storage.setItem(key, next);
    return next;
  } catch {
    return crypto.randomUUID();
  }
}

export default function ClientBehaviorTelemetry({
  environment,
}: {
  environment: TelemetryEnvironment;
}) {
  const pathname = usePathname();
  const eligible = isClientPath(pathname);
  const consent = useSyncExternalStore(
    subscribeToConsent,
    consentSnapshot,
    () => "declined",
  );
  const milestones = useRef(new Set<number>());

  useEffect(() => {
    if (!eligible || consent !== "accepted") return;
    const visitorId = identifier(window.localStorage, VISITOR_KEY);
    const sessionId = identifier(window.sessionStorage, SESSION_KEY);
    const send = (
      eventName: string,
      properties: Record<string, string | number | boolean> = {},
      path = pathname,
    ) => {
      void fetch("/api/telemetry", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-f1-telemetry-client": "product-insights-v1",
        },
        body: JSON.stringify({
          events: [
            {
              id: crypto.randomUUID(),
              occurredAt: new Date().toISOString(),
              environment,
              surface: "migration_workspace",
              eventName,
              pageKey: redactPath(path),
              visitorId,
              sessionId,
              consentBasis:
                environment === "test" ? "test" : "analytics_consent",
              properties,
              schemaVersion: SCHEMA_VERSION,
            },
          ],
        }),
        credentials: "omit",
        cache: "no-store",
        keepalive: true,
        referrerPolicy: "origin",
      }).catch(() => undefined);
    };

    milestones.current = new Set<number>();
    send("page_view", {
      viewport:
        window.innerWidth < 640
          ? "mobile"
          : window.innerWidth < 1024
            ? "tablet"
            : "desktop",
    });

    const onClick = (event: MouseEvent) => {
      const element =
        event.target instanceof Element
          ? event.target.closest("a,button")
          : null;
      if (!element) return;
      const targetPath =
        element instanceof HTMLAnchorElement
          ? redactPath(element.getAttribute("href") ?? pathname)
          : pathname;
      send("interaction", {
        element: element.tagName.toLowerCase(),
        interaction: "click",
        target_path: targetPath,
      });
    };
    const onSubmit = (event: SubmitEvent) => {
      const form = event.target instanceof HTMLFormElement ? event.target : null;
      send("form_submit", {
        form_key: form?.dataset.f1Form?.slice(0, 80) || "form",
      });
    };
    const onScroll = () => {
      const scrollable =
        document.documentElement.scrollHeight - window.innerHeight;
      if (scrollable <= 0) return;
      const percentage = Math.round((window.scrollY / scrollable) * 100);
      for (const depth of [25, 50, 75, 100]) {
        if (percentage >= depth && !milestones.current.has(depth)) {
          milestones.current.add(depth);
          send("scroll_depth", { depth });
        }
      }
    };
    const onError = () =>
      send("client_error", { area: "window", code: "uncaught_error" });
    const onRejection = () =>
      send("client_error", {
        area: "window",
        code: "unhandled_rejection",
      });
    const fifteenSeconds = window.setTimeout(
      () => send("engagement", { seconds: 15 }),
      15_000,
    );
    const sixtySeconds = window.setTimeout(
      () => send("engagement", { seconds: 60 }),
      60_000,
    );

    document.addEventListener("click", onClick, { passive: true });
    document.addEventListener("submit", onSubmit);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.clearTimeout(fifteenSeconds);
      window.clearTimeout(sixtySeconds);
      document.removeEventListener("click", onClick);
      document.removeEventListener("submit", onSubmit);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, [consent, eligible, environment, pathname]);

  function choose(next: Exclude<ConsentState, "unknown">) {
    window.localStorage.setItem(CONSENT_KEY, next);
    window.dispatchEvent(new Event(CONSENT_EVENT));
  }

  if (!eligible || consent !== "unknown") return null;
  return (
    <aside
      className="fixed inset-x-4 bottom-4 z-[100] mx-auto max-w-3xl rounded-2xl border border-white/15 bg-[#11120f]/95 p-4 text-white shadow-2xl backdrop-blur-xl md:flex md:items-center md:gap-5"
      aria-label="Product analytics choice"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          Help improve the migration experience
        </p>
        <p className="mt-1 text-xs leading-5 text-white/60">
          Allow anonymous first-party usage signals. We do not record form
          values, document contents, case links, keystrokes or cross-site
          activity. See our{" "}
          <Link className="underline underline-offset-2" href="/privacy">
            privacy policy
          </Link>
          .
        </p>
      </div>
      <div className="mt-3 flex shrink-0 gap-2 md:mt-0">
        <button
          type="button"
          onClick={() => choose("declined")}
          className="rounded-full border border-white/20 px-4 py-2 text-xs text-white/70 hover:bg-white/10"
        >
          Decline
        </button>
        <button
          type="button"
          onClick={() => choose("accepted")}
          className="rounded-full bg-[#d8ef66] px-4 py-2 text-xs font-medium text-black hover:bg-[#e3f780]"
        >
          Allow
        </button>
      </div>
    </aside>
  );
}
