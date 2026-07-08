import { Injectable } from "@nestjs/common";
import { loadConfig, type AppConfig } from "./config.schema.js";

/**
 * Typed configuration provider. Validates process.env at construction — if the
 * environment is invalid the app fails to start (fail-fast, NFR AVL-2 / BR5).
 */
@Injectable()
export class ConfigService {
  private readonly config: AppConfig;

  constructor(env: Record<string, string | undefined> = process.env) {
    this.config = loadConfig(env);
  }

  get<K extends keyof AppConfig>(key: K): AppConfig[K] {
    return this.config[key];
  }

  get all(): Readonly<AppConfig> {
    return this.config;
  }
}
