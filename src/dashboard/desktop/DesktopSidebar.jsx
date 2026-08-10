import NavigationPanel from "../shared/NavigationPanel";

export default function DesktopSidebar(props) {
  return (
    <aside className="dashboard-sidebar fixed inset-y-0 left-0 z-40 hidden w-[256px] flex-col overflow-y-hidden border-r border-cyan-300/10 bg-[#030b11] px-3 py-3 lg:flex">
      <NavigationPanel {...props} />
    </aside>
  );
}
