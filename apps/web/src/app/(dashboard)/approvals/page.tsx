"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, Clock, Shield, Sparkles } from "lucide-react";
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
  CRITICAL: "bg-red-500/10 text-red-400 border-red-500/20",
  HIGH: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  MEDIUM: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  LOW: "bg-slate-500/10 text-slate-400 border-slate-500/20",
};

const effortColors: Record<string, string> = {
  LOW: "text-green-400",
  MEDIUM: "text-yellow-400",
  HIGH: "text-red-400",
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
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          <span className="text-gradient">Approval Queue</span>
        </h1>
        <p className="text-muted-foreground mt-1">
          Review and approve actions recommended by Quinn and the team.
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-muted/50">
          <TabsTrigger value="PENDING" className="gap-2">
            <Clock className="h-3.5 w-3.5" /> Pending
          </TabsTrigger>
          <TabsTrigger value="APPROVED" className="gap-2">
            <CheckCircle2 className="h-3.5 w-3.5" /> Approved
          </TabsTrigger>
          <TabsTrigger value="REJECTED" className="gap-2">
            <XCircle className="h-3.5 w-3.5" /> Rejected
          </TabsTrigger>
          <TabsTrigger value="ALL">All</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-6">
          {approvals.length === 0 ? (
            <Card className="glass-card">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 mb-4">
                  <Shield className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">
                  {tab === "PENDING" ? "No pending approvals" : "No items found"}
                </h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  {tab === "PENDING"
                    ? "Quinn hasn't submitted anything for your review yet. Trigger a workflow to get started."
                    : "No approvals match this filter."}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {approvals.map((approval) => (
                <Card
                  key={approval.id}
                  className="glass-card cursor-pointer transition-all hover:scale-[1.005] hover:border-primary/30"
                  onClick={() => setSelectedApproval(approval)}
                >
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className={priorityColors[approval.priority] ?? ""}>
                            {approval.priority}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {approval.type.replace(/_/g, " ")}
                          </Badge>
                          <Badge variant="secondary" className="text-xs">
                            {approval.agentName}
                          </Badge>
                        </div>
                        <h3 className="font-semibold text-base mt-2">{approval.title}</h3>
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {approval.description}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <div className="text-right">
                          <div className="text-xs text-muted-foreground mb-1">Confidence</div>
                          <div className="flex items-center gap-2">
                            <Progress value={approval.confidence} className="w-16 h-1.5" />
                            <span className="text-xs font-mono">{approval.confidence}%</span>
                          </div>
                        </div>
                        <div className={`text-xs font-medium ${effortColors[approval.effort] ?? ""}`}>
                          {approval.effort} effort
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Approval Detail Dialog */}
      <Dialog open={!!selectedApproval} onOpenChange={() => setSelectedApproval(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          {selectedApproval && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline" className={priorityColors[selectedApproval.priority] ?? ""}>
                    {selectedApproval.priority}
                  </Badge>
                  <Badge variant="secondary">{selectedApproval.agentName}</Badge>
                </div>
                <DialogTitle className="text-xl">{selectedApproval.title}</DialogTitle>
              </DialogHeader>

              <ScrollArea className="max-h-[50vh] pr-4">
                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-1">Description</h4>
                    <p className="text-sm">{selectedApproval.description}</p>
                  </div>

                  <Separator />

                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-1">
                      <Sparkles className="h-3.5 w-3.5 inline mr-1 text-primary" />
                      Quinn&apos;s Reasoning
                    </h4>
                    <p className="text-sm">{selectedApproval.reasoning}</p>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-1">Expected Impact</h4>
                    <p className="text-sm">{selectedApproval.impact}</p>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <h4 className="text-xs font-medium text-muted-foreground mb-1">Effort</h4>
                      <p className={`text-sm font-medium ${effortColors[selectedApproval.effort] ?? ""}`}>
                        {selectedApproval.effort}
                      </p>
                    </div>
                    <div>
                      <h4 className="text-xs font-medium text-muted-foreground mb-1">Confidence</h4>
                      <p className="text-sm font-medium">{selectedApproval.confidence}%</p>
                    </div>
                    <div>
                      <h4 className="text-xs font-medium text-muted-foreground mb-1">Type</h4>
                      <p className="text-sm">{selectedApproval.type.replace(/_/g, " ")}</p>
                    </div>
                  </div>

                  {selectedApproval.metrics.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-muted-foreground mb-1">Success Metrics</h4>
                      <ul className="text-sm space-y-1">
                        {selectedApproval.metrics.map((m, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="text-primary mt-1">•</span>
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
                        <h4 className="text-sm font-medium text-muted-foreground mb-2">Review Notes (optional)</h4>
                        <Textarea
                          placeholder="Add any notes or feedback..."
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
                <DialogFooter className="gap-2">
                  <Button
                    variant="outline"
                    onClick={() => handleAction(selectedApproval.id, "reject")}
                    disabled={loading}
                    className="gap-2 border-red-500/20 text-red-400 hover:bg-red-500/10"
                  >
                    <XCircle className="h-4 w-4" /> Reject
                  </Button>
                  <Button
                    onClick={() => handleAction(selectedApproval.id, "approve")}
                    disabled={loading}
                    className="gap-2"
                  >
                    <CheckCircle2 className="h-4 w-4" /> Approve
                  </Button>
                </DialogFooter>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
