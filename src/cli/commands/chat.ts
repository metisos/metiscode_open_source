import readline from "readline";
import { summarizeRepo } from "../../tools/repo";
import { makeProvider } from "../../agent/simpleAgent";
import { getSessionMemory } from "../../runtime/sessionMemory";
import type { Message } from "../../providers/types";

export async function runChat(_args: string[]) {
  const provider = makeProvider();
  const repoSummary = summarizeRepo(60);
  const sessionMemory = getSessionMemory();
  
  // Generate session ID for this chat
  const sessionId = `chat-${Date.now()}`;
  const session = sessionMemory.loadSession(sessionId);
  
  // Get conversation history or start fresh
  let history: Message[] = session.messages.length > 0 
    ? session.messages 
    : [
        {
          role: "system",
          content:
            "You are Metis, a concise repo-aware coding assistant. Keep answers short and actionable. Include code blocks only when needed.\n\nRepository summary:\n" +
            repoSummary,
        },
      ];
  
  const sessionSummary = sessionMemory.getSessionSummary();
  if (sessionSummary.trim()) {
    console.log(`[chat] Continuing session with context: ${session.currentTask || 'previous conversation'}`);
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log("[chat] Type your question. Ctrl+C to exit.");
  const ask = (): void => {
    rl.question("You> ", async (q) => {
      const prompt = q.trim();
      if (!prompt) return ask();
      history.push({ role: "user", content: prompt });
      
      // Save user message to session
      sessionMemory.addMessage({ role: "user", content: prompt });
      
      try {
        const reply = await provider.send(history);
        console.log("Metis> " + reply.trim());
        history.push({ role: "assistant", content: reply });
        
        // Save assistant reply to session
        sessionMemory.addMessage({ role: "assistant", content: reply });
        
      } catch (e: any) {
        console.error("[chat] Error:", e?.message || e);
      }
      ask();
    });
  };
  
  ask();
  
  // Handle cleanup on exit
  process.on('SIGINT', () => {
    console.log("\n[chat] Goodbye!");
    sessionMemory.cleanupOldSessions();
    process.exit(0);
  });
}
