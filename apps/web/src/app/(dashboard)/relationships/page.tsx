"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fadeUp, stagger } from "@/lib/animations";

interface Relationship {
  id: string; stage: string; interestLevel: number; nextFollowUp?: string;
  lastContactDate?: string; notes?: string;
  organization?: { name: string }; contact?: { firstName: string; lastName: string; email?: string };
}

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const stageColors: Record<string, string> = {
  PROSPECT: "bg-white/[0.03] text-[#A0988E]", INITIAL_CONTACT: "bg-white/[0.05] text-[#EDE8E0]",
  ENGAGED: "bg-white/[0.06] text-[#EDE8E0]", MEETING_HELD: "bg-white/[0.07] text-[#EDE8E0]",
  ACTIVE_PARTNER: "bg-white/[0.1] text-[#EDE8E0]",
};

export default function RelationshipsPage() {
  const [rels, setRels] = useState<Relationship[]>([]);
  useEffect(() => { fetch(`${API}/api/relationships`).then((r) => r.ok ? r.json() : []).then(setRels).catch(() => {}); }, []);

  return (
    <motion.div
      className="space-y-10"
      initial="hidden"
      animate="visible"
      variants={stagger}
    >
      <motion.div variants={fadeUp}>
        <h1 className="text-3xl font-semibold tracking-tight text-[#EDE8E0]">Relationships</h1>
        <p className="text-[#A0988E] mt-2 text-sm">CRM managed by Iris.</p>
      </motion.div>
      {rels.length === 0 ? (
        <motion.div variants={fadeUp}>
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-20 text-center">
              <p className="text-sm text-[#A0988E] max-w-sm leading-relaxed">
                No relationships yet. Iris tracks contacts as Dermaqea builds partnerships.
              </p>
            </CardContent>
          </Card>
        </motion.div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rels.map((rel, i) => (
            <motion.div key={rel.id} variants={fadeUp} custom={i}>
              <Card className="glass-card-hover">
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-sm font-medium text-[#EDE8E0]">
                          {rel.contact ? `${rel.contact.firstName} ${rel.contact.lastName}` : rel.organization?.name ?? "Unknown"}
                        </h3>
                        <Badge variant="outline" className={`${stageColors[rel.stage] ?? ""} rounded-full shrink-0`}>
                          {rel.stage.replace(/_/g, " ")}
                        </Badge>
                      </div>
                      {rel.organization && (
                        <p className="text-xs text-[#A0988E]/70 mt-1">{rel.organization.name}</p>
                      )}
                      {rel.nextFollowUp && (
                        <p className="text-xs text-[#A0988E] mt-2.5">
                          Follow up: {new Date(rel.nextFollowUp).toLocaleDateString("en-US", {
                            month: "short", day: "numeric", year: "numeric",
                          })}
                        </p>
                      )}
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
