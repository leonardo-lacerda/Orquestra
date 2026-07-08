// =============================================================================
// orquestra-maestro — Pi extension for terminal orchestration.
//
// Features:
// 1. Custom tools (orquestra_recruit, orquestra_dismiss, orquestra_list) that
//    agents call as native functions instead of remembering CLI syntax.
// 2. Auto-dispatch via `input` hook — detects multi-subtask tasks and creates
//    workers automatically.
// 3. Injects maestro system prompt via APPEND_SYSTEM.md when crown is active.
// =============================================================================

import type { ExtensionAPI, ExtensionContext, AgentToolUpdateCallback, AgentToolResult } from "@earendil-works/pi-coding-agent"
import * as fs from "node:fs"
import * as path from "node:path"

// =============================================================================
// Constants
// =============================================================================
const CROWN_MARKER = ".orquestra/crown.json"
const COMMANDS_DIR = ".orquestra-commands"

/** Simple heuristic: does this task look like it has multiple sub-tasks? */
function hasMultipleTasks(text: string): boolean {
  const lower = text.toLowerCase().trim()

  // Pattern 1: Count task verbs (PT + EN)
  const taskVerbs = [
    "criar", "fazer", "desenvolver", "implementar", "construir",
    "crie", "faça", "desenvolva", "implemente", "construa",
    "preciso", "quero", "necessito", "gere", "gerar", "monte", "montar",
    "instale", "instalar", "configure", "configurar",
    "criando", "fazendo", "desenvolvendo",
    "create", "make", "build", "develop", "implement", "generate",
    "write", "code", "produce", "craft", "prepare",
  ]
  const words = lower.split(/[\s,;.()]+/).filter(Boolean)
  let verbCount = 0
  for (const w of words) {
    if (taskVerbs.includes(w)) {
      verbCount++
    }
  }

  // Pattern 2: Coordinating conjunctions
  const coordinatingConjunctions = /\b(e\s+(tamb[ée]m|um|uma|outro|outra)|and\s+(also|a|an|one)|tamb[ée]m\b|also\b|plus\b|al[ée]m\s+(disso|de)|outro\b)/i.test(lower)

  // Pattern 3: Numbered lists or markdown bullets
  const hasNumberedList = /^\s*\d+[.)\]]|^\s*[-*]\s+|^(?:primeira?|segunda?|terceira?|first|second|third)\b/im.test(lower)

  // Pattern 4: Explicit quantity ("3 things", "several files")
  const hasQuantity = /\b(\d+|v[áa]rios|several|multiple|some)\s*(?:coisas?|things?|tarefas?|tasks?|arquivos?|files?|partes?|parts?)\b/i.test(lower)

  // Pattern 5: File list ("index.html and style.css")
  const filePattern = /\b\w+\.\w{2,4}\s+(and|e|,)\s+\w+\.\w{2,4}/i.test(lower)

  // Pattern 6: Compound AND between distinct task clauses
  const andBetweenClauses = /\b(e|and)\b.*\b(e|and)\b/i.test(lower) && /\b(criar|fazer|crie|faça|create|make|build)\b.*\b(e|and)\b/i.test(lower)

  // Pattern 7: Plural nouns suggesting multiple items
  const hasPluralNouns = /\b(arquivos|files|páginas?|pages?|telas?|screens?|scripts?|modulos?|modules?)\b/i.test(lower)

  const score = (verbCount >= 2 ? 1 : 0) +
    (coordinatingConjunctions ? 1 : 0) +
    (hasNumberedList ? 2 : 0) +
    (hasQuantity ? 2 : 0) +
    (filePattern ? 2 : 0) +
    (andBetweenClauses ? 1 : 0)

  return score >= 2 || (verbCount >= 1 && coordinatingConjunctions) || hasPluralNouns
}

/** Send a command to the orchestrator via .orquestra-commands/ */
function sendCommand(cwd: string, cmd: string, args: Record<string, unknown>): void {
  const dir = path.join(cwd, COMMANDS_DIR)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const payload = JSON.stringify({ cmd, args, timestamp: Date.now() })
  const filename = `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`
  fs.writeFileSync(path.join(dir, filename), payload)
}

/** Check if crown is active in this workspace */
function crownActive(cwd: string): boolean {
  try { return fs.existsSync(path.join(cwd, CROWN_MARKER)) }
  catch { return false }
}

/** Helper to create an AgentToolResult */
function ok(text: string): AgentToolResult<unknown> {
  return { content: [{ type: "text" as const, text }], details: undefined }
}

