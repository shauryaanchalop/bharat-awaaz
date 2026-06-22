import { createFileRoute } from "@tanstack/react-router";
import { TEMPLATES, getTemplate, autoMapTemplate, type FormTemplate, type TemplateField } from "@/lib/pdf/templates";
import {
  getOrCreateSession,
  updateSession,
  type CustomTemplate,
  type CustomTemplateField,
  type TemplateVersionSnapshot,
} from "@/lib/agent/state";

function customToTemplate(c: CustomTemplate): FormTemplate {
  return {
    id: c.id,
    name: c.name,
    ministry: c.ministry,
    scheme: c.scheme,
    fields: c.fields as TemplateField[],
  };
}

function resolveTemplate(sessionId: string, id: string): FormTemplate | undefined {
  const s = getOrCreateSession(sessionId);
  const custom = s.customTemplates.find((c) => c.id === id);
  if (custom) return customToTemplate(custom);
  return getTemplate(id);
}

type IncomingTemplate = {
  id: string;
  name: string;
  ministry: string;
  scheme?: string;
  fields: CustomTemplateField[];
  note?: string;
};

function validateTemplate(t: IncomingTemplate): string | null {
  if (!t?.id || !/^[a-z0-9-]{2,32}$/.test(t.id)) return `id "${t?.id}" must be lowercase a-z0-9- (2..32 chars)`;
  if (!t.name?.trim()) return `template ${t.id}: name required`;
  if (!Array.isArray(t.fields) || t.fields.length === 0) return `template ${t.id}: at least one field required`;
  for (const f of t.fields) {
    if (!f.key || !/^[a-z][a-z0-9_]{0,40}$/.test(f.key)) return `template ${t.id}: bad field key "${f.key}"`;
    if (!f.label?.trim()) return `template ${t.id}: field ${f.key} needs a label`;
  }
  if (TEMPLATES.some((x) => x.id === t.id)) return `template ${t.id}: id collides with built-in template`;
  return null;
}

function registerOne(sessionId: string, t: IncomingTemplate) {
  updateSession(sessionId, (s) => {
    const existing = s.customTemplates.find((x) => x.id === t.id);
    const nextVersion = existing ? existing.version + 1 : 1;
    const history: TemplateVersionSnapshot[] = existing ? [...existing.history] : [];
    if (existing) {
      history.push({
        version: existing.version,
        name: existing.name,
        ministry: existing.ministry,
        scheme: existing.scheme,
        fields: existing.fields,
        savedAt: Date.now(),
        note: t.note,
      });
    }
    const fresh: CustomTemplate = {
      id: t.id,
      name: t.name.trim(),
      ministry: t.ministry?.trim() ?? "",
      scheme: (t.scheme ?? t.name).trim(),
      fields: t.fields,
      createdAt: existing?.createdAt ?? Date.now(),
      version: nextVersion,
      history,
    };
    s.customTemplates = s.customTemplates.filter((x) => x.id !== t.id);
    s.customTemplates.push(fresh);
  });
}

/* ---------------- CSV helpers (one row per field) ---------------- */
// columns: template_id, template_name, ministry, scheme, field_key, label, required, aliases, source
const CSV_HEADER = ["template_id", "template_name", "ministry", "scheme", "field_key", "label", "required", "aliases", "source"];

