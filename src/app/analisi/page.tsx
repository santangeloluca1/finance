"use client";

import Link from "next/link";
import { Orb } from "@/components/advisor/Orb";

import { useState } from "react";
import { usePortfolioView, type Filter } from "@/components/PortfolioProvider";
import { AnalisiTab, Toolbar } from "@/components/home/Toolbar";
import { PAGE_TITLE } from "@/components/ui";

export default function AnalisiPage() {
  const [filter, setFilter] = useState<Filter>({ account: "all", asset: "all" });
  const view = usePortfolioView(filter);
  return (
    <div>
      <div className="flex items-center justify-between pr-4">
        <h1 className={`px-4 py-1 ${PAGE_TITLE}`}>Analisi</h1>
        <Link href="/consulente" className="press flex h-9 items-center gap-2 rounded-full bg-chip pl-1.5 pr-3.5 text-[14px] font-semibold text-ink">
          <Orb size={24} /> Basis AI
        </Link>
      </div>
      <Toolbar filter={filter} setFilter={setFilter} view={view} />
      {view.totals && view.state ? <AnalisiTab view={view} filter={filter} /> : null}
    </div>
  );
}
