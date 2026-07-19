"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { fadeUp, stagger } from "@/lib/animations";

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
    <motion.div
      className="space-y-10"
      initial="hidden"
      animate="visible"
      variants={stagger}
    >
      <motion.div variants={fadeUp}>
        <h1 className="text-3xl font-semibold tracking-tight text-[#EDE8E0]">Growth Pipeline</h1>
        <p className="text-[#A0988E] mt-2 text-sm">Opportunities discovered by Atlas.</p>
      </motion.div>
      {opps.length === 0 ? (
        <motion.div variants={fadeUp}>
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-20 text-center">
              <p className="text-sm text-[#A0988E] max-w-sm leading-relaxed">
                No opportunities yet. Ask Quinn to scan for growth.
              </p>
            </CardContent>
          </Card>
        </motion.div>
      ) : (
        <div className="grid gap-3">
          {opps.map((opp, i) => (
            <motion.div key={opp.id} variants={fadeUp} custom={i}>
              <Card className="glass-card-hover">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-6">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="outline" className="text-xs rounded-full">{opp.type.replace(/_/g, " ")}</Badge>
                        <Badge variant="secondary" className="text-xs rounded-full">{opp.status}</Badge>
                        {opp.organization && (
                          <Badge variant="outline" className="text-xs rounded-full">{opp.organization.name}</Badge>
                        )}
                      </div>
                      <h3 className="text-sm font-medium text-[#EDE8E0]">{opp.title}</h3>
                      <p className="text-sm text-[#A0988E] mt-1.5 line-clamp-2 leading-relaxed">{opp.description}</p>
                      <div className="grid grid-cols-3 gap-4 mt-4">
                        <div>
                          <p className="text-xs text-[#A0988E] mb-1">Strategic Fit</p>
                          <Progress value={opp.strategicFit * 10} className="h-1" />
                        </div>
                        <div>
                          <p className="text-xs text-[#A0988E] mb-1">Revenue</p>
                          <Progress value={opp.revenuePotential * 10} className="h-1" />
                        </div>
                        <div>
                          <p className="text-xs text-[#A0988E] mb-1">Brand Value</p>
                          <Progress value={opp.brandValue * 10} className="h-1" />
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0 pt-1">
                      <div className="text-2xl font-light text-[#EDE8E0]">{opp.probability}%</div>
                      <p className="text-xs text-[#A0988E] mt-1">probability</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
