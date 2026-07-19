"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fadeUp, stagger } from "@/lib/animations";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function capitalizeKey(key: string) {
  return key
    .replace(/([A-Z])/g, " $1")
    .trim()
    .replace(/^./, (s) => s.toUpperCase());
}

export default function AnalyticsPage() {
  const [data, setData] = useState<{ summary: Record<string, number>; snapshots: unknown[] } | null>(null);
  useEffect(() => { fetch(`${API}/api/analytics`).then((r) => r.ok ? r.json() : null).then(setData).catch(() => {}); }, []);

  const summary = data?.summary ?? { pendingApprovals: 0, totalOrgs: 0, totalContent: 0, totalOpps: 0 };
  const summaryEntries = Object.entries(summary);

  return (
    <motion.div
      className="space-y-10"
      initial="hidden"
      animate="visible"
      variants={stagger}
    >
      <motion.div variants={fadeUp}>
        <h1 className="text-3xl font-semibold tracking-tight text-[#EDE8E0]">Analytics</h1>
        <p className="text-[#A0988E] mt-2 text-sm">KPIs tracked by Beacon.</p>
      </motion.div>

      <motion.div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4" variants={stagger}>
        {summaryEntries.map(([key, val], i) => (
          <motion.div key={key} variants={fadeUp} custom={i}>
            <Card size="sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-normal text-[#A0988E] uppercase tracking-wider">
                  {capitalizeKey(key)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-light text-[#EDE8E0]">
                  {val}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      <motion.div variants={fadeUp}>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-sm text-[#A0988E] max-w-sm leading-relaxed">
              Charts will appear here as Quinn collects more data.
            </p>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
