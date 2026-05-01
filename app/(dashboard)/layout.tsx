import { NavBar } from "@/components/NavBar";
import { MainWrapper } from "@/components/MainWrapper";
import { SidebarProvider } from "@/context/SidebarContext";
import { TopLoadingBar } from "@/components/TopLoadingBar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider>
      <div className="flex min-h-dvh">
        <TopLoadingBar />
        <NavBar />
        <MainWrapper>{children}</MainWrapper>
      </div>
    </SidebarProvider>
  );
}
