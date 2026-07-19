"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { fadeUp, stagger } from "@/lib/animations";
import Link from "next/link";

interface StatCard {
  title: string;
  value: string | number;
  change?: string;
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
    { title: "Pending Approvals", value: stats.pendingApprovals },
    { title: "Organizations", value: stats.totalOrgs },
    { title: "Content Items", value: stats.totalContent },
    { title: "Opportunities", value: stats.totalOpps },
  ];

  return (
    <motion.div
      className="space-y-12"
      initial="hidden"
      animate={mounted ? "visible" : "hidden"}
      variants={stagger}
    >
      {/* Header */}
      <motion.div className="flex items-start justify-between" variants={fadeUp}>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-[#EDE8E0]">
            Command Center
          </h1>
          <p className="text-[#A0988E] mt-2 text-sm">
            {new Date().toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm text-[#A0988E]">
            <span className="status-dot" />
            online
          </div>
          <Link href="/chat">
            <Button size="sm">Talk to Quinn</Button>
          </Link>
        </div>
      </motion.div>

      {/* Stat Cards */}
      <motion.div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4" variants={stagger}>
        {statCards.map((stat, i) => (
          <motion.div key={stat.title} variants={fadeUp} custom={i}>
            <Card size="sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-normal text-[#A0988E] uppercase tracking-wider">
                  {stat.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-light text-[#EDE8E0]">
                  {stat.value}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      {/* Main Content Grid */}
      <div className="grid gap-8 lg:grid-cols-3">
        {/* Latest Briefing */}
        <motion.div variants={fadeUp} custom={4} className="lg:col-span-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between border-b border-white/[0.06] pb-4">
              <CardTitle className="text-sm font-medium text-[#EDE8E0]">
                Latest Briefing
              </CardTitle>
              {briefing && (
                <Badge variant="outline" className="text-xs rounded-full px-3 py-0.5">
                  {briefing.type}
                </Badge>
              )}
            </CardHeader>
            <CardContent className="pt-5">
              {briefing ? (
                <ScrollArea className="h-[400px] pr-4">
                  <div className="max-w-none">
                    <h3 className="text-[#EDE8E0] text-base font-medium mb-3">
                      {briefing.title}
                    </h3>
                    <div className="whitespace-pre-wrap text-[#A0988E] leading-[1.75] text-sm">
                      {briefing.summary}
                    </div>
                  </div>
                </ScrollArea>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <p className="text-sm text-[#A0988E] max-w-sm leading-relaxed">
                    No briefings yet. Quinn generates a daily briefing each morning.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-6"
                    onClick={() => {
                      fetch(
                        `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/api/quinn/trigger/daily-briefing`,
                        { method: "POST" },
                      ).catch(() => {});
                    }}
                  >
                    Trigger Daily Briefing
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Quick Actions */}
        <motion.div variants={fadeUp} custom={5}>
          <Card>
            <CardHeader className="border-b border-white/[0.06] pb-4">
              <CardTitle className="text-sm font-medium text-[#EDE8E0]">
                Quick Actions
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-5 space-y-1">
              {[
                { label: "Review Approvals", href: "/approvals", desc: "Items awaiting review" },
                { label: "View Research", href: "/research", desc: "Organizations & contacts" },
                { label: "Content Calendar", href: "/content", desc: "Upcoming content" },
                { label: "Growth Pipeline", href: "/growth", desc: "Opportunities & leads" },
              ].map((action) => (
                <Link
                  key={action.href}
                  href={action.href}
                  className="group flex items-center justify-between rounded-lg px-3 py-2.5 transition-all duration-200 hover:bg-white/[0.04]"
                >
                  <div>
                    <p className="text-sm text-[#EDE8E0] group-hover:text-white transition-colors duration-200">
                      {action.label}
                    </p>
                    <p className="text-xs text-[#A0988E] mt-0.5">{action.desc}</p>
                  </div>
                </Link>
              ))}

              <Separator className="my-5" />

              <div className="space-y-3">
                <p className="text-xs text-[#A0988E]/50 font-medium uppercase tracking-wider">
                  Scheduled
                </p>
                {[
                  { label: "Daily Briefing", time: "8:00 AM", active: true },
                  { label: "Weekly Priorities", time: "Mon 9:00 AM", active: false },
                  { label: "Weekly Report", time: "Fri 5:00 PM", active: false },
                  { label: "Quarterly Plan", time: "Q start", active: false },
                ].map((wf) => (
                  <div
                    key={wf.label}
                    className="flex items-center justify-between text-sm py-1.5"
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className={`inline-block w-1 h-1 rounded-full ${
                          wf.active ? "bg-success shadow-[0_0_6px_var(--success)]" : "bg-white/[0.12]"
                        }`}
                      />
                      <span className="text-[#A0988E]">{wf.label}</span>
                    </span>
                    <span className="text-xs text-[#A0988E]/40 font-mono">{wf.time}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  );
}
