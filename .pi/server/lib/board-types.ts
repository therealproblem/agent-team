export const STATUSES = ["backlog", "in_progress", "in_review", "blocked", "done"] as const;
export type Status = typeof STATUSES[number];

export const STATUS_LABELS: Record<Status, string> = {
  backlog: "Backlog",
  in_progress: "In Progress",
  in_review: "In Review",
  blocked: "Blocked",
  done: "Done",
};

export const PERSONAS = ["pm", "engineer"] as const;
export type Persona = typeof PERSONAS[number];

export const PERSONA_LABELS: Record<Persona, string> = {
  pm: "PM",
  engineer: "Engineer",
};

export const SUB_PERSONAS: Record<Persona, readonly string[]> = {
  pm: ["prd", "roadmap", "stakeholder-summary", "user-research", "uiux", "copywriter"],
  engineer: ["frontend", "backend", "uiux", "devops", "debugger", "refactor"],
};

export const PROJECT_STATUSES = ["active", "paused", "done", "archived"] as const;
export type ProjectStatus = typeof PROJECT_STATUSES[number];

export const PRIORITIES = ["p0", "p1", "p2", "p3"] as const;
export type Priority = typeof PRIORITIES[number];

export interface Card {
  slug: string;
  title: string;
  status: Status;
  persona: Persona | null;
  sub_persona: string | null;
  link: string | null;
  priority: Priority | null;
  tags: string[];
  created: string | null;
  updated: string | null;
  body: string;
  warning: string | null;
}

export interface Project {
  slug: string;
  name: string;
  status: ProjectStatus;
  owner: Persona | null;
  tags: string[];
  created: string | null;
  updated: string | null;
  description: string;
  cardCounts: Record<Status, number>;
}
