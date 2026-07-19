"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { fadeUp, stagger } from "@/lib/animations";

interface Org {
  id: string; name: string; website?: string; country?: string;
  industry?: string; products: string[]; priorityScore: number;
  outreachStatus: string; researchNotes?: string; tags: string[];
}

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const statusColors: Record<string, string> = {
  NOT_CONTACTED: "bg-white/[0.03] text-[#A0988E]", RESEARCHING: "bg-white/[0.05] text-[#EDE8E0]",
  CONTACTED: "bg-white/[0.06] text-[#EDE8E0]", IN_CONVERSATION: "bg-white/[0.08] text-[#EDE8E0]",
  PARTNER: "bg-white/[0.1] text-[#EDE8E0]",
};

export default function ResearchPage() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => { fetchOrgs(); }, []);

  async function fetchOrgs() {
    try {
      const res = await fetch(`${API}/api/organizations?limit=100`);
      if (res.ok) setOrgs(await res.json());
    } catch { /* */ }
  }

  const filtered = search
    ? orgs.filter((o) => o.name.toLowerCase().includes(search.toLowerCase()) || o.industry?.toLowerCase().includes(search.toLowerCase()))
    : orgs;

  return (
    <motion.div
      className="space-y-10"
      initial="hidden"
      animate="visible"
      variants={stagger}
    >
      <motion.div variants={fadeUp}>
        <h1 className="text-3xl font-semibold tracking-tight text-[#EDE8E0]">Research</h1>
        <p className="text-[#A0988E] mt-2 text-sm">Organizations researched by Sage.</p>
      </motion.div>

      <motion.div variants={fadeUp}>
        <Input
          placeholder="Search organizations..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-10"
        />
      </motion.div>

      {filtered.length === 0 ? (
        <motion.div variants={fadeUp}>
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-20 text-center">
              <p className="text-sm text-[#A0988E] max-w-sm leading-relaxed">
                {search ? "No matches. Try a different search." : "No organizations yet. Trigger a research workflow."}
              </p>
            </CardContent>
          </Card>
        </motion.div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((org, i) => (
            <motion.div key={org.id} variants={fadeUp} custom={i}>
              <Card className="glass-card-hover">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-sm font-medium text-[#EDE8E0]">
                        {org.name}
                      </h3>
                      <div className="flex items-center gap-4 mt-1.5 text-xs text-[#A0988E]/70">
                        {org.industry && <span>{org.industry}</span>}
                        {org.country && <span>{org.country}</span>}
                      </div>
                    </div>
                    <Badge variant="outline" className={`${statusColors[org.outreachStatus] ?? ""} rounded-full`}>
                      {org.outreachStatus.replace(/_/g, " ")}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2.5 mb-3">
                    <span className="text-xs text-[#A0988E]">Priority</span>
                    <Progress value={org.priorityScore * 10} className="flex-1 h-1" />
                    <span className="text-xs font-mono text-[#EDE8E0]">{org.priorityScore}/10</span>
                  </div>
                  {org.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {org.tags.slice(0, 4).map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-[10px] rounded-full px-2">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
