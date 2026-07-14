"use client";

import { useEffect, useState } from "react";
import { Target, CheckCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

interface KeyResult {
  id: string; title: string; targetValue: number;
  currentValue: number; unit: string; status: string;
}
interface Goal {
  id: string; quarter: string; title: string;
  description: string; status: string; progress: number;
  keyResults: KeyResult[];
}

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  useEffect(() => {
    fetch(`${API}/api/goals`).then((r) => r.ok ? r.json() : []).then(setGoals).catch(() => {});
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          <span className="text-gradient">OKRs &amp; Goals</span>
        </h1>
        <p className="text-muted-foreground mt-1">Quarterly objectives and key results.</p>
      </div>
      {goals.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Target className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No goals set yet</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              Quinn will set quarterly goals after the first briefing cycle.
            </p>
          </CardContent>
        </Card>
      ) : (
        goals.map((goal) => (
          <Card key={goal.id} className="glass-card">
            <CardHeader>
              <Badge variant="outline" className="w-fit mb-2">{goal.quarter}</Badge>
              <CardTitle>{goal.title}</CardTitle>
              <Progress value={goal.progress} className="h-2 mt-2" />
            </CardHeader>
            <CardContent className="space-y-3">
              {goal.keyResults.map((kr) => (
                <div key={kr.id} className="flex items-center gap-3">
                  <CheckCircle className={`h-4 w-4 shrink-0 ${kr.currentValue >= kr.targetValue ? "text-green-500" : "text-muted-foreground/30"}`} />
                  <div className="flex-1">
                    <p className="text-sm">{kr.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Progress value={(kr.currentValue / kr.targetValue) * 100} className="flex-1 h-1" />
                      <span className="text-xs font-mono text-muted-foreground">
                        {kr.currentValue}/{kr.targetValue} {kr.unit}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
