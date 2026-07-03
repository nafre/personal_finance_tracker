import { NavBar } from "@/components/NavBar";
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
      <div className="flex flex-col min-h-dvh">
        <TopLoadingBar />
        <div className="flex flex-1">
          <NavBar />
          <MainWrapper banner={<DemoBanner />}>{children}</MainWrapper>
        </div>
      </div>
    </SidebarProvider>
  );
}
