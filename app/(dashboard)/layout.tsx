import { NavBar, BottomNav } from "@/components/NavBar";
import { MainWrapper } from "@/components/MainWrapper";
import { SidebarProvider } from "@/context/SidebarContext";
import { TopLoadingBar } from "@/components/TopLoadingBar";
import { DemoBanner } from "@/components/DemoBanner";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider>
      {/* App shell — exactly one viewport tall, never scrolls itself.
          Scrolling happens inside <MainWrapper>, which means the *root*
          scroller never moves and Android's dynamic URL bar therefore never
          retracts. That's what lets <BottomNav> sit in normal flow and stay
          welded to the bottom edge: its position is a layout fact, not a
          promise about how browser chrome behaves. See the comment on
          BottomNav for the fixed-positioning failure modes this replaces. */}
      <div data-app-shell className="flex flex-col h-dvh overflow-hidden">
        <TopLoadingBar />
        <div className="flex flex-1 min-h-0">
          <NavBar />
          <MainWrapper banner={<DemoBanner />}>{children}</MainWrapper>
        </div>
        <BottomNav />
      </div>
    </SidebarProvider>
  );
}
