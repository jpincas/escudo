import type { Me } from "../api/types.ts";
import { useStrings } from "../i18n/context.tsx";
import type { SectionId } from "../router.ts";
import { SECTIONS } from "../sections.tsx";

/**
 * The persistent chrome for every signed-in screen: crest, village name, the
 * section list, and the signed-in admin's name + sign-out at the foot.
 * Rendered only by Shell, which only ever mounts once there is a session —
 * see App.tsx.
 */
export function Sidebar({ me, section, onNavigate, onSignOut, inboxCount }: {
  me: Me;
  section: SectionId;
  onNavigate: (section: SectionId) => void;
  onSignOut: () => void;
  /**
   * The count of inbox entries waiting to be registered or dismissed (spec
   * 2026-07-27 §7.3), supplied by Shell.tsx from InboxProvider. Undefined
   * while that first fetch is still in flight, in which case the badge simply
   * doesn't render rather than flashing a stale or wrong number. Ámbar, never
   * rojo-alarma: a device installed and not finished is something to attend
   * to, not an alarm.
   */
  inboxCount?: number;
}) {
  const s = useStrings();

  return (
    <nav className="sidebar" aria-label={s.sidebar.navLabel}>
      <div className="sidebar__brand">
        {/* Copy of graphics/logo/green-neg.svg (panel/public/), the project's
            canonical artwork source — see graphics/sync-to-site.py's own
            header for the "masters live in graphics/, never edit a copy"
            rule. Extending that script to also target the panel isn't the
            right fit: it exists to keep the Hugo site's static/ in sync and
            already documents that shape in its docstring, while the panel is
            a separate Vite build with its own public/ convention. One SVG
            that changes only if the brand crest itself changes doesn't
            justify a second sync path — a committed, verbatim copy is enough. */}
        <img
          className="sidebar__crest"
          src={`${import.meta.env.BASE_URL}crest-green-neg.svg`}
          alt=""
        />
        <span className="sidebar__village">{me.village}</span>
      </div>

      <ul className="sidebar__sections">
        {SECTIONS.map(({ id, label }) => {
          const active = section === id;
          return (
            <li key={id}>
              <a
                href={`/panel/${id}`}
                className={`sidebar__link${active ? " sidebar__link--active" : ""}`}
                aria-current={active ? "page" : undefined}
                onClick={(e) => {
                  // Let a modified or non-primary click do what the browser
                  // would normally do with a real <a href> — open in a new
                  // tab/window, etc. — rather than always intercepting for
                  // client-side navigation.
                  if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button !== 0) {
                    return;
                  }
                  e.preventDefault();
                  onNavigate(id);
                }}
              >
                <span>{label(s)}</span>
                {id === "inbox" && !!inboxCount && (
                  <span className="sidebar__badge">{inboxCount}</span>
                )}
              </a>
            </li>
          );
        })}
      </ul>

      <div className="sidebar__foot">
        <p className="sidebar__admin">{me.name}</p>
        <button type="button" className="sidebar__signout" onClick={onSignOut}>
          {s.sidebar.signOut}
        </button>
      </div>
    </nav>
  );
}
