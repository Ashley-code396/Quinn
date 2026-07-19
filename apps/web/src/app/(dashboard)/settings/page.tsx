"use client";

import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { fadeUp } from "@/lib/animations";

export default function SettingsPage() {
  return (
    <motion.div
      className="space-y-10"
      initial="hidden"
      animate="visible"
      variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.1 } } }}
    >
      <motion.div variants={fadeUp}>
        <h1 className="text-3xl font-semibold tracking-tight text-[#EDE8E0]">
          Settings
        </h1>
        <p className="text-[#A0988E] mt-2 text-sm">
          Configure Quinn&apos;s behavior, model preferences, and brand guidelines.
        </p>
      </motion.div>
      <motion.div variants={fadeUp}>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-sm text-[#A0988E] max-w-sm leading-relaxed">
              Settings page coming soon. Agent models, brand voice, and preferences
              will be configurable here.
            </p>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