function csvEscape(v: string) {
  if (v == null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function templatesToCsv(list: CustomTemplate[]): string {
  const lines = [CSV_HEADER.join(",")];
  for (const t of list) {
    for (const f of t.fields) {
      lines.push(
        [
          t.id,
          t.name,
          t.ministry,
          t.scheme,
          f.key,
          f.label,
          f.required ? "true" : "false",
          (f.aliases ?? []).join("|"),
          f.source ?? "user",
        ]
          .map(csvEscape)
          .join(","),
      );
    }
  }
  return lines.join("\n");
}

function parseCsvRow(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQ = false;
      else cur += c;
    } else {
      if (c === ",") { out.push(cur); cur = ""; }
      else if (c === '"') inQ = true;
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

function csvToTemplates(csv: string): IncomingTemplate[] {
  const lines = csv.replace(/\r\n/g, "\n").split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const header = parseCsvRow(lines[0]).map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);
  const ix = {
    id: idx("template_id"),
    name: idx("template_name"),
    ministry: idx("ministry"),
    scheme: idx("scheme"),
    key: idx("field_key"),
    label: idx("label"),
    required: idx("required"),
    aliases: idx("aliases"),
    source: idx("source"),
  };
  const map = new Map<string, IncomingTemplate>();
  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvRow(lines[i]);
    const tid = row[ix.id]?.trim();
    if (!tid) continue;
    let t = map.get(tid);
    if (!t) {
      t = {
        id: tid,
        name: (row[ix.name] ?? "").trim(),
        ministry: (row[ix.ministry] ?? "").trim(),
        scheme: (row[ix.scheme] ?? "").trim(),
        fields: [],
      };
      map.set(tid, t);
    }
    const aliases = (row[ix.aliases] ?? "")
      .split(/[|;]/)
      .map((a) => a.trim())
      .filter(Boolean);
    const src = (row[ix.source] ?? "user").trim() as CustomTemplateField["source"];
    t.fields.push({
      key: (row[ix.key] ?? "").trim(),
      label: (row[ix.label] ?? "").trim(),
      required: /^(true|1|yes|y)$/i.test((row[ix.required] ?? "").trim()),
      aliases,
      source: src,
    });
  }
  return [...map.values()];
}

export const Route = createFileRoute("/api/templates")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const sessionId = url.searchParams.get("sessionId");
        const templateId = url.searchParams.get("templateId");
        const mode = url.searchParams.get("mode");

        if (mode === "export-json" && sessionId) {
          const s = getOrCreateSession(sessionId);
          return new Response(JSON.stringify({ templates: s.customTemplates }, null, 2), {
            headers: {
              "Content-Type": "application/json",
              "Content-Disposition": `attachment; filename="templates-${sessionId}.json"`,
            },
          });
        }
        if (mode === "export-csv" && sessionId) {
          const s = getOrCreateSession(sessionId);
          return new Response(templatesToCsv(s.customTemplates), {
            headers: {
              "Content-Type": "text/csv",
              "Content-Disposition": `attachment; filename="templates-${sessionId}.csv"`,
            },
          });
        }

        if (templateId && sessionId) {
          const tpl = resolveTemplate(sessionId, templateId);
          if (!tpl) return new Response("Template not found", { status: 404 });
          const s = getOrCreateSession(sessionId);
          const mapped = autoMapTemplate(tpl, s.documents, s.demographics);
          const meta = s.customTemplates.find((x) => x.id === templateId);
          return Response.json({
            template: tpl,
            mapped,
            version: meta?.version,
            history: meta?.history ?? [],
          });
        }

        const built = TEMPLATES.map((t) => ({
          id: t.id,
          name: t.name,
          ministry: t.ministry,
          scheme: t.scheme,
          fieldCount: t.fields.length,
          custom: false as const,
        }));
        if (sessionId) {
          const s = getOrCreateSession(sessionId);
          const custom = s.customTemplates.map((t) => ({
            id: t.id,
            name: t.name,
            ministry: t.ministry,
            scheme: t.scheme,
            fieldCount: t.fields.length,
            custom: true as const,
            version: t.version,
            historyCount: t.history.length,
          }));
          return Response.json({ templates: [...built, ...custom] });
        }
        return Response.json({ templates: built });
      },

      POST: async ({ request }) => {
        const body = (await request.json()) as
          | { action?: "select"; sessionId: string; templateId: string }
          | { action: "register"; sessionId: string; template: IncomingTemplate }
          | { action: "remove"; sessionId: string; templateId: string }
          | { action: "rollback"; sessionId: string; templateId: string; toVersion: number }
          | { action: "import-json"; sessionId: string; templates: IncomingTemplate[] }
          | { action: "import-csv"; sessionId: string; csv: string };

        const { sessionId } = body as { sessionId: string };
        if (!sessionId) return new Response("sessionId required", { status: 400 });
        const act = (body as { action?: string }).action;

        if (act === "register") {
          const t = (body as { template: IncomingTemplate }).template;
          const err = validateTemplate(t);
          if (err) return Response.json({ ok: false, error: err }, { status: 400 });
          registerOne(sessionId, t);
          return Response.json({ ok: true });
        }

        if (act === "remove") {
          const id = (body as { templateId: string }).templateId;
          updateSession(sessionId, (s) => {
            s.customTemplates = s.customTemplates.filter((x) => x.id !== id);
          });
          return Response.json({ ok: true });
        }

        if (act === "rollback") {
          const { templateId, toVersion } = body as { templateId: string; toVersion: number };
          const s = getOrCreateSession(sessionId);
          const cur = s.customTemplates.find((x) => x.id === templateId);
          if (!cur) return Response.json({ ok: false, error: "template not found" }, { status: 404 });
          const snap = cur.history.find((h) => h.version === toVersion);
          if (!snap) return Response.json({ ok: false, error: `version ${toVersion} not in history` }, { status: 404 });
          registerOne(sessionId, {
            id: cur.id,
            name: snap.name,
            ministry: snap.ministry,
            scheme: snap.scheme,
            fields: snap.fields,
            note: `rollback to v${toVersion}`,
          });
          return Response.json({ ok: true });
        }

        if (act === "import-json") {
          const list = (body as { templates: IncomingTemplate[] }).templates ?? [];
          const errors: string[] = [];
          let imported = 0;
          for (const t of list) {
            const err = validateTemplate(t);
            if (err) { errors.push(err); continue; }
            registerOne(sessionId, t);
            imported++;
          }
          return Response.json({ ok: errors.length === 0, imported, errors });
        }

        if (act === "import-csv") {
          const csv = (body as { csv: string }).csv ?? "";
          const list = csvToTemplates(csv);
          const errors: string[] = [];
          let imported = 0;
          for (const t of list) {
            const err = validateTemplate(t);
            if (err) { errors.push(err); continue; }
            registerOne(sessionId, t);
            imported++;
          }
          return Response.json({ ok: errors.length === 0, imported, errors, parsed: list.length });
        }

        // default: select
        const templateId = (body as { templateId: string }).templateId;
        if (!templateId) return new Response("templateId required", { status: 400 });
        updateSession(sessionId, (s) => {
          s.selectedTemplateId = templateId;
        });
        return Response.json({ ok: true });
      },
    },
  },
});
