"use client";

import { useEffect, useState } from "react";
import { Users, UserCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Relationship {
  id: string; stage: string; interestLevel: number; nextFollowUp?: string;
  lastContactDate?: string; notes?: string;
  organization?: { name: string }; contact?: { firstName: string; lastName: string; email?: string };
}

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const stageColors: Record<string, string> = {
  PROSPECT: "bg-slate-500/10 text-slate-400", INITIAL_CONTACT: "bg-blue-500/10 text-blue-400",
  ENGAGED: "bg-cyan-500/10 text-cyan-400", MEETING_HELD: "bg-yellow-500/10 text-yellow-400",
  ACTIVE_PARTNER: "bg-green-500/10 text-green-400",
};

export default function RelationshipsPage() {
  const [rels, setRels] = useState<Relationship[]>([]);
  useEffect(() => { fetch(`${API}/api/relationships`).then((r) => r.ok ? r.json() : []).then(setRels).catch(() => {}); }, []);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight"><span className="text-gradient">Relationships</span></h1>
        <p className="text-muted-foreground mt-1">CRM managed by Iris — contacts, partnerships, and follow-ups.</p>
      </div>
      {rels.length === 0 ? (
        <Card className="glass-card"><CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <Users className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <h3 className="text-lg font-semibold mb-2">No relationships yet</h3>
          <p className="text-sm text-muted-foreground max-w-sm">Iris will track relationships as Dermaqea builds partnerships.</p>
        </CardContent></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rels.map((rel) => (
            <Card key={rel.id} className="glass-card transition-all hover:border-primary/20">
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <UserCircle className="h-8 w-8 text-muted-foreground/50 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold">{rel.contact ? `${rel.contact.firstName} ${rel.contact.lastName}` : rel.organization?.name ?? "Unknown"}</h3>
                      <Badge variant="outline" className={stageColors[rel.stage] ?? ""}>{rel.stage.replace(/_/g, " ")}</Badge>
                    </div>
                    {rel.organization && <p className="text-xs text-muted-foreground">{rel.organization.name}</p>}
                    {rel.nextFollowUp && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Follow up: <span className="text-foreground">{new Date(rel.nextFollowUp).toLocaleDateString()}</span>
                      </p>
                    )}
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
