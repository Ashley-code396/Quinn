"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CheckCircle2,
  Search,
  FileText,
  TrendingUp,
  Users,
  BarChart3,
  Target,
  MessageSquare,
  Settings,
  Sparkles,
  ChevronLeft,
} from "lucide-react";
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
  { href: "/", label: "Command Center", icon: LayoutDashboard },
  { href: "/approvals", label: "Approvals", icon: CheckCircle2, badge: true },
  { href: "/research", label: "Research", icon: Search },
  { href: "/content", label: "Content Hub", icon: FileText },
  { href: "/growth", label: "Growth", icon: TrendingUp },
  { href: "/relationships", label: "CRM", icon: Users },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/goals", label: "OKRs", icon: Target },
  { href: "/chat", label: "Talk to Quinn", icon: MessageSquare },
  { href: "/settings", label: "Settings", icon: Settings },
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
      <div className="flex h-screen overflow-hidden">
        {/* Sidebar */}
        <aside
          className={cn(
            "flex flex-col border-r border-sidebar-border bg-sidebar transition-all duration-300 ease-in-out",
            collapsed ? "w-[68px]" : "w-[260px]",
          )}
        >
          {/* Logo */}
          <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 glow-quinn">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            {!collapsed && (
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-gradient">Quinn</span>
                <span className="text-[10px] text-muted-foreground tracking-wider uppercase">
                  AI CMO • Dermaqea
                </span>
              </div>
            )}
          </div>

          {/* Nav Items */}
          <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
            {navItems.map((item) => {
              const isActive =
                pathname === item.href ||
                (item.href !== "/" && pathname.startsWith(item.href));
              const Icon = item.icon;

              const link = (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                    isActive
                      ? "bg-primary/10 text-primary glow-quinn"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                    collapsed && "justify-center px-2",
                  )}
                >
                  <Icon
                    className={cn(
                      "h-[18px] w-[18px] shrink-0",
                      isActive && "text-primary",
                    )}
                  />
                  {!collapsed && <span>{item.label}</span>}
                  {!collapsed && item.badge && (
                    <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-[10px] font-bold text-primary animate-pulse-dot">
                      •
                    </span>
                  )}
                </Link>
              );

              if (collapsed) {
                return (
                  <Tooltip key={item.href}>
                    <TooltipTrigger>{link}</TooltipTrigger>
                    <TooltipContent side="right" className="font-medium">
                      {item.label}
                    </TooltipContent>
                  </Tooltip>
                );
              }
              return link;
            })}
          </nav>

          {/* Collapse Toggle */}
          <div className="border-t border-sidebar-border p-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCollapsed(!collapsed)}
              className="w-full justify-center text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft
                className={cn(
                  "h-4 w-4 transition-transform",
                  collapsed && "rotate-180",
                )}
              />
            </Button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="p-6 lg:p-8 max-w-[1400px] mx-auto">{children}</div>
        </main>
      </div>
    </TooltipProvider>
  );
}
