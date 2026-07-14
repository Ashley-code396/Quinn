"use client";

import { useEffect, useState } from "react";
import { Search, Building2, Globe, MapPin, Star, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";

interface Org {
  id: string; name: string; website?: string; country?: string;
  industry?: string; products: string[]; priorityScore: number;
  outreachStatus: string; researchNotes?: string; tags: string[];
}

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const statusColors: Record<string, string> = {
  NOT_CONTACTED: "bg-slate-500/10 text-slate-400", RESEARCHING: "bg-blue-500/10 text-blue-400",
  CONTACTED: "bg-yellow-500/10 text-yellow-400", IN_CONVERSATION: "bg-green-500/10 text-green-400",
  PARTNER: "bg-primary/10 text-primary",
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
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight"><span className="text-gradient">Research Intelligence</span></h1>
        <p className="text-muted-foreground mt-1">Organizations researched by Sage — potential partners, customers, and opportunities.</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search organizations..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
      </div>

      {filtered.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Building2 className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-semibold mb-2">{search ? "No matches" : "No organizations yet"}</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              {search ? "Try a different search term." : "Sage hasn't researched any organizations yet. Trigger a research workflow to get started."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((org) => (
            <Card key={org.id} className="glass-card transition-all hover:border-primary/20">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold flex items-center gap-2">{org.name}
                      {org.website && <a href={org.website} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3 w-3 text-muted-foreground hover:text-primary" /></a>}
                    </h3>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      {org.industry && <span className="flex items-center gap-1"><Globe className="h-3 w-3" />{org.industry}</span>}
                      {org.country && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{org.country}</span>}
                    </div>
                  </div>
                  <Badge variant="outline" className={statusColors[org.outreachStatus] ?? ""}>{org.outreachStatus.replace(/_/g, " ")}</Badge>
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <Star className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs text-muted-foreground">Priority</span>
                  <Progress value={org.priorityScore * 10} className="flex-1 h-1.5" />
                  <span className="text-xs font-mono">{org.priorityScore}/10</span>
                </div>
                {org.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {org.tags.slice(0, 4).map((tag) => <Badge key={tag} variant="secondary" className="text-[10px]">{tag}</Badge>)}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
