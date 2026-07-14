"use client";

import { Settings as SettingsIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          <span className="text-gradient">Settings</span>
        </h1>
        <p className="text-muted-foreground mt-1">
          Configure Quinn&apos;s behavior, model preferences, and brand guidelines.
        </p>
      </div>
      <Card className="glass-card">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <SettingsIcon className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <h3 className="text-lg font-semibold mb-2">Settings coming soon</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            This page will allow you to configure agent models, brand voice,
            content preferences, notification settings, and API keys.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
