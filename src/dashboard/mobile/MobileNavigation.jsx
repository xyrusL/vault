import { MoreHorizontal } from "lucide-react";
import { mobileNavigationItems, pageDetails } from "../shared/navigation";

export default function MobileNavigation({ activePage, onNavigate, onMore }) {
  const secondaryPageActive = !mobileNavigationItems.some((item) => item.id === activePage);

  return (
    <nav className="mobile-navigation lg:hidden" aria-label="Primary navigation">
      <div className="mobile-navigation-inner">
        {mobileNavigationItems.map(({ id, label, icon: Icon }) => {
          const active = activePage === id;
          return (
            <button key={id} type="button" onClick={() => onNavigate(id)} className={`mobile-navigation-item ${active ? "is-active" : ""}`} aria-current={active ? "page" : undefined}>
              <span className="mobile-navigation-icon"><Icon /></span>
              <span>{label}</span>
            </button>
          );
        })}
        <button type="button" onClick={onMore} className={`mobile-navigation-item ${secondaryPageActive ? "is-active" : ""}`} aria-label={secondaryPageActive ? `More, current page ${pageDetails[activePage]?.title}` : "More navigation"} aria-current={secondaryPageActive ? "page" : undefined}>
          <span className="mobile-navigation-icon"><MoreHorizontal /></span>
          <span>More</span>
        </button>
      </div>
    </nav>
  );
}
