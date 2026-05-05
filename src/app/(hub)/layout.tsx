import HubSidebar from "@/components/hub/hub-sidebar";

export default function HubLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#F7F8FA" }}>
      <HubSidebar />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, background: "#F7F8FA" }}>
        {children}
      </div>
    </div>
  );
}
