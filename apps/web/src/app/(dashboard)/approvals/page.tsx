"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { fadeUp, stagger } from "@/lib/animations";

interface Approval {
  id: string;
  type: string;
  title: string;
  description: string;
  content: unknown;
  agentName: string;
  status: string;
  priority: string;
  reasoning: string;
  impact: string;
  effort: string;
  confidence: number;
  metrics: string[];
  createdAt: string;
  reviewNotes?: string;
}

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const priorityColors: Record<string, string> = {
  CRITICAL: "bg-white/[0.08] text-[#EDE8E0] border-white/[0.12]",
  HIGH: "bg-white/[0.06] text-[#EDE8E0] border-white/[0.1]",
  MEDIUM: "bg-white/[0.04] text-[#A0988E] border-white/[0.08]",
  LOW: "bg-white/[0.02] text-[#A0988E] border-white/[0.06]",
};

const effortColors: Record<string, string> = {
  LOW: "text-success",
  MEDIUM: "text-warning",
  HIGH: "text-destructive",
};

export default function ApprovalsPage() {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [tab, setTab] = useState("PENDING");
  const [selectedApproval, setSelectedApproval] = useState<Approval | null>(null);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchApprovals(tab);
  }, [tab]);

  async function fetchApprovals(status: string) {
    try {
      const res = await fetch(`${API}/api/approvals?status=${status}`);
      if (res.ok) setApprovals(await res.json());
    } catch {
      /* API not running */
    }
  }

  async function handleAction(id: string, action: "approve" | "reject") {
    setLoading(true);
    try {
      await fetch(`${API}/api/approvals/${id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      setSelectedApproval(null);
      setNotes("");
      fetchApprovals(tab);
    } catch {
      /* error */
    }
    setLoading(false);
  }

  return (
    <motion.div
      className="space-y-10"
      initial="hidden"
      animate="visible"
      variants={stagger}
    >
      <motion.div variants={fadeUp}>
        <h1 className="text-3xl font-semibold tracking-tight text-[#EDE8E0]">
          Approvals
        </h1>
        <p className="text-[#A0988E] mt-2 text-sm">
          Review actions recommended by Quinn.
        </p>
      </motion.div>

      <motion.div variants={fadeUp}>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="PENDING">Pending</TabsTrigger>
            <TabsTrigger value="APPROVED">Approved</TabsTrigger>
            <TabsTrigger value="REJECTED">Rejected</TabsTrigger>
            <TabsTrigger value="ALL">All</TabsTrigger>
          </TabsList>

          <TabsContent value={tab} className="mt-8">
            {approvals.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-20 text-center">
                  <p className="text-sm text-[#A0988E] max-w-sm leading-relaxed">
                    {tab === "PENDING"
                      ? "No pending approvals. Trigger a workflow to get started."
                      : "No items match this filter."}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3">
                {approvals.map((approval, i) => (
                  <motion.div key={approval.id} variants={fadeUp} custom={i}>
                    <Card
                      className="cursor-pointer glass-card-hover"
                      onClick={() => setSelectedApproval(approval)}
                    >
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between gap-6">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge variant="outline" className={priorityColors[approval.priority] ?? "rounded-full"}>
                                {approval.priority}
                              </Badge>
                              <Badge variant="outline" className="text-xs rounded-full">
                                {approval.type.replace(/_/g, " ")}
                              </Badge>
                              <Badge variant="secondary" className="text-xs rounded-full">
                                {approval.agentName}
                              </Badge>
                            </div>
                            <h3 className="text-sm font-medium mt-2 text-[#EDE8E0]">{approval.title}</h3>
                            <p className="text-sm text-[#A0988E] mt-1.5 line-clamp-2 leading-relaxed">
                              {approval.description}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-3 shrink-0">
                            <div className="text-right">
                              <div className="text-xs text-[#A0988E] mb-1.5">Confidence</div>
                              <div className="flex items-center gap-2.5">
                                <Progress value={approval.confidence} className="w-16 h-1.5" />
                                <span className="text-xs font-mono text-[#EDE8E0]">{approval.confidence}%</span>
                              </div>
                            </div>
                            <div className={`text-xs font-medium px-2 py-0.5 rounded-full bg-white/[0.04] ${effortColors[approval.effort] ?? ""}`}>
                              {approval.effort} effort
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </motion.div>

      <Dialog open={!!selectedApproval} onOpenChange={() => setSelectedApproval(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] border-white/[0.08] bg-[#0B0D11]/95 backdrop-blur-xl">
          {selectedApproval && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline" className={priorityColors[selectedApproval.priority] ?? "rounded-full"}>
                    {selectedApproval.priority}
                  </Badge>
                  <Badge variant="secondary" className="rounded-full">{selectedApproval.agentName}</Badge>
                </div>
                <DialogTitle className="text-lg text-[#EDE8E0]">{selectedApproval.title}</DialogTitle>
              </DialogHeader>

              <ScrollArea className="max-h-[50vh] pr-4">
                <div className="space-y-5">
                  <div>
                    <h4 className="text-xs font-medium text-[#A0988E] mb-1.5 uppercase tracking-wider">Description</h4>
                    <p className="text-sm text-[#EDE8E0]/80 leading-relaxed">{selectedApproval.description}</p>
                  </div>

                  <Separator />

                  <div>
                    <h4 className="text-xs font-medium text-[#A0988E] mb-1.5 uppercase tracking-wider">Reasoning</h4>
                    <p className="text-sm text-[#EDE8E0]/80 leading-relaxed">{selectedApproval.reasoning}</p>
                  </div>

                  <div>
                    <h4 className="text-xs font-medium text-[#A0988E] mb-1.5 uppercase tracking-wider">Expected Impact</h4>
                    <p className="text-sm text-[#EDE8E0]/80 leading-relaxed">{selectedApproval.impact}</p>
                  </div>

                  <div className="grid grid-cols-3 gap-4 p-4 rounded-xl bg-white/[0.03]">
                    <div>
                      <h4 className="text-xs font-medium text-[#A0988E] mb-1">Effort</h4>
                      <p className={`text-sm font-medium ${effortColors[selectedApproval.effort] ?? ""}`}>
                        {selectedApproval.effort}
                      </p>
                    </div>
                    <div>
                      <h4 className="text-xs font-medium text-[#A0988E] mb-1">Confidence</h4>
                      <p className="text-sm font-medium text-[#EDE8E0]">{selectedApproval.confidence}%</p>
                    </div>
                    <div>
                      <h4 className="text-xs font-medium text-[#A0988E] mb-1">Type</h4>
                      <p className="text-sm text-[#EDE8E0]">{selectedApproval.type.replace(/_/g, " ")}</p>
                    </div>
                  </div>

                  {selectedApproval.metrics.length > 0 && (
                    <div>
                      <h4 className="text-xs font-medium text-[#A0988E] mb-1.5 uppercase tracking-wider">Success Metrics</h4>
                      <ul className="text-sm space-y-1.5">
                        {selectedApproval.metrics.map((m, i) => (
                          <li key={i} className="flex items-start gap-2 text-[#EDE8E0]/80">
                            {m}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {selectedApproval.status === "PENDING" && (
                    <>
                      <Separator />
                      <div>
                        <h4 className="text-xs font-medium text-[#A0988E] mb-2 uppercase tracking-wider">Review Notes</h4>
                        <Textarea
                          placeholder="Notes or feedback..."
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          className="min-h-[80px]"
                        />
                      </div>
                    </>
                  )}
                </div>
              </ScrollArea>

              {selectedApproval.status === "PENDING" && (
                <DialogFooter className="gap-3 pt-2">
                  <Button
                    variant="outline"
                    onClick={() => handleAction(selectedApproval.id, "reject")}
                    disabled={loading}
                    className="gap-2 border-white/[0.12] text-[#A0988E] hover:bg-white/[0.06]"
                  >
                    Reject
                  </Button>
                  <Button
                    onClick={() => handleAction(selectedApproval.id, "approve")}
                    disabled={loading}
                  >
                    Approve
                  </Button>
                </DialogFooter>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
