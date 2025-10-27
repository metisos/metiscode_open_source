import { loadConfig, loadSecrets } from "../config";
import { Provider, Message } from "../providers/types";
import { GroqProvider } from "../providers/groq";
import { summarizeRepo } from "../tools/repo";
import { AssetLoader } from "../assets/loader";
import { Persona } from "../types/persona";

export type AgentMode = "plan" | "run";

export function makeProvider(): Provider {
  const cfg = loadConfig();
  const secrets = loadSecrets();
  const base = {
    model: cfg.model,
    temperature: cfg.temperature,
  };

  // Always use Groq provider
  return new GroqProvider({
    ...base,
    apiKey: secrets.groq || process.env.GROQ_API_KEY,
  });
}

export async function runSimpleAgent(mode: AgentMode, task: string): Promise<string> {
  const cfg = loadConfig();
  const provider = makeProvider();
  const repoSummary = summarizeRepo(60);
  
  // Load persona
  const personaName = process.env.METIS_PERSONA || 'default';
  const loader = new AssetLoader();
  let persona: Persona;
  
  try {
    persona = await loader.loadPersona(personaName);
    if (process.env.METIS_VERBOSE === 'true') {
      console.log(`Using persona: ${persona.name} - ${persona.description}`);
    }
  } catch (error: any) {
    console.warn(`Failed to load persona '${personaName}': ${error.message}`);
    console.warn("Falling back to default behavior");
    persona = {
      name: 'fallback',
      version: '1.0',
      description: 'Fallback persona',
      system_prompt: 'You are Metis, a helpful coding assistant.',
      temperature: cfg.temperature
    };
  }
  
  const systemPrompt = buildSystemPrompt(mode, persona, repoSummary);
  const messages: Message[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: task.trim() || "Plan repository changes for the task." },
  ];
  
  // Use persona temperature if specified
  const temperature = persona.temperature !== undefined ? persona.temperature : cfg.temperature;
  const out = await provider.send(messages, { temperature });
  return out.trim();
}

function buildSystemPrompt(mode: AgentMode, persona: Persona, repoSummary: string): string {
  if (mode === "plan") {
    return `${persona.system_prompt}

Your task is to propose a clear, minimal plan of steps to implement the user's request in this repository. Prefer diffs and focused changes.

Repository summary:
${repoSummary}`;
  } else {
    return `${persona.system_prompt}

Your task is to produce specific, minimal file-level changes and a patch.

Format strictly as a Metis Patch:
*** Begin Patch
*** Add File: path/relative/to/repo.ext
<full new file content>
*** Update File: another/path.ext
<full updated file content>
*** Delete File: another/path.ext
*** End Patch

Rules:
- For Add/Update, include the FULL file content exactly as it should be saved.
- Do not include code fences or explanations outside the patch envelope.
- Only touch files needed for the task.
- Use POSIX newlines.

Repository summary:
${repoSummary}`;
  }
}