// =============================================================================
// Extension Entry Point
// =============================================================================
export default function (pi: ExtensionAPI) {
  // Only activate if crown is present
  const cwd = process.cwd()
  if (!crownActive(cwd)) return

  // ---------------------------------------------------------------------------
  // Custom Tools — registered via pi.registerTool()
  // ---------------------------------------------------------------------------

  pi.registerTool({
    name: "orquestra_recruit",
    label: "Recruit Worker",
    description: "Cria um novo terminal worker no canvas para executar uma subtarefa independente em paralelo. Use sempre que uma tarefa puder ser dividida em partes.",
    promptSnippet: "orquestra_recruit — cria worker para subtarefa paralela",
    promptGuidelines: [
      "Tarefas com múltiplas partes DEVEM usar orquestra_recruit",
      "Cada worker recebe UMA subtarefa específica",
      "Ex: landing page + script → dois workers separados",
    ],
    parameters: {
      type: "object",
      properties: {
        role: { type: "string", description: "Descrição da tarefa do worker" },
        name: { type: "string", description: "Nome curto do worker (ex: landing, scraper)" },
      },
      required: ["role", "name"],
    },
    execute: async (_id: string, params: any, _signal: AbortSignal | undefined, _update: AgentToolUpdateCallback<unknown> | undefined, _ctx: ExtensionContext): Promise<AgentToolResult<unknown>> => {
      sendCommand(cwd, "recruit", { role: params.role, name: params.name, agent: "verboo" })
      return ok(`Worker "${params.name}" recrutado para: ${params.role}`)
    },
  })

  pi.registerTool({
    name: "orquestra_dismiss",
    label: "Dismiss Worker",
    description: "Fecha um terminal worker existente no canvas.",
    promptSnippet: "orquestra_dismiss — fecha worker pelo nome",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Nome do worker a ser fechado" },
      },
      required: ["name"],
    },
    execute: async (_id: string, params: any, _signal: AbortSignal | undefined, _update: AgentToolUpdateCallback<unknown> | undefined, _ctx: ExtensionContext): Promise<AgentToolResult<unknown>> => {
      sendCommand(cwd, "dismiss", { target: params.name })
      return ok(`Worker "${params.name}" dispensado.`)
    },
  })

  pi.registerTool({
    name: "orquestra_list",
    label: "List Workers",
    description: "Lista todos os workers ativos e suas tarefas.",
    promptSnippet: "orquestra_list — lista workers ativos",
    parameters: {
      type: "object",
      properties: {},
    },
    execute: async (_id: string, _params: any, _signal: AbortSignal | undefined, _update: AgentToolUpdateCallback<unknown> | undefined, _ctx: ExtensionContext): Promise<AgentToolResult<unknown>> => {
      sendCommand(cwd, "list", {})
      return ok("Lista de workers solicitada. Verifique o console do Orquestra.")
    },
  })

  pi.registerTool({
    name: "orquestra_reassign",
    label: "Reassign Worker",
    description: "Altera a tarefa/role de um worker existente.",
    promptSnippet: "orquestra_reassign — muda tarefa de um worker",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Nome do worker" },
        role: { type: "string", description: "Nova descrição da tarefa" },
      },
      required: ["name", "role"],
    },
    execute: async (_id: string, params: any, _signal: AbortSignal | undefined, _update: AgentToolUpdateCallback<unknown> | undefined, _ctx: ExtensionContext): Promise<AgentToolResult<unknown>> => {
      sendCommand(cwd, "reassign", { target: params.name, role: params.role })
      return ok(`Worker "${params.name}" agora tem: ${params.role}`)
    },
  })

  // ---------------------------------------------------------------------------
  // Auto-Dispatch via input hook — detects multi-task requests and transforms
  // the user message to include orchestration instructions.
  // ---------------------------------------------------------------------------

  pi.on("input", async (event) => {
    if (event.source !== "interactive") return
    if (!hasMultipleTasks(event.text)) return

    return {
      action: "transform" as const,
      text: `<orquestra_analysis>
  Detectei que esta tarefa tem múltiplas partes independentes.
  Você DEVE usar orquestra_recruit para delegar CADA subtarefa a um worker.

  Para cada subtarefa:
  1. Chame orquestra_recruit com role e name
  2. Acompanhe os workers
  3. Consolide ao final

  NÃO execute as subtarefas você mesmo — delegue SEMPRE.
</orquestra_analysis>

${event.text}`,
    }
  })
}
