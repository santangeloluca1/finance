"use client";

import { BackLink, LargeTitle, Segmented } from "@/components/ui";
import { useTheme, type ThemePref } from "@/lib/theme";

export default function Aspetto() {
  const [theme, setTheme] = useTheme();
  return (
    <div>
      <BackLink href="/impostazioni" label="Impostazioni" />
      <LargeTitle>Aspetto</LargeTitle>
      <div className="px-4 pt-2">
        <Segmented<ThemePref>
          value={theme}
          onChange={setTheme}
          options={[
            { value: "auto", label: "Automatico" },
            { value: "light", label: "Chiaro" },
            { value: "dark", label: "Scuro" },
          ]}
        />
        <p className="px-1 pt-2 text-[13px] text-mut">Automatico segue l&apos;impostazione dell&apos;iPhone.</p>
      </div>
    </div>
  );
}
