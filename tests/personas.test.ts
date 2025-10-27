import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { AssetLoader } from "../src/assets/loader";
import fs from "fs";
import path from "path";
import { Persona } from "../src/types/persona";

describe("AssetLoader", () => {
  let loader: AssetLoader;
  let testDir: string;

  beforeEach(() => {
    testDir = path.join(process.cwd(), ".metis-test");
    loader = new AssetLoader(path.dirname(testDir));
    
    // Create test directory structure
    fs.mkdirSync(path.join(testDir, "personas"), { recursive: true });
    fs.mkdirSync(path.join(testDir, "workflows"), { recursive: true });
    fs.mkdirSync(path.join(testDir, "skills"), { recursive: true });
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("should load personas from YAML files", async () => {
    const personaData: Persona = {
      name: "test-dev",
      version: "1.0",
      description: "Test developer persona",
      system_prompt: "You are a test developer.",
      temperature: 0.1,
      capabilities: ["testing", "debugging"],
      model_preferences: ["gpt-4o"]
    };

    // Write test persona
    const personaPath = path.join(testDir, "personas", "test-dev.yaml");
    const yaml = require("js-yaml");
    fs.writeFileSync(personaPath, yaml.dump(personaData));

    const loadedPersona = await loader.loadPersona("test-dev");
    
    expect(loadedPersona.name).toBe("test-dev");
    expect(loadedPersona.description).toBe("Test developer persona");
    expect(loadedPersona.system_prompt).toBe("You are a test developer.");
    expect(loadedPersona.temperature).toBe(0.1);
    expect(loadedPersona.capabilities).toContain("testing");
    expect(loadedPersona.model_preferences).toContain("gpt-4o");
  });

  it("should list available personas", async () => {
    // Create test personas
    const yaml = require("js-yaml");
    
    fs.writeFileSync(
      path.join(testDir, "personas", "dev1.yaml"),
      yaml.dump({ name: "dev1", system_prompt: "Developer 1", version: "1.0", description: "Dev 1" })
    );
    
    fs.writeFileSync(
      path.join(testDir, "personas", "dev2.yaml"),
      yaml.dump({ name: "dev2", system_prompt: "Developer 2", version: "1.0", description: "Dev 2" })
    );

    const personas = await loader.listPersonas();
    
    expect(personas).toContain("dev1");
    expect(personas).toContain("dev2");
    expect(personas.length).toBeGreaterThanOrEqual(2);
  });

  it("should validate persona format", async () => {
    const personaName = "invalid-persona";
    
    // Create invalid persona (missing required fields)
    const invalidPersona = {
      name: personaName,
      // missing system_prompt and other required fields
    };

    const yaml = require("js-yaml");
    fs.writeFileSync(
      path.join(testDir, "personas", `${personaName}.yaml`),
      yaml.dump(invalidPersona)
    );

    await expect(loader.loadPersona(personaName)).rejects.toThrow("Invalid persona format");
  });

  it("should handle missing persona files gracefully", async () => {
    await expect(loader.loadPersona("nonexistent")).rejects.toThrow("Persona not found");
  });

  it("should create new personas", async () => {
    const newPersona: Persona = {
      name: "new-persona",
      version: "1.0",
      description: "Newly created persona",
      system_prompt: "You are a newly created persona.",
      temperature: 0.5
    };

    await loader.createPersona(newPersona);
    
    const personaPath = path.join(testDir, "personas", "new-persona.yaml");
    expect(fs.existsSync(personaPath)).toBe(true);
    
    const loadedPersona = await loader.loadPersona("new-persona");
    expect(loadedPersona.name).toBe("new-persona");
    expect(loadedPersona.description).toBe("Newly created persona");
  });

  it("should prevent overwriting existing personas without explicit permission", async () => {
    const existingPersona: Persona = {
      name: "existing",
      version: "1.0", 
      description: "Existing persona",
      system_prompt: "Original prompt"
    };

    await loader.createPersona(existingPersona);
    
    const updatedPersona: Persona = {
      ...existingPersona,
      system_prompt: "Updated prompt"
    };

    await expect(loader.createPersona(updatedPersona, false)).rejects.toThrow("Persona already exists");
    
    // Should work with overwrite=true
    await expect(loader.createPersona(updatedPersona, true)).resolves.not.toThrow();
  });

  it("should validate asset integrity", async () => {
    const validPersona = "test-persona";
    const yaml = require("js-yaml");
    
    fs.writeFileSync(
      path.join(testDir, "personas", `${validPersona}.yaml`),
      yaml.dump({
        name: validPersona,
        version: "1.0",
        description: "Valid test persona",
        system_prompt: "You are valid."
      })
    );

    const isValid = await loader.validateAsset("persona", validPersona);
    expect(isValid).toBe(true);

    const isInvalid = await loader.validateAsset("persona", "nonexistent");
    expect(isInvalid).toBe(false);
  });
});