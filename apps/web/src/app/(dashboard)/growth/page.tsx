"use client";

import { useEffect, useState } from "react";
import { TrendingUp, Rocket } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

interface Opportunity {
  id: string; type: string; title: string; description: string;
  strategicFit: number; revenuePotential: number; brandValue: number;
  effortRequired: string; probability: number; status: string;
  deadline?: string; organization?: { name: string };
}

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function GrowthPage() {
  const [opps, setOpps] = useState<Opportunity[]>([]);
  useEffect(() => {
    fetch(`${API}/api/opportunities`).then((r) => r.ok ? r.json() : []).then(setOpps).catch(() => {});
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight"><span className="text-gradient">Growth Pipeline</span></h1>
        <p className="text-muted-foreground mt-1">Opportunities discovered by Atlas — partnerships, grants, accelerators, and prospects.</p>
      </div>
      {opps.length === 0 ? (
        <Card className="glass-card"><CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <Rocket className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <h3 className="text-lg font-semibold mb-2">No opportunities yet</h3>
          <p className="text-sm text-muted-foreground max-w-sm">Atlas hasn&apos;t discovered opportunities yet. Ask Quinn to scan for growth.</p>
        </CardContent></Card>
      ) : (
        <div className="grid gap-4">
          {opps.map((opp) => (
            <Card key={opp.id} className="glass-card transition-all hover:border-primary/20">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="text-xs">{opp.type.replace(/_/g, " ")}</Badge>
                      <Badge variant="secondary" className="text-xs">{opp.status}</Badge>
                      {opp.organization && <Badge variant="outline" className="text-xs">{opp.organization.name}</Badge>}
                    </div>
                    <h3 className="font-semibold mt-2">{opp.title}</h3>
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{opp.description}</p>
                    <div className="grid grid-cols-3 gap-4 mt-3">
                      <div><p className="text-xs text-muted-foreground">Strategic Fit</p><Progress value={opp.strategicFit * 10} className="h-1.5 mt-1" /></div>
                      <div><p className="text-xs text-muted-foreground">Revenue</p><Progress value={opp.revenuePotential * 10} className="h-1.5 mt-1" /></div>
                      <div><p className="text-xs text-muted-foreground">Brand Value</p><Progress value={opp.brandValue * 10} className="h-1.5 mt-1" /></div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-2xl font-bold tabular-nums">{opp.probability}%</div>
                    <p className="text-xs text-muted-foreground">probability</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
