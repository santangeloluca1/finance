"use client";

import { useState } from "react";
import { usePortfolioView, type Filter } from "@/components/PortfolioProvider";
import { AnalisiTab, Toolbar } from "@/components/home/Toolbar";
import { PAGE_TITLE } from "@/components/ui";

export default function AnalisiPage() {
  const [filter, setFilter] = useState<Filter>({ account: "all", asset: "all" });
  const view = usePortfolioView(filter);
  return (
    <div>
      <h1 className={`px-4 py-1 ${PAGE_TITLE}`}>Analisi</h1>
      <Toolbar filter={filter} setFilter={setFilter} view={view} />
      {view.totals && view.state ? <AnalisiTab view={view} filter={filter} /> : null}
    </div>
  );
}
