"use client";

import { useEffect, useState } from "react";
import {
  Sparkles,
  CheckCircle2,
  Building2,
  FileText,
  TrendingUp,
  Clock,
  ArrowUpRight,
  Zap,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import Link from "next/link";

interface StatCard {
  title: string;
  value: string | number;
  change?: string;
  icon: React.ReactNode;
  color: string;
}

export default function CommandCenter() {
  const [stats, setStats] = useState({
    pendingApprovals: 0,
    totalOrgs: 0,
    totalContent: 0,
    totalOpps: 0,
  });
  const [briefing, setBriefing] = useState<{
    id: string;
    title: string;
    summary: string;
    date: string;
    type: string;
  } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Fetch initial data
    fetchDashboard();
  }, []);

  async function fetchDashboard() {
    try {
      const [analyticsRes, briefingsRes] = await Promise.all([
        fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/api/analytics`),
        fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/api/briefings`),
      ]);

      if (analyticsRes.ok) {
        const data = await analyticsRes.json();
        setStats(data.summary ?? stats);
      }

      if (briefingsRes.ok) {
        const data = await briefingsRes.json();
        if (data.length > 0) setBriefing(data[0]);
      }
    } catch {
      // API not running yet — show empty state
    }
  }

  const statCards: StatCard[] = [
    {
      title: "Pending Approvals",
      value: stats.pendingApprovals,
      icon: <CheckCircle2 className="h-4 w-4" />,
      color: "text-primary",
    },
    {
      title: "Organizations",
      value: stats.totalOrgs,
      icon: <Building2 className="h-4 w-4" />,
      color: "text-chart-2",
    },
    {
      title: "Content Items",
      value: stats.totalContent,
      icon: <FileText className="h-4 w-4" />,
      color: "text-chart-3",
    },
    {
      title: "Opportunities",
      value: stats.totalOpps,
      icon: <TrendingUp className="h-4 w-4" />,
      color: "text-chart-5",
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            <span className="text-gradient">Command Center</span>
          </h1>
          <p className="text-muted-foreground mt-1">
            Quinn&apos;s executive overview — {new Date().toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
            Quinn is online
          </div>
          <Link href="/chat">
            <Button size="sm" className="gap-2">
              <Sparkles className="h-3.5 w-3.5" />
              Talk to Quinn
            </Button>
          </Link>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat, i) => (
          <Card
            key={stat.title}
            className={`glass-card transition-all duration-300 hover:scale-[1.02] ${mounted ? "animate-count-up" : "opacity-0"}`}
            style={{ animationDelay: `${i * 100}ms` }}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <div className={stat.color}>{stat.icon}</div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold tabular-nums">{stat.value}</div>
              {stat.change && (
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                  <ArrowUpRight className="h-3 w-3 text-green-500" />
                  {stat.change}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Latest Briefing */}
        <Card className="glass-card lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              <CardTitle className="text-lg">Latest Briefing</CardTitle>
            </div>
            {briefing && (
              <Badge variant="outline" className="text-xs">
                {briefing.type}
              </Badge>
            )}
          </CardHeader>
          <CardContent>
            {briefing ? (
              <ScrollArea className="h-[400px] pr-4">
                <div className="prose prose-invert prose-sm max-w-none">
                  <h3 className="text-foreground">{briefing.title}</h3>
                  <div className="whitespace-pre-wrap text-muted-foreground leading-relaxed">
                    {briefing.summary}
                  </div>
                </div>
              </ScrollArea>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 mb-4">
                  <Sparkles className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">No briefings yet</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  Quinn hasn&apos;t generated a briefing yet. Trigger a daily briefing or wait
                  for the next scheduled run.
                </p>
                <Button variant="outline" size="sm" className="mt-4 gap-2" onClick={() => {
                  fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/api/quinn/trigger/daily-briefing`, { method: "POST" })
                    .catch(() => {});
                }}>
                  <Zap className="h-3.5 w-3.5" />
                  Trigger Daily Briefing
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: "Review Approvals", href: "/approvals", icon: CheckCircle2, desc: "Items awaiting your review" },
              { label: "View Research", href: "/research", icon: Building2, desc: "Organizations & contacts" },
              { label: "Content Calendar", href: "/content", icon: FileText, desc: "Upcoming content" },
              { label: "Growth Pipeline", href: "/growth", icon: TrendingUp, desc: "Opportunities & leads" },
            ].map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="flex items-center gap-3 rounded-lg p-3 transition-all hover:bg-accent group"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/5 group-hover:bg-primary/10 transition-colors">
                  <action.icon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{action.label}</p>
                  <p className="text-xs text-muted-foreground">{action.desc}</p>
                </div>
                <ArrowUpRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-primary transition-colors" />
              </Link>
            ))}

            <Separator className="my-4" />

            <div className="space-y-2">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                Scheduled Workflows
              </p>
              {[
                { label: "Daily Briefing", time: "8:00 AM", active: true },
                { label: "Weekly Priorities", time: "Mon 9:00 AM", active: false },
                { label: "Weekly Report", time: "Fri 5:00 PM", active: false },
                { label: "Quarterly Plan", time: "Q start", active: false },
              ].map((wf) => (
                <div key={wf.label} className="flex items-center justify-between text-sm py-1">
                  <span className="text-muted-foreground">{wf.label}</span>
                  <span className="text-xs text-muted-foreground/60 font-mono">{wf.time}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
