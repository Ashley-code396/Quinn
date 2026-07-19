"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { fadeUp, stagger } from "@/lib/animations";

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
    <motion.div
      className="space-y-10"
      initial="hidden"
      animate="visible"
      variants={stagger}
    >
      <motion.div variants={fadeUp}>
        <h1 className="text-3xl font-semibold tracking-tight text-[#EDE8E0]">
          OKRs &amp; Goals
        </h1>
        <p className="text-[#A0988E] mt-2 text-sm">Quarterly objectives and key results.</p>
      </motion.div>
      {goals.length === 0 ? (
        <motion.div variants={fadeUp}>
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-20 text-center">
              <p className="text-sm text-[#A0988E] max-w-sm leading-relaxed">
                No goals set yet. Quinn will define quarterly goals after the first briefing.
              </p>
            </CardContent>
          </Card>
        </motion.div>
      ) : (
        goals.map((goal, i) => (
          <motion.div key={goal.id} variants={fadeUp} custom={i}>
            <Card>
              <CardHeader>
                <Badge variant="outline" className="w-fit mb-2 rounded-full">{goal.quarter}</Badge>
                <CardTitle className="text-base font-medium text-[#EDE8E0]">{goal.title}</CardTitle>
                <Progress value={goal.progress} className="h-1.5 mt-3" />
              </CardHeader>
              <CardContent className="space-y-3">
                {goal.keyResults.map((kr) => {
                  const pct = kr.targetValue > 0 ? Math.min((kr.currentValue / kr.targetValue) * 100, 100) : 0;
                  const done = kr.currentValue >= kr.targetValue;
                  return (
                    <div key={kr.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03]">
                      <span className={`inline-block w-3 h-3 rounded-full shrink-0 ${done ? "bg-success" : "bg-white/[0.1]"}`} />
                      <div className="flex-1">
                        <p className="text-sm text-[#EDE8E0]">{kr.title}</p>
                        <div className="flex items-center gap-3 mt-1.5">
                          <Progress value={pct} className="flex-1 h-1" />
                          <span className="text-xs font-mono text-[#A0988E] shrink-0">
                            {kr.currentValue}/{kr.targetValue} {kr.unit}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </motion.div>
        ))
      )}
    </motion.div>
  );
}
