import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

interface ComponentDemoProps {
  name: string;
  importPath: string;
  description?: string;
  children: ReactNode;
}

/*
 * Single demo cell for the /components gallery. Shows the component name +
 * import path so an agent reading the page can copy-paste the import.
 */
export function ComponentDemo({ name, importPath, description, children }: ComponentDemoProps) {
  return (
    <Card className="bg-card">
      <CardHeader>
        <CardTitle className="font-serif text-lg">{name}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
        <CardDescription className="font-mono text-xs">
          {importPath}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-start gap-3">{children}</div>
      </CardContent>
    </Card>
  );
}
