"use client";

import { useEffect, useState } from "react";
import { BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function AnalyticsPage() {
  const [data, setData] = useState<{ summary: Record<string, number>; snapshots: unknown[] } | null>(null);
  useEffect(() => { fetch(`${API}/api/analytics`).then((r) => r.ok ? r.json() : null).then(setData).catch(() => {}); }, []);

  const summary = data?.summary ?? { pendingApprovals: 0, totalOrgs: 0, totalContent: 0, totalOpps: 0 };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight"><span className="text-gradient">Analytics</span></h1>
        <p className="text-muted-foreground mt-1">Performance metrics tracked by Beacon — KPIs, trends, and insights.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Object.entries(summary).map(([key, val]) => (
          <Card key={key} className="glass-card">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground capitalize">{key.replace(/([A-Z])/g, " $1").trim()}</CardTitle></CardHeader>
            <CardContent><div className="text-3xl font-bold tabular-nums">{val}</div></CardContent>
          </Card>
        ))}
      </div>
      <Card className="glass-card">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <BarChart3 className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <h3 className="text-lg font-semibold mb-2">Charts coming soon</h3>
          <p className="text-sm text-muted-foreground max-w-sm">As Quinn operates and collects data, Beacon will display trend charts, performance graphs, and marketing KPI dashboards here.</p>
        </CardContent>
      </Card>
    </div>
  );
}
