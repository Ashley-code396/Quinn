"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const navItems = [
  { href: "/", label: "Command Center" },
  { href: "/approvals", label: "Approvals", badge: true },
  { href: "/research", label: "Research" },
  { href: "/content", label: "Content Hub" },
  { href: "/growth", label: "Growth" },
  { href: "/relationships", label: "CRM" },
  { href: "/analytics", label: "Analytics" },
  { href: "/goals", label: "OKRs" },
  { href: "/chat", label: "Talk to Quinn" },
  { href: "/settings", label: "Settings" },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <TooltipProvider>
      <div className="flex h-screen overflow-hidden bg-[#050608]">
        {/* Background layers */}
        <div className="bg-layer">
          <div className="bg-aurora" />
          <div className="bg-radial" />
          <div className="bg-grid" />
          <div className="bg-noise" />
        </div>

        {/* Sidebar */}
        <aside
          className={cn(
            "relative z-10 flex flex-col border-r border-sidebar-border bg-sidebar/80 backdrop-blur-xl transition-all duration-300 ease-out",
            collapsed ? "w-[68px]" : "w-[240px]",
          )}
        >
          {/* Wordmark */}
          <div className="flex h-16 items-center border-b border-sidebar-border px-5">
            {!collapsed && (
              <span className="text-base font-semibold tracking-tight text-[#EDE8E0]">
                quinn
              </span>
            )}
          </div>

          {/* Nav Items */}
          <nav className="flex-1 overflow-y-auto py-5 px-3 space-y-0.5">
            {navItems.map((item) => {
              const isActive =
                pathname === item.href ||
                (item.href !== "/" && pathname.startsWith(item.href));

              const link = (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-200",
                    isActive
                      ? "bg-white/[0.06] text-[#EDE8E0] font-medium"
                      : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                    collapsed && "justify-center px-2",
                  )}
                >
                  {!collapsed && <span>{item.label}</span>}
                  {!collapsed && item.badge && (
                    <span className="ml-auto inline-block w-1.5 h-1.5 rounded-full bg-primary/60" />
                  )}
                  {isActive && !collapsed && (
                    <span className="ml-auto inline-block w-0.5 h-4 rounded-full bg-primary/60" />
                  )}
                </Link>
              );

              if (collapsed) {
                return (
                  <Tooltip key={item.href}>
                    <TooltipTrigger>{link}</TooltipTrigger>
                    <TooltipContent
                      side="right"
                      className="font-medium bg-[#0B0D11]/95 backdrop-blur-xl border border-white/10 text-sm px-3 py-1.5"
                    >
                      {item.label}
                    </TooltipContent>
                  </Tooltip>
                );
              }
              return link;
            })}
          </nav>

          {/* Collapse Toggle */}
          <div className="border-t border-sidebar-border p-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCollapsed(!collapsed)}
              className="w-full justify-center text-muted-foreground/40 hover:text-foreground hover:bg-sidebar-accent rounded-lg h-8"
            >
              <ChevronLeft
                className={cn(
                  "h-3.5 w-3.5 transition-transform duration-300",
                  collapsed && "rotate-180",
                )}
              />
            </Button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="relative z-10 flex-1 overflow-y-auto">
          <div className="p-6 lg:p-10 max-w-[1360px] mx-auto content-layer">
            {children}
          </div>
        </main>
      </div>
    </TooltipProvider>
  );
}
